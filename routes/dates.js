const express = require('express');
const pool = require('../db');

const router = express.Router();

router.all('/', async (req, res) => {
    try {
        if (req.method === 'GET') {
            const [rows] = await pool.query('SELECT date FROM session_dates ORDER BY date ASC');
            return res.json(rows.map(r => r.date));
        }

        if (req.method === 'POST') {
            if (!req.auth || req.auth.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Non autorisé' });
            }
            const date = String((req.body || {}).date || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.json({ success: false, message: 'Date invalide' });
            }
            const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM session_dates WHERE date = ?', [date]);
            if (cnt > 0) {
                return res.json({ success: false, message: 'Cette date est déjà ouverte à l\'inscription' });
            }
            await pool.query('INSERT INTO session_dates (date) VALUES (?)', [date]);
            return res.json({ success: true });
        }

        if (req.method === 'DELETE') {
            if (!req.auth || req.auth.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Non autorisé' });
            }
            const date = String(req.query.date || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.json({ success: false, message: 'Date invalide' });
            }
            const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM presences WHERE date = ?', [date]);
            if (cnt > 0) {
                return res.json({ success: false, message: 'Impossible de supprimer : des inscriptions existent pour cette date' });
            }
            await pool.query('DELETE FROM session_dates WHERE date = ?', [date]);
            return res.json({ success: true });
        }

        res.status(404).json({ success: false, message: 'Non trouvé' });
    } catch (e) {
        console.error('dates error:', e);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

module.exports = router;
