const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || '',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || '',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    charset: 'utf8mb4_general_ci',
    dateStrings: true, // renvoie les colonnes DATE/DATETIME en chaînes 'YYYY-MM-DD' (évite les décalages de fuseau horaire)
});

module.exports = pool;
