import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createApp } from '../server/app.mjs';
import { MAX_IMAGE_BYTES,parseInventory,ScanError,validatePhotos } from '../server/ai.mjs';
import { createRenterVerifier } from '../server/scan-auth.mjs';

const key=randomUUID();
const actor={id:randomUUID(),role:'renter'};
const items=[{name:'Bed',qty:2,confidence:'high'},{name:'Boxes',qty:4,confidence:'low'}];
const aiResponse=(list=items)=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items:list})}]}]});
const provider=async()=>Response.json(aiResponse());
const png=await sharp({create:{width:8,height:8,channels:3,background:'#87aa99'}}).png().toBuffer();
const photo='data:image/png;base64,'+png.toString('base64');
const otherPng=await sharp({create:{width:8,height:8,channels:3,background:'#aa8799'}}).png().toBuffer();
const otherPhoto='data:image/png;base64,'+otherPng.toString('base64');
async function withServer(options,run){
  const app=createApp({env:{OPENAI_API_KEY:key,AI_ENABLE_OPENAI_FALLBACK:'true'},verifyRenter:async()=>actor,fetchImpl:provider,dist:null,...options});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const base='http://127.0.0.1:'+server.address().port;
  const post=(body,headers={})=>fetch(base+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture-token',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
  try{await run(post,base);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('valid multi-photo requests call Responses with backend credentials, canonical JPEGs, strict inventory and no storage',async()=>{
  let submitted;
  await withServer({fetchImpl:async(url,init)=>{submitted={url,...init};return Response.json(aiResponse());}},async(post,base)=>{
    const response=await post({images:[photo,otherPhoto],consent:true,model:'client-model',apiKey:'ignored',prompt:'ignored'});
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
    const data=await response.json();assert.deepEqual(data.items,items);assert.equal(data.reviewRequired,true);
    const body=JSON.parse(submitted.body);
    assert.equal(submitted.url,'https://api.openai.com/v1/responses');
    assert.ok(submitted.headers.Authorization==='Bearer '+key);
    assert.equal(body.model,'gpt-4.1-mini');assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
    assert.equal(body.input[0].content.filter(item=>item.type==='input_image').length,2);
    assert.ok(body.input[0].content[1].image_url.startsWith('data:image/jpeg;base64,'));
    assert.equal(JSON.stringify(data).includes(key),false);
    const health=await(await fetch(base+'/api/health')).json();assert.equal(health.aiConfigured,true);assert.equal(JSON.stringify(health).includes(key),false);
  });
});
test('unconfigured AI returns an honest manual fallback without fabricated items',async()=>{
  await withServer({env:{},fetchImpl:()=>{throw new Error('Must not call AI');}},async post=>{
    const response=await post({});assert.equal(response.status,503);const data=await response.json();assert.equal(data.code,'ai_not_configured');assert.equal(Object.hasOwn(data,'items'),false);
  });
});
test('unauthenticated users and non-renter roles cannot use paid scanning',async()=>{
  let calls=0;
  await withServer({verifyRenter:async()=>({...actor,role:'mover'}),fetchImpl:async()=>{calls++;return Response.json(aiResponse());}},async post=>{
    assert.equal((await post({images:[photo],consent:true},{Authorization:''})).status,401);
    assert.equal((await post({images:[photo],consent:true})).status,403);
  });
  assert.equal(calls,0);
  await withServer({env:{OPENAI_API_KEY:key,AI_ENABLE_OPENAI_FALLBACK:'true',AI_ALLOW_DEMO_SCAN:'true',NODE_ENV:'production'}},async post=>{
    assert.equal((await post({images:[photo],consent:true},{Authorization:'','X-BashaShift-Demo':'1'})).status,401);
  });
});
test('legacy development demo headers never bypass renter authentication; API errors remain JSON',async()=>{
  await withServer({env:{OPENAI_API_KEY:key,AI_ENABLE_OPENAI_FALLBACK:'true',AI_ALLOW_DEMO_SCAN:'true',NODE_ENV:'development'}},async post=>{
    assert.equal((await post({images:[photo],consent:true},{Authorization:'','X-BashaShift-Demo':'1'})).status,401);
    const malformed=await post('{');assert.equal(malformed.status,400);assert.equal((await malformed.json()).code,'invalid_json');
  });
});
test('consent, count, format, base64, corrupt images and byte limits are checked before AI',async()=>{
  let calls=0;
  await withServer({scanLimit:30,fetchImpl:async()=>{calls++;return Response.json(aiResponse());}},async post=>{
    for(const body of [{images:[photo]}, {images:[],consent:true},{images:[photo,photo,photo,photo],consent:true},
      {images:['https://example.test/photo.jpg'],consent:true},{images:['data:image/svg+xml;base64,PHN2Zz4='],consent:true},
      {images:['data:image/png;base64,!!!!'],consent:true},{images:['data:image/png;base64,YWJjZA=='],consent:true},
      {images:[photo.replace('image/png','image/jpeg')],consent:true}])assert.equal((await post(body)).status,400);
    const large='data:image/jpeg;base64,'+Buffer.alloc(MAX_IMAGE_BYTES+1).toString('base64');
    assert.equal((await post({images:[large],consent:true})).status,413);
    const twoMiB='data:image/jpeg;base64,'+Buffer.alloc(MAX_IMAGE_BYTES-1).toString('base64');
    assert.equal((await post({images:[twoMiB,twoMiB,twoMiB],consent:true})).status,413);
  });
  assert.equal(calls,0);
});
test('decoder strips metadata and rejects oversized pixel dimensions',async()=>{
  const jpeg=await sharp(png).jpeg().withMetadata({exif:{IFD0:{Artist:'Synthetic test fixture'}}}).toBuffer();
  const [sanitized]=await validatePhotos({images:['data:image/jpeg;base64,'+jpeg.toString('base64')],consent:true});
  assert.equal((await sharp(Buffer.from(sanitized.split(',')[1],'base64')).metadata()).exif,undefined);
  const huge=await sharp({create:{width:5000,height:5000,channels:3,background:'white'}}).png().toBuffer();
  await assert.rejects(validatePhotos({images:['data:image/png;base64,'+huge.toString('base64')],consent:true}),error=>error.code==='invalid_image');
});
test('malformed AI output, duplicate categories, invalid confidence and incomplete results are rejected',()=>{
  for(const list of [[{name:'Car',qty:1,confidence:'high'}],[{name:'Bed',qty:0,confidence:'high'}],
    [{name:'Bed',qty:1.5,confidence:'high'}],[{name:'Bed',qty:101,confidence:'high'}],
    [{name:'Bed',qty:1,confidence:'certain'}],[items[0],items[0]]])assert.throws(()=>parseInventory(aiResponse(list)),error=>error.code==='invalid_ai_response');
  assert.throws(()=>parseInventory({...aiResponse(),status:'incomplete'}));
  assert.deepEqual(parseInventory(aiResponse([])),[]);
});
test('upstream failures are generic and never echo provider errors or keys',async()=>{
  for(const status of [401,429,500])await withServer({fetchImpl:async()=>Response.json({error:{message:'private '+key}},{status})},async post=>{
    const response=await post({images:[photo],consent:true});assert.equal(response.status,status===429?503:502);assert.equal((await response.text()).includes(key),false);
  });
  await withServer({fetchImpl:async()=>Response.json(aiResponse([]))},async post=>{
    assert.deepEqual((await(await post({images:[photo],consent:true})).json()).items,[]);
  });
});
test('timeouts abort the upstream request and allow manual entry',async()=>{
  const fetchImpl=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Aborted')),{once:true}));
  await withServer({timeoutMs:20,fetchImpl},async post=>{
    const response=await post({images:[photo],consent:true});assert.equal(response.status,504);assert.equal((await response.json()).code,'ai_timeout');
  });
});
test('per-user limits reset after the window and return Retry-After',async()=>{
  let now=0;
  await withServer({scanLimit:1,clock:()=>now},async post=>{
    assert.equal((await post({images:[photo],consent:true})).status,200);
    const limited=await post({images:[photo],consent:true});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
    now=60001;assert.equal((await post({images:[photo],consent:true})).status,200);
  });
});
test('parallel scans are bounded and release capacity after completion',async()=>{
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;});
  const waiting=new Promise(resolve=>{release=resolve;});
  let first=true;
  await withServer({concurrencyLimit:1,fetchImpl:async()=>{if(first){first=false;entered();await waiting;}return Response.json(aiResponse());}},async post=>{
    const pending=post({images:[photo],consent:true});await started;
    assert.equal((await post({images:[photo],consent:true})).status,503);
    release();assert.equal((await pending).status,200);
    assert.equal((await post({images:[photo],consent:true})).status,200);
  });
});
test('renter authorization uses verified Auth identity plus protected profile role, not user metadata',async()=>{
  const id=randomUUID();
  const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_'+randomUUID()};
  let role='mover';
  const verifier=createRenterVerifier(env,async url=>Response.json(String(url).includes('/auth/v1/user')?{id,email:'fixture@example.test',user_metadata:{role:'renter'}}:{id,role}));
  await assert.rejects(verifier('fixture-token'),error=>error instanceof ScanError&&error.status===403);
  role='renter';assert.equal((await verifier('fixture-token')).id,id);
});


test('identical normalized photos are sent once so duplicate uploads cannot inflate inventory',async()=>{
  const images=await validatePhotos({images:[photo,photo,otherPhoto],consent:true});
  assert.equal(images.length,2);
  assert.notEqual(images[0],images[1]);
});

test('production scan verifies Supabase Auth and protected role, rejects demo bypass and fails closed on account outages',async()=>{
  const id=randomUUID();let role='renter',profileStatus=200,providerCalls=0,profileCalls=0;
  const env={NODE_ENV:'production',OPENAI_API_KEY:key,AI_ENABLE_OPENAI_FALLBACK:'true',AI_ALLOW_DEMO_SCAN:'true',VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
  const upstream=async(url)=>{
    const path=new URL(url).pathname;
    if(path==='/auth/v1/user')return Response.json({id,user_metadata:{role:'renter'}});
    if(path==='/rest/v1/profiles'){profileCalls++;return Response.json(profileStatus===200?{id,role}:{message:'private account failure'},{status:profileStatus});}
    assert.equal(String(url),'https://api.openai.com/v1/responses');providerCalls++;return Response.json(aiResponse());
  };
  await withServer({env,fetchImpl:upstream,verifyRenter:createRenterVerifier(env,upstream)},async post=>{
    assert.equal((await post({images:[photo],consent:true},{Authorization:'','X-BashaShift-Demo':'1'})).status,401);
    role='mover';assert.equal((await post({images:[photo],consent:true})).status,403);assert.equal(providerCalls,0);
    role='renter';profileStatus=503;
    const unavailable=await post({images:[photo],consent:true});assert.equal(unavailable.status,503);assert.doesNotMatch(await unavailable.text(),/private account failure/);assert.equal(providerCalls,0);assert.equal(profileCalls,2,'Authorization outages must not trigger unbounded SDK retries');
    profileStatus=200;
    assert.equal((await post({images:[photo],consent:false})).status,400);assert.equal(providerCalls,0);
    const accepted=await post({images:[photo],consent:true});assert.equal(accepted.status,200);assert.equal((await accepted.json()).reviewRequired,true);assert.equal(providerCalls,1);
  });
});

test('Render ingress uses the last forwarded hop for attempt limits; client-supplied earlier IPs cannot bypass them',async()=>{
  const reject=async()=>{throw new ScanError(401,'sign_in_required','Sign in again.');};
  await withServer({env:{NODE_ENV:'production',RENDER:'true',OPENAI_API_KEY:key,AI_ENABLE_OPENAI_FALLBACK:'true'},verifyRenter:reject},async post=>{
    for(let i=0;i<40;i++)assert.equal((await post({}, {'X-Forwarded-For':`192.0.2.${i+1}, 198.51.100.10`})).status,401);
    const limited=await post({}, {'X-Forwarded-For':'192.0.2.250, 198.51.100.10'});assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
    assert.equal((await post({}, {'X-Forwarded-For':'198.51.100.20'})).status,401);
  });
  await withServer({verifyRenter:reject},async post=>{
    for(let i=0;i<40;i++)assert.equal((await post({}, {'X-Forwarded-For':`192.0.2.${i+1}`})).status,401);
    assert.equal((await post({}, {'X-Forwarded-For':'198.51.100.30'})).status,429);
  });
});
