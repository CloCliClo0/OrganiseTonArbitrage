const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Toutes les actions passent par /api/auth.php?action=... pour rester compatible avec le frontend existant
router.all('/', async (req, res) => {
    const action = req.query.action || '';
    const data = req.body || {};

    try {
        // --- INSCRIPTION ---
        if (req.method === 'POST' && action === 'register') {
            const required = ['email', 'password', 'nom', 'prenom'];
            for (const field of required) {
                if (!data[field]) {
                    return res.json({ success: false, message: 'Champs obligatoires manquants' });
                }
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
                return res.json({ success: false, message: 'Email invalide' });
            }
            if (String(data.password).length < 6) {
                return res.json({ success: false, message: 'Mot de passe trop court (6 caractères min.)' });
            }

            const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [data.email]);
            if (existing.length > 0) {
                return res.json({ success: false, message: 'Email déjà utilisé' });
            }

            const code = (data.code || '').trim();
            let role = 'joueur';
            if (code && process.env.CODE_ADMIN && code === process.env.CODE_ADMIN) {
                role = 'admin';
            } else if (code && process.env.CODE_COACH && code === process.env.CODE_COACH) {
                role = 'coach';
            }

            const hash = await bcrypt.hash(data.password, 10);
            const categorie = data.cat || null;

            await pool.query(
                'INSERT INTO users (email, password, nom, prenom, age, telephone, categorie, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [data.email, hash, data.nom, data.prenom, data.age || null, data.tel || null, categorie, role]
            );
            return res.json({ success: true });
        }

        // --- CONNEXION ---
        if (req.method === 'POST' && action === 'login') {
            const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [data.email]);
            const user = rows[0];

            if (user && await bcrypt.compare(data.password || '', user.password)) {
                delete user.password;
                setSessionCookie(res, user);
                return res.json({ success: true, user });
            }
            return res.json({ success: false, message: 'Identifiants incorrects' });
        }

        // --- LOGOUT ---
        if (action === 'logout') {
            clearSessionCookie(res);
            return res.json({ success: true });
        }

        // --- CODES D'INVITATION (admin) ---
        if (req.method === 'GET' && action === 'invite-codes') {
            if (!req.auth || req.auth.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Non autorisé' });
            }
            return res.json({
                success: true,
                codeAdmin: process.env.CODE_ADMIN || '',
                codeCoach: process.env.CODE_COACH || '',
            });
        }

        // --- ME ---
        if (req.method === 'GET' && action === 'me') {
            if (!req.auth) {
                return res.json({ success: false, user: null });
            }
            const [rows] = await pool.query(
                'SELECT id, email, nom, prenom, age, telephone, categorie, role FROM users WHERE id = ?',
                [req.auth.id]
            );
            if (!rows[0]) return res.json({ success: false, user: null });
            return res.json({ success: true, user: rows[0] });
        }

        res.status(404).json({ success: false, message: 'Action inconnue' });
    } catch (e) {
        console.error('auth error:', e);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

module.exports = router;
