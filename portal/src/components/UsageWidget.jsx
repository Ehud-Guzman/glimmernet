import { useEffect, useState } from 'react';
import axios from 'axios';

const POLL_INTERVAL = 60_000;

function fmtBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtTime(mins) {
  if (!mins || mins <= 0) return '0m';
  if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${mins}m`;
}

function ProgressBar({ pct, color = 'var(--accent)', label }) {
  const clamped = Math.min(Math.max(pct || 0, 0), 100);
  const barColor = clamped >= 90 ? '#ef4444' : clamped >= 75 ? '#f59e0b' : color;
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.3rem' }}>
          {label}
        </div>
      )}
      <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 4, background: barColor, width: `${clamped}%`, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

export default function UsageWidget({ mac, operatorShortCode, expiresAt, accentColor = 'var(--accent)' }) {
  const [usage, setUsage] = useState(null);
  const [error, setError] = useState(false);

  const poll = async () => {
    if (!mac) return;
    try {
      const opParam = operatorShortCode ? `&op=${encodeURIComponent(operatorShortCode)}` : '';
      const r = await axios.get(`/api/v1/session/usage?mac=${encodeURIComponent(mac)}${opParam}`, { timeout: 8000 });
      setUsage(r.data);
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [mac, operatorShortCode]);

  const totalBytes = usage ? (usage.bytesIn || 0) + (usage.bytesOut || 0) : null;
  const hasDataCap = usage?.percentUsed != null;
  const minsLeft = usage?.minutesLeft ?? (expiresAt ? Math.max(0, Math.round((new Date(expiresAt) - Date.now()) / 60000)) : null);

  if (error || (!usage && !expiresAt)) return null;

  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 12, padding: '1rem 1.25rem', marginTop: '1rem', textAlign: 'left',
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'rgba(255,255,255,0.45)', marginBottom: '0.75rem' }}>
        Session Usage
      </div>

      {minsLeft != null && (
        <ProgressBar
          pct={expiresAt ? ((1 - minsLeft / Math.max(1, minsLeft + (usage?.uptime ? parseInt(usage.uptime) / 60 : 0))) * 100) : null}
          color={accentColor}
          label={[
            <span key="l">Time remaining</span>,
            <strong key="r" style={{ color: accentColor }}>{fmtTime(minsLeft)}</strong>,
          ]}
        />
      )}

      {hasDataCap && totalBytes != null && (
        <ProgressBar
          pct={usage.percentUsed}
          color={accentColor}
          label={[
            <span key="l">Data used</span>,
            <strong key="r" style={{ color: usage.percentUsed >= 80 ? '#f59e0b' : accentColor }}>
              {fmtBytes(totalBytes)} · {Math.round(usage.percentUsed)}%
            </strong>,
          ]}
        />
      )}

      {!hasDataCap && totalBytes != null && totalBytes > 0 && (
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.25rem' }}>
          Data used: <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{fmtBytes(totalBytes)}</strong>
          <span style={{ marginLeft: '0.5rem', opacity: 0.6 }}>(no cap)</span>
        </div>
      )}
    </div>
  );
}
