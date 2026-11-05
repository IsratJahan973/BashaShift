import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {stagePropertyPhotos,validatePropertyPhotos} from '../src/lib/property-photos.js';
import {saveProperty,loadDatabase} from '../src/lib/repository.js';
const jpeg=await sharp({create:{width:32,height:24,channels:3,background:'#84aa91'}}).jpeg().toBuffer();
const data='data:image/jpeg;base64,'+jpeg.toString('base64');
const owner={id:'owner',role:'owner'},propertyId='home';
const form={title:'Test home',ownerName:'Test owner',ownerPhone:'01711110001',area:'Banasree',block:'TEST',rent:15000,beds:2,baths:1,floor:1,sqft:'',available:'2027-01-01',lift:true,balcony:false,parking:false,description:''};
function fixture({fail=()=>false,photos=3}={}){
  let serial=0;
  const rows=Array.from({length:photos},(_,position)=>({id:'image-'+position,property_id:propertyId,storage_path:`owner/home/${position}.jpg`,position,created_at:'2026-01-01'}));
  const files=new Map(rows.map(row=>[row.storage_path,jpeg])),events=[];
  const property={id:propertyId,owner_id:owner.id,status:'published',...form,property_images:rows};
  function failure(event){events.push(event);if(fail(event))return {data:null,error:new Error('Synthetic storage/API failure')};}
  const bucket={
    upload:async(path,blob,options)=>{const failureResult=failure({op:'upload',path,options});if(failureResult)return failureResult;assert.equal(blob.type,'image/jpeg');files.set(path,Buffer.from(await blob.arrayBuffer()));return {data:{path},error:null};},
    remove:async paths=>{const failureResult=failure({op:'removeFiles',paths});if(failureResult)return failureResult;for(const path of paths)files.delete(path);return {data:[],error:null};},
    createSignedUrls:async paths=>{const failureResult=failure({op:'sign',paths});if(failureResult)return failureResult;return {data:paths.map(path=>({path,signedUrl:'https://storage.example.test/'+path})),error:null};},
  };
  const client={storage:{from:name=>{assert.equal(name,'property-images');return bucket;}},from(table){
    let op='read',payload,one=false;const filters=[];
    const q={select(){return q;},eq(key,value){filters.push([key,value]);return q;},single(){one=true;return q;},order(){return q;},insert(value){op='insert';payload=value;return q;},update(value){op='update';payload=value;return q;},delete(){op='delete';return q;},then(resolve,reject){
      return Promise.resolve().then(()=>{
        const failed=failure({op,table,payload,filters});if(failed)return failed;
        let found=[];
        if(table==='property_images'){
          found=rows.filter(row=>filters.every(([key,value])=>row[key]===value));
          if(op==='delete'){for(const row of found)rows.splice(rows.indexOf(row),1);}
          if(op==='insert'){const values=Array.isArray(payload)?payload:[payload];for(const value of values){assert.ok(files.has(value.storage_path),'metadata must reference an existing private object');const row={id:'new-'+(++serial),created_at:'2026-02-01',...value};rows.push(row);}found=values;}
        }else if(table==='properties'){if(op==='update')Object.assign(property,payload);found=[property];}
        else if(table==='profiles')found=[{...owner,...payload}];
        return {data:one?found[0]:found,error:null};
      }).then(resolve,reject);
    }};return q;
  }};
  return {client,rows,files,events,property,photos:()=>rows.map(row=>({path:row.storage_path,position:row.position}))};
}
const state=f=>f.rows.map(row=>[row.storage_path,row.position]).sort();

