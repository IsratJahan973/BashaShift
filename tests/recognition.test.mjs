import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewInventory,scanFurniture } from '../src/lib/recognition.js';
import { createMove } from '../src/lib/repository.js';

test('reviewed inventory replaces suggestions, removes errors, and allows missing manual items',()=>{
  assert.deepEqual(reviewInventory([{name:'Bed',qty:'3'},{name:'Refrigerator',qty:'0'},{name:'Boxes',qty:5}]),[{name:'Bed',qty:3},{name:'Boxes',qty:5}]);
  for(const items of [[{name:'Bed',qty:''}],[{name:'Bed',qty:-1}],[{name:'Bed',qty:1.5}],[{name:'Bed',qty:1001}],[{name:'Car',qty:1}],[{name:'Bed',qty:1},{name:'Bed',qty:1}]])assert.throws(()=>reviewInventory(items));
});
test('moving requests preserve approved inventory without inventing a platform price',async()=>{
  const items=reviewInventory([{name:'Bed',qty:3},{name:'Boxes',qty:5},{name:'Sofa',qty:1}]);
  const move={items,km:8,fromFloor:2,toFloor:3,hasLift:false,listingId:null,fromArea:'Banasree',toArea:'Rampura',date:'2027-01-01',customerName:'Test renter',customerPhone:'01812345678',customerConsent:true,notes:''};
  let submitted;
  const client={rpc:async(name,payload)=>{submitted={name,payload};return {data:'test-request',error:null};}};
  await createMove(client,move);
  assert.equal(submitted.name,'create_moving_request');
  assert.deepEqual(submitted.payload.inventory,items);
  assert.equal(submitted.payload.details.estimate,0);
  assert.equal(submitted.payload.details.contact_consent,true);
  assert.equal(Object.hasOwn(submitted.payload.details,'status'),false);
});
test('scan client sends photo permission and a session header; failures do not synthesize inventory',async()=>{
  let request;
  const items=[{name:'Bed',qty:2,confidence:'medium'}];
  assert.deepEqual(await scanFurniture({images:['photo'],token:'session-token',demoMode:false,fetchImpl:async(url,init)=>{
    request={url,...init};return new Response(JSON.stringify({source:'openai',items}),{status:200});
  }}),items);
  assert.equal(request.url,'/api/scan');assert.equal(request.headers.Authorization,'Bearer session-token');
  assert.deepEqual(JSON.parse(request.body),{images:['photo'],consent:true});
  assert.equal(Object.hasOwn(request.headers,'OPENAI_API_KEY'),false);
  await assert.rejects(scanFurniture({images:['photo'],demoMode:true,fetchImpl:async()=>new Response(JSON.stringify({error:'AI is not configured'}),{status:503})}),/not configured/);
  await assert.rejects(scanFurniture({images:['photo'],demoMode:true,fetchImpl:async()=>new Response('not JSON',{status:200})}),/unavailable/);
});
