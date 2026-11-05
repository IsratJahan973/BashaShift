import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { mkdtemp, mkdir, copyFile, symlink, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const publicEnv={NODE_ENV:'production',RENDER:'true',VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_fixture',VITE_SUPABASE_ANON_KEY:'',
  SUPABASE_URL:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_ANON_KEY:'',OPENAI_API_KEY:'',BASHASHIFT_OPENAI_API_KEY:'',CLOUDFLARE_ACCOUNT_ID:'',CLOUDFLARE_AI_TOKEN:'',AI_ENABLE_OPENAI_FALLBACK:'false',AI_ALLOW_DEMO_SCAN:'true'};
async function fixture(frontend=true){
  const directory=await mkdtemp(path.join(tmpdir(),'bashashift-production-'));
  await mkdir(path.join(directory,'server'));
  for(const name of ['index.mjs','app.mjs','ai.mjs','scan-auth.mjs','cloudflare-ai.mjs','scan-provider.mjs'])await copyFile(path.join(root,'server',name),path.join(directory,'server',name));
  await symlink(path.join(root,'node_modules'),path.join(directory,'node_modules'),'dir');
  await symlink(path.join(root,'src'),path.join(directory,'src'),'dir');
  if(frontend){
    await mkdir(path.join(directory,'dist','assets'),{recursive:true});
    await writeFile(path.join(directory,'dist','index.html'),'<!doctype html><div id="root">Built frontend fixture</div>');
    await writeFile(path.join(directory,'dist','assets','fixture.js'),'console.log("frontend fixture")');
    await writeFile(path.join(directory,'dist','.env'),'DO_NOT_SERVE=private-test-fixture');
  }
  // Production must ignore local dotenv files even if someone accidentally includes one.
  await writeFile(path.join(directory,'.env.local'),'OPENAI_API_KEY=dotenv-test-fixture\n');
  return directory;
}
async function availablePort(){
  const socket=net.createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;
}
function start(directory,overrides={}){
  const child=spawn(process.execPath,[path.join(directory,'server','index.mjs')],{cwd:directory,env:{...process.env,...publicEnv,...overrides},stdio:['ignore','pipe','pipe']});
  const output={stdout:'',stderr:''};
  child.stdout.on('data',chunk=>{output.stdout+=chunk;});child.stderr.on('data',chunk=>{output.stderr+=chunk;});
  return {child,output,exit:once(child,'exit')};
}
async function stop(run){
  if(run.child.exitCode!==null||run.child.signalCode!==null)return;
  run.child.kill('SIGTERM');
  const guard=setTimeout(()=>run.child.kill('SIGKILL'),3000);
  try{await run.exit;}finally{clearTimeout(guard);}
}

test('production entry binds the supplied PORT, serves the SPA and assets with API isolation, and shuts down cleanly',async()=>{
  const directory=await fixture();const port=await availablePort();const run=start(directory,{PORT:String(port)});
  try{
    const ready=new Promise((resolve,reject)=>{
      run.child.stdout.on('data',()=>{if(run.output.stdout.includes(`:${port}`))resolve();});
      run.exit.then(()=>reject(new Error('Production entry exited before listening: '+run.output.stderr)));
    });
    await Promise.race([ready,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timed out')),8000);timer.unref();})]);
    const base=`http://127.0.0.1:${port}`;
    const health=await fetch(base+'/api/health');
    assert.deepEqual(await health.json(),{ok:true,aiConfigured:false,aiRequiresRenterLogin:true});
    assert.equal(health.headers.get('cache-control'),'no-store');
    const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/Built frontend fixture/);
    const nested=await fetch(base+'/renter/requests',{headers:{Accept:'text/html'}});
    assert.equal(nested.status,200);assert.equal(nested.headers.get('cache-control'),'no-cache');
    const asset=await fetch(base+'/assets/fixture.js');assert.equal(asset.status,200);assert.match(asset.headers.get('cache-control'),/immutable/);assert.equal(asset.headers.get('x-content-type-options'),'nosniff');
    for(const route of ['/assets/missing.js','/missing.png','/.env']){
      const response=await fetch(base+route);assert.equal(response.status,404);assert.doesNotMatch(await response.text(),/Built frontend|DO_NOT_SERVE/);
    }
    for(const method of ['GET','POST']){
      const response=await fetch(base+'/api/not-found',{method});assert.equal(response.status,404);assert.equal((await response.json()).code,'not_found');
    }
    const unavailable=await fetch(base+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json','X-BashaShift-Demo':'1'},body:'{}'});
    assert.equal(unavailable.status,503);assert.match((await unavailable.json()).error,/manually/);
    run.child.kill('SIGTERM');assert.deepEqual(await run.exit,[0,null]);
  }finally{await stop(run);await rm(directory,{recursive:true,force:true});}
});

test('production fails safely for missing/local/mismatched Supabase, invalid PORT, or missing frontend',async()=>{
  for(const scenario of [
    {env:{VITE_SUPABASE_URL:'',VITE_SUPABASE_PUBLISHABLE_KEY:''},match:/Production requires/},
    {env:{VITE_SUPABASE_URL:'http:\/\/localhost:54321'},match:/hosted HTTPS/},
    {env:{SUPABASE_URL:'https://different-project.supabase.co'},match:/same Supabase project/},
    {env:{PORT:'invalid-port'},match:/PORT must be/},
    {env:{PORT:'0'},match:/PORT must be/},
    {env:{PORT:'65536'},match:/PORT must be/},
    {env:{},frontend:false,match:/Frontend build missing/},
  ]){
    const directory=await fixture(scenario.frontend!==false);const run=start(directory,{PORT:'10000',...scenario.env});
    try{
      const guard=setTimeout(()=>run.child.kill('SIGKILL'),8000);
      let code,signal;
      try{[code,signal]=await run.exit;}finally{clearTimeout(guard);}
      assert.equal(signal,null);assert.equal(code,1);assert.match(run.output.stderr,scenario.match);
      assert.doesNotMatch(run.output.stdout+run.output.stderr,/sb_publishable_test_fixture|dotenv-test-fixture/);
    }finally{await stop(run);await rm(directory,{recursive:true,force:true});}
  }
});
