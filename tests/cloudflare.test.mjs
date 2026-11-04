import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createApp} from '../server/app.mjs';
import {createRenterVerifier} from '../server/scan-auth.mjs';
import {validatePhotos} from '../server/ai.mjs';
import {CLOUDFLARE_MODEL,parseCloudflareInventory,prepareCloudflareImage} from '../server/cloudflare-ai.mjs';
import {createFurnitureRecognizer} from '../server/scan-provider.mjs';

// All credentials, photos and provider responses in this file are synthetic fixtures.
const account='a'.repeat(32),cloudToken=randomUUID(),openKey=randomUUID();
const env={NODE_ENV:'production',CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_AI_TOKEN:cloudToken};
const items=[{name:'Bed',qty:2,confidence:'high'},{name:'Boxes',qty:3,confidence:'medium'}];
const envelope=list=>({success:true,errors:[],messages:[],result:{response:JSON.stringify({items:list})}});
const openEnvelope={status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({items})}]}]};
const photo=async color=>'data:image/png;base64,'+(await sharp({create:{width:16,height:12,channels:3,background:color}}).png().toBuffer()).toString('base64');
const original=await photo('red'),other=await photo('blue');
const sanitized=await validatePhotos({images:[original,other],consent:true});
async function withServer(options,action){
  const app=createApp({env,verifyRenter:async()=>({id:'renter-fixture',role:'renter'}),fetchImpl:async()=>Response.json(envelope(items)),dist:null,...options});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  const post=(body={images:[original],consent:true},headers={})=>fetch(url+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer renter-session-fixture',...headers},body:JSON.stringify(body)});
  try{await action(post,url);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('primary Cloudflare REST request uses a sanitized image, fixed model and backend token only',async()=>{
  let submitted;
  const normalized=[{name:' couch ',qty:2,confidence:'high'},{name:'MOVING_BOXES',qty:3,confidence:'medium'}];
  await withServer({env:{...env,OPENAI_API_KEY:openKey},fetchImpl:async(url,init)=>{submitted={url,...init};return Response.json(envelope(normalized));}},async(post,url)=>{
    const response=await post({images:[original],consent:true,accountId:'ignored',model:'ignored',prompt:'private customer notes',token:'ignored'});
    assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.source,'cloudflare');assert.equal(data.model,CLOUDFLARE_MODEL);assert.equal(data.reviewRequired,true);
    assert.deepEqual(data.items,[{name:'Sofa',qty:2,confidence:'high'},items[1]]);
    assert.equal(submitted.url,`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CLOUDFLARE_MODEL}`);
    assert.equal(submitted.headers.Authorization,'Bearer '+cloudToken);
    const body=JSON.parse(submitted.body);
    assert.deepEqual(Object.keys(body).sort(),['image','max_tokens','prompt','stream','temperature']);
    assert.equal(body.max_tokens,1200);assert.equal(body.temperature,0);assert.equal(body.stream,false);
    assert.equal(body.image,sanitized[0]);assert.match(body.prompt,/largest clearly visible count/);
    assert.doesNotMatch(submitted.body,/private customer notes|renter-session-fixture/);
    assert.equal(submitted.body.includes(openKey),false);
    for(const value of [cloudToken,account,openKey])assert.equal(JSON.stringify(data).includes(value),false);
    const health=await(await fetch(url+'/api/health')).json();assert.equal(health.aiConfigured,true);assert.equal(health.aiDemoEnabled,false);
  });
});

test('multiple sanitized views form one bounded, metadata-free contact sheet; duplicate photos are not summed',async()=>{
  const tagged=await sharp(Buffer.from(original.split(',')[1],'base64')).jpeg().withMetadata({exif:{IFD0:{Artist:'private fixture metadata'}}}).toBuffer();
  const clean=await validatePhotos({images:['data:image/jpeg;base64,'+tagged.toString('base64'),other],consent:true});
  const sheet=await prepareCloudflareImage(clean);
  const bytes=Buffer.from(sheet.split(',')[1],'base64'),metadata=await sharp(bytes).metadata();
  assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,1280);assert.equal(metadata.height,640);assert.equal(metadata.exif,undefined);
  assert.equal(bytes.includes(Buffer.from('private fixture metadata')),false);
  assert.equal(await prepareCloudflareImage([sanitized[0],sanitized[0]]),sanitized[0]);
  let calls=0;
  await withServer({fetchImpl:async()=>{calls++;return Response.json(envelope(items));}},async post=>{
    const data=await(await post({images:[original,original,other],consent:true})).json();
    assert.deepEqual(data.items,items);assert.equal(calls,1);
  });
});

test('Cloudflare output normalizes safe category aliases but never defaults, rounds, clamps or guesses quantities',()=>{
  assert.deepEqual(parseCloudflareInventory(envelope([{name:' FRIDGE ',qty:1,confidence:'medium'},{name:'dining_table',qty:2,confidence:'low'}])),[{name:'Refrigerator',qty:1,confidence:'medium'},{name:'Dining table',qty:2,confidence:'low'}]);
  const fenced=envelope(items);fenced.result.response='```json\n'+fenced.result.response+'\n```';assert.deepEqual(parseCloudflareInventory(fenced),items);
  for(const invalid of [
    [{name:'Bed',confidence:'high'}], [{name:'Bed',qty:'2',confidence:'high'}], [{name:'Bed',qty:0,confidence:'high'}],
    [{name:'Bed',qty:1.5,confidence:'high'}], [{name:'Bed',qty:101,confidence:'high'}], [{name:'Bed',qty:-1,confidence:'high'}],
    [{name:'Car',qty:1,confidence:'high'}], [{name:'Bed',qty:1,confidence:'certain'}], [{name:'Bed',qty:1}],
    [{name:'Sofa',qty:1,confidence:'high'},{name:'couch',qty:1,confidence:'high'}],
    [{name:'Bed',qty:1,confidence:'high',description:'invented text'}],
  ])assert.throws(()=>parseCloudflareInventory(envelope(invalid)),error=>error.code==='invalid_ai_response');
});

test('malformed envelopes, prose, truncated JSON and oversized text fail closed; empty inventory remains valid',()=>{
  assert.deepEqual(parseCloudflareInventory(envelope([])),[]);
  for(const data of [{success:false,errors:[],result:{response:'{"items":[]}'}},{success:true,result:'{"items":[]}'},{success:true,result:{response:{items:[]}}},
    {...envelope(items),errors:[{message:'private failure'}]},
    ...['', 'Here is your inventory: {"items":[]}', '{"items":[', '{"items":[],"price":1000}', '[]','x'.repeat(16001)].map(response=>({success:true,result:{response}})),
  ])assert.throws(()=>parseCloudflareInventory(data),error=>error.code==='invalid_ai_response'&&!error.message.includes('private failure'));
});

test('Cloudflare HTTP/transport/provider failures preserve manual fallback and never expose credential or provider details',async()=>{
  for(const status of [401,403,429,500,503]){
    await withServer({fetchImpl:async()=>Response.json({errors:[{message:'private '+cloudToken}]},{status})},async post=>{
      const response=await post();assert.equal(response.status,[429,503].includes(status)?503:502);
      const data=await response.json();assert.match(data.error,/manually/);assert.equal(Object.hasOwn(data,'items'),false);assert.equal(JSON.stringify(data).includes(cloudToken),false);
    });
  }
  for(const fetchImpl of [async()=>{throw new Error('private '+cloudToken);},async()=>new Response('not JSON'),async()=>Response.json({success:false,errors:[{code:5016,message:'private terms '+cloudToken}]}),async()=>Response.json({success:true,result:{response:'invalid'}})]){
    await withServer({fetchImpl},async post=>{const response=await post();assert.equal(response.status,502);assert.equal((await response.text()).includes(cloudToken),false);});
  }
});

test('authorization, consent, photo sanitation and production demo restrictions run before Cloudflare',async()=>{
  let calls=0;
  const upstream=async()=>{calls++;return Response.json(envelope(items));};
  await withServer({env:{...env,AI_ALLOW_DEMO_SCAN:'true'},fetchImpl:upstream},async post=>{
    assert.equal((await post(undefined,{Authorization:'','X-BashaShift-Demo':'1'})).status,401);
    assert.equal((await post({images:[original],consent:false})).status,400);
    assert.equal((await post({images:['https://private.invalid/photo'],consent:true})).status,400);
    assert.equal((await post({images:['data:image/png;base64,YWJjZA=='],consent:true})).status,400);
  });
  await withServer({verifyRenter:async()=>({id:'mover-fixture',role:'mover'}),fetchImpl:upstream},async post=>assert.equal((await post()).status,403));
  assert.equal(calls,0);
});

test('existing per-renter limits and scan concurrency also bound Cloudflare calls',async()=>{
  let calls=0;
  await withServer({scanLimit:1,fetchImpl:async()=>{calls++;return Response.json(envelope(items));}},async post=>{
    assert.equal((await post()).status,200);assert.equal((await post()).status,429);assert.equal(calls,1);
  });
  let entered,release;
  const started=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;});
  await withServer({concurrencyLimit:1,fetchImpl:async()=>{entered();await blocked;return Response.json(envelope(items));}},async post=>{
    const first=post();await started;assert.equal((await post()).status,503);release();assert.equal((await first).status,200);
  });
});

