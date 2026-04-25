import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { autoLogin } from '../App';

const POLL_INTERVAL = 3000;
const MAX_POLLS = 40;        // ~2 minutes
const OFFLINE_THRESHOLD = 3; // consecutive failures before showing offline warning

export default function StatusPoller({ checkoutRequestId, brand = {} }) {
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
      <h2>Check your phone</h2>
      <p>An M-Pesa STK push has been sent to your number.<br />Enter your PIN to confirm payment.</p>
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
          Network connection lost — waiting to reconnect.<br />
          <span style={{ opacity: 0.8, fontSize: '0.77rem' }}>Your payment is still being tracked. Don't close this page.</span>
        </div>
      ) : (
        <div className="dot-loader"><span /><span /><span /></div>
      )}
      <div className="pin-hint">
        <strong>How to complete:</strong><br />
        A pop-up will appear on your phone asking for your M-Pesa PIN.
        Enter it to pay and get connected instantly.
      </div>
      <p className="support-copy subtle">Keep this page open while we confirm payment and activate access.</p>
    </div>
  );

  if (phase === 'success') return (
    <div className="status-screen">
      <div className="status-icon success">✅</div>
      <h2>You're connected!</h2>
      <p>Payment confirmed. Logging you in automatically…</p>
      {session?.expiresAt && (
        <div className="expires-chip">
          Access until {new Date(session.expiresAt).toLocaleString('en-KE', {
            hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short',
          })}
        </div>
      )}
    </div>
  );

  if (phase === 'failed') return (
    <div className="status-screen">
      <div className="status-icon fail">❌</div>
      <h2>Payment failed</h2>
      <p>Your M-Pesa transaction was not completed.<br />You were not charged.</p>
      <button className="retry-btn" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );

  if (phase === 'cancelled') return (
    <div className="status-screen">
      <div className="status-icon fail">⚠️</div>
      <h2>Payment cancelled</h2>
      <p>You cancelled the M-Pesa prompt.</p>
      <button className="retry-btn" onClick={() => window.location.reload()}>Try again</button>
    </div>
  );

  if (phase === 'access_failed') return (
    <div className="status-screen">
      <div className="status-icon fail">⚠️</div>
      <h2>Payment received</h2>
      <p>We got your payment, but activating internet access is taking longer than expected.</p>

      {verifyError && (
        <p className="error-msg status-error">{verifyError}</p>
      )}

      <button
        className="btn-pay"
        onClick={handleVerify}
        disabled={verifying}
        style={{ marginBottom: '0.75rem' }}
      >
        {verifying ? 'Retrying activation…' : 'Retry activation'}
      </button>

      {supportParts.length > 0 && (
        <p className="support-copy">
          If it still does not connect, contact support: <strong style={{ color: '#ddd' }}>{supportParts.join(' · ')}</strong>
        </p>
      )}
    </div>
  );

  // Timeout — offer manual verification
  return (
    <div className="status-screen">
      <div className="status-icon fail">⏱️</div>
      <h2>Taking longer than expected</h2>
      <p>We couldn't confirm your payment automatically.</p>

      {verifyError && (
        <p className="error-msg status-error">{verifyError}</p>
      )}

      <button
        className="btn-pay"
        onClick={handleVerify}
        disabled={verifying}
        style={{ marginBottom: '0.75rem' }}
      >
        {verifying ? 'Checking M-Pesa…' : 'Verify my payment'}
      </button>

      <button className="retry-btn" onClick={() => window.location.reload()}>
        Start over
      </button>

      <div className="support-panel">
        <strong>Were you charged but not connected?</strong><br />
        Press "Verify my payment" above — it checks M-Pesa directly and activates your session if the payment went through.
        {supportParts.length > 0 && (
          <>
            <br /><br />
            Still stuck? Contact support: <strong>{supportParts.join(' · ')}</strong>
          </>
        )}
      </div>
    </div>
  );
}
