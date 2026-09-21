const express = require('express');
const pool = require('../db');

const router = express.Router();

router.all('/', async (req, res) => {
    try {
        if (req.method === 'GET') {
            const [rows] = await pool.query('SELECT name FROM categories ORDER BY name ASC');
            return res.json(rows.map(r => r.name));
        }

        if (req.method === 'POST') {
            if (!req.auth || req.auth.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Non autorisé' });
            }
            const name = String((req.body || {}).name || '').trim();
            if (!name) {
                return res.json({ success: false, message: 'Nom de catégorie invalide' });
            }
            const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM categories WHERE name = ?', [name]);
            if (cnt > 0) {
                return res.json({ success: false, message: 'Cette catégorie existe déjà' });
            }
            await pool.query('INSERT INTO categories (name) VALUES (?)', [name]);
            return res.json({ success: true });
        }

        if (req.method === 'DELETE') {
            if (!req.auth || req.auth.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Non autorisé' });
            }
            const name = String(req.query.name || '').trim();
            if (!name) {
                return res.json({ success: false, message: 'Nom de catégorie invalide' });
            }
            const [[{ cnt }]] = await pool.query('SELECT COUNT(*) as cnt FROM users WHERE categorie = ?', [name]);
            if (cnt > 0) {
                return res.json({ success: false, message: 'Impossible de supprimer : des utilisateurs sont dans cette catégorie' });
            }
            await pool.query('DELETE FROM categories WHERE name = ?', [name]);
            return res.json({ success: true });
        }

        res.status(404).json({ success: false, message: 'Non trouvé' });
    } catch (e) {
        console.error('categories error:', e);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

module.exports = router;