test('OpenAI keys alone never enable scanning or a silent fallback',async()=>{
  for(const config of [{OPENAI_API_KEY:openKey},{OPENAI_API_KEY:openKey,AI_ENABLE_OPENAI_FALLBACK:'false'},{CLOUDFLARE_ACCOUNT_ID:'../invalid',CLOUDFLARE_AI_TOKEN:cloudToken},{CLOUDFLARE_ACCOUNT_ID:account}]){
    await withServer({env:config,fetchImpl:()=>{throw new Error('Provider must not be called');}},async(post,url)=>{
      assert.equal((await(await fetch(url+'/api/health')).json()).aiConfigured,false);assert.equal((await post()).status,503);
    });
  }
  let calls=0;
  await withServer({env:{...env,OPENAI_API_KEY:openKey},fetchImpl:async()=>{calls++;return new Response('failed',{status:503});}},async post=>{
    assert.equal((await post()).status,503);assert.equal(calls,1);
  });
});

test('explicitly enabled OpenAI backup runs only after a Cloudflare failure with separate credentials',async()=>{
  const calls=[];
  await withServer({env:{...env,OPENAI_API_KEY:openKey,AI_ENABLE_OPENAI_FALLBACK:'true'},fetchImpl:async(url,init)=>{
    calls.push({url,...init});
    return String(url).includes('api.cloudflare.com')?new Response('busy',{status:503}):Response.json(openEnvelope);
  }},async post=>{
    const result=await(await post()).json();assert.equal(result.source,'openai');assert.equal(result.reviewRequired,true);assert.deepEqual(result.items,items);
    assert.equal(calls.length,2);assert.equal(calls[0].headers.Authorization,'Bearer '+cloudToken);assert.equal(calls[1].headers.Authorization,'Bearer '+openKey);
    assert.equal(calls[0].body.includes(openKey),false);assert.equal(calls[1].body.includes(cloudToken),false);
  });
});

