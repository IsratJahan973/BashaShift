import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = process.env.SUPABASE_CLI || 'supabase';
const status = spawnSync(cli, ['status', '--output', 'json'], { cwd: root, encoding: 'utf8' });
if (status.status !== 0) throw new Error('Start local Supabase first. Set SUPABASE_CLI if the CLI is not on PATH.');
let local;
try { local = JSON.parse(status.stdout); }
catch { throw new Error('Local Supabase status could not be read. No credentials were logged.'); }
const endpoint = new URL(local.API_URL);
if (!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)) throw new Error('This helper only operates on a local Supabase instance.');
if (!local.ANON_KEY || !local.SERVICE_ROLE_KEY) throw new Error('Local Supabase did not return its test credentials.');

const mode = process.argv[2];
if (mode === 'env') {
  const path = new URL('../.env.local', import.meta.url);
  if (existsSync(path)) throw new Error('.env.local already exists; preserve it and configure local test settings manually.');
  writeFileSync(path, `# Generated public configuration for local Supabase only.\nVITE_SUPABASE_URL=${local.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${local.ANON_KEY}\n`, { mode: 0o600 });
  console.log('Wrote ignored .env.local with public local configuration. No server secret was written.');
} else if (mode === 'test' || mode === 'browser') {
  const runId = randomUUID().replaceAll('-', '');
  const env = { ...process.env, BASHASHIFT_TEST_SUPABASE_URL:local.API_URL,
    BASHASHIFT_TEST_SUPABASE_KEY:local.ANON_KEY, BASHASHIFT_TEST_SUPABASE_ADMIN_KEY:local.SERVICE_ROLE_KEY,
    BASHASHIFT_TEST_RUN_ID:runId };
  const command = mode === 'test' ? process.execPath : (process.env.PYTHON_EXECUTABLE || 'python3');
  const args = mode === 'test' ? ['--test','tests/integration/supabase.test.mjs'] : ['tests/supabase_smoke.py', ...process.argv.slice(3)];
  const run = spawnSync(command, args, { cwd:root, env, stdio:'inherit' });
  process.exitCode = run.status ?? 1;
  if (mode === 'browser') {
    // Remove only users/records created by this exact local browser test run.
    const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth:{ persistSession:false, autoRefreshToken:false } });
    const checked = async query => { const { data,error }=await query;if(error)throw new Error(error.message);return data; };
    try {
      const ids=[];
      for (let page=1;;page++) {
        const { data,error }=await admin.auth.admin.listUsers({ page,perPage:1000 });
        if(error)throw new Error(error.message);
        ids.push(...data.users.filter(user=>user.email?.startsWith('ui-'+runId+'-')).map(user=>user.id));
        if(data.users.length<1000)break;
      }
      if(ids.length) {
        const requests=(await checked(admin.from('moving_requests').select('id').in('renter_id',ids))).map(row=>row.id);
        if(requests.length) {
          for(const table of ['bookings','mover_offers','moving_inventory'])await checked(admin.from(table).delete().in('request_id',requests));
          await checked(admin.from('moving_requests').delete().in('id',requests));
        }
        await checked(admin.from('viewing_inquiries').delete().in('renter_id',ids));
        const properties=await checked(admin.from('properties').select('id,property_images(storage_path)').in('owner_id',ids));
        const photos=properties.flatMap(property=>property.property_images).map(image=>image.storage_path);
        if(photos.length)await checked(admin.storage.from('property-images').remove(photos));
        await checked(admin.from('properties').delete().in('owner_id',ids));
        for(const id of ids) { const { error }=await admin.auth.admin.deleteUser(id);if(error)throw new Error(error.message); }
      }
      console.log('Removed local browser fixtures for this run.');
    } catch(error) { console.error('Local fixture cleanup failed: '+error.message);process.exitCode=1; }
  }
} else throw new Error('Choose env, test, or browser. Credential values are never printed.');
