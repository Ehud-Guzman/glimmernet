import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import client from '../api/client';

const fmt = (n) => `KES ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

const COLORS = ['#00c853', '#2979ff', '#ff6d00', '#d500f9', '#f50057', '#00bcd4', '#ff9100', '#76ff03'];

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '2rem 0 1rem', color: 'var(--text-1)' }}>
      {children}
    </h2>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: '0.75rem',
      padding: '1.25rem',
      ...style,
    }}>
      {children}
    </div>
  );
}

function ChartEmpty({ height = 220, message = 'No data yet for this period.' }) {
  return (
    <div style={{
      height,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-3)', gap: '0.5rem',
    }}>
      <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
      <div style={{ fontSize: '0.82rem' }}>{message}</div>
    </div>
  );
}

function StatPill({ label, value, sub }) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>{sub}</div>}
    </Card>
  );
}

const tooltipStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  fontSize: '0.8rem',
  color: 'var(--text-1)',
};

export default function Analytics() {
  const [revenue, setRevenue]     = useState([]);
  const [bundles, setBundles]     = useState([]);
  const [hourly, setHourly]       = useState([]);
  const [operators, setOperators] = useState([]);
  const [devices, setDevices]     = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    Promise.all([
      client.get('/admin/analytics/revenue'),
      client.get('/admin/analytics/bundles'),
      client.get('/admin/analytics/hourly'),
      client.get('/admin/analytics/operators'),
      client.get('/admin/analytics/devices'),
    ])
      .then(([r, b, h, o, d]) => {
        setRevenue(r.data.data);
        setBundles(b.data.data);
        setHourly(h.data.data);
        setOperators(o.data.data);
        setDevices(d.data.data);
      })
      .catch(() => setError('Failed to load analytics. Make sure you are a superadmin.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-3)' }}>Loading analytics…</div>;
  if (error)   return <div style={{ padding: '2rem', color: 'var(--red)' }}>{error}</div>;

  const totalGross = revenue.reduce((s, r) => s + r.gross, 0);
  const totalFees  = revenue.reduce((s, r) => s + r.platformFee, 0);
  const totalTxns  = revenue.reduce((s, r) => s + r.count, 0);

  return (
    <div style={{ maxWidth: '1100px' }}>
      <h1 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-1)' }}>
        Analytics
      </h1>
      <p style={{ color: 'var(--text-3)', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
        Last 30 days — platform-wide
      </p>

      {/* Summary pills */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <StatPill label="Total Revenue" value={fmt(totalGross)} />
        <StatPill label="Platform Fees" value={fmt(totalFees)} />
        <StatPill label="Transactions" value={totalTxns.toLocaleString()} />
        {devices && (
          <>
            <StatPill label="Total Sessions" value={(devices.totalSessions || 0).toLocaleString()} />
            <StatPill label="Repeat Devices" value={(devices.repeatDevices || 0).toLocaleString()} />
            {devices.conversionRate != null && (
              <StatPill label="Paid Rate" value={`${devices.conversionRate}%`} sub="of all sessions" />
            )}
          </>
        )}
      </div>

      {/* 30-day revenue chart */}
      <SectionTitle>Daily Revenue (30 days)</SectionTitle>
      <Card>
        {revenue.length === 0 ? (
          <ChartEmpty message="No transactions recorded in the last 30 days." />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenue} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) => d.slice(5)}
                tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-3)' }} width={55} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmt(v), name]} />
              <Bar dataKey="gross" name="Gross" fill="#00c853" radius={[3, 3, 0, 0]} />
              <Bar dataKey="platformFee" name="Fee" fill="#2979ff" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Bundle breakdown + hourly heatmap */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
        <div>
          <SectionTitle>Revenue by Bundle</SectionTitle>
          <Card>
            {bundles.length === 0 ? (
              <ChartEmpty message="No bundle sales yet." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={bundles}
                    dataKey="gross"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {bundles.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle>Transactions by Hour (Nairobi)</SectionTitle>
          <Card>
            {hourly.length === 0 ? (
              <ChartEmpty message="No transaction data yet." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: 'var(--text-3)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)' }} width={30} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Txns" fill="#ff6d00" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </div>

      {/* Operator leaderboard */}
      <SectionTitle>Operator Leaderboard (30 days)</SectionTitle>
      {operators.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: 'var(--text-3)', fontSize: '0.85rem' }}>
            No operator activity recorded yet.
          </div>
        </Card>
      ) : (
        <Card style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['#', 'Operator', 'Transactions', 'Gross', 'Platform Fee', 'Operator Net'].map((h) => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {operators.map((op, i) => (
                <tr key={op.operatorId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-3)' }}>{i + 1}</td>
                  <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>
                    {op.name}
                    <span style={{ marginLeft: '0.4rem', fontSize: '0.72rem', color: 'var(--text-3)' }}>{op.shortCode}</span>
                  </td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{op.count}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--green)' }}>{fmt(op.gross)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--blue)' }}>{fmt(op.platformFee)}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{fmt(op.operatorNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