test('successful empty Cloudflare output never spends an enabled OpenAI backup key',async()=>{
  let calls=0;
  await withServer({env:{...env,OPENAI_API_KEY:openKey,AI_ENABLE_OPENAI_FALLBACK:'true'},fetchImpl:async url=>{
    assert.match(String(url),/api.cloudflare.com/);calls++;return Response.json(envelope([]));
  }},async post=>{const data=await(await post()).json();assert.equal(data.source,'cloudflare');assert.deepEqual(data.items,[]);assert.equal(calls,1);});
});

test('Cloudflare timeouts preserve manual entry, and cancellation never starts OpenAI backup',async()=>{
  const waiting=async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
  await withServer({timeoutMs:30,fetchImpl:waiting},async post=>{const response=await post();assert.equal(response.status,504);assert.equal((await response.json()).code,'ai_timeout');});
  let entered,calls=0;
  const started=new Promise(resolve=>{entered=resolve;});const controller=new AbortController();
  const recognizer=createFurnitureRecognizer({env:{...env,OPENAI_API_KEY:openKey,AI_ENABLE_OPENAI_FALLBACK:'true'},fetchImpl:async(...args)=>{calls++;entered();return waiting(...args);}});
  const pending=recognizer.recognize({images:[sanitized[0]],signal:controller.signal});await started;controller.abort();
  await assert.rejects(pending,error=>error.code==='ai_timeout');assert.equal(calls,1);
});


