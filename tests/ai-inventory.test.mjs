import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { validatePhotos, recognizeFurniture } from '../server/ai.mjs';
const image = async color => 'data:image/png;base64,'+(await sharp({create:{width:8,height:8,channels:3,background:color}}).png().toBuffer()).toString('base64');
const response = items => Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({items})}]}]});
test('real decoder validates consent, removes duplicate views and strips photo metadata',async()=>{
  const first=await image('red'),second=await image('blue');
  await assert.rejects(validatePhotos({images:[first]}),e=>e.code==='photo_consent_required');
  await assert.rejects(validatePhotos({images:['data:image/png;base64,YWJjZA=='],consent:true}),e=>e.code==='invalid_image');
  const images=await validatePhotos({images:[first,first,second],consent:true});
  assert.equal(images.length,2);
  assert.ok(images.every(i=>i.startsWith('data:image/jpeg;base64,')));
  assert.equal((await sharp(Buffer.from(images[0].split(',')[1],'base64')).metadata()).exif,undefined);
});
test('mocked provider recognizes only a review-required inventory and never receives customer details or prices',async()=>{
  const photos=await validatePhotos({images:[await image('green')],consent:true});
  const items=[{name:'Bed',qty:2,confidence:'medium'}];
  let submitted;
  const result=await recognizeFurniture({images:photos,key:'test-only-key',model:'fixture-model',fetchImpl:async(url,init)=>{submitted={url,...init};return response(items);}});
  assert.deepEqual(result.items,items);assert.equal(result.reviewRequired,true);assert.equal(result.source,'openai');
  const body=JSON.parse(submitted.body);
  assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
  assert.match(body.input[0].content[0].text,/avoid counting it twice/);
  assert.equal(JSON.stringify(result).includes('test-only-key'),false);
  assert.equal(Object.hasOwn(result,'price'),false);
  assert.deepEqual(body.input[0].content.filter(c=>c.type==='input_image').map(c=>c.image_url),photos);
});
test('AI errors, invalid output, empty photos and timeouts retain an honest manual fallback',async()=>{
  const options={images:[await image('red')],key:'test-only-key',model:'fixture-model'};
  const empty=await recognizeFurniture({...options,fetchImpl:async()=>response([])});
  assert.deepEqual(empty.items,[]);
  await assert.rejects(recognizeFurniture({...options,fetchImpl:async()=>response([{name:'Car',qty:1,confidence:'high'}])}),e=>e.code==='invalid_ai_response');
  await assert.rejects(recognizeFurniture({...options,fetchImpl:async()=>new Response('private provider failure',{status:500})}),e=>e.code==='ai_provider_error'&&!e.message.includes('private'));
  await assert.rejects(recognizeFurniture({...options,timeoutMs:10,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))))}),e=>e.code==='ai_timeout');
});
