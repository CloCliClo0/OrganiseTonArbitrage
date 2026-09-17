console.log(`[boot] server.js démarre — pid=${process.pid} node=${process.version} cwd=${process.cwd()} time=${new Date().toISOString()}`);

process.on('uncaughtException', (err) => {
    console.error('[fatal] uncaughtException:', err);
    process.exit(1);
});
process.on('unhandledRejection', (err) => {
    console.error('[fatal] unhandledRejection:', err);
    process.exit(1);
});

try {
    require('dotenv').config();

    const express = require('express');
    const cookieParser = require('cookie-parser');
    const path = require('path');
    const pool = require('./db');
    const { readSession } = require('./middleware/auth');

    console.log('[boot] dépendances chargées, initialisation Express...');

    const app = express();
    app.disable('x-powered-by');

    app.use(express.json());
    app.use(cookieParser());
    app.use(readSession);

    // --- Routes API (mêmes URLs que l'ancien backend PHP, pour rester compatible avec js/script.js) ---
    app.use('/api/auth.php', require('./routes/auth'));
    app.use('/api/bookings.php', require('./routes/bookings'));
    app.use('/api/matches.php', require('./routes/matches'));
    app.use('/api/debug.php', require('./routes/debug'));

    // --- Health check (indépendant du reste, ne doit jamais planter) ---
    app.get(['/health', '/health.php'], async (req, res) => {
        const checks = { node_version: process.version };
        let dbOk = false;
        let dbError = null;
        try {
            await pool.query('SELECT 1');
            dbOk = true;
        } catch (e) {
            dbError = e.message;
        }
        checks.database = dbOk ? 'ok' : 'error';
        if (!dbOk && process.env.APP_ENV === 'development') checks.database_error = dbError;
        checks.smtp_configured = !!process.env.SMTP_HOST;

        res.status(dbOk ? 200 : 503).json({
            status: dbOk ? 'ok' : 'degraded',
            time: new Date().toISOString(),
            checks,
        });
    });

    // --- Fichiers statiques du frontend (uniquement public/, jamais la racine du projet) ---
    app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

    const PORT = process.env.PORT || 3000;
    const server = app.listen(PORT, () => {
        console.log(`[boot] PlannifierMonArbitrage démarré et à l'écoute sur le port ${PORT}`);
    });
    server.on('error', (err) => {
        console.error('[fatal] échec app.listen():', err);
        process.exit(1);
    });
} catch (err) {
    console.error('[fatal] erreur pendant l\'initialisation de server.js:', err);
    process.exit(1);
}
