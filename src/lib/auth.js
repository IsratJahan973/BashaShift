import { safePhone } from '../domain.js';

export const roles = { owner: 'Property Owner', renter: 'Renter', mover: 'Moving Service Provider' };

function validatePublicKey(key) {
  if (key.startsWith('sb_secret_')) throw new Error('A server secret must never be used in the frontend.');
  if (key.startsWith('sb_publishable_')) return;
  let claims;
  try { claims = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { throw new Error('Use a Supabase publishable key or legacy anon key.'); }
  if (claims.role !== 'anon') throw new Error('Only the public anon key is allowed in the frontend.');
}

export function readSupabaseConfig(env = {}, { requireHosted = false } = {}) {
  if (Object.entries(env).some(([name,value]) => value && /^VITE_.*(?:SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY|OPENAI|CLOUDFLARE)/i.test(name))) {
    throw new Error('Server credentials must not use VITE_ variable names.');
  }
  const url = env.VITE_SUPABASE_URL?.trim() || '';
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '').trim();
  for (const name of ['VITE_SUPABASE_PUBLISHABLE_KEY','VITE_SUPABASE_ANON_KEY']) {
    if (env[name]?.trim()) validatePublicKey(env[name].trim());
  }
  if (!url && !key) {
    if (requireHosted) throw new Error('Production requires VITE_SUPABASE_URL and a public Supabase key.');
    return { configured: false, url: '', key: '' };
  }
  if (!url || !key) throw new Error('Set both the Supabase URL and public publishable key.');
  let endpoint;
  try { endpoint = new URL(url); }
  catch { throw new Error('Use a valid Supabase project API URL.'); }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('Use the base project URL without embedded credentials, query parameters, or paths.');
  }
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname))) {
    throw new Error('Use HTTPS for a hosted Supabase project.');
  }
  if (endpoint.hostname === 'supabase.com' || endpoint.hostname.endsWith('.supabase.com')) {
    throw new Error('Use the project API URL, not the Supabase dashboard URL.');
  }
  if (requireHosted && (endpoint.protocol !== 'https:' || endpoint.hostname === 'localhost' ||
    endpoint.hostname.endsWith('.localhost') || /^127\./.test(endpoint.hostname) ||
    ['[::1]', '[::]', '0.0.0.0'].includes(endpoint.hostname))) {
    throw new Error('Production requires a hosted HTTPS Supabase project API URL.');
  }
  return { configured: true, url: endpoint.href.replace(/\/$/, ''), key };
}

export function registrationData(form) {
  if (!Object.hasOwn(roles, form.role)) throw new Error('Choose an account role.');
  if (!form.display_name?.trim()) throw new Error('Enter your name.');
  if (!safePhone(form.phone)) throw new Error('Enter a valid Bangladesh phone number.');
  if (!form.email?.trim() || !form.email.includes('@')) throw new Error('Enter your email address.');
  if (!form.password || form.password.length < 8) throw new Error('Use a password with at least 8 characters.');
  return {
    email: form.email.trim(), password: form.password,
    options: { data: {
      role: form.role, display_name: form.display_name.trim(),
      phone: form.phone.replace(/\D/g, ''), service_area: form.service_area || 'Banasree',
    } },
  };
}

export async function registerAccount(client, form, redirectTo) {
  const payload = registrationData(form);
  if (redirectTo) payload.options.emailRedirectTo = redirectTo;
  const { data, error } = await client.auth.signUp(payload);
  if (error) throw error;
  return { ...data, needsEmailConfirmation: !data.session };
}

export async function loginAccount(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
  return data;
}

export async function verifyAccountRole(client, userId, selectedRole) {
  const { data, error } = await client.from('profiles').select('role').eq('id', userId).single();
  if (error) throw error;
  if (!Object.hasOwn(roles, data.role)) throw new Error('Your account role could not be verified. Contact support before continuing.');
  if (data.role !== selectedRole) {
    throw new Error(`This account is registered as ${roles[data.role] || 'another role'}. Select the matching role to sign in.`);
  }
  return data.role;
}

export async function requestPasswordReset(client, email, redirectTo) {
  const address = email.trim();
  if (!address || !address.includes('@')) throw new Error('Enter your email address.');
  const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo });
  if (error) throw error;
}

export async function updateAccountPassword(client, password) {
  if (!password || password.length < 8) throw new Error('Use a password with at least 8 characters.');
  const { data, error } = await client.auth.updateUser({ password });
  if (error) throw error;
  return data;
}
