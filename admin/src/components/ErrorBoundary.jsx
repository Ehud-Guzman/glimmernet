import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const msg = this.state.error?.message || 'Unknown error';

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', fontFamily: 'Inter, system-ui, sans-serif', padding: '2rem',
      }}>
        <div style={{
          maxWidth: 480, width: '100%', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: '14px',
          padding: '2rem 2.25rem', boxShadow: 'var(--shadow-lg)',
          borderTop: '4px solid var(--red)',
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Something went wrong</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
            An unexpected error occurred in the dashboard. The error has been logged to your browser console.
          </p>
          <code style={{
            display: 'block', fontSize: '0.78rem', color: 'var(--red)',
            background: 'var(--red-dim)', borderRadius: '8px',
            padding: '0.75rem 1rem', marginBottom: '1.5rem',
            wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          }}>
            {msg}
          </code>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              padding: '0.55rem 1.25rem', borderRadius: '8px', border: 'none',
              background: 'var(--accent)', color: '#fff', fontWeight: 600,
              fontSize: '0.85rem', cursor: 'pointer',
            }}
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
