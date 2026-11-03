import { useState } from 'react';
import { X } from 'lucide-react';
import { areas } from '../data.js';
import { loginAccount, registerAccount, roles } from '../lib/auth.js';

export default function AuthModal({ client, onClose, initialRole = 'renter' }) {
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', password: '', role: initialRole, display_name: '', phone: '', service_area: 'Banasree' });
  const field = (key) => ({ value: form[key], onChange: event => setForm(old => ({ ...old, [key]: event.target.value })) });
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (register) {
        const data = await registerAccount(client, form, window.location.origin);
        if (data.needsEmailConfirmation) { setMessage('Check your email to confirm your account, then sign in.'); setForm(old => ({ ...old, password: '' })); }
        else onClose();
      } else { await loginAccount(client, form.email, form.password); onClose(); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Account access">
    <div className="auth-modal form-panel">
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close account dialog" disabled={busy}><X size={20}/></button>
      <h2>{register ? 'Create your BashaShift account' : 'Sign in to BashaShift'}</h2>
      <p className="muted small">Use an account to share listings and requests across devices.</p>
      <form onSubmit={submit} className="auth-form">
        {register && <>
          <label className="field"><span>Account role</span><select className="form-control" {...field('role')}>{Object.entries(roles).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Full name</span><input className="form-control" required maxLength={100} autoComplete="name" {...field('display_name')}/></label>
          <label className="field"><span>Bangladesh phone number</span><input className="form-control" required type="tel" autoComplete="tel" placeholder="01XXXXXXXXX" {...field('phone')}/></label>
          {form.role === 'mover' && <label className="field"><span>Service area</span><select className="form-control" {...field('service_area')}>{areas.map(area => <option key={area}>{area}</option>)}</select></label>}
        </>}
        <label className="field"><span>Email address</span><input className="form-control" type="email" required autoComplete="email" {...field('email')}/></label>
        <label className="field"><span>Password</span><input className="form-control" type="password" required minLength={8} autoComplete={register ? 'new-password' : 'current-password'} {...field('password')}/></label>
        {error && <div role="alert" className="inline-alert">{error}</div>}
        {message && <div role="status" className="inline-alert positive">{message}</div>}
        <button className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      </form>
      <button className="btn btn-soft btn-block" disabled={busy} onClick={() => { setRegister(!register); setMessage(''); setError(''); }}>{register ? 'Already registered? Sign in' : 'New here? Create an account'}</button>
    </div>
  </div>;
}
