const Setting = require('../models/Setting');
const logger = require('../utils/logger');

const TTL = 60 * 1000; // 60 seconds
let _cache = null;
let _cacheAt = 0;

const load = async () => {
  const rows = await Setting.find({}).lean();
  const map = {};
  for (const s of rows) map[s.key] = s.value;
  _cache = map;
  _cacheAt = Date.now();
  return map;
};

const getAll = async () => {
  if (!_cache || Date.now() - _cacheAt > TTL) await load();
  return _cache;
};

/**
 * Get a single setting value from the DB-backed cache.
 * Falls back to `fallback` if the key is missing, null, or empty string.
 */
const get = async (key, fallback = undefined) => {
  try {
    const all = await getAll();
    const val = all[key];
    if (val === undefined || val === null || val === '') return fallback;
    return val;
  } catch (err) {
    logger.warn('configService.get failed — using fallback', { key, err: err.message });
    return fallback;
  }
};

// Bust the cache immediately — call after any settings save so changes take effect within the same request cycle.
const invalidate = () => {
  _cache = null;
};

module.exports = { get, getAll, invalidate };
