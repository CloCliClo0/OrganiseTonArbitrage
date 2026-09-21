const express = require('express');
const pool = require('../db');
const { notifyStaffNewRegistration } = require('../mailer');

const router = express.Router();

router.all('/', async (req, res) => {
    const action = req.query.action || '';
    const data = req.body || {};

    try {
        // GET USERS (Pour Admin Stats)
        if (req.method === 'GET' && action === 'users') {
            if (!req.auth || req.auth.role !== 'admin') return res.json([]);
            const [rows] = await pool.query(
                "SELECT id, email, nom, prenom, age, telephone, role, categorie, COALESCE(status,'active') as status FROM users ORDER BY nom ASC"
            );
            return res.json(rows);
        }

        // GET PRESENCES
        if (req.method === 'GET' && action === 'presences') {
            if (!req.auth || !['admin', 'coach', 'joueur'].includes(req.auth.role)) return res.json([]);
            // Coordonnées (email/téléphone) visibles uniquement pour le staff, pas entre joueurs
            const isStaff = ['admin', 'coach'].includes(req.auth.role);
            const cols = isStaff
                ? 'p.id, p.date, p.user_id, u.nom, u.prenom, u.email, u.telephone'
                : 'p.id, p.date, p.user_id, u.nom, u.prenom';
            const [rows] = await pool.query(
                `SELECT ${cols} FROM presences p JOIN users u ON p.user_id = u.id ORDER BY p.date ASC`
            );
            return res.json(rows);
        }

        // GET BOOKINGS (legacy)
        if (req.method === 'GET') {
            const [rows] = await pool.query(
                `SELECT b.id, b.match_id, b.user_id, u.nom, u.prenom
                 FROM bookings b JOIN users u ON b.user_id = u.id`
            );
            const formatted = rows.map(b => ({
                id: b.id,
                matchId: b.match_id,
                userId: b.user_id,
                userName: `${b.prenom} ${b.nom}`,
            }));
            return res.json(formatted);
        }

        if (req.method === 'POST') {
            // Mise à jour de son propre profil (champs limités)
            if (action === 'updateUser') {
                if (!req.auth) return res.json({ success: false, message: 'Non connecté' });
                const userId = parseInt(data.userId || 0, 10);
                if (userId !== req.auth.id && req.auth.role !== 'admin') {
                    return res.json({ success: false, message: 'Non autorisé' });
                }
                const allowed = ['email', 'telephone', 'age'];
                const { sql, params } = buildUpdate(allowed, data, userId);
                if (!sql) return res.json({ success: false, message: 'Aucun champ' });
                await pool.query(sql, params);
                return res.json({ success: true });
            }

            // Admin : mise à jour complète d'un profil
            if (action === 'update_user') {
                if (!req.auth || req.auth.role !== 'admin') return res.json({ success: false, message: 'Non autorisé' });
                const targetId = parseInt(data.id || 0, 10);
                if (targetId <= 0) return res.json({ success: false, message: 'ID manquant' });
                const allowed = ['nom', 'prenom', 'email', 'age', 'telephone', 'role', 'categorie', 'status'];
                const { sql, params } = buildUpdate(allowed, data, targetId);
                if (!sql) return res.json({ success: false, message: 'Aucun champ' });
                await pool.query(sql, params);
                return res.json({ success: true });
            }

            // Mise à jour d'une présence (admin/coach)
            if (action === 'updatePresence') {
                if (!req.auth || !['admin', 'coach'].includes(req.auth.role)) {
                    return res.json({ success: false, message: 'Non autorisé' });
                }
                const presenceId = parseInt(data.presenceId || 0, 10);
                const newDate = data.date || '';
                if (!presenceId || !newDate) return res.json({ success: false, message: 'Paramètres manquants' });

                const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM presences WHERE date = ?', [newDate]);
                if (cnt >= 2) return res.json({ success: false, message: 'Samedi complet' });

                await pool.query('UPDATE presences SET date = ? WHERE id = ?', [newDate, presenceId]);
                return res.json({ success: true });
            }

            if (!req.auth) return res.json({ error: 'Non connecté' });
            const userId = req.auth.id;

            // Inscription pour une seule date
            if (data.presenceDate) {
                const date = data.presenceDate;
                const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM presences WHERE date = ?', [date]);
                if (cnt >= 2) return res.json({ success: false, message: 'Samedi complet' });

                const [[{ cnt: dup }]] = await pool.query('SELECT COUNT(*) as cnt FROM presences WHERE date = ? AND user_id = ?', [date, userId]);
                if (dup > 0) return res.json({ success: false, message: 'Déjà inscrit ce samedi' });

                const [result] = await pool.query('INSERT INTO presences (date, user_id) VALUES (?, ?)', [date, userId]);
                const player = await getUser(userId);
                notifyStaffNewRegistration(pool, player, date).catch(() => {});
                return res.json({ success: true, id: result.insertId });
            }

            // Inscription pour plusieurs dates
            if (Array.isArray(data.presenceDates)) {
                const results = {};
                const player = await getUser(userId);
                for (let date of data.presenceDates) {
                    date = String(date).trim();
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { results[date] = { success: false, message: 'Date invalide' }; continue; }

                    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM presences WHERE date = ?', [date]);
                    if (cnt >= 2) { results[date] = { success: false, message: 'Samedi complet' }; continue; }

                    const [[{ cnt: dup }]] = await pool.query('SELECT COUNT(*) as cnt FROM presences WHERE date = ? AND user_id = ?', [date, userId]);
                    if (dup > 0) { results[date] = { success: false, message: 'Déjà inscrit' }; continue; }

                    const [result] = await pool.query('INSERT INTO presences (date, user_id) VALUES (?, ?)', [date, userId]);
                    notifyStaffNewRegistration(pool, player, date).catch(() => {});
                    results[date] = { success: true, id: result.insertId };
                }
                if (data.commentaire !== undefined) {
                    await pool.query('UPDATE users SET commentaire = ? WHERE id = ?', [data.commentaire, userId]);
                }
                return res.json({ success: true, results });
            }

            // Fallback legacy : réservations par match
            let matchIds = [];
            if (Array.isArray(data.matchIds)) matchIds = data.matchIds;
            else if (data.matchId) matchIds = [data.matchId];

            if (matchIds.length > 0) {
                const results = {};
                for (let mId of matchIds) {
                    mId = parseInt(mId, 10);
                    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM bookings WHERE match_id = ?', [mId]);
                    if (cnt >= 2) { results[mId] = { success: false, message: 'Match complet' }; continue; }
                    const [[{ cnt: dup }]] = await pool.query('SELECT COUNT(*) as cnt FROM bookings WHERE match_id = ? AND user_id = ?', [mId, userId]);
                    if (dup > 0) { results[mId] = { success: false, message: 'Déjà inscrit' }; continue; }
                    const [result] = await pool.query('INSERT INTO bookings (match_id, user_id) VALUES (?, ?)', [mId, userId]);
                    results[mId] = { success: true, id: result.insertId };
                }
                return res.json({ success: true, results });
            }

            return res.json({ success: false, message: 'Payload invalide' });
        }

        if (req.method === 'DELETE') {
            if (!req.auth) return res.end();
            const id = parseInt(req.query.id || 0, 10);
            const userId = req.auth.id;
            const role = req.auth.role;

            if (req.query.type === 'presence') {
                if (id <= 0) return res.json({ success: false, message: 'ID manquant' });
                if (role === 'admin') {
                    await pool.query('DELETE FROM presences WHERE id = ?', [id]);
                } else {
                    await pool.query('DELETE FROM presences WHERE id = ? AND user_id = ?', [id, userId]);
                }
                return res.json({ success: true });
            }

            if (id <= 0) return res.json({ success: false, message: 'ID manquant' });
            if (role === 'admin') {
                await pool.query('DELETE FROM bookings WHERE id = ?', [id]);
            } else {
                await pool.query('DELETE FROM bookings WHERE id = ? AND user_id = ?', [id, userId]);
            }
            return res.json({ success: true });
        }

        res.status(404).json({ success: false, message: 'Non trouvé' });
    } catch (e) {
        console.error('bookings error:', e);
        res.status(500).json({ success: false, message: 'Erreur serveur', error: e.message });
    }
});

function buildUpdate(allowedCols, data, id) {
    const fields = [];
    const params = [];
    for (const col of allowedCols) {
        if (data[col] !== undefined) {
            fields.push(`${col} = ?`);
            params.push(data[col]);
        }
    }
    if (fields.length === 0) return { sql: null, params: [] };
    params.push(id);
    return { sql: `UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params };
}

async function getUser(id) {
    const [rows] = await pool.query('SELECT id, email, nom, prenom FROM users WHERE id = ?', [id]);
    return rows[0];
}

module.exports = router;
