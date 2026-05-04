import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import axios from 'axios';
import BundleSelector from './components/BundleSelector';
import PaymentForm from './components/PaymentForm';
import StatusPoller from './components/StatusPoller';
import RedeemForm from './components/RedeemForm';
import UsageWidget from './components/UsageWidget';
import WalletPanel from './components/WalletPanel';
import { useLang } from './context/LangContext';

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
  // Only submit to the operator-configured MikroTik login URL.
  // Never use ?dst= — that is the post-login redirect destination, not the login endpoint.
  if (!hotspotLoginUrl) return;
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = hotspotLoginUrl;
  [['username', username], ['password', password]].forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = name; input.value = value;
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

// ── Animated check SVG (also used by StatusPoller) ───────────────────────────
export function AnimatedCheck({ color = 'var(--accent)', size = 78 }) {
  return (
    <div className="animated-check-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 52 52" fill="none">
        <circle cx="26" cy="26" r="25" stroke={color} strokeWidth="1.5" opacity="0.2" />
        <circle cx="26" cy="26" r="25" stroke={color} strokeWidth="2"
          strokeDasharray="157" strokeDashoffset="157" strokeLinecap="round"
          style={{ animation: 'check-draw 0.55s ease forwards 0.1s' }} />
        <path stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="36" strokeDashoffset="36"
          style={{ animation: 'check-draw 0.3s ease forwards 0.55s' }}
          d="M14 27 l8 8 l16 -16" />
      </svg>
    </div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
const STEPS = [{ n: 1, label: 'Plan' }, { n: 2, label: 'Pay' }, { n: 3, label: 'Connect' }];

const stepNum = (step) => {
  if ([STEP.SELECT, STEP.TRIAL_CONFIRM, STEP.REDEEM].includes(step)) return 1;
  if (step === STEP.PAY) return 2;
  if ([STEP.POLLING, STEP.RESUMED].includes(step)) return 3;
  return 0;
};

function StepIndicator({ step }) {
  const current = stepNum(step);
  if (current === 0) return null;
  return (
    <div className="step-indicator">
      {STEPS.map((s, i) => {
        const done   = current > s.n;
        const active = current === s.n;
        return (
          <Fragment key={s.n}>
            {i > 0 && <div className={`step-connector${done ? ' done' : ''}`} />}
            <div className="step-dot">
              <div className={`step-dot-circle ${done ? 'done' : active ? 'active' : 'pending'}`}>
                {done ? '✓' : s.n}
              </div>
              <div className={`step-dot-label ${done ? 'done' : active ? 'active' : ''}`}>{s.label}</div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

const THEME_KEY = 'portal-theme';

const initPortalTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
};

const ThemeToggle = ({ theme, onToggle }) => (
  <button
    onClick={onToggle}
    title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    style={{
      background: 'none', border: 'none', cursor: 'pointer',
      fontSize: '1.15rem', lineHeight: 1, padding: '0.2rem',
      opacity: 0.75, transition: 'opacity 0.15s',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.75; }}
  >
    {theme === 'dark' ? '☀️' : '🌙'}
  </button>
);

const LangToggle = ({ lang, onToggle }) => (
  <button
    onClick={onToggle}
    title={lang === 'en' ? 'Badilisha Kiswahili' : 'Switch to English'}
    style={{
      background: 'none', border: '1px solid currentColor', borderRadius: '4px',
      cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700,
      lineHeight: 1, padding: '0.2rem 0.4rem', letterSpacing: '0.03em',
      opacity: 0.65, transition: 'opacity 0.15s',
      color: 'var(--text)',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.65; }}
  >
    {lang === 'en' ? 'SW' : 'EN'}
  </button>
);

function InstallPrompt({ accentColor = '#00c853' }) {
  const [prompt, setPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('pwa-dismissed') === '1');

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!prompt || dismissed) return null;

  const install = async () => {
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setPrompt(null);
    else { setDismissed(true); sessionStorage.setItem('pwa-dismissed', '1'); }
  };

  return (
    <div style={{
      position: 'fixed', bottom: 16, left: 16, right: 16, zIndex: 9999,
      background: '#1a1a1a', border: `1px solid ${accentColor}44`,
      borderRadius: 14, padding: '0.9rem 1.1rem',
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      maxWidth: 480, margin: '0 auto',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f1f5f9' }}>Add to Home Screen</div>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>Get quick access without the browser chrome</div>
      </div>
      <button onClick={() => { setDismissed(true); sessionStorage.setItem('pwa-dismissed', '1'); }}
        style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.1rem', cursor: 'pointer', padding: '0.2rem', lineHeight: 1 }}>
        ×
      </button>
      <button onClick={install}
        style={{ background: accentColor, color: '#fff', border: 'none', borderRadius: 9, padding: '0.5rem 1rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
        Install
      </button>
    </div>
  );
}

export default function App() {
  const { lang, t, toggle: toggleLang } = useLang();
  const [step, setStep] = useState(STEP.LOADING);
  const [portalTheme, setPortalTheme] = useState(initPortalTheme);
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [checkoutRequestId, setCheckoutRequestId] = useState(null);
  const [resumedSession, setResumedSession] = useState(null);
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialError, setTrialError] = useState('');

  const togglePortalTheme = useCallback(() => {
    const next = portalTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    setPortalTheme(next);
  }, [portalTheme]);

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
      <InstallPrompt accentColor={accentColor} />

      <header className="portal-header">
        <div className="hero-badge mobile-badge">Fast captive WiFi</div>
        <div className="wifi-icon"><BrandIcon logoUrl={brand.logoUrl} accentColor={accentColor} /></div>
        <h1>{brandName}</h1>
        <p>{brand.brandTagline || t.tagline}</p>
        <div className="portal-header-actions">
          <LangToggle lang={lang} onToggle={toggleLang} />
          <ThemeToggle theme={portalTheme} onToggle={togglePortalTheme} />
        </div>
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
        <StepIndicator step={step} />
        <div className="portal-form-header">
          <div className="small-icon"><BrandIcon logoUrl={brand.logoUrl} accentColor={accentColor} size={20} /></div>
          <div>
            <h2>{brandName}</h2>
            <p>{brand.brandTagline || t.taglineSub}</p>
          </div>
          <LangToggle lang={lang} onToggle={toggleLang} />
          <ThemeToggle theme={portalTheme} onToggle={togglePortalTheme} />
        </div>

        {step === STEP.LOADING && (
          <div className="loading-screen">
            <div className="dot-loader"><span /><span /><span /></div>
            <p>{t.loading}</p>
          </div>
        )}

        {step === STEP.RESUMED && resumedSession && (
          <div className="status-screen">
            <AnimatedCheck color={accentColor} />
            <h2>{t.welcomeBack}</h2>
            <p>{t.activeSession}</p>
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
            {MAC && (
              <UsageWidget
                mac={MAC}
                operatorShortCode={OPERATOR}
                expiresAt={resumedSession.expiresAt}
                accentColor={accentColor}
              />
            )}
            <WalletPanel operatorShortCode={OPERATOR} accentColor={accentColor} />
            <button
              className="btn-pay btn-pay-compact"
              style={{ marginTop: '1rem' }}
              onClick={() => setStep(STEP.SELECT)}
            >
              {t.topUp}
            </button>
          </div>
        )}

        {step === STEP.SELECT && (
          <>
            {/* Free trial banner — shown only when operator enables it and device has MAC */}
            {showTrialButton && (
              <div className="trial-banner">
                <div className="trial-banner-title">
                  {t.trialTitle(brand.trialMinutes)}
                </div>
                <div className="trial-banner-copy">
                  {t.trialCopy}
                </div>
                {trialError && <p className="error-msg trial-error">{trialError}</p>}
                <button
                  className="btn-pay btn-pay-compact"
                  onClick={handleStartTrial}
                  disabled={trialLoading}
                >
                  {trialLoading ? t.trialStarting : t.trialStart(brand.trialMinutes)}
                </button>
              </div>
            )}

            <BundleSelector operatorShortCode={OPERATOR} onSelect={handleSelect} />

            <div className="portal-divider">
              <div className="portal-divider-line" />
              <span>{t.alreadyHaveCode}</span>
              <div className="portal-divider-line" />
            </div>
            <button
              type="button"
              className="btn-back secondary-cta"
              onClick={() => setStep(STEP.REDEEM)}
            >
              {t.enterVoucher}
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
