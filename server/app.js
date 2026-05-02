const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const configService = require('./services/configService');

const bundlesRouter      = require('./routes/bundles');
const paymentRouter      = require('./routes/payment');
const sessionRouter      = require('./routes/session');
const redeemRouter       = require('./routes/redeem');
const authRouter         = require('./routes/auth');
const adminRouter        = require('./routes/admin');
const operatorAuthRouter = require('./routes/operatorAuth');
const operatorPortalRouter = require('./routes/operatorPortal');
const settingsRouter     = require('./routes/settings');
const analyticsRouter    = require('./routes/analytics');
const errorHandler       = require('./middleware/errorHandler');

const app = express();

// Trust the first proxy hop (Render's load balancer) so req.ip and
// express-rate-limit see the real client IP, not the proxy's internal IP.
app.set('trust proxy', 1);

app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true } }));

// CORS — checks ALLOWED_ORIGINS env var first (static, set on Render), then DB setting
// (dynamic, editable via admin dashboard). Requests with no origin are always allowed.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];
const DEV_PRIVATE_ORIGIN_RE = /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d{1,5})?$/i;
const ENV_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: async (origin, cb) => {
    if (!origin) return cb(null, true);
    if (ENV_ORIGINS.includes(origin)) return cb(null, true);
    try {
      const raw = await configService.get('allowed_origins', '');
      const dbOrigins = raw ? raw.split(',').map((o) => o.trim()).filter(Boolean) : [];
      // In non-production fall back to dev origins when DB has no list configured yet.
      // In production an empty allowed_origins blocks all cross-origin requests (fail-secure).
      const allowed = dbOrigins.length > 0
        ? dbOrigins
        : (process.env.NODE_ENV !== 'production' ? DEV_ORIGINS : []);
      if (allowed.includes(origin)) return cb(null, true);
      // Local/LAN testing: allow private-network origins in non-production.
      if (process.env.NODE_ENV !== 'production' && DEV_PRIVATE_ORIGIN_RE.test(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    } catch {
      if (process.env.NODE_ENV !== 'production' && (DEV_ORIGINS.includes(origin) || DEV_PRIVATE_ORIGIN_RE.test(origin))) return cb(null, true);
      cb(new Error('CORS check failed'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// ── Rate limiters ─────────────────────────────────────────────────────────────

// Payment initiation — STK push costs money; 5 per IP per minute
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many payment requests. Please wait a minute and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth + seed endpoints — brute-force protection (20 per IP per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Voucher redemption — brute-force code guessing protection (10 per IP per minute)
const redeemLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many redemption attempts. Please wait a minute and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API — prevent scraping / DoS (120 per IP per minute)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, message: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Operator write actions (bundle create/update, session grant) — keyed by token, not IP
const operatorWriteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  skip: (req) => req.method === 'GET',
  keyGenerator: (req) => req.headers.authorization?.split(' ')[1]?.slice(-16) || ipKeyGenerator(req),
  message: { success: false, message: 'Too many requests from this account. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Settlement requests — stricter: 5 per operator per day
const settlementRequestLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.headers.authorization?.split(' ')[1]?.slice(-16) || ipKeyGenerator(req),
  message: { success: false, message: 'You can only request payouts 5 times per day.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// CSV export endpoints — prevent DB-hammering large exports (10 per hour per admin)
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.headers.authorization?.split(' ')[1]?.slice(-16) || ipKeyGenerator(req),
  message: { success: false, message: 'Export rate limit reached. Try again in an hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Specific limiters must be registered before the general one
app.use('/api/v1/payment/initiate',    paymentLimiter);
app.use('/api/v1/payment/verify',      paymentLimiter);
app.use('/api/v1/auth/login',               authLimiter);
app.use('/api/v1/auth/forgot-password',    authLimiter);
app.use('/api/v1/auth/reset-password',     authLimiter);
app.use('/api/v1/operator/auth/login',     authLimiter);
app.use('/api/v1/operator/auth/signup',   authLimiter); // prevent PENDING-operator spam
app.use('/api/v1/admin/seed',              authLimiter); // brute-force guard on bootstrap token
app.use('/api/v1/redeem',                        redeemLimiter);
app.use('/api/v1/operator/settlements/request',  settlementRequestLimiter);
app.use('/api/v1/operator',                      operatorWriteLimiter);
app.use('/api/v1/admin/sessions/export',         exportLimiter);
app.use('/api/v1/admin/transactions/export',     exportLimiter);
app.use('/api/v1/admin/vouchers/export',         exportLimiter);
app.use('/api/',                                 generalLimiter);

app.use('/api/v1/bundles',         bundlesRouter);
app.use('/api/v1/payment',         paymentRouter);
app.use('/api/v1/session',         sessionRouter);
app.use('/api/v1/redeem',          redeemRouter);
app.use('/api/v1/auth',            authRouter);
app.use('/api/v1/admin',           adminRouter);
app.use('/api/v1/operator/auth',   operatorAuthRouter);
app.use('/api/v1/operator',        operatorPortalRouter);
app.use('/api/v1/admin/settings',  settingsRouter);
app.use('/api/v1/admin/analytics', analyticsRouter);

// Serve built portal only when dist exists (local dev / self-hosted; skipped on Render)
const portalDist = path.join(__dirname, '../portal/dist');
const portalBuilt = fs.existsSync(path.join(portalDist, 'index.html'));

if (portalBuilt) {
  app.use(express.static(portalDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(portalDist, 'index.html'));
  });
}

app.use(errorHandler);

module.exports = app;
