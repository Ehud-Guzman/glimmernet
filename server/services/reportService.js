const nodemailer = require('nodemailer');
const Transaction = require('../models/Transaction');
const Session = require('../models/Session');
const Settlement = require('../models/Settlement');
const configService = require('./configService');
const logger = require('../utils/logger');

const getTransport = async () => {
  const [host, port, user, pass] = await Promise.all([
    configService.get('smtp_host', process.env.SMTP_HOST || ''),
    configService.get('smtp_port', process.env.SMTP_PORT || 587),
    configService.get('smtp_user', process.env.SMTP_USER || ''),
    configService.get('smtp_pass', process.env.SMTP_PASS || ''),
  ]);
  if (!host || !user) return null;
  return nodemailer.createTransport({ host, port: Number(port), secure: Number(port) === 465, auth: { user, pass } });
};

const buildReport = async (operator, periodDays) => {
  const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
  const opId = operator._id;

  const [revenue, sessions, settlements, topBundles] = await Promise.all([
    Transaction.aggregate([
      { $match: { operatorId: opId, status: 'SUCCESS', createdAt: { $gte: since } } },
      { $group: { _id: null, gross: { $sum: '$amount' }, net: { $sum: '$operatorNet' }, count: { $sum: 1 } } },
    ]),
    Session.aggregate([
      { $match: { operatorId: opId, createdAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Settlement.aggregate([
      { $match: { operatorId: opId, status: 'PAID', paidAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Transaction.aggregate([
      { $match: { operatorId: opId, status: 'SUCCESS', createdAt: { $gte: since } } },
      { $group: { _id: '$bundleId', count: { $sum: 1 }, revenue: { $sum: '$operatorNet' } } },
      { $sort: { count: -1 } }, { $limit: 3 },
      { $lookup: { from: 'bundles', localField: '_id', foreignField: '_id', as: 'bundle' } },
      { $unwind: { path: '$bundle', preserveNullAndEmptyArrays: true } },
    ]),
  ]);

  const rev = revenue[0] || { gross: 0, net: 0, count: 0 };
  const sessionMap = {};
  sessions.forEach((s) => { sessionMap[s._id] = s.count; });

  const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  const label = periodDays === 1 ? 'Daily' : 'Weekly';
  const brandName = operator.brandName || operator.name;

  const bundleRows = topBundles.map((b) =>
    `<tr><td>${b.bundle?.name || 'Unknown'}</td><td>${b.count}</td><td>${fmt(b.revenue)}</td></tr>`
  ).join('');

  const html = `
  <div style="font-family:sans-serif;max-width:560px;margin:auto;padding:24px;color:#111">
    <h2 style="margin:0 0 4px">${brandName} — ${label} Report</h2>
    <p style="color:#666;margin:0 0 20px;font-size:13px">Last ${periodDays} day${periodDays > 1 ? 's' : ''}</p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr style="background:#f5f5f5"><td style="padding:10px;border-radius:6px 0 0 6px"><strong>Gross Revenue</strong></td><td style="padding:10px;text-align:right">${fmt(rev.gross)}</td></tr>
      <tr><td style="padding:10px"><strong>Your Net Earnings</strong></td><td style="padding:10px;text-align:right;color:#16a34a;font-weight:700">${fmt(rev.net)}</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:10px"><strong>Paid Transactions</strong></td><td style="padding:10px;text-align:right">${rev.count}</td></tr>
      <tr><td style="padding:10px"><strong>Active Sessions</strong></td><td style="padding:10px;text-align:right">${sessionMap['ACTIVE'] || 0}</td></tr>
      <tr style="background:#f5f5f5"><td style="padding:10px"><strong>Settled to M-Pesa</strong></td><td style="padding:10px;text-align:right">${fmt(settlements[0]?.total || 0)}</td></tr>
    </table>

    ${bundleRows ? `
    <h3 style="margin:0 0 8px;font-size:14px">Top Bundles</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
      <thead><tr style="background:#f5f5f5"><th style="padding:8px;text-align:left">Bundle</th><th style="padding:8px;text-align:center">Sales</th><th style="padding:8px;text-align:right">Revenue</th></tr></thead>
      <tbody>${bundleRows}</tbody>
    </table>` : ''}

    <p style="font-size:12px;color:#999;margin-top:24px">GlimmerInk Creations · Automated Report · Do not reply to this email.</p>
  </div>`;

  return { subject: `${brandName} — ${label} Report`, html, text: `${brandName} ${label} Report\nGross: ${fmt(rev.gross)}\nNet: ${fmt(rev.net)}\nTransactions: ${rev.count}` };
};

const sendOperatorReport = async (operator) => {
  if (!operator.reportEmailEnabled || !operator.email) return false;
  const transport = await getTransport();
  if (!transport) {
    logger.warn('Report email skipped — SMTP not configured', { operatorId: operator._id });
    return false;
  }

  const periodDays = operator.reportFrequency === 'daily' ? 1 : 7;
  const report = await buildReport(operator, periodDays);
  const from = await configService.get('smtp_from', process.env.SMTP_FROM || 'reports@glimmerink.co.ke');

  try {
    await transport.sendMail({ from, to: operator.email, subject: report.subject, html: report.html, text: report.text });
    logger.info('Operator report sent', { operatorId: operator._id, email: operator.email });
    return true;
  } catch (err) {
    logger.warn('Operator report email failed', { operatorId: operator._id, message: err.message });
    return false;
  }
};

module.exports = { sendOperatorReport, buildReport };
