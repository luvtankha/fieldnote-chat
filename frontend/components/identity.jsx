import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Feather, Laptop, Moon, Sun, X } from 'lucide-react';
import { api } from '../services/api';

export function Mark({ large = false }) {
  return <span className={large ? 'mark mark-large' : 'mark'} aria-hidden="true"><Feather /></span>;
}

export function Modal({ title, description, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="modal" aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="modal-inner">
      <button className="icon-button close-modal" aria-label="Close dialog" onClick={onClose}><X size={19} /></button>
      <Mark />
      <h2 id="modal-title">{title}</h2>
      {description && <p className="muted modal-description">{description}</p>}
      {children}
    </div>
  </dialog>;
}

export function AuthModal({ initial, onClose, onUser }) {
  const [mode, setMode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signup = mode === 'signup';
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const input = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError('');
    try {
      const { user } = await api(`/auth/${mode}`, { method: 'POST', body: input });
      onUser(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <Modal title={signup ? 'Create your account' : 'Welcome back'}
    description={signup ? 'Your conversations and preferences travel with you.' : 'Sign in to pick up where you left off.'} onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      {signup && <label>Your name<input autoComplete="name" name="name" maxLength={40} required /></label>}
      <label>Email address<input type="email" autoComplete="email" name="email" maxLength={254} required /></label>
      <label>Password<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} name="password" minLength={signup ? 12 : 1} maxLength={128} required />
        {signup && <small>Use at least 12 characters.</small>}
      </label>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="primary-button full-button" disabled={busy} type="submit">{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button>
    </form>
    <p className="form-footer">{signup ? 'Already have an account?' : 'New to Fieldnote?'}{' '}
      <button className="text-button" onClick={() => { setMode(signup ? 'login' : 'signup'); setError(''); }}>
        {signup ? 'Sign in' : 'Create an account'}
      </button>
    </p>
  </Modal>;
}

export function SettingsModal({ user, onClose, onUser, onExpire }) {
  const [theme, setTheme] = useState(user.settings.theme);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const options = [['system', 'System', Laptop], ['light', 'Light', Sun], ['dark', 'Dark', Moon]];
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const assistantName = new FormData(event.currentTarget).get('assistantName');
    setBusy(true);
    setError('');
    try {
      const { user } = await api('/me/settings', { method: 'PATCH', body: { assistantName, theme } });
      onUser(user);
      onClose();
    } catch (err) {
      if (err.status === 401) onExpire();
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <Modal title="Preferences" description="Make your workspace feel like yours." onClose={onClose}>
    <form className="form-stack" onSubmit={submit}>
      <label>Assistant name<input name="assistantName" defaultValue={user.settings.assistantName} maxLength={40} required /></label>
      <fieldset><legend>Appearance</legend><div className="theme-options">
        {options.map(([value, label, Icon]) => <label className="theme-option" key={value}>
          <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => setTheme(value)} />
          <span><Icon size={18} />{label}</span>
        </label>)}
      </div></fieldset>
      {error && <p className="error-text" role="alert">{error}</p>}
      <button className="primary-button full-button" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save preferences'}<Check size={17} /></button>
    </form>
  </Modal>;
}
