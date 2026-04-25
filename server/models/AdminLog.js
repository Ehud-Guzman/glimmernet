const mongoose = require('mongoose');

const AdminLogSchema = new mongoose.Schema({
  actor:      { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'actorModel' },
  actorModel: { type: String, enum: ['AdminUser', 'Operator'], required: true },
  actorName:  { type: String, default: '' },        // denormalized — survives account renames/deletes
  action:     { type: String, required: true, index: true },
  targetModel: { type: String, default: '' },
  targetId:   { type: mongoose.Schema.Types.ObjectId, default: null },
  meta:       { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

AdminLogSchema.index({ createdAt: -1 });
AdminLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('AdminLog', AdminLogSchema);
