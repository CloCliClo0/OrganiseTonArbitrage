require('dotenv').config();

/**
 * Envoie un rappel par email aux joueurs inscrits pour une date à venir
 * (X jours avant, X = REMINDER_DAYS_BEFORE dans .env, 3 par défaut).
 *
 * À exécuter une fois par jour via les Cron Jobs de Hostinger :
 *   node /chemin/vers/cron_reminders.js
 */

const pool = require('./db');
const { sendPlayerReminder } = require('./mailer');

async function main() {
    const daysBefore = parseInt(process.env.REMINDER_DAYS_BEFORE || '3', 10);
    const target = new Date();
    target.setDate(target.getDate() + daysBefore);
    const targetDate = target.toISOString().slice(0, 10);

    const [rows] = await pool.query(
        `SELECT p.id, p.date, u.email, u.nom, u.prenom
         FROM presences p JOIN users u ON p.user_id = u.id
         WHERE p.date = ? AND COALESCE(p.reminder_sent, 0) = 0`,
        [targetDate]
    );

    let sent = 0;
    let failed = 0;

    for (const row of rows) {
        const ok = await sendPlayerReminder(row, row.date);
        if (ok) {
            await pool.query('UPDATE presences SET reminder_sent = 1 WHERE id = ?', [row.id]);
            sent++;
        } else {
            failed++;
        }
    }

    console.log(JSON.stringify({ success: true, date_cible: targetDate, envoyes: sent, echecs: failed }));
    process.exit(0);
}

main().catch((e) => {
    console.error('cron_reminders error:', e);
    process.exit(1);
});
