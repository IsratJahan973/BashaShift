import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

test('Vite refuses a server-secret key before producing a client bundle', () => {
  const secret = 'sb_secret_'+randomUUID();
  const run = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js','build'], {
    encoding:'utf8', env:{ ...process.env, VITE_SUPABASE_URL:'https://example.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY:secret, VITE_SUPABASE_ANON_KEY:'' },
  });
  assert.notEqual(run.status,0);
  assert.match(run.stderr,/server secret must never be used/);
  assert.equal((run.stdout+run.stderr).includes(secret),false,'The rejected credential must not be logged');
});
