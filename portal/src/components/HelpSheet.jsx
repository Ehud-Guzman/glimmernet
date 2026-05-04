import { useState, useEffect } from 'react';

const FAQS = [
  {
    id: 'laptop',
    icon: '💻',
    question: 'How do I connect my laptop or desktop?',
    answer: [
      { type: 'text', content: 'Open any browser on your laptop — the WiFi login page should appear automatically.' },
      { type: 'steps', items: [
        'Select a plan and click Continue',
        'Enter your M-Pesa number (the one that will receive the payment prompt)',
        'Confirm the M-Pesa STK push on your phone',
        'Your laptop connects automatically once payment clears',
      ]},
      { type: 'tip', content: 'If the portal doesn\'t open automatically, try visiting a plain HTTP site (e.g. http://example.com). Secure HTTPS sites can bypass the redirect.' },
    ],
  },
  {
    id: 'tv',
    icon: '📺',
    question: 'How do I connect my Smart TV?',
    answer: [
      { type: 'text', content: 'Most Smart TVs don\'t show captive portal pages automatically. Try one of these options:' },
      { type: 'options', items: [
        {
          label: 'Option A — TV browser app',
          detail: 'Open your TV\'s built-in browser, visit any website, and the WiFi login page should appear. Buy a plan normally.',
        },
        {
          label: 'Option B — Phone hotspot (easiest)',
          detail: 'Connect your phone to this WiFi, buy a plan on your phone, then turn on Mobile Hotspot in your phone settings. Connect your TV to your phone\'s hotspot.',
        },
        {
          label: 'Option C — Voucher code',
          detail: 'Ask the venue for a voucher code. Open the TV browser, go to any site, tap "Enter Voucher Code" on the login page, and type the code.',
        },
      ]},
    ],
  },
  {
    id: 'transfer',
    icon: '📱',
    question: 'I bought on my phone — how do I use it on my laptop or TV?',
    answer: [
      { type: 'text', content: 'Your session is linked to your phone\'s connection. Here\'s how to share it with another device:' },
      { type: 'options', items: [
        {
          label: '🔥 Hotspot (quickest)',
          detail: 'Stay connected on this WiFi. Go to your phone Settings → Mobile Hotspot → Turn it ON. Now connect your laptop or TV to your phone\'s hotspot name. Done — they share your internet.',
        },
        {
          label: 'Voucher code (any device)',
          detail: 'If the venue sells voucher codes, get one and redeem it directly on the laptop or TV. Open a browser, visit any site, tap "Enter Voucher Code", type the code, and that device connects independently.',
        },
        {
          label: 'Buy a separate plan',
          detail: 'Open a browser on the laptop or TV, purchase a new plan and pay with any M-Pesa number. Each device gets its own session.',
        },
      ]},
      { type: 'tip', content: 'The hotspot method works with any device — laptops, tablets, TVs, game consoles. Your phone stays connected to the WiFi and shares it out.' },
    ],
  },
  {
    id: 'code-laptop',
    icon: '🔑',
    question: 'How do I type my session code on another device?',
    answer: [
      { type: 'text', content: 'If you received a voucher or session code (e.g. via SMS or printed slip), here\'s how to use it on any device:' },
      { type: 'steps', items: [
        'Make sure the device is connected to this WiFi network',
        'Open a browser and go to any website — the portal login page will appear',
        'Scroll down and tap "Enter Voucher Code"',
        'Type the code exactly as given (letters and numbers, no spaces)',
        'Tap Redeem — the device connects immediately',
      ]},
      { type: 'tip', content: 'Voucher codes are single-use and expire once redeemed. Keep the code private.' },
    ],
  },
  {
    id: 'charged',
    icon: '💳',
    question: 'I was charged but didn\'t get internet',
    answer: [
      { type: 'text', content: 'This is usually a timing issue. Here\'s what to do:' },
      { type: 'steps', items: [
        'Wait up to 60 seconds — activation sometimes takes a moment',
        'Open a new browser tab and try loading any site',
        'If you still see this portal, tap "Check my connection" or "Verify Payment" if the button appears',
        'Still nothing after 2 minutes? Contact the venue support shown at the bottom of this page',
      ]},
      { type: 'tip', content: 'Your M-Pesa balance is safe. If activation failed, the venue can issue a voucher code as a replacement.' },
    ],
  },
  {
    id: 'expired',
    icon: '⏰',
    question: 'My internet stopped working',
    answer: [
      { type: 'text', content: 'Your session has most likely expired.' },
      { type: 'steps', items: [
        'Open any browser — you\'ll be redirected to this page automatically',
        'Purchase a new plan to reconnect',
        'Returning users: your phone number is remembered, so checkout is faster',
      ]},
    ],
  },
];

export default function HelpSheet({ accentColor = '#00c853', supportParts = [] }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const close = () => { setOpen(false); setExpanded(null); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = (id) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <>
      <button className="help-trigger" onClick={() => setOpen(true)} aria-label="Open help">
        <span className="help-trigger-icon">?</span>
        <span>Help &amp; FAQ</span>
      </button>

      {open && (
        <div className="help-overlay" role="dialog" aria-modal="true">
          <div className="help-sheet">

            {/* Header */}
            <div className="help-sheet-header">
              <div>
                <h2 className="help-sheet-title">Help &amp; FAQ</h2>
                <p className="help-sheet-sub">How to connect on any device</p>
              </div>
              <button className="help-close" onClick={close} aria-label="Close help">×</button>
            </div>

            {/* Body */}
            <div className="help-sheet-body">
              {FAQS.map((faq) => {
                const isOpen = expanded === faq.id;
                return (
                  <div key={faq.id} className={`help-item${isOpen ? ' open' : ''}`}>
                    <button className="help-item-trigger" onClick={() => toggle(faq.id)}>
                      <span className="help-item-icon">{faq.icon}</span>
                      <span className="help-item-question">{faq.question}</span>
                      <span className={`help-chevron${isOpen ? ' up' : ''}`}>›</span>
                    </button>

                    {isOpen && (
                      <div className="help-item-body">
                        {faq.answer.map((block, i) => {
                          if (block.type === 'text') return (
                            <p key={i} className="help-block-text">{block.content}</p>
                          );
                          if (block.type === 'steps') return (
                            <ol key={i} className="help-steps">
                              {block.items.map((s, j) => <li key={j}>{s}</li>)}
                            </ol>
                          );
                          if (block.type === 'options') return (
                            <div key={i} className="help-options">
                              {block.items.map((opt, j) => (
                                <div key={j} className="help-option">
                                  <div className="help-option-label" style={{ color: accentColor }}>{opt.label}</div>
                                  <div className="help-option-detail">{opt.detail}</div>
                                </div>
                              ))}
                            </div>
                          );
                          if (block.type === 'tip') return (
                            <div key={i} className="help-tip"
                              style={{ borderColor: `${accentColor}44`, background: `${accentColor}0d` }}>
                              <span style={{ color: accentColor, fontWeight: 700 }}>Tip: </span>
                              {block.content}
                            </div>
                          );
                          return null;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Support footer inside sheet */}
              {supportParts.length > 0 && (
                <div className="help-support">
                  <div className="help-support-label">Still stuck? Contact support</div>
                  <div className="help-support-contacts">
                    {supportParts.map((s, i) => (
                      <span key={i} className="help-support-item">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
