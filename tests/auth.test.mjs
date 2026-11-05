import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loginAccount, readSupabaseConfig, registerAccount, registrationData, requestPasswordReset, updateAccountPassword, verifyAccountRole } from '../src/lib/auth.js';

const publicKey = () => 'sb_publishable_'+randomUUID();
const form = () => ({ email: ' renter@example.test ', password: randomUUID(), role: 'renter', display_name: ' Test Renter ', phone: '018-1234-5678' });

test('missing configuration leaves accounts unconfigured; incomplete configuration fails', () => {
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
test('selected login role is verified against the protected Supabase profile', async () => {
  let query;
  const client = { from:table => ({ select:columns => ({ eq:(column,value) => ({ single:async () => {
    query={table,columns,column,value};
    return { data:{ role:'mover' }, error:null };
  } }) }) }) };
  assert.equal(await verifyAccountRole(client,'user-1','mover'),'mover');
  assert.deepEqual(query,{table:'profiles',columns:'role',column:'id',value:'user-1'});
  await assert.rejects(verifyAccountRole(client,'user-1','renter'),/registered as Moving Service Provider/);
  const failure = new Error('Profile lookup failed');
  await assert.rejects(verifyAccountRole({ from:() => ({ select:() => ({ eq:() => ({ single:async () => ({ data:null,error:failure }) }) }) }) },'user-1','mover'),failure);
});
test('password recovery requests a reset link using a normalized email and callback URL', async () => {
  let submitted;
  const client = { auth:{ resetPasswordForEmail:async (...args) => { submitted=args;return { error:null }; } } };
  await requestPasswordReset(client, ' renter@example.test ', 'https://bashashift.example');
  assert.deepEqual(submitted, ['renter@example.test', { redirectTo:'https://bashashift.example' }]);
  await assert.rejects(requestPasswordReset(client, 'invalid', 'https://bashashift.example'), /Enter your email address/);
});
test('password update validates length and propagates Supabase Auth failures', async () => {
  const failure = new Error('Auth session missing');
  const client = { auth:{ updateUser:async ({ password }) => ({ data:{ user:{ password } }, error:failure }) } };
  await assert.rejects(updateAccountPassword(client, 'short'), /at least 8 characters/);
  await assert.rejects(updateAccountPassword(client, randomUUID()), failure);
  let updated;
  const successfulClient = { auth:{ updateUser:async value => { updated=value;return { data:{ user:{ id:randomUUID() } }, error:null }; } } };
  await updateAccountPassword(successfulClient, 'long-enough-password');
  assert.deepEqual(updated, { password:'long-enough-password' });
});

test('production configuration requires a hosted API origin while test/development support a local Supabase API',()=>{
  assert.throws(()=>readSupabaseConfig({}, {requireHosted:true}),/Production requires/);
  for(const url of ['http://localhost:54321','https://localhost','https://127.0.0.2','https://[::1]']){
    assert.throws(()=>readSupabaseConfig({VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:publicKey()},{requireHosted:true}),/hosted HTTPS/);
  }
  assert.equal(readSupabaseConfig({VITE_SUPABASE_URL:'https://custom-api.example.test',VITE_SUPABASE_PUBLISHABLE_KEY:publicKey()},{requireHosted:true}).configured,true);
  assert.equal(readSupabaseConfig({VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_PUBLISHABLE_KEY:publicKey()}).configured,true);
});
test('dashboard URLs and any VITE provider credential setting are rejected without exposing their values',()=>{
  for(const url of ['https://supabase.com','https://app.supabase.com'])assert.throws(()=>readSupabaseConfig({VITE_SUPABASE_URL:url,VITE_SUPABASE_PUBLISHABLE_KEY:publicKey()}),/dashboard/);
  const privateValue='private-test-value-'+randomUUID();
  for(const key of ['VITE_OPENAI_API_KEY','VITE_BASHASHIFT_OPENAI_KEY','VITE_CLOUDFLARE_AI_TOKEN','VITE_CLOUDFLARE_ACCOUNT_ID']){
    assert.throws(()=>readSupabaseConfig({[key]:privateValue}),error=>/Server credentials/.test(error.message)&&!error.message.includes(privateValue));
  }
  assert.throws(()=>readSupabaseConfig({VITE_SUPABASE_URL:privateValue,VITE_SUPABASE_PUBLISHABLE_KEY:publicKey()}),error=>/project API URL/.test(error.message)&&!error.message.includes(privateValue));
});
