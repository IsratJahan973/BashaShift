import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server/app.mjs';
import {createDrivingRouter,DIRECTIONS_URL} from '../server/routes.mjs';
import {routingAreas} from '../server/routing-areas.mjs';
import {fetchDrivingRoute,validateDrivingRoute} from '../src/lib/routes.js';
import {readSupabaseConfig} from '../src/lib/auth.js';
const key='private-test-routing-key',env={HEIGIT_API_KEY:key};
const shape=(from='Banasree',to='Mirpur',distance=18000)=>({type:'FeatureCollection',features:[{type:'Feature',properties:{summary:{distance,duration:3000}},geometry:{type:'LineString',coordinates:[routingAreas[from].coordinates,routingAreas[to].coordinates]}}]});
async function serve(options,run){
  const app=createApp({env,dist:null,verifyRenter:async()=>({id:'renter-fixture',role:'renter'}),fetchImpl:async()=>Response.json(shape()),...options});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
  const get=(query='from=Banasree&to=Mirpur',headers={})=>fetch(url+'/api/route?'+query,{headers:{Authorization:'Bearer renter-fixture',...headers}});
  try{await run(get);}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
test('authenticated route API uses current HeiGIT POST, center coordinates and backend-only credentials',async()=>{
  let submitted;
  await serve({fetchImpl:async(url,init)=>{submitted={url,...init};return Response.json(shape(),{headers:{'Content-Type':'application/geo+json'}});}},async get=>{
    const res=await get('from=banasree&to=Mirpur');assert.equal(res.status,200);const data=await res.json();
    assert.equal(data.distanceKm,18);assert.equal(data.source,'heigit');assert.equal(data.approximate,true);assert.equal(data.from,'Banasree');
    assert.equal(submitted.url,DIRECTIONS_URL);assert.equal(submitted.headers.Authorization,key);assert.equal(submitted.method,'POST');
    assert.deepEqual(JSON.parse(submitted.body),{coordinates:[routingAreas.Banasree.coordinates,routingAreas.Mirpur.coordinates],instructions:false});
    assert.equal(JSON.stringify(data).includes(key),false);assert.equal(res.headers.get('cache-control'),'no-store');
  });
});
test('route changes make distinct validated calls; only successful results are cached with expiration',async()=>{
  let now=0,calls=0;
  const route=createDrivingRouter({env,clock:()=>now,fetchImpl:async(_url,init)=>{calls++;const end=JSON.parse(init.body).coordinates[1];return Response.json(shape('Banasree',end===null?'Mirpur':end[0]===routingAreas.Mirpur.coordinates[0]?'Mirpur':'Mohammadpur',end[0]===routingAreas.Mirpur.coordinates[0]?30000:10000));}});
  assert.equal((await route('Banasree','Mirpur')).distanceKm,30);assert.equal((await route('Banasree','Mohammadpur')).distanceKm,10);
  assert.equal((await route('Banasree','Mirpur')).distanceKm,30);assert.equal(calls,2);
  now=300001;await route('Banasree','Mirpur');assert.equal(calls,3);
});
test('no key, unsupported input and same-area routing never invent a distance or call the provider',async()=>{
  let calls=0;const noCalls=async()=>{calls++;throw new Error('Must not call');};
  await serve({env:{},fetchImpl:noCalls},async get=>{const res=await get();assert.equal(res.status,503);assert.equal((await res.json()).code,'routing_not_configured');});
  await serve({fetchImpl:noCalls},async get=>{
    for(const query of ['from=Other&to=Mirpur','from=https://private.invalid&to=Mirpur','from=Banasree&to=Mirpur&url=https://example.test','from[]=Banasree&to=Mirpur'])assert.equal((await get(query)).status,400);
    const same=await get('from=Banasree&to=Banasree');assert.equal(same.status,422);const data=await same.json();assert.equal(data.distanceKm,undefined);assert.match(data.error,/manually/);
  });assert.equal(calls,0);
});
test('route requires a verified renter and bounds per-actor requests',async()=>{
  await serve({verifyRenter:async()=>({id:'owner',role:'owner'})},async get=>{assert.equal((await get('',{Authorization:''})).status,401);assert.equal((await get()).status,403);});
  await serve({routeLimit:1},async get=>{assert.equal((await get()).status,200);const res=await get();assert.equal(res.status,429);assert.equal(res.headers.get('retry-after'),'60');});
});
test('bad content type, geometry, quantities and mismatched endpoints are rejected without provider content leaks',async()=>{
  for(const body of [{},shape('Banasree','Mirpur',0),shape('Banasree','Mirpur',100),shape('Banasree','Mirpur','18000'),shape('Banasree','Mirpur',999999),shape('Gulshan','Uttara'),{...shape(),features:[{...shape().features[0],geometry:{type:'LineString',coordinates:[[90,10],[NaN,24]]}}]}]){
    await serve({fetchImpl:async()=>Response.json(body)},async get=>{const res=await get();assert.equal(res.status,502);assert.match((await res.json()).error,/manually/);});
  }
  await serve({fetchImpl:async()=>new Response('<html>'+key+'</html>',{headers:{'Content-Type':'text/html'}})},async get=>{const res=await get();assert.equal(res.status,502);assert.ok(!(await res.text()).includes(key));});
});
test('authorization/quota/server provider failures and timeouts give honest manual fallback',async()=>{
  for(const status of [401,403,429,500])await serve({fetchImpl:async()=>new Response(key,{status})},async get=>{const res=await get();assert.equal(res.status,503);assert.ok(!(await res.text()).includes(key));});
  await serve({routeTimeoutMs:20,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))},async get=>{const res=await get();assert.equal(res.status,504);assert.equal((await res.json()).code,'route_timeout');});
});
test('failed responses are not cached, identical inflight routes share a request, concurrency is bounded',async()=>{
  let failed=true,calls=0;
  const route=createDrivingRouter({env,fetchImpl:()=>{calls++;if(failed)throw new Error(key);return Promise.resolve(Response.json(shape()));}});
  await assert.rejects(route('Banasree','Mirpur'));failed=false;await route('Banasree','Mirpur');assert.equal(calls,2);
  let release;const wait=new Promise(resolve=>{release=resolve;});let pendingCalls=0;
  const blocked=createDrivingRouter({env,fetchImpl:async(_url,init)=>{pendingCalls++;await wait;const [start,end]=JSON.parse(init.body).coordinates;const from=Object.keys(routingAreas).find(k=>routingAreas[k].coordinates[0]===start[0]),to=Object.keys(routingAreas).find(k=>routingAreas[k].coordinates[0]===end[0]);return Response.json(shape(from,to));}});
  const a=blocked('Banasree','Mirpur'),same=blocked('Banasree','Mirpur'),b=blocked('Banasree','Mohammadpur');
  await assert.rejects(blocked('Banasree','Uttara'),e=>e.code==='routing_busy');release();await Promise.all([a,same,b]);assert.equal(pendingCalls,2);
});
test('client rejects mismatched/stale or fabricated route contracts; public key configuration rejects HeiGIT secrets',async()=>{
  const valid={from:'Banasree',to:'Mirpur',distanceKm:18,source:'heigit',approximate:true,geometry:shape().features[0].geometry};
  assert.equal(validateDrivingRoute(valid,'Banasree','Mirpur').distanceKm,18);
  for(const patch of [{source:'mock'},{approximate:false},{distanceKm:0},{to:'Uttara'},{geometry:{type:'Point',coordinates:[90,23]}}])assert.throws(()=>validateDrivingRoute({...valid,...patch},'Banasree','Mirpur'));
  let submitted;await fetchDrivingRoute({from:'Banasree',to:'Mirpur',token:'fixture',fetchImpl:async(url,init)=>{submitted={url,...init};return Response.json(valid);}});assert.equal(submitted.headers.Authorization,'Bearer fixture');assert.match(submitted.url,/from=Banasree&to=Mirpur/);
  assert.throws(()=>readSupabaseConfig({VITE_HEIGIT_API_KEY:key}),/credentials/);
});
