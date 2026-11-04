import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createApp} from '../server/app.mjs';
import {createRenterVerifier} from '../server/scan-auth.mjs';
import {validatePhotos} from '../server/ai.mjs';
import {CLOUDFLARE_MODEL,CLOUDFLARE_MISTRAL_MODEL,parseCloudflareInventory,prepareCloudflareImage} from '../server/cloudflare-ai.mjs';
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
  const app=createApp({env,verifyRenter:async()=>({id:'renter-fixture',role:'renter'}),fetchImpl:async()=>Response.json(envelope(items)),logScanFailure:()=>{},dist:null,...options});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const url='http://127.0.0.1:'+server.address().port;
  const post=(body={images:[original],consent:true},headers={})=>fetch(url+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer renter-session-fixture',...headers},body:JSON.stringify(body)});
  try{await action(post,url);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('default Mistral REST request uses multimodal messages, a sanitized JPEG data URI and backend token only',async()=>{
  let submitted;
  const normalized=[{name:' couch ',qty:2,confidence:'high'},{name:'MOVING_BOXES',qty:3,confidence:'medium'}];
  await withServer({env:{...env,OPENAI_API_KEY:openKey},fetchImpl:async(url,init)=>{submitted={url,...init};return Response.json(envelope(normalized));}},async(post,url)=>{
    const response=await post({images:[original],consent:true,accountId:'ignored',model:'ignored',prompt:'private customer notes',token:'ignored'});
    assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.source,'cloudflare');assert.equal(data.model,CLOUDFLARE_MISTRAL_MODEL);assert.equal(data.reviewRequired,true);
    assert.deepEqual(data.items,[{name:'Sofa',qty:2,confidence:'high'},items[1]]);
    assert.equal(submitted.url,`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CLOUDFLARE_MISTRAL_MODEL}`);
    assert.equal(submitted.headers.Authorization,'Bearer '+cloudToken);
    const body=JSON.parse(submitted.body);
    assert.deepEqual(Object.keys(body).sort(),['max_tokens','messages','stream','temperature']);
    assert.equal(body.max_tokens,1200);assert.equal(body.temperature,0);assert.equal(body.stream,false);
    assert.equal(body.messages.length,1);assert.equal(body.messages[0].role,'user');
    const content=body.messages[0].content;assert.equal(content.length,2);
    assert.deepEqual(content[1],{type:'image_url',image_url:{url:sanitized[0]}});
    assert.equal(content[0].type,'text');assert.match(content[0].text,/largest clearly visible count/);
    assert.notEqual(content[0].text,'agree');
    assert.doesNotMatch(submitted.body,/private customer notes|renter-session-fixture/);
    assert.equal(submitted.body.includes(openKey),false);
    for(const value of [cloudToken,account,openKey])assert.equal(JSON.stringify(data).includes(value),false);
    const health=await(await fetch(url+'/api/health')).json();assert.equal(health.aiConfigured,true);assert.equal(health.aiDemoEnabled,false);
  });
});

test('an explicitly selected eligible Llama account retains raw-base64 prompt input; 5016 never triggers automatic agreement or model switching',async()=>{
  let denied=false;const calls=[];
  await withServer({env:{...env,CLOUDFLARE_VISION_MODEL:' '+CLOUDFLARE_MODEL+' '},fetchImpl:async(url,init)=>{
    calls.push({url,body:JSON.parse(init.body)});
    return denied?Response.json({success:false,errors:[{code:5016,message:'agreement required'}]},{status:403}):Response.json(envelope(items));
  }},async post=>{
    const response=await post();assert.equal(response.status,200);assert.equal((await response.json()).model,CLOUDFLARE_MODEL);
    const body=calls[0].body;assert.deepEqual(Object.keys(body).sort(),['image','max_tokens','prompt','stream','temperature']);
    assert.equal(body.image,sanitized[0].split(',')[1]);assert.doesNotMatch(body.image,/^data:/);
    assert.match(body.prompt,/largest clearly visible count/);assert.notEqual(body.prompt,'agree');
    denied=true;const failure=await post();assert.equal(failure.status,502);assert.equal((await failure.json()).code,'ai_provider_error');
    assert.equal(calls.length,2);assert.ok(calls.every(call=>call.url.endsWith('/'+CLOUDFLARE_MODEL)&&call.body.prompt===body.prompt));
  });
});

test('explicit Mistral configuration and blank defaults select Mistral independently of client-supplied model names',async()=>{
  for(const model of [CLOUDFLARE_MISTRAL_MODEL,' '+CLOUDFLARE_MISTRAL_MODEL+' ','']){
    await withServer({env:{...env,CLOUDFLARE_VISION_MODEL:model},fetchImpl:async(url,init)=>{
      assert.ok(url.endsWith('/'+CLOUDFLARE_MISTRAL_MODEL));assert.ok(Array.isArray(JSON.parse(init.body).messages));
      return Response.json(envelope(items));
    }},async post=>{
      const response=await post({images:[original],consent:true,model:CLOUDFLARE_MODEL});
      assert.equal(response.status,200);assert.equal((await response.json()).model,CLOUDFLARE_MISTRAL_MODEL);
    });
  }
});

test('unknown Cloudflare model configuration fails closed without sending furniture images to an arbitrary model or URL',async()=>{
  for(const model of ['@cf/unknown-model','../../other-account','https://private.invalid/model']){
    await withServer({env:{...env,CLOUDFLARE_VISION_MODEL:model},fetchImpl:async()=>assert.fail('Unsupported model must not be contacted')},async(post,url)=>{
      assert.equal((await(await fetch(url+'/api/health')).json()).aiConfigured,false);
      const response=await post();assert.equal(response.status,503);const data=await response.json();
      assert.equal(data.code,'ai_not_configured');assert.equal(Object.hasOwn(data,'items'),false);assert.match(data.error,/manually/);
    });
  }
});

test('Mistral REST responses preserve review and strict quantities, accept usage metadata, and reject malformed inventory without detections',async()=>{
  const valid=envelope([{name:' couch ',qty:2,confidence:'medium'}]);
  valid.result.response='```json\n'+valid.result.response+'\n```';
  valid.result.usage={prompt_tokens:120,completion_tokens:30,total_tokens:150};valid.result.tool_calls=[];
  const cases=[
    [valid,200],[envelope([]),200],
    [{success:true,result:{response:{items}}},502],
    [{success:true,result:{response:'{"items":['}},502],
    [envelope([{name:'Sofa',qty:'2',confidence:'high'}]),502],
    [envelope([{name:'Car',qty:1,confidence:'high'}]),502],
  ];
  let current;
  await withServer({scanLimit:10,fetchImpl:async url=>{assert.ok(url.endsWith('/'+CLOUDFLARE_MISTRAL_MODEL));return Response.json(current);}},async post=>{
    for(const [data,status] of cases){
      current=data;const response=await post();assert.equal(response.status,status);const result=await response.json();
      if(status===200){assert.equal(result.reviewRequired,true);assert.equal(result.model,CLOUDFLARE_MISTRAL_MODEL);
        assert.deepEqual(result.items,data===valid?[{name:'Sofa',qty:2,confidence:'medium'}]:[]);
      }else{assert.equal(result.code,'invalid_ai_response');assert.equal(Object.hasOwn(result,'items'),false);assert.match(result.error,/manually/);}
    }
  });
});

test('Mistral explanatory wrappers preserve strict inventory validation',async()=>{
  const textInventory='{"items":[{"name":"Sofa","qty":1,"confidence":"medium"}]}';
  const responses=[
    'Here is the moving inventory:\n'+textInventory,
    '```json\n'+textInventory+'\n```',
    'Detected furniture:\n```json\n'+textInventory+'\n```\nPlease review.',
  ];
  for(const responseText of responses){
    const response=parseCloudflareInventory({success:true,errors:[],result:{response:responseText}});
    assert.deepEqual(response,[{name:'Sofa',qty:1,confidence:'medium'}]);
  }
  for(const responseText of [
    'No furniture found.',
    '{"items":[{"name":"Car","qty":1,"confidence":"high"}]}',
    'First ```json\n'+textInventory+'\n``` second ```json\n'+textInventory+'\n```',
    '{"items":[{"name":"Bed","qty":"1","confidence":"high"}]}',
  ]){
    assert.throws(()=>parseCloudflareInventory({success:true,errors:[],result:{response:responseText}}),e=>e.code==='invalid_ai_response');
  }
});

test('multiple sanitized views form one bounded, metadata-free contact sheet; duplicate photos are not summed',async()=>{
  const tagged=await sharp(Buffer.from(original.split(',')[1],'base64')).jpeg().withMetadata({exif:{IFD0:{Artist:'private fixture metadata'}}}).toBuffer();
  const clean=await validatePhotos({images:['data:image/jpeg;base64,'+tagged.toString('base64'),other],consent:true});
  const sheet=await prepareCloudflareImage(clean);
  const bytes=Buffer.from(sheet,'base64'),metadata=await sharp(bytes).metadata();
  assert.equal(metadata.format,'jpeg');assert.equal(metadata.width,1280);assert.equal(metadata.height,640);assert.equal(metadata.exif,undefined);
  assert.equal(bytes.includes(Buffer.from('private fixture metadata')),false);
  assert.equal(await prepareCloudflareImage([sanitized[0],sanitized[0]]),sanitized[0].split(',')[1]);
  let calls=0;
  await withServer({fetchImpl:async()=>{calls++;return Response.json(envelope(items));}},async post=>{
    const data=await(await post({images:[original,original,other],consent:true})).json();
    assert.deepEqual(data.items,items);assert.equal(calls,1);
  });
});

test('camera-sized JPEG/PNG fixtures use the correct Mistral and Llama image contracts after rotation, resizing and metadata removal',async()=>{
  // Synthetic room with phone-photo dimensions/EXIF; this tests transport, not live recognition accuracy.
  const room=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1000"><rect width="1400" height="1000" fill="#ddd3c1"/><path d="M0 700H1400V1000H0Z" fill="#967450"/><path d="M0 0L180 120V700L0 1000M1400 0L1220 120V700L1400 1000" fill="#c9bca3"/><rect x="700" y="180" width="300" height="250" fill="#accbd7"/><rect x="200" y="570" width="500" height="200" rx="30" fill="#43766d"/><rect x="180" y="650" width="540" height="160" rx="20" fill="#365e57"/><rect x="850" y="680" width="200" height="70" fill="#573c2a"/><path d="M870 750V880M1030 750V880" stroke="#573c2a" stroke-width="20"/></svg>');
  const jpeg=await sharp(room).resize(4032,3024,{fit:'fill'}).jpeg({quality:90})
    .withMetadata({orientation:6,exif:{IFD0:{Artist:'private camera fixture'}}}).toBuffer();
  const png=await sharp(room).resize(1800,1200,{fit:'fill'}).png().toBuffer();
  const photos=['data:image/jpeg;base64,'+jpeg.toString('base64'),'data:image/png;base64,'+png.toString('base64')];
  let submitted;
  for(const model of [CLOUDFLARE_MISTRAL_MODEL,CLOUDFLARE_MODEL]){
    await withServer({env:{...env,CLOUDFLARE_VISION_MODEL:model},fetchImpl:async(_url,init)=>{submitted=JSON.parse(init.body);return Response.json(envelope(items));}},async post=>{
      for(const images of [[photos[0]],[photos[1]],photos]){
        const response=await post({images,consent:true});assert.equal(response.status,200);
        const clean=await validatePhotos({images,consent:true});
        const expected=await prepareCloudflareImage(clean);
        const image=model===CLOUDFLARE_MISTRAL_MODEL?submitted.messages[0].content[1].image_url.url.split(',')[1]:submitted.image;
        assert.equal(image,expected);assert.match(image,/^[A-Za-z0-9+/]+={0,2}$/);
        const bytes=Buffer.from(image,'base64'),metadata=await sharp(bytes).metadata();
        assert.equal(bytes.toString('base64'),image);assert.equal(metadata.format,'jpeg');
        assert.ok(metadata.width<=1280&&metadata.height<=1280);assert.equal(metadata.exif,undefined);
        assert.equal(bytes.includes(Buffer.from('private camera fixture')),false);
        if(images.length===1)assert.equal(image,clean[0].split(',')[1]);
      }
    });
  }
});

test('documented REST JSON with usage/messages and a complete JSON fence remains valid without relaxing inventory validation',()=>{
  const data=envelope(items);
  data.result.usage={prompt_tokens:100,completion_tokens:40,total_tokens:140};
  data.result.tool_calls=[];data.messages=[{code:1000,message:'provider metadata'}];
  data.result.response=' \n```JSON\n'+JSON.stringify({items},null,2)+'\n``` \n';
  assert.deepEqual(parseCloudflareInventory(data),items);
  assert.deepEqual(parseCloudflareInventory({success:true,result:{response:' \n {"items": []} \n'}}),[]);
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

test('provider agreement, input, authorization, quota and timeout failures log only safe status/code and a server correlation ID',async()=>{
  for(const [status,code,expected] of [[403,5016,502],[400,5004,502],[401,10000,502],[403,10000,502],[429,3036,503],[408,3007,504],[200,5016,502]]){
    const logs=[];let calls=0;
    await withServer({logScanFailure:record=>logs.push(record),fetchImpl:async(_url,init)=>{
      calls++;const body=JSON.parse(init.body);assert.equal(body.messages[0].content[0].type,'text');assert.notEqual(body.messages[0].content[0].text,'agree');
      return Response.json({success:false,errors:[{code,message:`private ${cloudToken} ${account} ${original}`}],result:null},{status});
    }},async post=>{
      const response=await post(undefined,{'X-Request-ID':'private-client-correlation'});
      assert.equal(response.status,expected);const data=await response.json();
      assert.match(data.error,/manually/);assert.equal(Object.hasOwn(data,'items'),false);
      assert.equal(data.code,expected===504?'ai_timeout':expected===503?'ai_busy':'ai_provider_error');
      const requestId=response.headers.get('X-Request-ID');
      assert.match(requestId,/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i);
      assert.deepEqual(logs,[{httpStatus:status,providerCode:code,requestId}]);
      for(const secret of [cloudToken,account,original,'private-client-correlation','private']){
        assert.equal(JSON.stringify({data,logs}).includes(secret),false);
      }
      assert.equal(calls,1); // Never agree to terms, retry a different model, or silently use OpenAI.
    });
  }
});

test('malformed/non-JSON provider errors and transport failures cannot inject secrets into diagnostics',async()=>{
  const cases=[
    {status:403,code:null,fetchImpl:async()=>Response.json({errors:[{code:cloudToken,message:cloudToken}]},{status:403})},
    {status:403,code:5016,fetchImpl:async()=>Response.json({errors:[{code:'5016',message:cloudToken}]},{status:403})},
    {status:502,code:null,fetchImpl:async()=>new Response(cloudToken,{status:502})},
    {status:200,code:null,fetchImpl:async()=>Response.json({success:true,result:{response:'{truncated '+cloudToken}})},
    {status:null,code:null,fetchImpl:async()=>{throw new Error(cloudToken);}},
  ];
  for(const entry of cases){
    const logs=[];
    await withServer({logScanFailure:record=>logs.push(record),fetchImpl:entry.fetchImpl},async post=>{
      const response=await post();assert.equal(response.status,502);
      assert.deepEqual(logs,[{httpStatus:entry.status,providerCode:entry.code,requestId:response.headers.get('X-Request-ID')}]);
      assert.equal((JSON.stringify(logs)+await response.text()).includes(cloudToken),false);
    });
  }
});

test('local inference timeout has a correlation ID and safe null status/code; diagnostic failures never break fallback',async()=>{
  const logs=[];
  await withServer({timeoutMs:30,logScanFailure:record=>logs.push(record),fetchImpl:async(_url,{signal})=>
    new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error(cloudToken)),{once:true}))},async post=>{
    const response=await post();assert.equal(response.status,504);
    assert.deepEqual(logs,[{httpStatus:null,providerCode:null,requestId:response.headers.get('X-Request-ID')}]);
    assert.equal((await response.json()).code,'ai_timeout');
  });
  await withServer({logScanFailure:()=>{throw new Error(cloudToken);},fetchImpl:async()=>new Response('failed',{status:503})},async post=>{
    const response=await post();assert.equal(response.status,503);assert.match((await response.json()).error,/manually/);
  });
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
