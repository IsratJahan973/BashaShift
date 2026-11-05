import {propertyPhotoLimits} from './images.js';
const checked=async request=>{const {data,error}=await request;if(error)throw error;return data;};
export const sortPropertyPhotos=rows=>[...rows].sort((a,b)=>a.position-b.position||String(b.created_at).localeCompare(String(a.created_at))||a.storage_path.localeCompare(b.storage_path));
const signature=rows=>JSON.stringify(rows.map(row=>[row.path||row.storage_path,row.position]).sort((a,b)=>a[0].localeCompare(b[0])));
export function validatePropertyPhotos(photos){
  if(!Array.isArray(photos)||photos.length>propertyPhotoLimits.count)throw new Error('Keep up to six property photos.');
  const seen=new Set();
  for(const photo of photos){
    if(photo.path){if(seen.has(photo.path))throw new Error('Remove duplicate property photos.');seen.add(photo.path);}
    else if(typeof photo.data!=='string'||photo.data.length>4*1024*1024||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo.data))throw new Error('Choose valid property photos again.');
  }
}

// Existing grants allow INSERT/DELETE, not UPDATE(position). Only changed rows
// are replaced. Original storage objects remain intact until publication succeeds.
export async function stagePropertyPhotos(client,ownerId,propertyId,photos,originalPhotos){
  if(!Array.isArray(photos))throw new Error('Choose valid property photos.');
  const bucket=client.storage.from('property-images');
  const read=()=>checked(client.from('property_images').select('*').eq('property_id',propertyId));
  const originals=sortPropertyPhotos(await read()),byPath=new Map(originals.map(row=>[row.storage_path,row]));
  if(originalPhotos&&signature(originalPhotos)!==signature(originals))throw new Error('Property photos changed elsewhere. Refresh before saving.');
  if(photos.some(photo=>photo.path&&!byPath.has(photo.path)))throw new Error('A property photo is no longer available. Refresh before saving.');
  const unchanged=photos.length===originals.length&&photos.every((photo,i)=>photo.path===originals[i].storage_path);
  if(unchanged)return {rollback:async()=>true,cleanup:async()=>false};
  validatePropertyPhotos(photos);
  const uploads=[],touched=new Set(),newPaths=new Set(),desired=[];
  const removeRow=path=>checked(client.from('property_images').delete().eq('property_id',propertyId).eq('storage_path',path));
  const insertRow=(path,position)=>checked(client.from('property_images').insert({property_id:propertyId,storage_path:path,position}));
  async function rollback(){
    let restored=true;
    try{
      const current=await read(),currentByPath=new Map(current.map(row=>[row.storage_path,row]));
      for(const path of newPaths)if(currentByPath.has(path))await removeRow(path);
      for(const path of touched){
        const old=byPath.get(path),present=currentByPath.get(path);
        if(!old||present?.position===old.position)continue;
        if(present)await removeRow(path);
        await insertRow(path,old.position);
      }
    }catch{restored=false;}
    // If metadata restoration could not be confirmed, retain uploaded objects too.
    if(restored&&uploads.length){try{await checked(bucket.remove(uploads));}catch{restored=false;}}
    return restored;
  }
  try{
    for(const photo of photos){
      if(photo.path){desired.push(photo.path);continue;}
      const blob=await(await fetch(photo.data)).blob();
      const path=`${ownerId}/${propertyId}/${crypto.randomUUID()}.jpg`;
      uploads.push(path);newPaths.add(path);
      await checked(bucket.upload(path,blob,{contentType:'image/jpeg',upsert:false}));
      desired.push(path);
    }
    for(const [position,path] of desired.entries()){
      const existing=byPath.get(path);
      if(existing?.position===position)continue;
      if(existing){touched.add(path);await removeRow(path);}
      await insertRow(path,position);
    }
  }catch{
    const restored=await rollback();
    throw new Error(restored?'Photos could not be saved. Existing photos are unchanged; try again.':'Photos could not be saved completely. Original files are retained. Refresh before retrying.');
  }
  return {rollback,cleanup:async()=>{
    let incomplete=false;
    // Keep each removed image discoverable in the gallery until its object has
    // actually been deleted. A failed removal can then be retried after reload;
    // it never silently leaves a publicly readable orphan under a published home.
    for(const old of originals)if(!desired.includes(old.storage_path)){
      try{await checked(bucket.remove([old.storage_path]));await removeRow(old.storage_path);}
      catch{incomplete=true;}
    }
    return incomplete;
  }};
}
