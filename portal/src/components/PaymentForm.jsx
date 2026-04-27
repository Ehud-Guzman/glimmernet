import { useState } from 'react';
import axios from 'axios';
import { useLang } from '../context/LangContext';

const formatMeta = (b) => {
  if (b.durationMinutes) {
    if (b.durationMinutes < 60)   return `${b.durationMinutes} min`;
    if (b.durationMinutes < 1440) return `${b.durationMinutes / 60} hrs`;
    if (b.durationMinutes < 10080) return `${b.durationMinutes / 1440} day${b.durationMinutes / 1440 > 1 ? 's' : ''}`;
    if (b.durationMinutes < 43200) return `${Math.round(b.durationMinutes / 10080)} weeks`;
    return `${Math.round(b.durationMinutes / 43200)} month(s)`;
  }
  if (b.dataMB) return b.dataMB >= 1024 ? `${b.dataMB / 1024} GB data` : `${b.dataMB} MB data`;
  return '';
};

const normalizePhone = (value) => {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith('254')) return `0${digits.slice(3, 12)}`;
  if (digits.startsWith('0')) return digits.slice(0, 10);
  if (digits.startsWith('7') || digits.startsWith('1')) return `0${digits.slice(0, 9)}`;

  return digits.slice(0, 10);
};

const formatPhoneInput = (value) => {
  const normalized = normalizePhone(value);
  const trimmed = normalized.startsWith('0') ? normalized.slice(1) : normalized;
  const parts = [
    trimmed.slice(0, 3),
    trimmed.slice(3, 6),
    trimmed.slice(6, 9),
  ].filter(Boolean);
  return parts.join(' ');
};

export default function PaymentForm({ bundle, mac, operatorShortCode, onInitiated, onBack }) {
  const { t } = useLang();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const clean = normalizePhone(phone);
    if (!/^(07|01)\d{8}$/.test(clean)) {
      setError(t.invalidPhone);
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post('/api/v1/payment/initiate', {
        phone: clean,
        bundleId: bundle._id,
        mac,
        operatorShortCode: operatorShortCode || undefined,
      });
      onInitiated(res.data.checkoutRequestId);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send M-Pesa prompt. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="selected-summary">
        <div>
          <div className="s-name">{bundle.name}</div>
          <div className="s-meta">{formatMeta(bundle)}{bundle.speedLimitMbps ? ` · ${bundle.speedLimitMbps} Mbps` : ''}</div>
        </div>
        <div className="s-price">KES {bundle.price}</div>
      </div>

      <div className="info-card">
        <div className="info-card-title">{t.quickHeadsUp}</div>
        <p>{t.mpesaInfo}</p>
      </div>

      <div className="section-label">{t.mpesaNumber}</div>

      <div className="phone-wrap">
        <div className="phone-prefix">🇰🇪 +254</div>
        <input
          type="tel"
          placeholder={t.phonePlaceholder}
          value={phone}
          onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
          autoFocus
          inputMode="tel"
          maxLength={11}
        />
      </div>

      <p className="field-hint">{t.phoneHint}</p>

      {error && <p className="error-msg">{error}</p>}

      <button className="btn-pay" type="submit" disabled={loading}>
        {loading ? t.sendingPrompt : t.payBtn(bundle.price)}
      </button>
      <button type="button" className="btn-back" onClick={onBack}>{t.backToPlans}</button>
    </form>
  );
}
