const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, trim: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  type: { type: String, enum: ['string', 'number', 'boolean'], default: 'string' },
  label: { type: String, default: '' },
  description: { type: String, default: '' },
  group: { type: String, default: 'general' },
}, { timestamps: true });

module.exports = mongoose.model('Setting', SettingSchema);
