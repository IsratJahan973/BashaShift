import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync,fork } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';

const directory=mkdtempSync(join(tmpdir(),'bashashift-authenticated-ai-'));
const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
let server;
try{
  const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','test','--outDir',directory,'--emptyOutDir'],{
    stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:'http://127.0.0.1:'+port,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_browser_fixture',VITE_SUPABASE_ANON_KEY:''},
  });
  if(build.status!==0)process.exitCode=build.status??1;
  else{
    server=fork('tests/fixtures/ai-server.mjs',[directory,String(port)],{stdio:['ignore','inherit','inherit','ipc']});
    const timeout=setTimeout(()=>server.kill('SIGTERM'),30000);
    const ready=await Promise.race([once(server,'message').then(([message])=>message),once(server,'exit').then(()=>{throw new Error('AI test fixture did not start');})]);
    clearTimeout(timeout);
    for(const script of (process.argv.includes('--routes-only')?['tests/routing_smoke.py']:['tests/ai_smoke.py','tests/routing_smoke.py'])){
      const run=spawnSync(process.env.PYTHON_EXECUTABLE||'python3',['-u',script,'--base-url',ready.url],{stdio:'inherit'});
      process.exitCode=run.status??1;if(process.exitCode)break;
    }
  }
}finally{
  if(server&&server.exitCode===null){server.send('stop');await once(server,'exit');}
  rmSync(directory,{recursive:true,force:true});
}
