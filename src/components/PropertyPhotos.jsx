import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Images,X} from 'lucide-react';
import {imageTypes,prepareImage,propertyPhotoLimits} from '../lib/images.js';

function Photo({src,alt}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[src]);
  return src&&!failed?<img src={src} alt={alt} onError={()=>setFailed(true)}/>:<span className="photo-unavailable" role="img" aria-label={alt+' unavailable'}>Photo temporarily unavailable</span>;
}
export function OwnerPhotos({photos,onChange,disabled,onPendingChange}){
  const [preparing,setPreparing]=useState(false),[error,setError]=useState('');
  const picker=useRef(null),busy=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{onPendingChange(preparing);return()=>onPendingChange(false);},[preparing,onPendingChange]);
  async function choose(event){
    const files=[...(event.target.files||[])];event.target.value='';
    if(!files.length||busy.current||disabled)return;
    setError('');
    if(photos.length+files.length>propertyPhotoLimits.count){setError('Keep up to six property photos.');return;}
    if(files.some(file=>!imageTypes.includes(file.type))){setError('Use JPEG, PNG or WEBP photos.');return;}
    if(files.some(file=>file.size>propertyPhotoLimits.each)||[...photos,...files].reduce((total,item)=>total+(item.bytes??item.size??0),0)>propertyPhotoLimits.total){setError('Use photos under 8 MB each and 24 MB total.');return;}
    busy.current=true;setPreparing(true);
    try{
      const added=[];
      for(const file of files){const url=await prepareImage(file,1200);added.push({id:crypto.randomUUID(),url,data:url,bytes:file.size});}
      if(mounted.current)onChange([...photos,...added]);
    }catch{if(mounted.current)setError('A photo could not be opened. Existing photos are unchanged.');}
    finally{busy.current=false;if(mounted.current)setPreparing(false);}
  }
  function reorder(index,offset){const next=[...photos];[next[index],next[index+offset]]=[next[index+offset],next[index]];onChange(next);}
  return <section className="owner-photos" aria-label="Property photos">
    <h4>Room photos <small>{photos.length}/6</small></h4>
    <p className="small muted">First photo is the cover. Use your own photos; reorder or remove before saving.</p>
    <button type="button" className="btn btn-outline" disabled={disabled||preparing||photos.length>=6} onClick={()=>picker.current?.click()}><Images size={18}/>{preparing?'Preparing photos…':'Add room photos'}</button>
    <input ref={picker} aria-label="Property room photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={disabled||preparing||photos.length>=6} onChange={choose}/>
    <small className="muted">JPEG, PNG or WEBP · 8 MB each, 24 MB total</small>
    {preparing&&<p role="status">Preparing photos…</p>}
    {error&&<p role="alert" className="inline-alert">{error}</p>}
    <ol className="owner-photo-grid">{photos.map((photo,index)=><li key={photo.id||photo.path}>
      <Photo src={photo.url} alt={`Property photo ${index+1} of ${photos.length}`}/>
      <strong>{index===0?'Cover photo':`Photo ${index+1}`}</strong>
      <div className="photo-order-actions">
        <button type="button" className="btn btn-outline" aria-label={`Move photo ${index+1} earlier`} disabled={disabled||preparing||index===0} onClick={()=>reorder(index,-1)}><ArrowLeft size={17}/></button>
        <button type="button" className="btn btn-outline" aria-label={`Move photo ${index+1} later`} disabled={disabled||preparing||index===photos.length-1} onClick={()=>reorder(index,1)}><ArrowRight size={17}/></button>
        <button type="button" className="btn btn-outline" aria-label={`Remove property photo ${index+1}`} disabled={disabled||preparing} onClick={()=>onChange(photos.filter((_,i)=>i!==index))}><X size={17}/></button>
      </div>
    </li>)}</ol>
  </section>;
}
export function PropertyGallery({photos,title,fallback}){
  const [index,setIndex]=useState(0);const touch=useRef(null);
  const order=photos.map(photo=>photo.path||photo.id).join('|');
  useEffect(()=>setIndex(0),[title,order]);
  if(!photos.length)return fallback;
  const current=Math.min(index,photos.length-1),move=delta=>setIndex(old=>(old+delta+photos.length)%photos.length);
  return <section className="property-gallery" role="region" aria-roledescription="carousel" aria-label={title+' photos'} tabIndex={0}
    onKeyDown={event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowRight'?1:-1);}}}
    onTouchStart={event=>{touch.current={x:event.touches[0].clientX,y:event.touches[0].clientY};}}
    onTouchEnd={event=>{if(!touch.current)return;const dx=event.changedTouches[0].clientX-touch.current.x,dy=event.changedTouches[0].clientY-touch.current.y;touch.current=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy))move(dx<0?1:-1);}}>
    <Photo src={photos[current].url} alt={`Property photo ${current+1} of ${photos.length}`}/>
    {photos.length>1&&<><button type="button" className="btn gallery-arrow previous" aria-label="Previous property photo" onClick={()=>move(-1)}><ArrowLeft size={21}/></button><button type="button" className="btn gallery-arrow next" aria-label="Next property photo" onClick={()=>move(1)}><ArrowRight size={21}/></button></>}
    <div className="gallery-controls"><span aria-live="polite">Photo {current+1} of {photos.length}</span>{photos.length>1&&<div className="gallery-dots">{photos.map((photo,i)=><button key={photo.id||photo.path} type="button" aria-label={`Show property photo ${i+1}`} aria-pressed={i===current} onClick={()=>setIndex(i)}><span/></button>)}</div>}</div>
  </section>;
}