test('the Cloudflare production path verifies the protected Supabase role, not user metadata',async()=>{
  const user=randomUUID();let role='owner',calls=0;
  const config={...env,VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
  const upstream=async(url,init)=>{
    const path=new URL(url).pathname;
    if(path==='/auth/v1/user')return Response.json({id:user,user_metadata:{role:'renter'}});
    if(path==='/rest/v1/profiles')return Response.json({id:user,role});
    assert.equal(init.headers.Authorization,'Bearer '+cloudToken);calls++;return Response.json(envelope(items));
  };
  await withServer({env:config,fetchImpl:upstream,verifyRenter:createRenterVerifier(config,upstream)},async post=>{
    assert.equal((await post()).status,403);assert.equal(calls,0);
    role='renter';assert.equal((await post()).status,200);assert.equal(calls,1);
  });
});

test('invalid primary output can use an explicit backup; two failed providers still return manual entry',async()=>{
  for(const failBackup of [false,true]){
    let calls=0;
    await withServer({env:{...env,OPENAI_API_KEY:openKey,AI_ENABLE_OPENAI_FALLBACK:'true'},fetchImpl:async url=>{
      calls++;
      if(String(url).includes('api.cloudflare.com'))return Response.json({success:true,result:{response:'{truncated'}});
      return failBackup?new Response('private backup error',{status:500}):Response.json(openEnvelope);
    }},async post=>{
      const response=await post();assert.equal(response.status,failBackup?502:200);
      const data=await response.json();assert.equal(calls,2);
      if(failBackup){assert.match(data.error,/manually/);assert.equal(Object.hasOwn(data,'items'),false);}
      else assert.equal(data.source,'openai');
    });
  }
});

test('primary and backup share one deadline, and already-cancelled calls never contact a provider',async()=>{
  let calls=0;
  const recognizer=createFurnitureRecognizer({env:{...env,OPENAI_API_KEY:openKey,AI_ENABLE_OPENAI_FALLBACK:'true'},timeoutMs:250,
    fetchImpl:async(url,{signal})=>{
      calls++;
      if(String(url).includes('api.cloudflare.com'))return new Response('busy',{status:503});
      return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
    }});
  // Keep the test event loop alive while AbortSignal's unref'ed timer expires.
  const hold=setInterval(()=>{},500);
  try{await assert.rejects(recognizer.recognize({images:[sanitized[0]]}),error=>error.code==='ai_timeout');}
  finally{clearInterval(hold);}
  assert.equal(calls,2);
  const controller=new AbortController();controller.abort();
  await assert.rejects(recognizer.recognize({images:[sanitized[0]],signal:controller.signal}),error=>error.code==='ai_timeout');
  assert.equal(calls,2);
});
