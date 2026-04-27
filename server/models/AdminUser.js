const mongoose = require('mongoose');

const AdminUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['superadmin', 'admin'], default: 'admin' },
  isActive: { type: Boolean, default: true },
  resetToken: { type: String, default: null },
  resetTokenExpiry: { type: Date, default: null },
  passwordChangedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', AdminUserSchema);
