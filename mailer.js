const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;
    if (!process.env.SMTP_HOST) return null;

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: (process.env.SMTP_SECURE || 'tls').toLowerCase() === 'ssl', // true = SSL (465), false = STARTTLS (587)
        auth: process.env.SMTP_USER ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        } : undefined,
    });
    return transporter;
}

/**
 * Envoie un email. Ne lance jamais d'exception vers l'appelant : une erreur
 * d'envoi ne doit jamais faire échouer une inscription/réservation.
 */
async function sendMail(toEmail, toName, subject, html) {
    const t = getTransporter();
    if (!t || !toEmail) {
        console.warn(`sendMail: SMTP non configuré ou destinataire manquant (${toEmail})`);
        return false;
    }
    try {
        await t.sendMail({
            from: `"${process.env.SMTP_FROM_NAME || 'PlannifierMonArbitrage'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
            to: `"${toName || toEmail}" <${toEmail}>`,
            subject,
            html,
        });
        return true;
    } catch (e) {
        console.error('sendMail error:', e.message);
        return false;
    }
}

function emailLayout(title, bodyHtml) {
    return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
        <div style="background:#1e3a8a;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h1 style="margin:0;font-size:18px;">🏐 PlannifierMonArbitrage</h1>
        </div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
            <h2 style="margin-top:0;font-size:16px;color:#111827;">${escapeHtml(title)}</h2>
            ${bodyHtml}
            <p style="margin-top:24px;font-size:12px;color:#9ca3af;">Cet email est envoyé automatiquement, merci de ne pas y répondre.</p>
        </div></div>`;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function formatDateFr(dateStr, opts) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', opts);
}

/**
 * Notifie les admins/coachs quand un joueur s'inscrit comme arbitre pour une date.
 */
async function notifyStaffNewRegistration(pool, player, date) {
    let staff;
    try {
        const [rows] = await pool.query(
            "SELECT email, nom, prenom FROM users WHERE role IN ('admin','coach') AND COALESCE(status,'active') = 'active'"
        );
        staff = rows;
    } catch (e) {
        console.error('notifyStaffNewRegistration:', e.message);
        return;
    }
    if (!staff || staff.length === 0) return;

    const dateFmt = formatDateFr(date, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const subject = `Nouvelle inscription arbitre - ${dateFmt}`;
    const body = `<p><strong>${escapeHtml(player.prenom)} ${escapeHtml(player.nom)}</strong> vient de s'inscrire comme arbitre pour le <strong>${dateFmt}</strong>.</p>
        <p>Email du joueur : ${escapeHtml(player.email)}</p>`;
    const html = emailLayout('Nouvelle inscription arbitre', body);

    for (const s of staff) {
        await sendMail(s.email, `${s.prenom} ${s.nom}`, subject, html);
    }
}

/**
 * Envoie un rappel à un joueur pour une inscription à venir.
 */
async function sendPlayerReminder(player, date) {
    const dateFmt = formatDateFr(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const subject = `Rappel : vous arbitrez le ${dateFmt}`;
    const body = `<p>Bonjour ${escapeHtml(player.prenom)},</p>
        <p>Petit rappel : vous êtes inscrit(e) pour arbitrer le <strong>${dateFmt}</strong>.</p>
        <p>Merci de contacter un responsable si vous ne pouvez finalement pas être présent(e).</p>`;
    const html = emailLayout("Rappel d'inscription", body);

    return sendMail(player.email, `${player.prenom} ${player.nom}`, subject, html);
}

/**
 * Envoie le lien de validation d'adresse email après inscription.
 */
async function sendVerificationEmail(user, verifyUrl) {
    const subject = 'Validez votre adresse email';
    const body = `<p>Bonjour ${escapeHtml(user.prenom)},</p>
        <p>Merci de votre inscription sur PlannifierMonArbitrage. Cliquez sur le bouton ci-dessous pour valider votre adresse email et activer votre compte :</p>
        <p style="margin:24px 0;"><a href="${escapeHtml(verifyUrl)}" style="background:#16a34a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Valider mon email</a></p>
        <p style="font-size:12px;color:#6b7280;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${escapeHtml(verifyUrl)}</p>`;
    const html = emailLayout('Validez votre adresse email', body);
    return sendMail(user.email, `${user.prenom} ${user.nom}`, subject, html);
}

module.exports = { sendMail, notifyStaffNewRegistration, sendPlayerReminder, sendVerificationEmail, emailLayout };
