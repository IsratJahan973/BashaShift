// This is an HTTP-mocked UI test, not a hosted Supabase integration test.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const directory=mkdtempSync(join(tmpdir(),'bashashift-auth-ui-'));
try {
  const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','test','--outDir',directory,'--emptyOutDir'],{
    stdio:'inherit',env:{ ...process.env, VITE_SUPABASE_URL:'http://127.0.0.1:54329',
      VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+randomUUID(),VITE_SUPABASE_ANON_KEY:'' },
  });
  if(build.status!==0)process.exitCode=build.status??1;
  else {
    const run=spawnSync(process.env.PYTHON_EXECUTABLE||'python3',['tests/auth_ui_smoke.py','--app-dir',directory],{ stdio:'inherit' });
    process.exitCode=run.status??1;
  }
} finally { rmSync(directory,{ recursive:true,force:true }); }
