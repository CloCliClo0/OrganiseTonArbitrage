const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'session';

function signSession(user) {
    return jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function setSessionCookie(res, user) {
    const token = signSession(user);
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.APP_ENV !== 'development',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
    });
}

function clearSessionCookie(res) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Décode le cookie de session s'il existe, sans bloquer la requête (req.auth = null sinon)
function readSession(req, res, next) {
    req.auth = null;
    const token = req.cookies && req.cookies[COOKIE_NAME];
    if (token) {
        try {
            req.auth = jwt.verify(token, process.env.JWT_SECRET); // { id, role }
        } catch (e) {
            req.auth = null;
        }
    }
    next();
}

function requireAuth(req, res, next) {
    if (!req.auth) {
        return res.status(401).json({ success: false, message: 'Non connecté' });
    }
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.auth || !roles.includes(req.auth.role)) {
            return res.status(403).json({ success: false, message: 'Non autorisé' });
        }
        next();
    };
}

module.exports = { signSession, setSessionCookie, clearSessionCookie, readSession, requireAuth, requireRole, COOKIE_NAME };
