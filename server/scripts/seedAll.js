/**
 * Full database reset + seed.
 * Usage: node server/scripts/seedAll.js
 *
 * Drops every collection then inserts a clean baseline:
 *   • 1 superadmin
 *   • 1 demo operator (GlimmerNet Hotspots)
 *   • 8 bundles (time-based + data-based)
 *   • All platform settings at their defaults
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AdminUser   = require('../models/AdminUser');
const Operator    = require('../models/Operator');
const Bundle      = require('../models/Bundle');
const Setting     = require('../models/Setting');
const Session     = require('../models/Session');
const Transaction = require('../models/Transaction');
const Voucher     = require('../models/Voucher');
const Device      = require('../models/Device');
const Settlement  = require('../models/Settlement');
const AdminLog    = require('../models/AdminLog');

// ── Seed data ─────────────────────────────────────────────────────────────────

const ADMIN = {
  name: 'Nyamu Ehud',
  email: 'nyamuehud@gmail.com',
  password: '123456',
  role: 'superadmin',
};

const OPERATOR = {
  shortCode: 'GLMR1',
  name: 'GlimmerNet Hotspots',
  businessName: 'GlimmerNet Hotspots',
  ownerPhone: '0700000000',   // update to real number before going live
  email: 'nyamuehud@gmail.com',
  status: 'ACTIVE',
  brandName: 'GlimmerNet',
  brandTagline: 'Fast, reliable guest internet',
  accentColor: '#00c853',
  trialMinutes: 5,
  platformFeePercent: null,   // inherits global platform_fee_percent setting
};

const BUNDLES = [
  // Time-based
  { name: '1 Hour',           price: 20,   durationMinutes: 60,    dataMB: null,  speedLimitMbps: 2, mikrotikProfile: 'plan_1hr'     },
  { name: '3 Hours',          price: 50,   durationMinutes: 180,   dataMB: null,  speedLimitMbps: 3, mikrotikProfile: 'plan_3hr'     },
  { name: 'Daily (24 hrs)',   price: 100,  durationMinutes: 1440,  dataMB: null,  speedLimitMbps: 4, mikrotikProfile: 'plan_24hr'    },
  { name: 'Weekly (7 days)',  price: 450,  durationMinutes: 10080, dataMB: null,  speedLimitMbps: 5, mikrotikProfile: 'plan_weekly'  },
  { name: 'Monthly (30 days)',price: 1500, durationMinutes: 43200, dataMB: null,  speedLimitMbps: 5, mikrotikProfile: 'plan_monthly' },
  // Data-based
  { name: '500 MB',           price: 30,   durationMinutes: null,  dataMB: 500,   speedLimitMbps: 3, mikrotikProfile: 'plan_500mb'   },
  { name: '1 GB',             price: 60,   durationMinutes: null,  dataMB: 1024,  speedLimitMbps: 4, mikrotikProfile: 'plan_1gb'     },
  { name: '2 GB',             price: 100,  durationMinutes: null,  dataMB: 2048,  speedLimitMbps: 5, mikrotikProfile: 'plan_2gb'     },
];

const SETTINGS = [
  // Billing
  { key: 'platform_fee_percent',           value: 10,           type: 'number',  label: 'Platform Fee (%)',                    description: 'Percentage taken from each transaction as platform revenue.',                                                                   group: 'billing'       },
  // M-Pesa / Daraja
  { key: 'daraja_env',                     value: 'sandbox',    type: 'string',  label: 'Daraja Environment',                  description: '"sandbox" for testing, "production" for live payments.',                                                                       group: 'mpesa'         },
  { key: 'daraja_consumer_key',            value: '',           type: 'string',  label: 'Daraja Consumer Key',                 description: 'OAuth consumer key from your Daraja app.',                                                                                     group: 'mpesa'         },
  { key: 'daraja_consumer_secret',         value: '',           type: 'string',  label: 'Daraja Consumer Secret',              description: 'OAuth consumer secret from your Daraja app.',                                                                                  group: 'mpesa'         },
  { key: 'daraja_shortcode',               value: '',           type: 'string',  label: 'M-Pesa Shortcode (Paybill / Till)',   description: 'Safaricom Business Shortcode used for STK push.',                                                                              group: 'mpesa'         },
  { key: 'daraja_passkey',                 value: '',           type: 'string',  label: 'Lipa Na M-Pesa Passkey',              description: 'Lipa Na M-Pesa online passkey from Daraja portal.',                                                                           group: 'mpesa'         },
  { key: 'app_url',                        value: '',           type: 'string',  label: 'App Public URL',                      description: 'Public HTTPS base URL of this server. Used as the Daraja callback base.',                                                      group: 'mpesa'         },
  { key: 'stk_account_ref',               value: 'WiFi',       type: 'string',  label: 'STK Account Reference',               description: 'Account reference shown on the M-Pesa STK prompt (max 12 chars).',                                                             group: 'mpesa'         },
  { key: 'stk_transaction_desc',          value: 'WiFi Access',type: 'string',  label: 'STK Transaction Description',         description: 'Short description on the M-Pesa STK popup.',                                                                                  group: 'mpesa'         },
  { key: 'daraja_b2c_initiator_name',     value: '',           type: 'string',  label: 'B2C Initiator Name',                  description: 'Daraja B2C initiator username. Required for automatic operator payouts.',                                                       group: 'mpesa'         },
  { key: 'daraja_b2c_security_credential',value: '',           type: 'string',  label: 'B2C Security Credential',             description: 'Initiator password encrypted with the Safaricom public key.',                                                                   group: 'mpesa'         },
  // MikroTik
  { key: 'mikrotik_host',                  value: '',           type: 'string',  label: 'Default MikroTik Host',               description: 'Fallback RouterOS IP/hostname when an operator has no router configured.',                                                     group: 'mikrotik'      },
  { key: 'mikrotik_user',                  value: 'admin',      type: 'string',  label: 'Default MikroTik User',               description: 'RouterOS API username for the default router.',                                                                                group: 'mikrotik'      },
  { key: 'mikrotik_pass',                  value: '',           type: 'string',  label: 'Default MikroTik Password',           description: 'RouterOS API password for the default router.',                                                                                group: 'mikrotik'      },
  { key: 'mikrotik_port',                  value: 8728,         type: 'number',  label: 'Default MikroTik API Port',           description: 'RouterOS API port (default 8728; use 8729 for SSL).',                                                                         group: 'mikrotik'      },
  // SMS / Africa's Talking
  { key: 'sms_enabled',                    value: false,        type: 'boolean', label: 'SMS Receipts Enabled',                description: "Send M-Pesa payment receipts via Africa's Talking SMS.",                                                                       group: 'notifications' },
  { key: 'at_api_key',                     value: '',           type: 'string',  label: "Africa's Talking API Key",            description: 'AT API key for SMS sending.',                                                                                                  group: 'notifications' },
  { key: 'at_username',                    value: 'sandbox',    type: 'string',  label: "Africa's Talking Username",           description: 'AT account username ("sandbox" for testing).',                                                                                 group: 'notifications' },
  { key: 'at_sandbox',                     value: true,         type: 'boolean', label: 'AT Sandbox Mode',                     description: "Use the Africa's Talking sandbox API.",                                                                                        group: 'notifications' },
  { key: 'at_sender_id',                   value: '',           type: 'string',  label: 'AT Sender ID',                        description: 'Custom SMS sender ID (leave blank to use AT default).',                                                                        group: 'notifications' },
  // Support
  { key: 'support_phone',                  value: '',           type: 'string',  label: 'Support Phone',                       description: 'Default support phone shown on portal when an operator has none set.',                                                          group: 'support'       },
  { key: 'support_email',                  value: '',           type: 'string',  label: 'Support Email',                       description: 'Default support email shown on portal when an operator has none set.',                                                          group: 'support'       },
  // Security
  { key: 'allowed_origins',               value: '',           type: 'string',  label: 'Allowed Origins (CORS)',              description: 'Comma-separated origins allowed to call the API. Blank = localhost dev only.',                                                  group: 'security'      },
];

// ── Runner ────────────────────────────────────────────────────────────────────

const ok  = (msg) => console.log(`  \x1b[32m✓\x1b[0m  ${msg}`);
const info = (msg) => console.log(`  \x1b[36m·\x1b[0m  ${msg}`);

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('\nConnected to MongoDB\n');

  // ── 1. Drop all collections ────────────────────────────────────────────────
  console.log('Clearing collections...');
  await Promise.all([
    AdminUser.deleteMany({}),
    Operator.deleteMany({}),
    Bundle.deleteMany({}),
    Setting.deleteMany({}),
    Session.deleteMany({}),
    Transaction.deleteMany({}),
    Voucher.deleteMany({}),
    Device.deleteMany({}),
    Settlement.deleteMany({}),
    AdminLog.deleteMany({}),
  ]);
  ok('All collections cleared');

  // ── 2. SuperAdmin ──────────────────────────────────────────────────────────
  console.log('\nSeeding admin...');
  const passwordHash = await bcrypt.hash(ADMIN.password, 12);
  await AdminUser.create({ name: ADMIN.name, email: ADMIN.email, passwordHash, role: ADMIN.role });
  ok(`${ADMIN.name} <${ADMIN.email}> — superadmin`);

  // ── 3. Operator ────────────────────────────────────────────────────────────
  console.log('\nSeeding operator...');
  const operator = await Operator.create(OPERATOR);
  ok(`${operator.name} (${operator.shortCode})`);
  info('ownerPhone is placeholder — update in admin UI before going live');

  // ── 4. Bundles ─────────────────────────────────────────────────────────────
  console.log('\nSeeding bundles...');
  for (const b of BUNDLES) {
    await Bundle.create(b);
    ok(`${b.name.padEnd(20)} KES ${b.price}`);
  }

  // ── 5. Settings ────────────────────────────────────────────────────────────
  console.log('\nSeeding settings...');
  await Setting.insertMany(SETTINGS);
  ok(`${SETTINGS.length} settings inserted at defaults`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────');
  console.log(' Seed complete. Login:');
  console.log(`   Email   : ${ADMIN.email}`);
  console.log(`   Password: ${ADMIN.password}`);
  console.log('   URL     : http://localhost:5174');
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error('\x1b[31mSeed failed:\x1b[0m', err.message);
  process.exit(1);
});
