import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { autoLogin, AnimatedCheck } from '../App';
import { useLang } from '../context/LangContext';

const POLL_INTERVAL = 3000;
const MAX_POLLS = 40;        // ~2 minutes
const OFFLINE_THRESHOLD = 3; // consecutive failures before showing offline warning

export default function StatusPoller({ checkoutRequestId, brand = {} }) {
  const { t } = useLang();
  const [phase, setPhase] = useState('waiting');
  const [session, setSession] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [progress, setProgress] = useState(0);
  const [offline, setOffline] = useState(false);
  const polls = useRef(0);
  const consecutiveErrors = useRef(0);

  const hotspotLoginUrl = brand.hotspotLoginUrl || '';
  const supportPhone = brand.supportPhone || '';
  const supportWhatsapp = brand.supportWhatsapp || '';
  const supportEmail = brand.supportEmail || '';
  const supportParts = [
    supportPhone,
    supportWhatsapp && `WA: ${supportWhatsapp}`,
    supportEmail,
  ].filter(Boolean);

  useEffect(() => {
    const interval = setInterval(async () => {
      polls.current += 1;
      setProgress(Math.min((polls.current / MAX_POLLS) * 100, 100));
      if (polls.current > MAX_POLLS) { setPhase('timeout'); clearInterval(interval); return; }

      try {
        const res = await axios.get(`/api/v1/session/status/${checkoutRequestId}`);
        consecutiveErrors.current = 0;
        setOffline(false);

        const { status, username, password, expiresAt } = res.data;

        if (status === 'SUCCESS' && username) {
          clearInterval(interval);
          setSession({ username, password, expiresAt });
          setPhase('success');
          autoLogin(username, password, hotspotLoginUrl);
        } else if (status === 'FAILED')       { clearInterval(interval); setPhase('failed'); }
        else if (status === 'CANCELLED')      { clearInterval(interval); setPhase('cancelled'); }
        else if (status === 'ACCESS_FAILED')  { clearInterval(interval); setPhase('access_failed'); }
      } catch {
        consecutiveErrors.current += 1;
        if (consecutiveErrors.current >= OFFLINE_THRESHOLD) setOffline(true);
      }
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [checkoutRequestId, hotspotLoginUrl]);

  const handleCheckStatus = async () => {
    setVerifying(true);
    setVerifyError('');
    try {
      const res = await axios.get(`/api/v1/session/status/${checkoutRequestId}`);
      const { status, username, password, expiresAt } = res.data;
      if (status === 'SUCCESS' && username) {
        setSession({ username, password, expiresAt });
        setPhase('success');
        autoLogin(username, password, hotspotLoginUrl);
      } else {
        setVerifyError('Internet not active yet. Use "Retry Activation" if you were charged.');
      }
    } catch {
      setVerifyError('Could not check status. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyError('');
    try {
      const res = await axios.post('/api/v1/payment/verify', { checkoutRequestId });
      const { status, username, password, expiresAt } = res.data;
      if (status === 'SUCCESS' && username) {
        setSession({ username, password, expiresAt });
        setPhase('success');
        autoLogin(username, password, hotspotLoginUrl);
      } else if (status === 'FAILED')  { setPhase('failed'); }
      else if (status === 'CANCELLED') { setPhase('cancelled'); }
      else { setVerifyError('Payment not confirmed yet. If you were charged, use the support contact below.'); }
    } catch (err) {
      setVerifyError(err.response?.data?.message || 'Could not reach M-Pesa. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  if (phase === 'waiting') return (
    <div className="status-screen">
      <div className="status-icon waiting">📱</div>
      <h2>{t.checkYourPhone}</h2>
      <p>{t.stkSent}</p>
      <div className="status-progress" aria-hidden="true">
        <div className="status-progress-bar" style={{ width: `${Math.max(progress, 8)}%` }} />
      </div>
      {offline ? (
        <div style={{
          margin: '0.75rem 0',
          padding: '0.6rem 0.9rem',
          borderRadius: '8px',
          background: '#2a1a00',
          border: '1px solid #d9770655',
          color: '#f59e0b',
          fontSize: '0.82rem',
          textAlign: 'center',
          lineHeight: 1.5,
        }}>
          {t.networkLost}<br />
          <span style={{ opacity: 0.8, fontSize: '0.77rem' }}>{t.dontClose}</span>
        </div>
      ) : (
        <div className="dot-loader"><span /><span /><span /></div>
      )}
      <div className="pin-hint">
        <strong>{t.howToComplete}</strong><br />
        {t.popupHint}
      </div>
      <p className="support-copy subtle">{t.keepOpen}</p>
    </div>
  );

  if (phase === 'success') return (
    <div className="status-screen">
      <AnimatedCheck />
      <h2>{t.connected}</h2>
      <p>{t.paymentConfirmed}</p>
      {session?.expiresAt && (
        <div className="expires-chip">
          {t.accessUntil} {new Date(session.expiresAt).toLocaleString('en-KE', {
            hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
          })}
        </div>
      )}
      <a href="https://www.google.com" className="btn-browse">
        Start Browsing →
      </a>
    </div>
  );

  if (phase === 'failed') return (
    <div className="status-screen">
      <div className="status-icon fail">❌</div>
      <h2>{t.paymentFailed}</h2>
      <p>{t.notCompleted}</p>
      <button className="retry-btn" onClick={() => window.location.reload()}>{t.tryAgain}</button>
    </div>
  );

  if (phase === 'cancelled') return (
    <div className="status-screen">
      <div className="status-icon fail">⚠️</div>
      <h2>{t.paymentCancelled}</h2>
      <p>{t.youCancelled}</p>
      <button className="retry-btn" onClick={() => window.location.reload()}>{t.tryAgain}</button>
    </div>
  );

  if (phase === 'access_failed') return (
    <div className="status-screen">
      <div className="status-icon fail">⚠️</div>
      <h2>{t.paymentReceived}</h2>
      <p>{t.activating}</p>

      {verifyError && (
        <p className="error-msg status-error">{verifyError}</p>
      )}

      <button
        className="btn-pay"
        onClick={handleVerify}
        disabled={verifying}
        style={{ marginBottom: '0.75rem' }}
      >
        {verifying ? t.retryingActivation : t.retryActivation}
      </button>

      <button
        className="retry-btn"
        onClick={handleCheckStatus}
        disabled={verifying}
        style={{ marginBottom: '0.75rem' }}
      >
        {verifying ? 'Checking…' : 'Check my connection'}
      </button>

      {supportParts.length > 0 && (
        <p className="support-copy">
          {t.ifStuck} <strong style={{ color: '#ddd' }}>{supportParts.join(' · ')}</strong>
        </p>
      )}
    </div>
  );

  // Timeout — offer manual verification
  return (
    <div className="status-screen">
      <div className="status-icon fail">⏱️</div>
      <h2>{t.takingLong}</h2>
      <p>{t.couldNotConfirm}</p>

      {verifyError && (
        <p className="error-msg status-error">{verifyError}</p>
      )}

      <button
        className="btn-pay"
        onClick={handleVerify}
        disabled={verifying}
        style={{ marginBottom: '0.75rem' }}
      >
        {verifying ? t.checkingMpesa : t.verifyPayment}
      </button>

      <button
        className="retry-btn"
        onClick={handleCheckStatus}
        disabled={verifying}
        style={{ marginBottom: '0.75rem' }}
      >
        {verifying ? 'Checking…' : 'Check my connection'}
      </button>

      <button className="retry-btn" onClick={() => window.location.reload()}>
        {t.startOver}
      </button>

      <div className="support-panel">
        <strong>{t.charged}</strong><br />
        {t.verifyAbove}
        {supportParts.length > 0 && (
          <>
            <br /><br />
            {t.stillStuck} <strong>{supportParts.join(' · ')}</strong>
          </>
        )}
      </div>
    </div>
  );
}
