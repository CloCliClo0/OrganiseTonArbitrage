const express = require('express');
const pool = require('../db');

const router = express.Router();

router.all('/', async (req, res) => {
    const data = req.body || {};

    try {
        if (req.method === 'GET') {
            const [rows] = await pool.query('SELECT * FROM matches ORDER BY date ASC, time ASC');
            return res.json(rows);
        }

        if (req.method === 'POST') {
            const action = req.query.action || '';

            if (action === 'update') {
                if (!req.auth || !['admin', 'coach'].includes(req.auth.role)) {
                    return res.status(403).json({ error: 'Non autorisé' });
                }
                const id = parseInt(data.id || 0, 10);
                if (id <= 0) return res.json({ success: false, message: 'ID manquant' });
                await pool.query(
                    'UPDATE matches SET date = ?, time = ?, opponent = ?, location = ?, category = ? WHERE id = ?',
                    [data.date, data.time, data.opponent, data.location, data.category, id]
                );
                return res.json({ success: true });
            }

            if (!req.auth || !['admin', 'coach'].includes(req.auth.role)) {
                return res.status(403).json({ error: 'Non autorisé' });
            }
            const [result] = await pool.query(
                'INSERT INTO matches (date, time, opponent, location, category) VALUES (?, ?, ?, ?, ?)',
                [data.date, data.time, data.opponent, data.location, data.category]
            );
            return res.json({ success: true, id: result.insertId });
        }

        if (req.method === 'DELETE') {
            if (!req.auth || req.auth.role !== 'admin') {
                return res.status(403).json({ error: 'Non autorisé' });
            }
            const id = parseInt(req.query.id || 0, 10);
            if (id <= 0) return res.json({ success: false, message: 'ID manquant' });
            await pool.query('DELETE FROM matches WHERE id = ?', [id]);
            return res.json({ success: true });
        }

        res.status(404).json({ success: false });
    } catch (e) {
        console.error('matches error:', e);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

module.exports = router;
