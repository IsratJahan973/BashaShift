import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync,fork } from 'node:child_process';
import { once } from 'node:events';

const directory=mkdtempSync(join(tmpdir(),'bashashift-ai-demo-'));
let server;
try{
  const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--outDir',directory,'--emptyOutDir'],{
    stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:'',VITE_SUPABASE_ANON_KEY:''},
  });
  if(build.status!==0)process.exitCode=build.status??1;
  else{
    server=fork('tests/fixtures/ai-server.mjs',[directory],{stdio:['ignore','inherit','inherit','ipc']});
    const timeout=setTimeout(()=>server.kill('SIGTERM'),15000);
    const ready=await Promise.race([once(server,'message').then(([message])=>message),once(server,'exit').then(()=>{throw new Error('AI test fixture did not start');})]);
    clearTimeout(timeout);
    const run=spawnSync(process.env.PYTHON_EXECUTABLE||'python3',['tests/ai_smoke.py','--base-url',ready.url],{stdio:'inherit'});
    process.exitCode=run.status??1;
  }
}finally{
  if(server&&server.exitCode===null){server.send('stop');await once(server,'exit');}
  rmSync(directory,{recursive:true,force:true});
}
