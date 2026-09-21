const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
    if (!req.auth || req.auth.role !== 'admin') {
        return res.status(404).end();
    }

    const keys = [
        'DB_HOST', 'DB_TEST_NAME', 'DB_TEST_USER', 'DB_TEST_PASS',
        'DB_PROD_NAME', 'DB_PROD_USER', 'DB_PROD_PASS',
        'SUPER_ADMIN_EMAIL', 'CODE_ADMIN', 'CODE_COACH', 'SMTP_HOST',
    ];
    const out = { ok: true, env: {}, session: null, counts: {}, dbTarget: process.env.APP_ENV === 'production' ? 'prod' : 'test' };
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
