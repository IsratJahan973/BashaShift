import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

test('default production builds reject missing public config, loopback endpoints and VITE provider credentials',()=>{
  for(const settings of [
    {VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:'',expected:/Production requires/},
    {VITE_SUPABASE_URL:'http://127.0.0.1:54321',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',expected:/hosted HTTPS/},
    {VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_OPENAI_API_KEY:'private-build-test-value',expected:/Server credentials/},
    {VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_CLOUDFLARE_AI_TOKEN:'private-build-test-value',expected:/Server credentials/},
    {VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_CLOUDFLARE_ACCOUNT_ID:'private-build-test-value',expected:/Server credentials/},
  ]){
    const {expected,...env}=settings;
    const run=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{encoding:'utf8',env:{...process.env,VITE_SUPABASE_ANON_KEY:'',...env}});
    assert.notEqual(run.status,0);assert.match(run.stderr,expected);assert.equal((run.stdout+run.stderr).includes('private-build-test-value'),false);
  }
});


test('a production bundle never includes backend provider credential values',()=>{
  const directory=mkdtempSync(join(tmpdir(),'bashashift-secret-boundary-'));
  const secret='sk-proj-'+randomUUID(),alias='server-alias-'+randomUUID(),cloudToken='cloudflare-test-'+randomUUID(),account='f'.repeat(32);
  const secrets=[secret,alias,cloudToken,account];
  try{
    const run=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',directory,'--emptyOutDir'],{
      encoding:'utf8',timeout:60000,env:{...process.env,VITE_SUPABASE_URL:'https://fixture.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',VITE_SUPABASE_ANON_KEY:'',OPENAI_API_KEY:secret,BASHASHIFT_OPENAI_API_KEY:alias,CLOUDFLARE_AI_TOKEN:cloudToken,CLOUDFLARE_ACCOUNT_ID:account},
    });
    assert.equal(run.status,0,'Production fixture build must succeed');
    const files=readdirSync(directory,{recursive:true,withFileTypes:true}).filter(file=>file.isFile());
    for(const file of files){
      const content=readFileSync(join(file.parentPath,file.name),'utf8');
      assert.equal(secrets.some(value=>content.includes(value)),false,'Server credentials must stay outside every built file');
    }
    assert.equal(secrets.some(value=>(run.stdout+run.stderr).includes(value)),false);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
