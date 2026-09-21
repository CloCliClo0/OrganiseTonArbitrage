const mysql = require('mysql2/promise');

// En production on se connecte à DB_PROD_*, sinon (dev/test) à DB_TEST_*
const isProd = process.env.APP_ENV === 'production';
const dbUser = isProd ? process.env.DB_PROD_USER : process.env.DB_TEST_USER;
const dbPass = isProd ? process.env.DB_PROD_PASS : process.env.DB_TEST_PASS;
const dbName = isProd ? process.env.DB_PROD_NAME : process.env.DB_TEST_NAME;

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: dbUser || '',
    password: dbPass || '',
    database: dbName || '',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: 'utf8mb4_general_ci',
    dateStrings: true, // renvoie les colonnes DATE/DATETIME en chaînes 'YYYY-MM-DD' (évite les décalages de fuseau horaire)
});

module.exports = pool;
