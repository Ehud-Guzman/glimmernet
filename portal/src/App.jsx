import { useState, useEffect } from 'react';
import axios from 'axios';
import BundleSelector from './components/BundleSelector';
import PaymentForm from './components/PaymentForm';
import StatusPoller from './components/StatusPoller';
import RedeemForm from './components/RedeemForm';

const params = new URLSearchParams(window.location.search);
const MAC = (params.get('mac') || '').toUpperCase();
const OPERATOR = (params.get('op') || '').toUpperCase();

const STEP = {
  LOADING: 'LOADING',
  SELECT: 'SELECT',
  PAY: 'PAY',
  POLLING: 'POLLING',
  REDEEM: 'REDEEM',
  RESUMED: 'RESUMED',
  TRIAL_CONFIRM: 'TRIAL_CONFIRM',
};

const DEFAULT_BRAND = {
  brandName: 'WiFi Access',
  operatorName: '',
  brandTagline: '',
  logoUrl: '',
  accentColor: '#00c853',
  hotspotLoginUrl: '',
  supportPhone: '',
  supportWhatsapp: '',
  supportEmail: '',
  trialMinutes: 0,
};

// Module-level store so StatusPoller can read the latest brand without prop-drilling.
// Written only during the init effect; not exported as a mutable binding.
let _brand = { ...DEFAULT_BRAND };
export const getBrand = () => _brand;

