const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db');
const { setSessionCookie, clearSessionCookie, requireAuth } = require('../middleware/auth');
const { sendVerificationEmail } = require('../mailer');

function buildVerifyUrl(req, token) {
    const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    return `${base}/?verify=${token}`;
}

const router = express.Router();

// Toutes les actions passent par /api/auth.php?action=... pour rester compatible avec le frontend existant
router.all('/', async (req, res) => {
    const action = req.query.action || '';
    const data = req.body || {};

    try {
        // --- INSCRIPTION ---
        if (req.method === 'POST' && action === 'register') {
            const required = ['email', 'password', 'nom', 'prenom'];
            for (const field of required) {
                if (!data[field]) {
                    return res.json({ success: false, message: 'Champs obligatoires manquants' });
                }
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
                return res.json({ success: false, message: 'Email invalide' });
            }
            if (String(data.password).length < 6) {
                return res.json({ success: false, message: 'Mot de passe trop court (6 caractères min.)' });
            }

            const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [data.email]);
            if (existing.length > 0) {
                return res.json({ success: false, message: 'Email déjà utilisé' });
            }

            const code = (data.code || '').trim();
            let role = null;
            if (code && process.env.CODE_ADMIN && code === process.env.CODE_ADMIN) {
                role = 'admin';
            } else if (code && process.env.CODE_COACH && code === process.env.CODE_COACH) {
                role = 'coach';
            } else if (code && process.env.CODE_JOUEUR && code === process.env.CODE_JOUEUR) {
                role = 'joueur';
            }

            if (!role) {
                return res.json({ success: false, message: "Code d'invitation invalide ou manquant. L'inscription se fait uniquement via un lien d'invitation fourni par le club." });
            }

            const hash = await bcrypt.hash(data.password, 10);
            const categorie = data.cat || null;
            const verifyToken = crypto.randomBytes(32).toString('hex');

            await pool.query(
                'INSERT INTO users (email, password, nom, prenom, age, telephone, categorie, role, email_verified, verify_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
                [data.email, hash, data.nom, data.prenom, data.age || null, data.tel || null, categorie, role, verifyToken]
            );

            const verifyUrl = buildVerifyUrl(req, verifyToken);
            sendVerificationEmail({ email: data.email, nom: data.nom, prenom: data.prenom }, verifyUrl).catch(() => {});

            return res.json({ success: true, message: 'Compte créé ! Vérifiez votre boîte mail pour valider votre adresse avant de vous connecter.' });
        }

        // --- RENVOI EMAIL DE VALIDATION ---
        if (req.method === 'POST' && action === 'resend-verification') {
            const email = String(data.email || '').trim();
            // Réponse générique dans tous les cas : ne révèle pas si l'email existe en base
            const generic = { success: true, message: "Si un compte existe avec cet email et n'est pas encore vérifié, un nouvel email vient d'être envoyé." };
            if (!email) return res.json(generic);

            const [rows] = await pool.query('SELECT id, nom, prenom, email_verified FROM users WHERE email = ?', [email]);
            const user = rows[0];
            if (!user || user.email_verified) return res.json(generic);

            const verifyToken = crypto.randomBytes(32).toString('hex');
            await pool.query('UPDATE users SET verify_token = ? WHERE id = ?', [verifyToken, user.id]);

            const verifyUrl = buildVerifyUrl(req, verifyToken);
            sendVerificationEmail({ email, nom: user.nom, prenom: user.prenom }, verifyUrl).catch(() => {});

            return res.json(generic);
        }

        // --- VALIDATION EMAIL (lien reçu par mail) ---
        if (req.method === 'GET' && action === 'verify') {
            const token = String(req.query.token || '').trim();
            if (!token) {
                return res.json({ success: false, message: 'Lien de vérification invalide' });
            }
            const [rows] = await pool.query('SELECT id FROM users WHERE verify_token = ?', [token]);
            if (!rows[0]) {
                return res.json({ success: false, message: 'Lien de vérification invalide ou déjà utilisé' });
            }
            await pool.query('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?', [rows[0].id]);
            return res.json({ success: true, message: 'Adresse email validée ! Vous pouvez maintenant vous connecter.' });
        }

        // --- CONNEXION ---
        if (req.method === 'POST' && action === 'login') {
            const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [data.email]);
            const user = rows[0];

            if (user && await bcrypt.compare(data.password || '', user.password)) {
                if (!user.email_verified) {
                    return res.json({
                        success: false,
                        unverified: true,
                        message: 'Merci de valider votre email avant de vous connecter (vérifiez votre boîte mail, y compris les spams).',
                    });
                }
                delete user.password;
                delete user.verify_token;
                setSessionCookie(res, user);
                return res.json({ success: true, user });
            }
            return res.json({ success: false, message: 'Identifiants incorrects' });
        }

        // --- LOGOUT ---
        if (action === 'logout') {
            clearSessionCookie(res);
            return res.json({ success: true });
        }

        // --- CODES D'INVITATION (admin) ---
        if (req.method === 'GET' && action === 'invite-codes') {
            if (!req.auth || req.auth.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'Non autorisé' });
            }
            return res.json({
                success: true,
                codeAdmin: process.env.CODE_ADMIN || '',
                codeCoach: process.env.CODE_COACH || '',
                codeJoueur: process.env.CODE_JOUEUR || '',
            });
        }

        // --- ME ---
        if (req.method === 'GET' && action === 'me') {
            if (!req.auth) {
                return res.json({ success: false, user: null });
            }
            const [rows] = await pool.query(
                'SELECT id, email, nom, prenom, age, telephone, categorie, role FROM users WHERE id = ?',
                [req.auth.id]
            );
            if (!rows[0]) return res.json({ success: false, user: null });
            return res.json({ success: true, user: rows[0] });
        }

        res.status(404).json({ success: false, message: 'Action inconnue' });
    } catch (e) {
        console.error('auth error:', e);
        res.status(500).json({ success: false, message: 'Erreur serveur' });
    }
});

module.exports = router;
