import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateBreakdown,calculateEstimate } from '../src/domain.js';
import { reviewInventory,scanFurniture } from '../src/lib/recognition.js';
import { createMove } from '../src/lib/repository.js';

test('reviewed inventory replaces suggestions, removes errors, and allows missing manual items',()=>{
  assert.deepEqual(reviewInventory([{name:'Bed',qty:'3'},{name:'Refrigerator',qty:'0'},{name:'Boxes',qty:5}]),[{name:'Bed',qty:3},{name:'Boxes',qty:5}]);
  for(const items of [[{name:'Bed',qty:''}],[{name:'Bed',qty:-1}],[{name:'Bed',qty:1.5}],[{name:'Bed',qty:1001}],[{name:'Car',qty:1}],[{name:'Bed',qty:1},{name:'Bed',qty:1}]])assert.throws(()=>reviewInventory(items));
});
test('pricing breaks out furniture, distance, stairs and rounding without an AI price',()=>{
  const move={items:[{name:'Bed',qty:3},{name:'Boxes',qty:5},{name:'Sofa',qty:1}],km:8,fromFloor:2,toFloor:3,hasLift:false};
  const quote=estimateBreakdown(move);
  assert.equal(quote.handling,2080);assert.equal(quote.vehicleBase,850);assert.equal(quote.distance,360);
  assert.equal(quote.stairs,500);assert.equal(quote.rounding,10);assert.equal(quote.total,3800);
  assert.equal(quote.lines.reduce((sum,item)=>sum+item.amount,0),quote.handling);
  assert.equal(calculateEstimate({...move,hasLift:true}),3300);
  assert.equal(calculateEstimate({...move,items:[]}),0);
  assert.equal(calculateEstimate({items:[{name:'Bed',qty:1}],km:0,fromFloor:0,toFloor:0,hasLift:false}),1300);
});
test('the existing moving-request RPC receives exactly the approved inventory and formula total',async()=>{
  const items=reviewInventory([{name:'Bed',qty:3},{name:'Boxes',qty:5},{name:'Sofa',qty:1}]);
  const move={items,km:8,fromFloor:2,toFloor:3,hasLift:false,listingId:null,fromArea:'Banasree',toArea:'Rampura',date:'2027-01-01',customerName:'Test renter',customerPhone:'01812345678',customerConsent:true,notes:''};
  let submitted;
  const client={rpc:async(name,payload)=>{submitted={name,payload};return {data:'test-request',error:null};}};
  await createMove(client,move,calculateEstimate(move));
  assert.equal(submitted.name,'create_moving_request');
  assert.deepEqual(submitted.payload.inventory,items);
  assert.equal(submitted.payload.details.estimate,3800);
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
