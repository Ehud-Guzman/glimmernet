const express = require('express');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const Device = require('../models/Device');
const Operator = require('../models/Operator');
const Bundle = require('../models/Bundle');
const { createProvisionedSession, syncSessionState } = require('../services/sessionService');
const { sendTrialNotice } = require('../services/notificationService');
const { createResumeToken, verifyResumeToken } = require('../utils/helpers');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/v1/session/resume?mac=XX&op=SHORTCODE
// Lightweight MAC-based lookup for the portal (no token required, but returns one).
// Used by the portal on page load to restore a session without prompting for payment.
router.get('/resume', async (req, res, next) => {
  try {
    const mac = req.query.mac;
    const opCode = req.query.op || '';
    if (!mac) return res.json({ active: false });

    const macUpper = mac.toUpperCase();
    const query = {
      macAddress: macUpper,
      status: 'ACTIVE',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    };

    if (opCode) {
      const op = await Operator.findOne({ shortCode: opCode.toUpperCase(), status: 'ACTIVE' }).select('_id');
      if (!op) return res.json({ active: false });
      query.operatorId = op._id;
    }

    let session = await Session.findOne(query).sort({ createdAt: -1 });
    if (!session) return res.json({ active: false });
    session = await syncSessionState(session);
    if (!session || session.status !== 'ACTIVE') return res.json({ active: false });

    await Device.findOneAndUpdate(
      { macAddress: macUpper },
      { lastSeen: new Date() },
      { upsert: true }
    );

    res.json({
      active: true,
      username: session.username,
      password: session.password,
      expiresAt: session.expiresAt,
      resumeToken: createResumeToken(session),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/session/resume
// Requires a signed resume token previously issued for the same session/browser.
router.post('/resume', async (req, res, next) => {
  try {
    const { mac, operatorShortCode = '', resumeToken } = req.body;
    if (!mac || !resumeToken) return res.json({ active: false });

    let decoded;
    try {
      decoded = verifyResumeToken(resumeToken);
    } catch {
      return res.json({ active: false });
    }

    if (decoded.type !== 'session_resume') return res.json({ active: false });

    const macUpper = mac.toUpperCase();
    if ((decoded.mac || '').toUpperCase() !== macUpper) return res.json({ active: false });

    let expectedOperatorId = '';
    if (operatorShortCode) {
      const op = await Operator.findOne({ shortCode: operatorShortCode.toUpperCase(), status: 'ACTIVE' }).select('_id');
      if (!op) return res.json({ active: false });
      expectedOperatorId = op._id.toString();
    }

    if ((decoded.operatorId || '') !== expectedOperatorId) return res.json({ active: false });

    let session = await Session.findOne({
      _id: decoded.sid,
      macAddress: macUpper,
      status: 'ACTIVE',
      ...(expectedOperatorId ? { operatorId: expectedOperatorId } : { operatorId: null }),
    }).sort({ createdAt: -1 });

    if (!session) return res.json({ active: false });
    session = await syncSessionState(session);
    if (!session || session.status !== 'ACTIVE') return res.json({ active: false });

    // Update device last-seen
    await Device.findOneAndUpdate(
      { macAddress: macUpper },
      { lastSeen: new Date() },
      { upsert: true }
    );

    res.json({
      active: true,
      username: session.username,
      password: session.password,
      expiresAt: session.expiresAt,
      resumeToken: createResumeToken(session),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/session/trial
// Grant a free trial session to a new device. Each MAC can only trial once per operator.
router.post('/trial', async (req, res, next) => {
  try {
    const { mac, operatorShortCode, phone = '' } = req.body;
    if (!mac || !operatorShortCode) {
      return res.status(400).json({ success: false, message: 'mac and operatorShortCode are required' });
    }

    const macUpper = mac.toUpperCase();

    const operator = await Operator.findOne({ shortCode: operatorShortCode.toUpperCase(), status: 'ACTIVE' });
    if (!operator) return res.status(404).json({ success: false, message: 'Operator not found' });
    if (!operator.trialMinutes || operator.trialMinutes <= 0) {
      return res.status(400).json({ success: false, message: 'Free trial is not enabled at this location.' });
    }

    // Check for an existing active session before consuming the trial slot
    const existingSession = await Session.findOne({
      macAddress: macUpper,
      status: 'ACTIVE',
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (existingSession) {
      return res.json({
        success: true,
        username: existingSession.username,
        password: existingSession.password,
        expiresAt: existingSession.expiresAt,
        resumed: true,
      });
    }

    // Atomically claim the trial slot — prevents TOCTOU race where two concurrent
    // requests both pass the check before either writes $addToSet.
    const claimed = await Device.findOneAndUpdate(
      { macAddress: macUpper, trialsUsed: { $ne: operator._id } },
      { phone, lastSeen: new Date(), $addToSet: { trialsUsed: operator._id } },
      { upsert: true, new: true }
    ).catch(() => null);

    if (!claimed) {
      return res.status(400).json({ success: false, message: 'You have already used your free trial here.' });
    }

    const trialBundle = await Bundle.findOne({
      operatorId: operator._id,
      isActive: true,
      mikrotikProfile: { $ne: null },
    });
    if (!trialBundle) {
      // Roll back the claimed slot — the failure is a config issue, not the user's fault.
      await Device.updateOne({ macAddress: macUpper }, { $pull: { trialsUsed: operator._id } }).catch((e) => {
        logger.error('Trial slot rollback failed — user may lose future trial eligibility', { mac: macUpper, operatorId: operator._id, error: e.message });
      });
      return res.status(400).json({
        success: false,
        message: 'Free trial is configured, but no active bundle/profile is available for access provisioning.',
      });
    }

    let session;
    try {
      session = await createProvisionedSession({
        phone,
        macAddress: macUpper,
        bundle: trialBundle,
        operator,
        isTrial: true,
        trialMinutes: operator.trialMinutes,
        comment: 'trial',
        usernameSeed: phone || macUpper,
      });
    } catch (err) {
      // Roll back the claimed slot so the user can retry once the router is back.
      await Device.updateOne({ macAddress: macUpper }, { $pull: { trialsUsed: operator._id } }).catch((e) => {
        logger.error('Trial slot rollback failed — user may lose future trial eligibility', { mac: macUpper, operatorId: operator._id, error: e.message });
      });
      logger.error('Trial provisioning failed', { mac: macUpper, message: err.message });
      return res.status(503).json({
        success: false,
        message: 'Free trial could not be activated automatically right now. Please try again in a moment.',
      });
    }

    // Zero-amount transaction record so trial activity appears in operator analytics
    Transaction.create({
      phone: phone || macUpper,
      amount: 0,
      bundleId: trialBundle._id,
      status: 'SUCCESS',
      macAddress: macUpper,
      operatorId: operator._id,
      platformFee: 0,
      operatorNet: 0,
      sessionId: session._id,
      isTrial: true,
    }).catch((e) => logger.warn('Trial transaction record failed', { mac: macUpper, err: e.message }));

    // Fire-and-forget SMS notice
    sendTrialNotice({
      phone,
      brandName: operator.brandName || operator.name,
      trialMinutes: operator.trialMinutes,
      supportPhone: operator.supportPhone,
    });

    logger.info('Trial session created', { mac: macUpper, operatorId: operator._id, trialMinutes: operator.trialMinutes });

    res.json({
      success: true,
      username: session.username,
      password: session.password,
      expiresAt: session.expiresAt,
      trialMinutes: operator.trialMinutes,
      resumed: false,
      resumeToken: createResumeToken(session),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/session/my?mac=XX&op=SHORTCODE — customer-facing session status page
router.get('/my', async (req, res, next) => {
  try {
    const mac = req.query.mac;
    const opCode = req.query.op || '';
    if (!mac) return res.status(400).json({ success: false, message: 'mac is required' });

    const macUpper = mac.toUpperCase();
    const query = { macAddress: macUpper };

    let operator = null;
    if (opCode) {
      operator = await Operator.findOne({ shortCode: opCode.toUpperCase(), status: 'ACTIVE' }).select(
        'name brandName brandTagline accentColor logoUrl supportPhone supportWhatsapp supportEmail'
      );
      if (!operator) return res.status(404).json({ success: false, message: 'Location not found' });
      query.operatorId = operator._id;
    }

    const [activeSession, recentSessions] = await Promise.all([
      Session.findOne({ ...query, status: 'ACTIVE', $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
        .populate('bundleId', 'name price durationMinutes')
        .sort({ createdAt: -1 }),
      Session.find(query)
        .sort({ createdAt: -1 })
        .limit(5)
        .select('status startTime expiresAt isTrial bundleId createdAt')
        .populate('bundleId', 'name price'),
    ]);

    res.json({
      success: true,
      data: {
        macAddress: macUpper,
        operator: operator
          ? { name: operator.brandName || operator.name, brandTagline: operator.brandTagline, accentColor: operator.accentColor, logoUrl: operator.logoUrl, support: { phone: operator.supportPhone, whatsapp: operator.supportWhatsapp, email: operator.supportEmail } }
          : null,
        activeSession: activeSession
          ? { status: activeSession.status, expiresAt: activeSession.expiresAt, startTime: activeSession.startTime, bundle: activeSession.bundleId, isTrial: activeSession.isTrial }
          : null,
        recentSessions,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/status/:checkoutRequestId', async (req, res, next) => {
  try {
    const transaction = await Transaction.findOne({
      checkoutRequestId: req.params.checkoutRequestId,
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    if (transaction.status === 'PENDING') {
      return res.json({ status: 'PENDING' });
    }

    if (transaction.status === 'FAILED') {
      return res.json({ status: 'FAILED', message: 'Payment was not completed.' });
    }

    if (transaction.status === 'CANCELLED') {
      return res.json({ status: 'CANCELLED', message: 'Payment was cancelled.' });
    }

    if (transaction.status === 'PROCESSING') {
      return res.json({ status: 'PENDING', message: 'Payment confirmed. Activating internet access now...' });
    }

    if (transaction.status === 'ACCESS_FAILED') {
      return res.json({
        status: 'ACCESS_FAILED',
        message: transaction.processingError || 'Payment was received, but access activation is still pending.',
      });
    }

    let session = await Session.findById(transaction.sessionId);
    if (!session) {
      return res.json({ status: 'PENDING', message: 'Payment confirmed, session initializing...' });
    }
    session = await syncSessionState(session);
    if (!session || session.status !== 'ACTIVE') {
      return res.json({ status: 'ACCESS_FAILED', message: 'Access is no longer active for this session.' });
    }

    res.json({
      status: 'SUCCESS',
      username: session.username,
      password: session.password,
      expiresAt: session.expiresAt,
      resumeToken: createResumeToken(session),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
