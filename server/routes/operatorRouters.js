const express = require('express');
const OperatorRouter = require('../models/OperatorRouter');
const { protectOperator } = require('../middleware/operatorAuthMiddleware');
const { protect, requireRole } = require('../middleware/authMiddleware');
const { testRouterConnection } = require('../services/mikrotikService');
const { encrypt: encryptField } = require('../utils/fieldEncryption');
const { audit } = require('../utils/audit');
const logger = require('../utils/logger');

const router = express.Router();

// ── Operator self-service: manage their own sub-routers ───────────────────────

router.use(protectOperator);

// GET /api/v1/operator/routers
router.get('/', async (req, res, next) => {
  try {
    const routers = await OperatorRouter.find({ operatorId: req.operator._id })
      .select('-pass')
      .sort({ createdAt: 1 });
    res.json({ success: true, data: routers });
  } catch (err) { next(err); }
});

// POST /api/v1/operator/routers
router.post('/', async (req, res, next) => {
  try {
    const { name, host, port = 8728, user, pass, hotspotServer = 'hotspot1' } = req.body;
    if (!name || !host || !user || !pass) {
      return res.status(400).json({ success: false, message: 'name, host, user and pass are required' });
    }
    const encPass = encryptField(pass);
    const r = await OperatorRouter.create({
      operatorId: req.operator._id, name, host, port: Number(port), user, pass: encPass, hotspotServer,
    });
    await audit({ actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'ROUTER_CREATED', targetModel: 'OperatorRouter', targetId: r._id, meta: { name, host } });
    res.status(201).json({ success: true, data: { ...r.toObject(), pass: undefined } });
  } catch (err) { next(err); }
});

// PUT /api/v1/operator/routers/:id
router.put('/:id', async (req, res, next) => {
  try {
    const r = await OperatorRouter.findOne({ _id: req.params.id, operatorId: req.operator._id });
    if (!r) return res.status(404).json({ success: false, message: 'Router not found' });
    const { name, host, port, user, pass, hotspotServer, isActive } = req.body;
    if (name !== undefined) r.name = name;
    if (host !== undefined) r.host = host;
    if (port !== undefined) r.port = Number(port);
    if (user !== undefined) r.user = user;
    if (pass) r.pass = encryptField(pass);
    if (hotspotServer !== undefined) r.hotspotServer = hotspotServer;
    if (isActive !== undefined) r.isActive = isActive;
    await r.save();
    await audit({ actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'ROUTER_UPDATED', targetModel: 'OperatorRouter', targetId: r._id, meta: { fields: Object.keys(req.body) } });
    res.json({ success: true, data: { ...r.toObject(), pass: undefined } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/operator/routers/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const r = await OperatorRouter.findOneAndDelete({ _id: req.params.id, operatorId: req.operator._id });
    if (!r) return res.status(404).json({ success: false, message: 'Router not found' });
    await audit({ actor: req.operator._id, actorModel: 'Operator', actorName: req.operator.name,
      action: 'ROUTER_DELETED', targetModel: 'OperatorRouter', targetId: r._id, meta: { name: r.name } });
    res.json({ success: true, message: 'Router removed' });
  } catch (err) { next(err); }
});

// POST /api/v1/operator/routers/:id/test
router.post('/:id/test', async (req, res, next) => {
  try {
    const r = await OperatorRouter.findOne({ _id: req.params.id, operatorId: req.operator._id });
    if (!r) return res.status(404).json({ success: false, message: 'Router not found' });
    // Allow unsaved form values to be tested before saving
    const testRouter = {
      host: req.body.host || r.host,
      port: Number(req.body.port || r.port),
      user: req.body.user || r.user,
      pass: req.body.pass ? encryptField(req.body.pass) : r.pass,
      name: r.name,
    };
    const result = await testRouterConnection(testRouter);
    res.json({ success: true, identity: result.identity });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
