const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
    if (!req.auth || req.auth.role !== 'admin') {
        return res.status(404).end();
    }

    const keys = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS', 'SUPER_ADMIN_EMAIL', 'CODE_ADMIN', 'CODE_COACH', 'SMTP_HOST'];
    const out = { ok: true, env: {}, session: null, counts: {} };
    keys.forEach(k => { out.env[k] = !!process.env[k]; });
    out.session = { id: req.auth.id, role: req.auth.role };

    try {
        const [[u]] = await pool.query('SELECT COUNT(*) as c FROM users');
        const [[m]] = await pool.query('SELECT COUNT(*) as c FROM matches');
        const [[b]] = await pool.query('SELECT COUNT(*) as c FROM bookings');
        out.counts = { users: u.c, matches: m.c, bookings: b.c };
    } catch (e) {
        out.ok = false;
        out.error = e.message;
    }

    res.json(out);
});

module.exports = router;
