import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loginAccount, readSupabaseConfig, registerAccount, registrationData } from '../src/lib/auth.js';

const publicKey = () => 'sb_publishable_'+randomUUID();
const form = () => ({ email: ' renter@example.test ', password: randomUUID(), role: 'renter', display_name: ' Test Renter ', phone: '018-1234-5678' });

test('missing configuration selects the labeled demo; incomplete configuration fails', () => {
  assert.equal(readSupabaseConfig({}).configured, false);
  assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL: 'https://example.supabase.co' }));
});
test('only HTTPS hosted URLs or loopback HTTP and public keys are accepted', () => {
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL:'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY:publicKey() }).configured, true);
  assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL:'http://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY:publicKey() }));
  assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL:'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY:'sb_secret_'+randomUUID() }));
  assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL:'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY:publicKey(), VITE_SUPABASE_ANON_KEY:'sb_secret_'+randomUUID() }));
  assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL:'https://user:password@example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY:publicKey() }));
  const legacy = role => ['header', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'signature'].join('.');
  assert.throws(() => readSupabaseConfig({ VITE_SUPABASE_URL:'https://example.supabase.co', VITE_SUPABASE_ANON_KEY:legacy('service_role') }));
  assert.equal(readSupabaseConfig({ VITE_SUPABASE_URL:'https://example.supabase.co', VITE_SUPABASE_ANON_KEY:legacy('anon') }).configured, true);
});
test('signup validates the selected role, phone and password before calling Auth', () => {
  for (const change of [{ role:'admin' }, { role:'__proto__' }, { phone:'01212345678' }, { password:'short' }]) {
    assert.throws(() => registrationData({ ...form(), ...change }));
  }
  const payload = registrationData({ ...form(), role:'mover', service_area:'Rampura', is_admin:true });
  assert.equal(payload.email, 'renter@example.test');
  assert.deepEqual(payload.options.data, { role:'mover', display_name:'Test Renter', phone:'01812345678', service_area:'Rampura' });
});
test('signup does not report an authenticated session when email confirmation is required', async () => {
  let submitted;
  const client = { auth:{ signUp:async payload => { submitted=payload;return { data:{ user:{ id:randomUUID() }, session:null }, error:null }; } } };
  const result = await registerAccount(client, form(), 'https://bashashift.example');
  assert.equal(result.needsEmailConfirmation, true);
  assert.equal(submitted.options.emailRedirectTo, 'https://bashashift.example');
});
test('signup/login failures propagate; they never turn into demo account success', async () => {
  const failure = new Error('Invalid login credentials');
  const client = { auth:{ signUp:async () => ({ error:failure }), signInWithPassword:async () => ({ error:failure }) } };
  await assert.rejects(registerAccount(client, form()), failure);
  await assert.rejects(loginAccount(client, 'renter@example.test', randomUUID()), failure);
});
test('successful login uses Supabase Auth and retains the returned session', async () => {
  const session = { user:{ id:randomUUID() } };
  let submitted;
  const client = { auth:{ signInWithPassword:async value => { submitted=value;return { data:{ session }, error:null }; } } };
  assert.equal((await loginAccount(client, ' renter@example.test ', randomUUID())).session, session);
  assert.equal(submitted.email, 'renter@example.test');
});
