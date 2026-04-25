const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
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

app.use(helmet());

// CORS — reads allowed_origins from DB on each request so changes take effect immediately.
// Requests with no origin (Daraja callbacks, mobile apps, curl) are always allowed.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'];

app.use(cors({
  origin: async (origin, cb) => {
    if (!origin) return cb(null, true);
    try {
      const raw = await configService.get('allowed_origins', '');
      const allowed = raw
        ? raw.split(',').map((o) => o.trim()).filter(Boolean)
        : DEV_ORIGINS;
      if (allowed.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    } catch {
      // Fail closed in production — never fall back to dev origins if the config layer is broken.
      if (process.env.NODE_ENV !== 'production' && DEV_ORIGINS.includes(origin)) return cb(null, true);
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
app.use('/api/v1/redeem',                  redeemLimiter); // code brute-force guard
app.use('/api/',                       generalLimiter);

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

// Serve built portal as captive portal page
const portalDist = path.join(__dirname, '../portal/dist');
app.use(express.static(portalDist));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(portalDist, 'index.html'));
});

app.use(errorHandler);

module.exports = app;