const WifiSvg = ({ size = 26, color = '#00c853' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0" />
    <path d="M1.42 9a16 16 0 0 1 21.16 0" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <circle cx="12" cy="20" r="1" fill={color} stroke="none" />
  </svg>
);

const BrandIcon = ({ logoUrl, accentColor, size = 26 }) => {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Brand logo"
        style={{ width: size, height: size, objectFit: 'contain', borderRadius: 4, display: 'block' }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return <WifiSvg size={size} color={accentColor} />;
};

function hexToRgb(hex) {
  const normalized = hex?.replace('#', '').trim();
  if (!normalized) return '0 200 83';

  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(value)) return '0 200 83';

  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r} ${g} ${b}`;
}

function applyBranding({ accentColor }) {
  if (accentColor) {
    document.documentElement.style.setProperty('--accent', accentColor);
    document.documentElement.style.setProperty('--accent-rgb', hexToRgb(accentColor));
    document.documentElement.style.setProperty('--accent-dim', `rgba(${hexToRgb(accentColor)} / 0.2)`);
  }
}

export function autoLogin(username, password, hotspotLoginUrl) {
  // Priority: operator-configured URL → ?dst= from MikroTik redirect
  const dst = hotspotLoginUrl || params.get('dst');
  if (!dst) return; // portal opened outside MikroTik captive-portal flow
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = dst;
  [['username', username], ['password', password]].forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

export default function App() {
  const [step, setStep] = useState(STEP.LOADING);
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState(null);
  const [resumedSession, setResumedSession] = useState(null);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState('');

  useEffect(() => {
    const init = async () => {
      // 1. Load branding + trial config
      try {
        const url = OPERATOR ? `/api/v1/bundles?op=${OPERATOR}` : '/api/v1/bundles';
        const r = await axios.get(url, { timeout: 5000 });
        if (r.data.branding) {
          const b = r.data.branding;
          setBrand(b);
          _brand = b;
          applyBranding(b);
          if (b.brandName) document.title = b.brandName;
        }
      } catch { /* non-fatal */ }

      // 2. Check for active session on this MAC (auto-resume)
      if (MAC) {
        try {
          const opParam = OPERATOR ? `&op=${encodeURIComponent(OPERATOR)}` : '';
          const r = await axios.get(`/api/v1/session/resume?mac=${encodeURIComponent(MAC)}${opParam}`, { timeout: 5000 });
          if (r.data.active) {
            setResumedSession(r.data);
            setStep(STEP.RESUMED);
            autoLogin(r.data.username, r.data.password, _brand.hotspotLoginUrl);
            return;
          }
        } catch { /* non-fatal */ }
      }

      setStep(STEP.SELECT);
    };

    init();
  }, []);

  const handleSelect = (bundle) => { setSelectedBundle(bundle); setStep(STEP.PAY); };
  const handleInitiated = (id) => { setCheckoutRequestId(id); setStep(STEP.POLLING); };

  const handleStartTrial = async () => {
    setTrialLoading(true);
    setTrialError('');
    try {
      const r = await axios.post('/api/v1/session/trial', {
        mac: MAC,
        operatorShortCode: OPERATOR,
      });
      const { username, password, expiresAt } = r.data;
      setResumedSession({ username, password, expiresAt });
      setStep(STEP.RESUMED);
      autoLogin(username, password, brand.hotspotLoginUrl);
    } catch (err) {
      setTrialError(err.response?.data?.message || 'Could not start trial. Please try paying instead.');
      setTrialLoading(false);
    }
  };

  const accentColor = brand.accentColor || '#00c853';
  const brandName = brand.brandName || brand.operatorName || 'WiFi Access';
  const showTrialButton = step === STEP.SELECT && OPERATOR && MAC && brand.trialMinutes > 0;

  const supportParts = [
    brand.supportPhone,
    brand.supportWhatsapp && `WA: ${brand.supportWhatsapp}`,
    brand.supportEmail,
  ].filter(Boolean);
  const footerText = supportParts.length > 0
    ? `Need help? ${supportParts.join(' · ')}`
    : OPERATOR
      ? `Access provided by ${brandName}`
      : 'Secure WiFi access';

  return (
    <div className="portal-shell">

      <header className="portal-header">
        <div className="hero-badge mobile-badge">Fast captive WiFi</div>
        <div className="wifi-icon"><BrandIcon logoUrl={brand.logoUrl} accentColor={accentColor} /></div>
        <h1>{brandName}</h1>
        <p>{brand.brandTagline || 'Get online instantly via M-Pesa'}</p>
      </header>

      <aside className="portal-hero">
        <div className="hero-content">
          <div className="hero-badge">Tap. Pay. Connect.</div>
          <div className="hero-wifi-icon"><WifiSvg size={34} color={accentColor} /></div>
          <h1>{brandName},<br /><span style={{ color: accentColor }}>instant access.</span></h1>
          <p className="hero-sub">
            {brand.brandTagline
              ? brand.brandTagline
              : 'Pick a plan, pay with M-Pesa, and get online in under 30 seconds. Smooth captive-portal access for homes, lounges, events, and workspaces.'}
          </p>

          <div className="hero-highlight-card">
            <div className="hero-highlight-kicker">Why it feels effortless</div>
            <div className="hero-highlight-title">One short flow from plan to connection.</div>
            <p>
              Choose a package, confirm the M-Pesa prompt, and the portal logs you in automatically.
            </p>
          </div>

          <div className="hero-perks">
            <div className="hero-perk"><span className="perk-dot" style={{ background: accentColor }} /> Pay with M-Pesa, no cash queue</div>
            <div className="hero-perk"><span className="perk-dot" style={{ background: accentColor }} /> Instant activation after payment</div>
            <div className="hero-perk"><span className="perk-dot" style={{ background: accentColor }} /> Flexible time and data plans</div>
            <div className="hero-perk"><span className="perk-dot" style={{ background: accentColor }} /> Built for quick repeat logins</div>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <strong>30s</strong>
              <span>Typical checkout</span>
            </div>
            <div className="hero-stat">
              <strong>24/7</strong>
              <span>Always available</span>
            </div>
            <div className="hero-stat">
              <strong>M-Pesa</strong>
              <span>Trusted payment</span>
            </div>
          </div>
        </div>
      </aside>

      <div className={`portal-body step-${step.toLowerCase()}`}>
        <div className="portal-form-header">
          <div className="small-icon"><BrandIcon logoUrl={brand.logoUrl} accentColor={accentColor} size={20} /></div>
          <div>
            <h2>{brandName}</h2>
            <p>{brand.brandTagline || 'Secure access via M-Pesa'}</p>
          </div>
        </div>

        {step === STEP.LOADING && (
          <div className="loading-screen">
            <div className="dot-loader"><span /><span /><span /></div>
            <p>Preparing your packages...</p>
          </div>
        )}

        {step === STEP.RESUMED && resumedSession && (
          <div className="status-screen">
            <div className="status-icon success">✅</div>
            <h2>Welcome back!</h2>
            <p>You already have an active session. Logging you in…</p>
            {resumedSession.expiresAt && (() => {
              const minsLeft = Math.round((new Date(resumedSession.expiresAt) - Date.now()) / 60000);
              const label = minsLeft > 60
                ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m remaining`
                : `${minsLeft} minute${minsLeft !== 1 ? 's' : ''} remaining`;
              return (
                <div className="expires-chip">
                  {label} · expires {new Date(resumedSession.expiresAt).toLocaleString('en-KE', {
                    hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
                  })}
                </div>
              );
            })()}
            <button
              className="btn-pay btn-pay-compact"
              style={{ marginTop: '1rem' }}
              onClick={() => setStep(STEP.SELECT)}
            >
              Top Up / Buy Another Bundle
            </button>
          </div>
        )}

        {step === STEP.SELECT && (
          <>
            {/* Free trial banner — shown only when operator enables it and device has MAC */}
            {showTrialButton && (
              <div className="trial-banner">
                <div className="trial-banner-title">
                  🎁 Try free for {brand.trialMinutes} minutes
                </div>
                <div className="trial-banner-copy">
                  New here? Experience the speed before you pay — no M-Pesa needed.
                </div>
                {trialError && <p className="error-msg trial-error">{trialError}</p>}
                <button
                  className="btn-pay btn-pay-compact"
                  onClick={handleStartTrial}
                  disabled={trialLoading}
                >
                  {trialLoading ? 'Starting…' : `Start ${brand.trialMinutes}-minute free trial`}
                </button>
              </div>
            )}

            <BundleSelector operatorShortCode={OPERATOR} onSelect={handleSelect} />

            <div className="portal-divider">
              <div className="portal-divider-line" />
              <span>already have a code?</span>
              <div className="portal-divider-line" />
            </div>
            <button
              type="button"
              className="btn-back secondary-cta"
              onClick={() => setStep(STEP.REDEEM)}
            >
              🎟 Enter voucher or M-Pesa receipt
            </button>
          </>
        )}

        {step === STEP.PAY && (
          <PaymentForm
            bundle={selectedBundle}
            mac={MAC}
            operatorShortCode={OPERATOR}
            onInitiated={handleInitiated}
            onBack={() => setStep(STEP.SELECT)}
          />
        )}

        {step === STEP.POLLING && (
          <StatusPoller
            checkoutRequestId={checkoutRequestId}
            brand={brand}
          />
        )}

        {step === STEP.REDEEM && (
          <RedeemForm
            mac={MAC}
            operatorShortCode={OPERATOR}
            brand={brand}
            onBack={() => setStep(STEP.SELECT)}
          />
        )}

        <p className="portal-footer">{footerText}</p>
        <p className="portal-footer" style={{ marginTop: '0.35rem' }}>
          Managed by{' '}
          <a href="https://glimmerink.co.ke" target="_blank" rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            GlimmerInk Creations
          </a>
        </p>
      </div>

    </div>
  );
}
