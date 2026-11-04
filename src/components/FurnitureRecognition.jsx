import { useEffect, useRef, useState } from 'react';
import { WandSparkles, X } from 'lucide-react';
import { photoLimits,reviewInventory,scanFurniture } from '../lib/recognition.js';

export default function FurnitureRecognition({ prepareImage,token,demoMode,onApply,onPendingChange }) {
  const [photos,setPhotos]=useState([]);
  const [preparing,setPreparing]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [consent,setConsent]=useState(false);
  const [suggestions,setSuggestions]=useState(null);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const controller=useRef(null);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();onPendingChange(false);};},[onPendingChange]);
  useEffect(()=>{onPendingChange(preparing||scanning||Boolean(suggestions));},[preparing,scanning,suggestions,onPendingChange]);

  async function chooseFiles(event) {
    const files=[...(event.target.files||[])];event.target.value='';
    if(!files.length)return;
    setError('');setMessage('');
    if(photos.length+files.length>photoLimits.count){setError('Choose up to three photos.');return;}
    if(files.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type))){setError('Use JPEG, PNG, or WEBP photos.');return;}
    if(files.some(file=>file.size>photoLimits.each) || photos.reduce((sum,photo)=>sum+photo.bytes,0)+files.reduce((sum,file)=>sum+file.size,0)>photoLimits.total){setError('Use photos under 3 MB each and 6 MB total.');return;}
    setPreparing(true);
    try{
      const added=[];
      for(const file of files)added.push({ id:crypto.randomUUID(),name:file.name,bytes:file.size,image:await prepareImage(file,1100) });
      if(mounted.current){setPhotos(old=>[...old,...added]);setSuggestions(null);setConsent(false);setMessage('Photos stay in this page until you choose Analyze photos.');}
    }catch{if(mounted.current)setError('A photo could not be opened. Choose another photo or enter items manually.');}
    finally{if(mounted.current)setPreparing(false);}
  }
  async function analyze() {
    if(!photos.length || !consent || scanning || preparing)return;
    controller.current=new AbortController();setScanning(true);setSuggestions(null);setError('');setMessage('');
    try{
      const items=await scanFurniture({ images:photos.map(photo=>photo.image),token,demoMode,signal:AbortSignal.any([controller.current.signal,AbortSignal.timeout(45000)]) });
      if(mounted.current){
        if(items.length)setSuggestions(items);
        else setMessage('No furniture was identified. Your existing inventory is unchanged; add items manually below.');
      }
    }catch(failure){if(mounted.current)setError(controller.current.signal.aborted?'Analysis cancelled. Your inventory is unchanged.':failure.message+' Manual entry remains available.');}
    finally{if(mounted.current)setScanning(false);}
  }
  function apply() {
    try{const items=reviewInventory(suggestions);onApply(items);setSuggestions(null);setMessage('Reviewed inventory applied. Add any missing items and check the quantities below.');setError('');}
    catch(failure){setError(failure.message);}
  }
  const busy=preparing||scanning;
  return <section className="furniture-scan" aria-label="Furniture photo analysis">
    <div className="scan-title"><WandSparkles size={24}/><div><h4>Photo-assisted inventory / ছবি থেকে তালিকা</h4><p className="muted small">Optional AI suggestions. You review every quantity; manual entry always works. / প্রতিটি সংখ্যা যাচাই করুন; নিজেও তালিকা লিখতে পারবেন।</p></div></div>
    <label className="upload-zone"><strong>{preparing?'Preparing photos…':'Choose furniture photos'}</strong><small>JPEG, PNG or WEBP · up to 3 photos · 3 MB each, 6 MB total</small><input aria-label="Furniture photos" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={chooseFiles}/></label>
    {!!photos.length&&<div className="scan-photos">{photos.map(photo=><figure key={photo.id}><img src={photo.image} alt={`Selected furniture photo: ${photo.name}`}/><figcaption>{photo.name}</figcaption><button type="button" className="btn btn-small btn-outline" aria-label={`Remove photo ${photo.name}`} disabled={busy} onClick={()=>{setPhotos(old=>old.filter(item=>item.id!==photo.id));setSuggestions(null);setConsent(false);setMessage('Photo removed. Your inventory is unchanged.');}}><X size={14}/> Remove</button></figure>)}</div>}
    {!!photos.length&&<><label className="check-control scan-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/> I have permission to send these photos to Cloudflare Workers AI and, when enabled, OpenAI as a backup for furniture analysis. / এই ছবি Cloudflare Workers AI-তে এবং বিকল্প সেবা চালু থাকলে OpenAI-তে পাঠাতে আমার অনুমতি আছে। Avoid faces, addresses and private documents. / মুখ, ঠিকানা ও ব্যক্তিগত কাগজ বাদ দিন।</label><div className="scan-actions"><button type="button" className="btn btn-soft" disabled={!consent||busy} onClick={analyze}>{scanning?'Analyzing photos…':'Analyze photos'}</button>{scanning&&<button type="button" className="btn btn-outline" onClick={()=>controller.current?.abort()}>Cancel analysis</button>}</div></>}
    {error&&<div role="alert" className="inline-alert">{error}</div>}
    {message&&<p role="status" className="scan-message">{message}</p>}
    {suggestions&&<div className="scan-review"><h4>Review & correct / যাচাই করুন</h4><p className="small muted">AI can miss items or count the same object in different photos. Correct each quantity; use 0 to remove a mistake. Applying replaces the current inventory. Add missing items below afterward.</p>
      {suggestions.map((item,index)=><div className="scan-review-row" key={item.name}><div><strong>{item.name}</strong><small>{item.confidence[0].toUpperCase()+item.confidence.slice(1)} confidence</small></div><label className="field"><span className="small">Quantity</span><input className="form-control" aria-label={`Detected ${item.name} quantity`} type="number" min="0" max="1000" step="1" value={item.qty} onChange={event=>setSuggestions(old=>old.map((entry,i)=>i===index?{...entry,qty:event.target.value}:entry))}/></label></div>)}
      <div className="scan-actions"><button type="button" className="btn btn-primary" aria-label="Apply reviewed inventory" onClick={apply}>Apply reviewed inventory / যাচাই করা তালিকা নিন</button><button type="button" className="btn btn-outline" aria-label="Keep manual inventory" onClick={()=>{setSuggestions(null);setMessage('Suggestions discarded. Your manual inventory is unchanged.');setError('');}}>Keep manual inventory / নিজের তালিকা রাখুন</button></div>
    </div>}
  </section>;
}
