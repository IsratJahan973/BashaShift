import { useState } from 'react';
import { X } from 'lucide-react';
import { areas } from '../data.js';
import { loginAccount, registerAccount, requestPasswordReset, roles, updateAccountPassword, verifyAccountRole } from '../lib/auth.js';

const roleLabels = {
  owner: { english: 'Property Owner', bangla: 'বাড়ির মালিক' },
  renter: { english: 'Renter', bangla: 'ভাড়াটিয়া' },
  mover: { english: 'Moving Service Provider', bangla: 'সেবাদানকারী' },
};
const registrationFields = {
  'Full name':'পূর্ণ নাম', 'Bangladesh phone number':'বাংলাদেশি ফোন নম্বর',
  'Service area':'কাজের এলাকা', 'Email address':'ইমেইল ঠিকানা',
  'Password':'পাসওয়ার্ড', 'Confirm new password':'নতুন পাসওয়ার্ড নিশ্চিত করুন',
};

export default function AuthModal({ client, onClose, onAuthenticated, initialRole = 'renter', initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', role: initialRole, display_name: '', phone: '', service_area: 'Banasree' });
  const register = mode === 'register';
  const field = (key) => ({ value: form[key], onChange: event => setForm(old => ({ ...old, [key]: event.target.value })) });
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(client, form.email, window.location.origin);
        setMessage('If an account exists for this email, we’ve sent a password reset link.');
      } else if (mode === 'reset') {
        if (form.password !== form.confirmPassword) throw new Error('Passwords do not match.');
        await updateAccountPassword(client, form.password);
        setMode('complete');
        setMessage('Your password has been updated. You are now signed in.');
      } else if (register) {
        const data = await registerAccount(client, form, window.location.origin);
        if (data.needsEmailConfirmation) { setMessage('Check your email to confirm your account, then sign in.'); setForm(old => ({ ...old, password: '' })); }
        else {
          try { await verifyAccountRole(client, data.user.id, form.role); }
          catch (failure) { await client.auth.signOut(); throw failure; }
          onAuthenticated(form.role);
        }
      } else {
        const data = await loginAccount(client, form.email, form.password);
        try { await verifyAccountRole(client, data.user.id, form.role); }
        catch (failure) { await client.auth.signOut(); throw failure; }
        onAuthenticated(form.role);
      }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  function changeMode(next) {
    setMode(next); setMessage(''); setError('');
    setForm(old => ({ ...old, password: '', confirmPassword: '' }));
  }
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Account access">
    <div className="auth-modal form-panel">
      <button type="button" className="modal-close" onClick={onClose} aria-label="Close account dialog" disabled={busy}><X size={20}/></button>
      <h2>{register ? 'Create your BashaShift account' : mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : mode === 'complete' ? 'Password updated' : 'Sign in to BashaShift'}</h2>
      <p className="muted small">{mode === 'forgot' ? 'Enter your email and we’ll send a secure password reset link.' : mode === 'reset' ? 'Choose a new password for your BashaShift account.' : mode === 'complete' ? 'Your account is ready to use with your new password.' : 'Use an account to share listings and requests across devices.'}</p>
      {mode === 'complete' ? <div className="auth-form">
        <div role="status" className="inline-alert positive">{message}</div>
        <button className="btn btn-primary btn-block" onClick={onClose}>Continue to BashaShift</button>
      </div> : <form onSubmit={submit} className="auth-form">
        {mode === 'login' && <fieldset className="role-picker">
          <legend>Choose your role / আপনার পরিচয় বাছুন</legend>
          <div className="role-options">{Object.entries(roleLabels).map(([value,label]) => <button key={value} type="button" className={form.role === value ? 'selected' : ''} aria-pressed={form.role === value} onClick={() => setForm(old => ({ ...old, role:value }))}><strong>{label.english}</strong><span lang="bn">{label.bangla}</span></button>)}</div>
        </fieldset>}
        {register && <>
          <label className="field"><span>Account role / অ্যাকাউন্টের ধরন</span><select aria-label="Account role" className="form-control" {...field('role')}>{Object.entries(roleLabels).map(([value,label]) => <option key={value} value={value}>{label.english} ({label.bangla})</option>)}</select></label>
          <label className="field"><span>Full name</span><small lang="bn">{registrationFields['Full name']}</small><input aria-label="Full name" className="form-control" required maxLength={100} autoComplete="name" {...field('display_name')}/></label>
          <label className="field"><span>Bangladesh phone number</span><small lang="bn">{registrationFields['Bangladesh phone number']}</small><input aria-label="Bangladesh phone number" className="form-control" required type="tel" autoComplete="tel" placeholder="01XXXXXXXXX" {...field('phone')}/></label>
          {form.role === 'mover' && <label className="field"><span>Service area</span><small lang="bn">{registrationFields['Service area']}</small><select aria-label="Service area" className="form-control" {...field('service_area')}>{areas.map(area => <option key={area}>{area}</option>)}</select></label>}
        </>}
        {mode !== 'reset' && <label className="field"><span>Email address</span><small lang="bn">{registrationFields['Email address']}</small><input aria-label="Email address" className="form-control" type="email" required autoComplete="email" {...field('email')}/></label>}
        {mode !== 'forgot' && <label className="field"><span>Password</span><small lang="bn">{registrationFields.Password}</small><input aria-label="Password" className="form-control" type="password" required minLength={8} autoComplete={register || mode === 'reset' ? 'new-password' : 'current-password'} {...field('password')}/></label>}
        {mode === 'reset' && <label className="field"><span>Confirm new password</span><small lang="bn">{registrationFields['Confirm new password']}</small><input aria-label="Confirm new password" className="form-control" type="password" required minLength={8} autoComplete="new-password" {...field('confirmPassword')}/></label>}
        {error && <div role="alert" className="inline-alert">{error}</div>}
        {message && <div role="status" className="inline-alert positive">{message}</div>}
        <button aria-label={busy?'Please wait':register?'Create account':mode==='forgot'?'Send reset link':mode==='reset'?'Update password':'Sign in'} className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Please wait…' : register ? 'Create account / অ্যাকাউন্ট খুলুন' : mode === 'forgot' ? 'Send reset link / রিসেট লিংক পাঠান' : mode === 'reset' ? 'Update password / পাসওয়ার্ড বদলান' : 'Sign in / লগ ইন'}</button>
      </form>}
      {mode === 'forgot' && <button aria-label="Back to sign in" className="auth-text-button" disabled={busy} onClick={() => changeMode('login')}>Back to sign in / লগ ইনে ফিরুন</button>}
      {mode === 'login' && <>
        <button aria-label="Forgot password?" className="auth-text-button" disabled={busy} onClick={() => changeMode('forgot')}>Forgot password? / পাসওয়ার্ড ভুলে গেছেন?</button>
        <button aria-label="New here? Create an account" className="btn btn-soft btn-block" disabled={busy} onClick={() => changeMode('register')}>New here? Create an account / নতুন? অ্যাকাউন্ট খুলুন</button>
      </>}
      {register && <button aria-label="Already registered? Sign in" className="btn btn-soft btn-block" disabled={busy} onClick={() => changeMode('login')}>Already registered? Sign in / আগে থেকেই অ্যাকাউন্ট আছে? লগ ইন</button>}
    </div>
  </div>;
}
