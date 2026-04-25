import { useEffect, useState } from 'react';
import axios from 'axios';

const POPULAR_NAME = 'Daily (24 hrs)';

const TIME_ICONS = { '1 Hour': '⚡', '3 Hours': '☕', 'Daily (24 hrs)': '🌞', 'Weekly (7 days)': '📅', 'Monthly (30 days)': '🗓️' };
const DATA_ICONS = { '500 MB': '🔋', '1 GB': '💾', '2 GB': '🚀' };

const formatMeta = (b) => {
  if (b.durationMinutes) {
    if (b.durationMinutes < 60)  return `${b.durationMinutes} minutes`;
    if (b.durationMinutes < 1440) return `${b.durationMinutes / 60} hours`;
    if (b.durationMinutes < 10080) return `${b.durationMinutes / 1440} day${b.durationMinutes / 1440 > 1 ? 's' : ''}`;
    if (b.durationMinutes < 43200) return `${Math.round(b.durationMinutes / 10080)} weeks`;
    return `${Math.round(b.durationMinutes / 43200)} month${Math.round(b.durationMinutes / 43200) > 1 ? 's' : ''}`;
  }
  if (b.dataMB) return b.dataMB >= 1024 ? `${b.dataMB / 1024} GB data` : `${b.dataMB} MB data`;
  return '';
};

export default function BundleSelector({ operatorShortCode, onSelect }) {
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('time');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const url = operatorShortCode
      ? `/api/v1/bundles?op=${operatorShortCode}`
      : '/api/v1/bundles';
    axios.get(url)
      .then((r) => setBundles(r.data.data))
      .catch(() => setError('Could not load packages. Please refresh.'))
      .finally(() => setLoading(false));
  }, [operatorShortCode]);

  const timeBundles = bundles.filter((b) => b.durationMinutes);
  const dataBundles = bundles.filter((b) => b.dataMB);
  const visible = tab === 'time' ? timeBundles : dataBundles;

  if (error) return <p className="error-msg">{error}</p>;

  return (
    <>
      <div className="section-intro">
        <div>
          <div className="section-eyebrow">Choose a package</div>
          <h3>Select the access plan that fits your session</h3>
        </div>
        <p>Fast checkout, instant activation, and easy re-entry if your device reconnects.</p>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'time' ? 'active' : ''}`} onClick={() => setTab('time')}>
          ⏱ Time Plans
        </button>
        <button className={`tab ${tab === 'data' ? 'active' : ''}`} onClick={() => setTab('data')}>
          📊 Data Plans
        </button>
      </div>

      <div className="bundle-list">
        {loading
          ? [1, 2, 3].map((k) => <div key={k} className="skeleton skeleton-row" />)
          : visible.length === 0
            ? (
              <div className="empty-state">
                <div className="empty-state-icon">{tab === 'time' ? '⏱' : '📊'}</div>
                <h4>No {tab} plans available right now</h4>
                <p>Switch tabs or refresh once packages are published for this operator.</p>
              </div>
            )
          : visible.map((b) => {
              const icon = tab === 'time' ? (TIME_ICONS[b.name] || '⏱') : (DATA_ICONS[b.name] || '📶');
              const isSelected = selected?._id === b._id;
              const isPopular = b.name === POPULAR_NAME;

              return (
                <button
                  key={b._id}
                  type="button"
                  className={`bundle-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelected(b)}
                  aria-pressed={isSelected}
                >
                  {isPopular && <span className="badge-popular">Popular</span>}
                  <div className="bundle-icon">{icon}</div>
                  <div className="bundle-info">
                    <div className="bundle-name">{b.name}</div>
                    <div className="bundle-meta">{formatMeta(b)}</div>
                  </div>
                  <div className="bundle-price-col">
                    <div className="bundle-price">KES {b.price}</div>
                    {b.speedLimitMbps && <div className="bundle-speed">{b.speedLimitMbps} Mbps</div>}
                  </div>
                  <div className="radio-dot" />
                </button>
              );
            })}
      </div>

      <button
        className="btn-pay"
        disabled={!selected}
        onClick={() => selected && onSelect(selected)}
      >
        {selected ? `Continue with ${selected.name}` : 'Continue →'}
      </button>
    </>
  );
}