test('text-only edits preserve existing photos without replacing metadata or storage',async()=>{
  const f=fixture();const before=state(f);
  await saveProperty(f.client,owner,{...form,photos:f.photos(),originalPhotos:f.photos()},propertyId);
  assert.deepEqual(state(f),before);
  assert.ok(f.events.every(e=>!['upload','removeFiles','insert','delete'].includes(e.op)));
});
test('six JPEG photos upload before metadata; cover positions follow explicit order',async()=>{
  const f=fixture({photos:0});const stage=await stagePropertyPhotos(f.client,owner.id,propertyId,Array.from({length:6},()=>({data})),[]);
  assert.equal(f.files.size,6);assert.deepEqual(f.rows.map(row=>row.position),[0,1,2,3,4,5]);
  assert.ok(f.events.slice(1,7).every(e=>e.op==='upload'));
  assert.equal(await stage.cleanup(),false);
});
test('reorder/removal uses allowed row insert/delete, preserving objects until commit',async()=>{
  const f=fixture(),photos=f.photos();
  const stage=await stagePropertyPhotos(f.client,owner.id,propertyId,[photos[2],photos[0]],photos);
  assert.deepEqual([...f.rows].filter(row=>row.storage_path!==photos[1].path).sort((a,b)=>a.position-b.position).map(r=>r.storage_path),[photos[2].path,photos[0].path]);
  assert.equal(f.files.size,3);assert.ok(f.events.every(e=>e.table!=='property_images'||e.op!=='update'));
  await stage.cleanup();assert.equal(f.files.has(photos[1].path),false);assert.equal(f.rows.length,2);
});
test('failed second upload leaves all original metadata and files intact and cleans new files',async()=>{
  let count=0;const f=fixture({fail:e=>e.op==='upload'&&++count===2}),before=state(f);
  await assert.rejects(stagePropertyPhotos(f.client,owner.id,propertyId,[...f.photos(),{data},{data}],f.photos()),/Existing photos are unchanged/);
  assert.deepEqual(state(f),before);assert.equal(f.files.size,3);
});
test('failed insertion after deleting a reordered row restores metadata and all original objects',async()=>{
  let failed=false;const f=fixture({fail:e=>e.table==='property_images'&&e.op==='insert'&&!failed&&(failed=true)}),before=state(f),photos=f.photos();
  await assert.rejects(stagePropertyPhotos(f.client,owner.id,propertyId,[photos[2],photos[1],photos[0]],photos),/Existing photos are unchanged/);
  assert.deepEqual(state(f),before);assert.equal(f.files.size,3);
});
test('failed publication rolls back staged photo changes; original objects are retained',async()=>{
  const f=fixture({fail:e=>e.table==='properties'&&e.op==='update'}),before=state(f),photos=f.photos();
  await assert.rejects(saveProperty(f.client,owner,{...form,photos:[photos[1],{data}],originalPhotos:photos},propertyId),/failure/);
  assert.deepEqual(state(f),before);assert.equal(f.files.size,3);assert.equal(f.property.status,'published');
});
test('unconfirmed metadata rollback preserves all files and reports incomplete save honestly',async()=>{
  let changed=false;const f=fixture({fail:e=>{if(e.table==='property_images'&&e.op==='delete'){changed=true;return false;}return changed&&e.table==='property_images'&&['read','insert'].includes(e.op);}});
  await assert.rejects(stagePropertyPhotos(f.client,owner.id,propertyId,[...f.photos().reverse(),{data}],f.photos()),/Original files are retained/);
  for(let i=0;i<3;i++)assert.ok(f.files.has(`owner/home/${i}.jpg`));
});
test('storage cleanup failure does not unpublish a successfully saved listing',async()=>{
  const f=fixture({fail:e=>e.op==='removeFiles'}),photos=f.photos();
  const saved=await saveProperty(f.client,owner,{...form,photos:[photos[0]],originalPhotos:photos},propertyId);
  assert.match(saved.photoWarning,/could not be removed/);assert.equal(f.property.status,'published');assert.equal(f.files.size,3);assert.equal(f.rows.length,3,'failed deletions remain discoverable for an explicit retry');
});
test('oversized, remote, duplicate, foreign and stale photo selections fail before destructive writes',async()=>{
  assert.throws(()=>validatePropertyPhotos(Array.from({length:7},()=>({data}))),/six/);
  for(const photo of [{data:'https://example.test/image.jpg'},{data:'data:image/png;base64,AA=='},{data:'data:image/jpeg;base64,'+'A'.repeat(4*1024*1024)}])assert.throws(()=>validatePropertyPhotos([photo]));
  assert.throws(()=>validatePropertyPhotos([{path:'a'},{path:'a'}]),/duplicate/);
  const f=fixture(),photos=f.photos(),before=state(f);
  await assert.rejects(stagePropertyPhotos(f.client,owner.id,propertyId,[{path:'another-owner/file'}],photos),/no longer available/);
  await assert.rejects(stagePropertyPhotos(f.client,owner.id,propertyId,photos,[{path:'stale',position:0}]),/changed elsewhere/);
  assert.deepEqual(state(f),before);assert.equal(f.files.size,3);
});
test('non-owner repository calls and attempts to edit another owner are rejected before photo writes',async()=>{
  const f=fixture();await assert.rejects(saveProperty(f.client,{...owner,role:'renter'},form,propertyId),/owner account/);
  f.property.owner_id='someone-else';await assert.rejects(saveProperty(f.client,owner,form,propertyId),/your own/);
  assert.ok(f.events.every(e=>e.op==='read'));
});
test('signed-photo failures keep real published listing data and existing paths available for editing',async()=>{
  const f=fixture({fail:e=>e.op==='sign'});
  const loaded=await loadDatabase(f.client,null);assert.equal(loaded.listings.length,1);assert.match(loaded.photoError,/temporarily unavailable/);
  assert.equal(loaded.listings[0].photos.length,3);assert.equal(loaded.listings[0].image,'');assert.ok(loaded.listings[0].photos.every(p=>p.path&&!p.url));
});

test('a partially failed signed-URL batch preserves the primary cover position and every stored image path',async()=>{
  const f=fixture();const storage=f.client.storage.from('property-images');
  storage.createSignedUrls=async paths=>({data:paths.map((path,i)=>({path,signedUrl:i===0?null:'https://storage.example.test/'+path,error:i===0?'Unavailable':null})),error:null});
  const loaded=await loadDatabase(f.client,null);
  assert.match(loaded.photoError,/Some property photos/);assert.equal(loaded.listings[0].image,'');
  assert.equal(loaded.listings[0].photos.length,3);assert.ok(loaded.listings[0].photos[1].url);
});

test('partial storage removal keeps only failed files listed and supports a successful explicit retry',async()=>{
  let failOnce=true;
  const f=fixture({fail:e=>e.op==='removeFiles'&&e.paths[0].endsWith('1.jpg')&&failOnce&&(failOnce=false,true)}),photos=f.photos();
  const first=await saveProperty(f.client,owner,{...form,photos:[photos[0]],originalPhotos:photos},propertyId);
  assert.match(first.photoWarning,/retry/);assert.equal(f.files.size,2);assert.equal(f.rows.length,2);
  const current=f.photos(),retry=await saveProperty(f.client,owner,{...form,photos:[current.find(p=>p.path.endsWith('0.jpg'))],originalPhotos:current},propertyId);
  assert.equal(retry.photoWarning,'');assert.equal(f.files.size,1);assert.equal(f.rows.length,1);
});
