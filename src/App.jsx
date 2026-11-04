import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BadgeCheck, BedDouble, Building2, CalendarDays,
  Check, CheckCheck, CheckCircle2, ChevronDown, ChevronRight, Clock3, Compass,
  DoorOpen, FileImage, Filter, Heart, House, Info, KeyRound, MapPin, Menu, MessageCircle,
  Minus, MoveRight, Package, Phone, Plus, Search, ShieldCheck, SlidersHorizontal, Sparkles,
  Truck, UploadCloud, UserRound, Users, Wallet, WandSparkles, X, RotateCcw, CalendarCheck,
  Navigation, Copy, Image as ImageIcon, LocateFixed, LayoutDashboard, ShieldAlert, Star,
} from 'lucide-react';
import { areas, furniture, initialDb } from './data.js';
import { addOffer, chooseOffer, declineAndReopen, matchesArea, money, phoneLink, safePhone, uid } from './domain.js';
import { isPasswordRecoveryPending, supabase, supabaseConfigurationError } from './lib/supabase.js';
import { roles } from './lib/auth.js';
import * as repository from './lib/repository.js';
import { useAuth, useCloudData } from './hooks/useSupabase.js';
import AuthModal from './components/AuthModal.jsx';
import FurnitureRecognition from './components/FurnitureRecognition.jsx';
import MovingBudget from './components/MovingBudget.jsx';
import { ApartmentPreferences, ApartmentExplanation, QuoteComparison, defaultPreferences } from './components/Recommendations.jsx';
import { rankApartments } from './lib/recommendations.js';

const STORAGE = 'bashashift-prototype-v1';
const dateAfter = () => new Date(Date.now()+86400000*10).toISOString().slice(0,10);
const itemDefault = [{name:'Bed',qty:1},{name:'Sofa',qty:1},{name:'Boxes',qty:3}];
const areaName = a => /^bonosree$/i.test((a||'').trim()) ? 'Banasree' : (a||'').trim();
const initial = () => { try { const raw=localStorage.getItem(STORAGE); if(raw) {const d=JSON.parse(raw); if(d?.listings&&d?.requests&&d?.workers&&d?.inquiries) return d;} } catch {} return initialDb(); };
const inputClass = 'form-control';
const fieldBangla = {
  'Moving from':'যেখান থেকে', 'Moving to':'যেখানে যাবেন', 'Moving date':'যাত্রার তারিখ',
  'Approx. distance (km)':'আনুমানিক দূরত্ব (কিমি)', 'Current floor':'বর্তমান তলা',
  'Destination floor':'গন্তব্যের তলা', 'Your name':'আপনার নাম', 'Your name *':'আপনার নাম *',
  'Phone number':'ফোন নম্বর', 'Phone number *':'ফোন নম্বর *', 'Notes for movers':'মুভারদের জন্য নির্দেশনা',
  'Property title *':'বাসার শিরোনাম *', 'Area *':'এলাকা *', 'Block / road *':'ব্লক / রাস্তা *',
  'Monthly rent (BDT) *':'মাসিক ভাড়া (টাকা) *', 'Bedrooms':'শোবার ঘর', 'Bathrooms':'বাথরুম',
  'Size (sqft)':'আয়তন (বর্গফুট)', 'Floor number':'তলা নম্বর', 'Available from':'ভাড়া হবে',
  'Owner name *':'মালিকের নাম *', 'Bangladesh phone *':'বাংলাদেশি ফোন নম্বর *',
  'Property description':'বাসার বিবরণ', 'Preferred viewing date':'দেখার পছন্দের তারিখ',
  'Message (optional)':'বার্তা (ঐচ্ছিক)', 'Area':'এলাকা', 'Maximum monthly rent':'সর্বোচ্চ মাসিক ভাড়া',
  'Minimum bedrooms':'কমপক্ষে শোবার ঘর', Lift:'লিফট আছে', Balcony:'বারান্দা',
  Parking:'গাড়ি রাখার জায়গা',
};
const fieldHint = label => fieldBangla[label] || fieldBangla[label?.replace(/ \*$/, '')];

function PropertyArt({listing, className=''}) {
  return <div className={`property-art ${listing.tone||'sage'} ${className}`}>
    {listing.image ? <img src={listing.image} alt={`${listing.title} uploaded by owner`} /> : <svg className="home-illustration" viewBox="0 0 470 290" aria-hidden="true">
      <circle cx="372" cy="56" r="39" fill="#fff" opacity=".33" />
      <path d="M0 251 L470 251 L470 290 L0 290Z" fill="#fff" opacity=".28" />
      <path d="M44 245 L44 124 L116 81 L189 124 L189 245" fill="#f5eee2" opacity=".55" />
      <path d="M126 251 L126 85 L217 35 L309 85 L309 251" fill="#fff5e8" opacity=".95" />
      <path d="M304 251 L304 121 L377 80 L446 121 L446 251" fill="#fffaf2" opacity=".75" />
      <path d="M116 88 L216 27 L315 88" stroke="#4c675c" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".48" />
      {[153,236].flatMap((x)=>[108,171].map(y=><g key={`${x}-${y}`}><rect x={x} y={y} width="36" height="44" rx="4" fill="#8baa9d" opacity=".85"/><path d={`M${x+18} ${y} v44 M${x} ${y+22} h36`} stroke="#f9f6ee" strokeWidth="3"/></g>))}
      <rect x="208" y="208" width="32" height="43" rx="3" fill="#6d8b7d"/><circle cx="234" cy="230" r="2" fill="#fff"/>
      <rect x="350" y="143" width="46" height="58" rx="4" fill="#82a39b" opacity=".7"/><path d="M373 143v58 M350 170h46" stroke="#f9f6ee" strokeWidth="4"/>
      <path d="M0 249 Q84 229 176 249 T470 249 L470 290 L0 290Z" fill="#56786b" opacity=".18"/>
      <path d="M37 245q-30-33 1-74 30 42-1 74 M418 247q-33-35 0-83 29 45 0 83" fill="#5c9077" opacity=".55" />
    </svg>}
    {listing.sample && <span className="image-tag">ILLUSTRATIVE DEMO</span>}
    {!listing.sample && <span className="image-tag live-tag">USER LISTED · UNVERIFIED</span>}
  </div>;
}
function Badge({children,tone='neutral'}) {return <span className={`chip ${tone}`}>{children}</span>}
function NumberStat({value,label}) {return <div className="stat"><strong>{value}</strong><span>{label}</span></div>}
function Empty({icon: Icon=House,title,description,action}) {return <div className="empty"><span className="empty-icon"><Icon size={29}/></span><h3>{title}</h3><p>{description}</p>{action}</div>}
function SectionTitle({eyebrow,title,desc,action}) {return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{desc&&<p>{desc}</p>}</div>{action}</div>}
function TextField({label,help,...props}) {return <label className="field"><span>{label}</span>{fieldHint(label)&&<small lang="bn">{fieldHint(label)}</small>}<input className={inputClass} aria-label={props['aria-label']||label} {...props}/>{help&&<small>{help}</small>}</label>}
function SelectField({label,options,placeholder,...props}) {return <label className="field"><span>{label}</span>{fieldHint(label)&&<small lang="bn">{fieldHint(label)}</small>}<select className={inputClass} aria-label={props['aria-label']||label} {...props}>{placeholder&&<option value="">{placeholder}</option>}{options.map(x=><option key={typeof x==='string'?x:x.value} value={typeof x==='string'?x:x.value}>{typeof x==='string'?x:x.label}</option>)}</select></label>}
function LayoutTitle({title,desc,icon:Icon}) {return <div className="workspace-title"><span className="workspace-icon"><Icon size={23}/></span><div><h2>{title}</h2><p>{desc}</p></div></div>}
function ListingCard({listing,onOpen,onMove,saved,onSave,canMove=true}) {
  return <article className="home-card"><div className="card-cover" onClick={()=>onOpen(listing)} role="button" tabIndex={0} onKeyDown={e=>e.key==='Enter'&&onOpen(listing)}><PropertyArt listing={listing}/><button className={`heart-btn ${saved?'liked':''}`} aria-label={saved?'Remove saved':'Save listing'} onClick={e=>{e.stopPropagation();onSave(listing.id)}}><Heart size={18} fill={saved?'currentColor':'none'}/></button></div><div className="home-card-body"><div className="home-price"><strong>{money(listing.rent)}</strong><span>/ month · / মাস</span></div><h3>{listing.title}</h3><p className="muted location"><MapPin size={14}/>{listing.block}, {listing.area}, Dhaka</p><div className="home-facts"><span><BedDouble size={15}/>{listing.beds} beds</span><span><DoorOpen size={15}/>{listing.baths} baths</span><span><Building2 size={15}/>{listing.sqft} sqft</span></div><div className="home-actions"><button aria-label="View details" className="btn btn-soft" onClick={()=>onOpen(listing)}>View details / বিস্তারিত <ArrowUpRight size={15}/></button>{canMove&&<button className="btn btn-icon-only" title="Plan a move / স্থানান্তরের পরিকল্পনা" aria-label="Plan move / স্থানান্তর" onClick={()=>onMove(listing)}><Truck size={18}/></button>}</div></div></article>;
}

function MoverBookingCard({request, confirmed}) {
  const status = request.status === 'confirmed'
    ? 'নিশ্চিত'
    : request.status === 'awaiting_call' ? 'ফোনে কথা বাকি' : request.status;
  return <div className="selected-worker worker-confirmed" key={request.id}>
    <strong>{request.fromArea} → {request.toArea}</strong>
    <p className="small muted">{confirmed?'নিশ্চিত কাজ':'নির্বাচিত কাজ'} · {status} · তারিখ: {request.date}</p>
    <p className="small muted">গ্রাহক: {request.customerName}</p>
    {request.customerConsent&&phoneLink(request.customerPhone)
      ? <a aria-label={`Call customer: ${request.customerPhone}`} className="btn btn-soft"
        href={phoneLink(request.customerPhone)}><Phone size={15}/> গ্রাহককে কল করুন: {request.customerPhone}</a>
      : <p className="muted small">গ্রাহকের ফোন এখনো শেয়ার করা হয়নি।</p>}
  </div>;
}

function MoverWorkspace({
  demoMode, db, activeWorker, setDb, setAvailability, workerForm,
  setWorkerForm, workerRegister, saving, workerQuote, setWorkerQuote, offer, go,
}) {
  const availableJobs = db.requests.filter(request =>
    request.status === 'open' && matchesArea(activeWorker, request));
  const bookings = db.requests.filter(request =>
    request.selectedOfferId && request.offers.some(offer =>
      offer.id === request.selectedOfferId && offer.workerId === activeWorker?.id));
  const selectedJobs = bookings.filter(request => request.status !== 'confirmed');
  const confirmedBookings = bookings.filter(request => request.status === 'confirmed');
  const bookingCard = request => <MoverBookingCard key={request.id}
    request={request} confirmed={request.status === 'confirmed'}/>;

  return <section className="container workspace">
    <LayoutTitle title="Mover desk / মুভারের ড্যাশবোর্ড"
      desc="Independent movers set their own prices and choose which jobs to quote. / মুভাররা নিজেরা দর ঠিক করে কাজ বাছাই করবেন।"
      icon={Users}/>
    <div className="worker-grid">
      <div className="form-panel">
        <span className="eyebrow">MOVER ACCOUNT / মুভার অ্যাকাউন্ট</span>
        <h3>আপনার কাজের ড্যাশবোর্ড</h3>
        {demoMode&&<SelectField label="ডেমো মুভার বাছুন" options={db.workers.map(worker=>({
          label:worker.name+' · '+worker.area+(worker.sample?' (ডেমো)':''),
          value:worker.id,
        }))} value={activeWorker?.id||''} onChange={event=>
          setDb(data=>({...data,selectedWorkerId:event.target.value}))}/>}
        {activeWorker&&<div className="worker-profile">
          <div className="avatar">{activeWorker.avatar}</div>
          <div><strong>{activeWorker.name}</strong><small>{activeWorker.area} · {activeWorker.sample?'ডেমো অ্যাকাউন্ট':'পরিচয় যাচাই হয়নি'}</small></div>
          <label className="switch"><input type="checkbox" checked={activeWorker.available}
            disabled={saving} onChange={event=>setAvailability(event.target.checked)}/>
            <span>{activeWorker.available?'কাজ নিতে প্রস্তুত':'এখন কাজ নেবেন না'}</span></label>
        </div>}
        <div className="panel-split"/>
        <h3>{demoMode?'নতুন ডেমো মুভার':'আপনার মুভার তথ্য'}</h3>
        <p className="muted small">{demoMode
          ? 'ডেমোতে মুভার যোগ করুন। / Add a mover to the demo.'
          : 'কাজের এলাকা ও যোগাযোগের তথ্য বদলান। পরিচয় যাচাই করা হয়নি।'}</p>
        <form onSubmit={workerRegister}>
          <TextField label="আপনার নাম" placeholder="পুরো নাম" value={workerForm.name}
            onChange={event=>setWorkerForm(state=>({...state,name:event.target.value}))}/>
          <SelectField label="কাজের এলাকা" options={areas} value={workerForm.area}
            onChange={event=>setWorkerForm(state=>({...state,area:event.target.value}))}/>
          <TextField label="ফোন নম্বর" placeholder="01XXXXXXXXX" value={workerForm.phone}
            onChange={event=>setWorkerForm(state=>({...state,phone:event.target.value}))}/>
          <button type="submit" aria-label={demoMode?'Register worker':'Save mover profile'}
            className="btn btn-primary btn-block" disabled={saving}>
            <Plus size={16}/>{demoMode?'ডেমো মুভার যোগ করুন':'তথ্য সংরক্ষণ করুন'}
          </button>
        </form>
      </div>
      <div className="form-panel">
        <div className="worker-head"><div><span className="eyebrow">কাছের নতুন অনুরোধ</span>
          <h3>Available Jobs / নতুন কাজের অনুরোধ</h3></div>
          <Badge tone="warm">{availableJobs.length} নতুন কাজ</Badge>
        </div>
        {availableJobs.length===0
          ? <Empty icon={Package} title="এখন নতুন কাজ নেই"
              description="আপনার এলাকার নতুন অনুরোধ এখানে দেখবেন।"
              action={demoMode&&<button className="btn btn-soft"
                onClick={()=>go('moving')}>ডেমো অনুরোধ তৈরি করুন</button>}/>
          : availableJobs.map(request=>{
            const prior=request.offers.find(item=>
              item.workerId===activeWorker?.id && item.status==='pending');
            return <div className="worker-job" key={request.id}>
              <div className="request-top"><div><strong>{request.fromArea} → {request.toArea}</strong>
                <small><CalendarDays size={13}/> {request.date}</small></div>
                <Badge tone="warm">নতুন কাজ</Badge></div>
              <div className="worker-job-facts">
                <span><MapPin size={15}/> যেখান থেকে: {request.fromArea}</span>
                <span><MapPin size={15}/> যেখানে যাবেন: {request.toArea}</span>
                <span><CalendarDays size={15}/> তারিখ: {request.date}</span>
                <span><Navigation size={15}/> দূরত্ব: {request.km} কিমি</span>
                <span>পিকআপ তলা: {request.fromFloor}</span>
                <span>গন্তব্যের তলা: {request.toFloor}</span>
                <span>{request.hasLift?'লিফট আছে':'লিফট নেই'}</span>
              </div>
              <div className="worker-inventory"><strong>আসবাব ও সংখ্যা:</strong><ul>
                {request.items.map(item=><li key={item.name}><span>{item.name}</span><b>×{item.qty}</b></li>)}
              </ul></div>
              <MovingBudget move={request} mover/>
              <div className="job-price"><label>আপনার দর (টাকা)
                <input aria-label="Your quotation (BDT)" className="form-control"
                  type="number" min="100" max="500000"
                  required value={workerQuote[request.id] ?? ''}
                  onChange={event=>setWorkerQuote(state=>({...state,[request.id]:event.target.value}))}/>
              </label><button aria-label={prior?'Quotation submitted':'Submit quotation'}
                className="btn btn-primary" disabled={saving||!!prior||!activeWorker?.available}
                onClick={()=>offer(request)}>
                {prior?'দর পাঠানো হয়েছে':'দর পাঠান'} <Check size={15}/>
              </button></div>
              <p className="small muted"><ShieldCheck size={13}/>
                গ্রাহকের ফোন শুধু নির্বাচিত মুভার দেখতে পাবেন।</p>
            </div>;
          })}
        {selectedJobs.length>0&&<section className="worker-booking-group">
          <h3>Selected Jobs / নির্বাচিত কাজ</h3>{selectedJobs.map(bookingCard)}
        </section>}
        <section className="worker-booking-group">
          <h3>Confirmed Bookings / নিশ্চিত কাজ</h3>
          {confirmedBookings.length
            ? confirmedBookings.map(bookingCard)
            : <p className="muted small">এখনো কোনো কাজ নিশ্চিত হয়নি।</p>}
        </section>
      </div>
    </div>
  </section>;
}

function OwnerWorkspace({
  demoMode, ownerTab, setOwnerTab, newProperty, newListing, setNewListing,
  publishListing, saving, editingProperty, setEditingProperty, ownerImage, ownerListingCount,
  ownerListings, removeListing, profile, db, acknowledge,
}) {
  return <section className="container workspace">
    <LayoutTitle title="Owner desk / মালিকের ড্যাশবোর্ড"
      desc="বাসার তালিকা দিন এবং দেখার অনুরোধ দেখুন। / Publish your property and manage viewing requests."
      icon={Building2}/>
    <div className="tabs">
      <button aria-label="Add property" className={ownerTab==='add'?'selected':''}
        onClick={newProperty}><Plus size={16}/> Add property / বাসার তথ্য দিন</button>
      <button aria-label="Listings and inquiries" className={ownerTab==='manage'?'selected':''}
        onClick={()=>setOwnerTab('manage')}><LayoutDashboard size={16}/>
        Listings & inquiries / তালিকা ও অনুরোধ <Badge>{ownerListingCount}</Badge>
      </button>
    </div>
    {ownerTab==='add'
      ? <div className="form-panel owner-form">
        <div className="panel-intro"><h3>আপনার বাসার তথ্য দিন / Tell us about your space</h3>
          <p>আপনার বিজ্ঞাপন দেওয়ার অধিকার আছে—এমন বাসার তথ্য দিন। / Only post properties you have permission to advertise.</p>
        </div>
        <form onSubmit={publishListing}>
          <div className="form-grid">
            <TextField label="Property title *" placeholder="e.g. Bright family flat"
              value={newListing.title} onChange={event=>setNewListing(state=>({...state,title:event.target.value}))} required/>
            <SelectField label="Area *" options={areas} value={newListing.area}
              onChange={event=>setNewListing(state=>({...state,area:event.target.value}))}/>
            <TextField label="Block / road *" placeholder="Block A, Road 2"
              value={newListing.block} onChange={event=>setNewListing(state=>({...state,block:event.target.value}))} required/>
            <TextField label="Monthly rent (BDT) *" type="number" min="1000"
              value={newListing.rent} onChange={event=>setNewListing(state=>({...state,rent:event.target.value}))} required/>
            <TextField label="Bedrooms" type="number" min="1" max="20" value={newListing.beds}
              onChange={event=>setNewListing(state=>({...state,beds:event.target.value}))}/>
            <TextField label="Bathrooms" type="number" min="1" max="20" value={newListing.baths}
              onChange={event=>setNewListing(state=>({...state,baths:event.target.value}))}/>
            <TextField label="Size (sqft)" type="number" min="100" placeholder="1200"
              value={newListing.sqft} onChange={event=>setNewListing(state=>({...state,sqft:event.target.value}))}/>
            <TextField label="Floor number" type="number" min="0" value={newListing.floor}
              onChange={event=>setNewListing(state=>({...state,floor:event.target.value}))}/>
            <TextField label="Available from" type="date" value={newListing.available}
              onChange={event=>setNewListing(state=>({...state,available:event.target.value}))}/>
            <TextField label="Owner name *" value={newListing.ownerName}
              onChange={event=>setNewListing(state=>({...state,ownerName:event.target.value}))} required/>
            <TextField label="Bangladesh phone *" placeholder="01XXXXXXXXX"
              value={newListing.ownerPhone} onChange={event=>setNewListing(state=>({...state,ownerPhone:event.target.value}))}
              required help={demoMode?'শুধু এই ব্রাউজারে থাকবে। / Stored only in this browser.':'দেখার অনুরোধ পাঠালে ভাড়াটিয়াকে দেওয়া হবে। / Shared with renters requesting a viewing.'}/>
          </div>
          <div className="check-row">{[['lift','Lift'],['balcony','Balcony'],['parking','Parking']].map(([key,label])=>
            <label key={key} className="check-control">
              <input type="checkbox" checked={newListing[key]}
                onChange={event=>setNewListing(state=>({...state,[key]:event.target.checked}))}/>
              {label} / {fieldHint(label)}
            </label>)}
          </div>
          <label className="field"><span>Property description</span><small lang="bn">বাসার বিবরণ</small>
            <textarea className="form-control" rows="3" value={newListing.description}
              onChange={event=>setNewListing(state=>({...state,description:event.target.value}))}
              placeholder="যে তথ্য নিশ্চিত, তা লিখুন। / Share only details you can verify."/>
          </label>
          <label className="upload-zone"><ImageIcon size={28}/>
            <strong>{newListing.image?'ছবি তৈরি / Photo ready — click to replace':'বাসার ছবি দিন / Upload a property photo (optional)'}</strong>
            <small>{demoMode?'JPG/PNG/WEBP; এই ব্রাউজারে থাকবে। / Stored in this browser.':'JPG/PNG/WEBP; বাসা প্রকাশের সময় আপলোড হবে। / Uploaded when you publish.'}</small>
            <input type="file" accept="image/*" onChange={ownerImage} hidden/>
          </label>
          <div className="form-footer">
            <p><ShieldAlert size={15}/> যাচাই না হওয়া পর্যন্ত নতুন তালিকা অযাচাইকৃত থাকবে।</p>
            <button aria-label={editingProperty?'Save and publish':'Publish property'}
              className="btn btn-primary" type="submit" disabled={saving}>
              {editingProperty?'Save and publish / সংরক্ষণ ও প্রকাশ':'Publish property / বাসার তালিকা প্রকাশ করুন'}
              <ArrowRight size={17}/>
            </button>
          </div>
        </form>
      </div>
      : <div className="dashboard-grid">
        <div className="form-panel"><h3>{demoMode?'Locally published properties':'Your properties'} / আপনার বাসা</h3>
          {ownerListings.length===0
            ? <Empty icon={Building2} title="এখনো কোনো বাসা নেই" description="নতুন বাসার তথ্য যোগ করুন।"
              action={<button className="btn btn-soft" onClick={newProperty}>বাসার তথ্য দিন</button>}/>
            : ownerListings.map(item=><div className="mini-entry" key={item.id}>
              <div><strong>{item.title}</strong><small>{item.area} · {money(item.rent)}/mo{!demoMode&&` · ${item.status}`}</small></div>
              {!demoMode&&<button className="btn btn-small btn-soft" onClick={()=>{
                setNewListing({...item,ownerPhone:profile.phone});setEditingProperty(item.id);setOwnerTab('add');
              }}>Edit / বদলান</button>}
              <button className="btn btn-small btn-danger-outline" disabled={saving}
                onClick={()=>removeListing(item.id)}>{demoMode?'Remove / সরান':'Unpublish / সরান'}</button>
            </div>)}
        </div>
        <div className="form-panel"><h3>Viewing requests / বাসা দেখার অনুরোধ</h3>
          {!db.inquiries.length
            ? <Empty icon={CalendarDays} title="এখনো কোনো অনুরোধ নেই"
              description="তালিকা থেকে বাসা দেখার অনুরোধ আসবে।"/>
            : db.inquiries.map(inquiry=><div className="mini-entry" key={inquiry.id}>
              <div><strong>{inquiry.name} · {inquiry.listingTitle}</strong>
                <small>{inquiry.date} · {inquiry.message||'কোনো বার্তা নেই'}</small>
                <small>ফোন: {inquiry.phone} · {inquiry.status}</small>
              </div>
              <button className="btn btn-small btn-soft" disabled={saving}
                aria-label={inquiry.status==='requested'?'Acknowledge':'Undo'}
                onClick={()=>acknowledge(inquiry)}>
                {inquiry.status==='requested'?'দেখেছি':'ফিরিয়ে দিন'}
              </button>
            </div>)}
        </div>
      </div>}
  </section>;
}

function App() {
  const isRecoveryRedirect = new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery';
  const [demoMode,setDemoMode] = useState(() => !isRecoveryRedirect && (!supabase || new URLSearchParams(window.location.search).get('demo') === '1'));
  const [demoDb,setDb] = useState(initial);
  const auth = useAuth(supabase);
  const profile = auth.session?.user.id === auth.profile?.id ? auth.profile : null;
  const cloud = useCloudData(supabase, profile, !demoMode, auth.session?.user.id);
  const db = demoMode ? demoDb : cloud.data;
  const [authDialog,setAuthDialog] = useState(() => isRecoveryRedirect ? 'reset' : null);
  const [saving,setSaving] = useState(false);
  const [editingProperty,setEditingProperty] = useState(null);
  const [page,setPage] = useState('explore');
  const [listing,setListing] = useState(null);
  const [toast,setToast] = useState('');
  const [search,setSearch] = useState('');
  const [area,setArea] = useState('');
  const [maxRent,setMaxRent] = useState('');
  const [minBeds,setMinBeds] = useState('');
  const [preferences,setPreferences] = useState(defaultPreferences);
  const [saved,setSaved] = useState([]);
  const [mobileNav,setMobileNav] = useState(false);
  const [newListing,setNewListing] = useState({title:'', area:'Banasree',block:'',rent:'',beds:2,baths:1,sqft:'',floor:1,lift:false,balcony:false,parking:false,ownerName:'',ownerPhone:'',description:'',available:dateAfter(),image:''});
  const [inquiry,setInquiry] = useState({name:'',phone:'',date:dateAfter(),message:''});
  const [ownerTab,setOwnerTab] = useState('add');
  const [workerForm,setWorkerForm] = useState({name:'',area:'Banasree',phone:''});
  const [workerQuote,setWorkerQuote] = useState({});
  const [move,setMove] = useState({fromArea:'Banasree',toArea:'Banasree',date:dateAfter(),km:5,fromFloor:2,toFloor:2,hasLift:true,customerName:'',customerPhone:'',customerConsent:false,notes:'',items:itemDefault,listingId:null});
  const [aiPending,setAiPending] = useState(false);
  const [requestCreated,setRequestCreated] = useState(false);

  useEffect(()=>{
    if(!supabase)return;
    if(isPasswordRecoveryPending()){setDemoMode(false);setAuthDialog('reset');}
    const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{
      if(event==='PASSWORD_RECOVERY'){setDemoMode(false);setAuthDialog('reset');}
    });
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{if(demoMode){try{localStorage.setItem(STORAGE,JSON.stringify(demoDb));}catch{notify('Browser storage full. Try a smaller photo.')}}},[demoDb,demoMode]);
  useEffect(()=>{
    const account = demoMode ? null : profile;
    setListing(null); setEditingProperty(null); setOwnerTab('add'); setSaved([]);
    setAiPending(false); setPreferences(defaultPreferences);
    setNewListing({title:'',area:'Banasree',block:'',rent:'',beds:2,baths:1,sqft:'',floor:1,lift:false,balcony:false,parking:false,ownerName:account?.display_name||'',ownerPhone:account?.phone||'',description:'',available:dateAfter(),image:''});
    setInquiry({name:account?.display_name||'',phone:account?.phone||'',date:dateAfter(),message:''});
    setMove({fromArea:'Banasree',toArea:'Banasree',date:dateAfter(),km:5,fromFloor:2,toFloor:2,hasLift:true,customerName:account?.display_name||'',customerPhone:account?.phone||'',customerConsent:false,notes:'',items:itemDefault,listingId:null});
    setWorkerForm({name:account?.display_name||'',area:account?.service_area||'Banasree',phone:account?.phone||''});
  },[demoMode,profile?.id]);
  function requireRole(role){if(demoMode)return true;if(!profile){setAuthDialog(role);return false;}if(profile.role!==role){notify(`Use a ${roles[role]} account for this action.`);return false;}return true;}
  async function onlineAction(action,message){if(saving)return false;setSaving(true);try{await action();await cloud.refresh();if(message)notify(message);return true;}catch(error){notify(error.message);return false;}finally{setSaving(false);}}
  async function signOut(){try{await repository.result(supabase.auth.signOut());go('explore');}catch(error){notify(error.message);}}
  function accountGate(role){return <section className="container workspace"><div className="form-panel"><h2>{auth.loading?'Loading your account…':`${roles[role]} / ${role==='owner'?'বাড়ির মালিক':role==='mover'?'সেবাদানকারী':'ভাড়াটিয়া'} account required`}</h2><p>{profile?`You are signed in as ${roles[profile.role]}. Switch accounts to use this workspace. / এই কাজের জন্য সঠিক অ্যাকাউন্টে লগ ইন করুন।`:'Sign in or create an account to save your information across devices. / তথ্য সংরক্ষণ করতে লগ ইন বা অ্যাকাউন্ট খুলুন।'}</p><button className="btn btn-primary" disabled={auth.loading} onClick={async()=>{if(auth.session)await signOut();setAuthDialog(role);}}>{profile?'Switch account / অ্যাকাউন্ট বদলান':'Sign in or register / লগ ইন বা নিবন্ধন'}</button></div></section>;}
  function notify(message){setToast(message);window.clearTimeout(notify.timer);notify.timer=window.setTimeout(()=>setToast(''),4300)}
  function go(p){setPage(p);setListing(null);setMobileNav(false);window.scrollTo({top:0,behavior:'smooth'})}
  function save(id){setSaved(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id])}
  function changeMode(next){const url=new URL(window.location.href);if(next)url.searchParams.set('demo','1');else url.searchParams.delete('demo');window.history.replaceState(null,'',url);setDemoMode(next);go('explore');}
  function newProperty(){setEditingProperty(null);setNewListing({title:'',area:'Banasree',block:'',rent:'',beds:2,baths:1,sqft:'',floor:1,lift:false,balcony:false,parking:false,ownerName:!demoMode?profile?.display_name||'':'',ownerPhone:!demoMode?profile?.phone||'':'',description:'',available:dateAfter(),image:''});setOwnerTab('add');}
  function resetDemo(){if(!window.confirm('Reset all local demo listings, workers, requests and inquiries?'))return;setDb(initialDb());setSaved([]);go('explore');notify('Demo data reset.')}
  const filtered = useMemo(()=>db.listings.filter(x=>{
    const q=areaName(search).toLowerCase();
    const places = `${x.title} ${x.area} ${x.block}`.toLowerCase();
    return (demoMode||x.status==='published')&&(!q||places.includes(q))&&(!area||x.area===area)&&(!maxRent||Number(x.rent)<=Number(maxRent))&&(!minBeds||Number(x.beds)>=Number(minBeds));
  }),[db.listings,search,area,maxRent,minBeds,demoMode]);
  const apartmentRanking = useMemo(()=>rankApartments(filtered,{...preferences,maxBudget:maxRent,minBeds,requiredArea:area}),[filtered,preferences,maxRent,minBeds,area]);
  const shownListings = demoMode ? filtered : apartmentRanking.map(row=>filtered.find(p=>p.id===row.id));
  const activeWorker = db.workers.find(w=>w.id===db.selectedWorkerId)||db.workers[0];
  const ownerListings = db.listings.filter(x=>!x.sample&&(demoMode||x.owner_id===profile?.id));
  const ownerListingCount = ownerListings.length;
  const selectedReq = id=>db.requests.find(r=>r.id===id);
  const navItems = [
    {key:'explore',english:'Explore homes',bangla:'ঘর খুঁজুন'},
    {key:'moving',english:'Moving services',bangla:'মুভিং সেবা'},
    {key:'activity',english:'My requests',bangla:'আমার অনুরোধ'},
    {key:'owner',english:'Owner desk',bangla:'মালিকের ড্যাশবোর্ড'},
    {key:'worker',english:'Mover desk',bangla:'মুভারের ড্যাশবোর্ড'},
  ];
  const visibleNav = demoMode ? navItems : [
    navItems[0],
    ...(profile?.role==='renter' ? [navItems[1],navItems[2]] : []),
    ...(profile?.role==='owner' ? [navItems[3]] : []),
    ...(profile?.role==='mover' ? [navItems[4]] : []),
  ];
  function authenticatedAs(role) {
    setAuthDialog(null);
    if(role==='owner')setOwnerTab('manage');
    const dashboard={owner:'owner',renter:'activity',mover:'worker'};
    go(dashboard[role]||'explore');
  }
  function planMove(l){if(!requireRole('renter'))return;setMove(old=>({...old,toArea:l.area,toFloor:l.floor,hasLift:l.lift,listingId:l.id}));setRequestCreated(false);go('moving');notify('Destination filled from selected home.');}
  async function imageToData(file,maxWidth=1100){
    if(!file||!file.type.startsWith('image/'))throw new Error('Please select an image.');
    if(file.size>8_000_000)throw new Error('File too large (8 MB maximum).');
    const url=URL.createObjectURL(file);
    try { const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not load image.'));image.src=url;}); const c=document.createElement('canvas'); const s=Math.min(1,maxWidth/Math.max(img.width,img.height));c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.78); } finally {URL.revokeObjectURL(url)}
  }
  async function ownerImage(e){const file=e.target.files?.[0];if(!file)return;try{const image=await imageToData(file,800);setNewListing(x=>({...x,image}));notify(demoMode?'Photo attached (stored only in this browser).':'Photo ready to upload when you publish.')}catch(err){notify(err.message)}}
  async function publishListing(e){e.preventDefault();if(!requireRole('owner'))return;if(!newListing.title.trim()||!newListing.block.trim()||!newListing.ownerName.trim()||!safePhone(newListing.ownerPhone)||Number(newListing.rent)<1000){notify('Check the required fields and valid 11-digit phone number.');return}
    if(!demoMode){const ok=await onlineAction(()=>repository.saveProperty(supabase,profile,newListing,editingProperty),'Your property is published.');if(ok){setEditingProperty(null);setOwnerTab('manage');setNewListing(s=>({...s,title:'',block:'',rent:'',image:'',description:''}));await auth.refreshProfile();}return;}
    const obj={...newListing,id:uid('home'),sample:false,ownerPhone:newListing.ownerPhone.replace(/\D/g,''),rent:Number(newListing.rent),beds:Number(newListing.beds),baths:Number(newListing.baths),sqft:Number(newListing.sqft)||0,floor:Number(newListing.floor),tone:'sage'};
    setDb(d=>({...d,listings:[obj,...d.listings]}));setNewListing({title:'',area:'Banasree',block:'',rent:'',beds:2,baths:1,sqft:'',floor:1,lift:false,balcony:false,parking:false,ownerName:'',ownerPhone:'',description:'',available:dateAfter(),image:''});setOwnerTab('manage');notify('Your listing is published locally (not public yet).')
  }
  async function requestVisit(e){e.preventDefault();if(!requireRole('renter'))return;if(!listing||!inquiry.name.trim()||!safePhone(inquiry.phone)){notify('Enter your name and a valid Bangladesh phone number.');return}
    if(!demoMode){const ok=await onlineAction(()=>repository.createInquiry(supabase,listing.id,inquiry),'Viewing inquiry sent to the owner.');if(ok){setListing(null);go('activity');}return;}
    setDb(d=>({...d,inquiries:[{id:uid('inq'),listingId:listing.id,listingTitle:listing.title,ownerName:listing.ownerName,name:inquiry.name,phone:inquiry.phone,date:inquiry.date,message:inquiry.message,status:'requested',createdAt:new Date().toISOString()},...d.inquiries]}));setListing(null);setInquiry({name:'',phone:'',date:dateAfter(),message:''});notify('Viewing request saved in demo dashboard.');go('activity')
  }
  function setItemQty(name,delta){setMove(s=>{let items=s.items.map(i=>i.name===name?{...i,qty:Math.max(0,i.qty+delta)}:i);if(!items.some(i=>i.name===name)&&delta>0)items=[...items,{name,qty:delta}];return {...s,items:items.filter(x=>x.qty>0)};})}
  async function createRequest(e){e.preventDefault();if(!requireRole('renter'))return;if(aiPending){notify('Review or discard the photo suggestions before publishing.');return;}if(!move.items.some(x=>x.qty>0)||!move.customerName.trim()||!safePhone(move.customerPhone)||!move.customerConsent||!move.date){notify('Add furniture, valid contact details, and contact-sharing consent.');return}
    if(!demoMode){const ok=await onlineAction(()=>repository.createMove(supabase,move),'Moving request published. Waiting for mover quotations.');if(ok)go('activity');return;}
    const req={id:uid('move'),...move,customerPhone:move.customerPhone.replace(/\D/g,''),items:move.items.map(i=>({...i})),estimate:0,offers:[],status:'open',selectedOfferId:null,sample:false,createdAt:new Date().toISOString()};setDb(d=>({...d,requests:[req,...d.requests]}));setRequestCreated(true);notify('Request published locally. Switch to mover view to respond.');go('activity'); }
  async function workerRegister(e){e.preventDefault();if(!requireRole('mover'))return;if(!workerForm.name.trim()||!safePhone(workerForm.phone)){notify('Enter name and valid Bangladesh phone number.');return}
    if(!demoMode){await onlineAction(async()=>{await repository.saveProfile(supabase,profile.id,{display_name:workerForm.name.trim(),phone:workerForm.phone.replace(/\D/g,''),service_area:workerForm.area});await auth.refreshProfile();},'Mover profile saved.');return;}
    const w={id:uid('worker'),name:workerForm.name.trim(),area:workerForm.area,phone:workerForm.phone.replace(/\D/g,''),sample:false,skills:['Moving'],available:true,avatar:workerForm.name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()};setDb(d=>({...d,workers:[...d.workers,w],selectedWorkerId:w.id}));setWorkerForm({name:'',area:'Banasree',phone:''});notify('Worker created locally. Identity not verified.'); }
  function updateRequest(id, updater){let error='';setDb(d=>({...d,requests:d.requests.map(req=>{if(req.id!==id)return req;try{return updater(req)}catch(err){error=err.message;return req}})}));if(error)notify(error)}
  async function offer(req){if(!requireRole('mover'))return;const entered=workerQuote[req.id];const amount=Number(entered);if(!entered||!Number.isFinite(amount)||amount<100||amount>500000){notify('Enter your quotation between BDT 100 and BDT 500,000.');return;}if(!demoMode){await onlineAction(()=>repository.sendOffer(supabase,req.id,amount),'Quotation submitted. Customer can compare and select you.');return;}try{const updated=addOffer(req,activeWorker,amount);setDb(d=>({...d,requests:d.requests.map(r=>r.id===req.id?updated:r)}));notify('Quotation submitted. Customer can compare and select you.')}catch(err){notify(err.message)} }
  async function choose(req,id){if(!requireRole('renter'))return;if(!demoMode){await onlineAction(()=>repository.selectOffer(supabase,id),'Mover selected. Call before confirming the booking.');return;}try{const updated=chooseOffer(req,id);setDb(d=>({...d,requests:d.requests.map(r=>r.id===req.id?updated:r)}));notify('Worker selected. Call to confirm before final booking.')}catch(err){notify(err.message)} }
  async function removeListing(id){if(demoMode){setDb(d=>({...d,listings:d.listings.filter(x=>x.id!==id),inquiries:d.inquiries.filter(x=>x.listingId!==id)}));notify('Listing removed.');}else await onlineAction(()=>repository.archiveProperty(supabase,id),'Property unpublished. Existing inquiries are retained.');}
  async function acknowledge(inquiry){if(demoMode)setDb(d=>({...d,inquiries:d.inquiries.map(x=>x.id===inquiry.id?{...x,status:x.status==='requested'?'acknowledged':'requested'}:x)}));else await onlineAction(()=>repository.acknowledgeInquiry(supabase,inquiry),'Inquiry updated.');}
  async function setAvailability(available){if(demoMode)setDb(d=>({...d,workers:d.workers.map(w=>w.id===activeWorker.id?{...w,available}:w)}));else await onlineAction(async()=>{await repository.saveProfile(supabase,profile.id,{is_available:available});await auth.refreshProfile();},'Availability updated.');}
  async function confirmRequest(id){if(demoMode)updateRequest(id,r=>({...r,status:'confirmed'}));else await onlineAction(()=>repository.confirmBooking(supabase,id),'Booking confirmed by you after your phone call.');}
  async function declineRequest(id){if(demoMode)updateRequest(id,declineAndReopen);else await onlineAction(()=>repository.reopenRequest(supabase,id),'Request reopened. Contact is no longer shared with the declined mover.');}
  const currentListing = listing && db.listings.find(x=>x.id===listing.id);
  return <div className="app-shell">
    <div className="announcement"><Sparkles size={14}/><span>Built For Ostad Presents YUNet AIgnite Buildathon 2026</span></div>
    <header className="site-header"><div className="header-inner container"><button className="brand" onClick={()=>go('explore')} aria-label="BashaShift home"><span className="brand-logo"><House size={21} strokeWidth={2.6}/><MoveRight size={13} strokeWidth={3}/></span><span>Basha<span>Shift</span><small>Home to home, made simple.</small></span></button>
      <nav className={`top-nav ${mobileNav?'open':''}`} aria-label="Main navigation">{visibleNav.map(item=><button key={item.key} aria-label={`${item.english}${item.key==='activity'&&db.requests.length>0?` ${db.requests.length}`:''}`} className={page===item.key?'active':''} onClick={()=>go(item.key)}><span>{item.english}{item.key==='activity'&&db.requests.length>0&&<span className="count-dot">{db.requests.length}</span>}</span><small lang="bn">{item.bangla}</small></button>)}</nav>
      <div className="header-actions"><span className="demo-pill"><span className="pulse-dot"/>{demoMode?'DEMO MODE':profile?roles[profile.role]:'LIVE RENTALS'}</span>{supabase&&<div className="auth-actions"><button className="btn btn-small btn-outline" aria-label={demoMode?'Live rentals':'Try demo'} disabled={saving} onClick={()=>changeMode(!demoMode)}>{demoMode?'Live rentals / লাইভ ভাড়া':'Try demo / ডেমো দেখুন'}</button>{!demoMode&&(auth.session?<button className="btn btn-small btn-soft" aria-label="Sign out" disabled={saving} onClick={signOut}>Sign out / লগ আউট</button>:<button className="btn btn-small btn-primary" aria-label="Sign in" disabled={auth.loading} onClick={()=>setAuthDialog('renter')}>Sign in / লগ ইন</button>)}</div>}<button className="mobile-menu" onClick={()=>setMobileNav(x=>!x)} aria-label="Toggle navigation / মেনু"><Menu size={23}/></button></div></div></header>
    <main>
      {!demoMode&&<div className="container cloud-status"><span>{auth.loading?'Loading your account… / অ্যাকাউন্ট লোড হচ্ছে…':profile?`${profile.display_name} · ${roles[profile.role]}`:'Browse rentals / বাসা খুঁজুন · Sign in to manage requests / অনুরোধ পরিচালনায় লগ ইন করুন'}</span><button className="btn btn-small btn-outline" aria-label="Refresh listings / তালিকা হালনাগাদ" disabled={cloud.loading||saving} onClick={cloud.refresh}>{cloud.loading?'Loading…':'Refresh listings / তালিকা হালনাগাদ'}</button>{saving&&<span role="status">Saving… / সংরক্ষণ হচ্ছে…</span>}</div>}
      {(cloud.error||auth.error)&&!demoMode&&<div className="container"><div role="alert" className="inline-alert">{auth.error||cloud.error}</div></div>}
      {supabaseConfigurationError&&<div className="container"><div role="alert" className="inline-alert">Online accounts are unavailable on this installation. The labeled demo remains available.</div></div>}

      {page==='explore'&&<>
        <section className="hero"><div className="container hero-grid"><div className="hero-copy"><span className="hero-kicker"><span>✦</span> ONE JOURNEY. ZERO EXTRA HASSLE.</span><h1>Your next home,<br/><em>without the headache.</em></h1><p>Discover rentals, connect with owners, and arrange your move — all in one calm place built for Bangladesh.</p><div className="hero-search"><Search size={20}/><input aria-label="Search rental locations" placeholder="Try Banasree, Mirpur, Dhanmondi…" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>e.key==='Enter'&&document.getElementById('homes')?.scrollIntoView({behavior:'smooth'})}/><button className="btn btn-primary" onClick={()=>document.getElementById('homes')?.scrollIntoView({behavior:'smooth'})}>Find homes <ArrowRight size={16}/></button></div><div className="hero-highlights"><span><CheckCircle2 size={17}/> Direct owner inquiries</span><span><CheckCircle2 size={17}/> One-tap mover requests</span></div></div><div className="hero-art" aria-hidden="true"><div className="hero-orb orb-one"/><div className="hero-orb orb-two"/><div className="hero-building back"><span className="roof"/><span className="window"/><span className="window"/><span className="window"/><span className="window"/></div><div className="hero-building front"><span className="roof"/><span className="window"/><span className="window"/><span className="window"/><span className="window"/><span className="door"/></div><div className="hero-truck"><Truck size={35}/></div><div className="float-note"><span><KeyRound size={16}/></span><div><strong>Find it. Love it. Move in.</strong><small>One connected journey</small></div></div></div></div></section>
        <section className="trust-strip"><div className="container trust-inner"><div><span className="feature-circle"><Search size={21}/></span><strong>Find your fit</strong><small>Filter homes your way</small></div><div><span className="feature-circle"><MessageCircle size={21}/></span><strong>Talk to the owner</strong><small>Arrange an in-person visit</small></div><div><span className="feature-circle"><Truck size={21}/></span><strong>Move confidently</strong><small>Request & compare movers</small></div></div></section>
        <section className="container listings-section" id="homes"><SectionTitle eyebrow="EXPLORE HOMES" title="A space that feels like yours." desc={demoMode?"Start with sample listings, or publish your own property in Owner Desk.":"Browse published rentals shared by property owners."} action={<Badge tone="light">{shownListings.length} homes shown</Badge>}/><div className="filters"><div className="filter-field filter-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Area, building, keyword" aria-label="Search homes"/></div><div className="filter-field"><MapPin size={17}/><select aria-label="Area" value={area} onChange={e=>setArea(e.target.value)}><option value="">All areas</option>{areas.map(x=><option key={x}>{x}</option>)}</select></div><div className="filter-field"><Wallet size={17}/><select aria-label="Maximum monthly rent" value={maxRent} onChange={e=>setMaxRent(e.target.value)}><option value="">Any budget</option>{maxRent&&![15000,20000,25000,30000,40000].includes(Number(maxRent))&&<option value={maxRent}>Under {money(maxRent)}</option>}{[15000,20000,25000,30000,40000].map(x=><option key={x} value={x}>Under {money(x)}</option>)}</select></div><div className="filter-field"><BedDouble size={17}/><select aria-label="Minimum bedrooms" value={minBeds} onChange={e=>setMinBeds(e.target.value)}><option value="">Any bedrooms</option>{[1,2,3,4].map(x=><option key={x} value={x}>{x}+ beds</option>)}</select></div><button className="btn btn-outline clear-button" onClick={()=>{setSearch('');setArea('');setMaxRent('');setMinBeds('');setPreferences(defaultPreferences)}}><RotateCcw size={15}/> Reset</button></div>
          <p className="disclaimer"><Info size={15}/> {demoMode?'Sample homes are fictional, not available for rent. User-added listings are unverified and stored only in this browser.':'These are owner-published listings. Ownership and availability are unverified; discuss details with the owner before making plans.'}</p>
          {!demoMode&&<ApartmentPreferences value={preferences} onChange={setPreferences} maxRent={maxRent} onBudgetChange={setMaxRent}/>}
          {!demoMode&&cloud.loading&&!shownListings.length&&<p role="status">Loading rentals / বাসার তালিকা লোড হচ্ছে…</p>}
          <div className="homes-grid">{shownListings.map(x=><div className="recommended-home" key={x.id}><ListingCard listing={x} onOpen={setListing} onMove={planMove} canMove={demoMode||!profile||profile.role==='renter'} saved={saved.includes(x.id)} onSave={save}/>{!demoMode&&<ApartmentExplanation recommendation={apartmentRanking.find(row=>row.id===x.id)}/>}</div>)}</div>{shownListings.length===0&&!cloud.loading&&<Empty icon={Search} title="No matching homes / মিলে এমন বাসা নেই" description="Try a different area or adjust your rent budget. / অন্য এলাকা বা ভাড়া দিয়ে খুঁজুন।" action={<button aria-label="Clear filters" className="btn btn-soft" onClick={()=>{setArea('');setSearch('');setMaxRent('');setMinBeds('');setPreferences(defaultPreferences)}}>Clear filters / ফিল্টার মুছুন</button>}/>}</section>
        <section className="container workflow-section"><SectionTitle eyebrow="THE BASHA SHIFT WAY / আমাদের সেবা" title="From house-hunting to moving day." desc="You focus on the fresh start. We connect the steps. / নতুন শুরুটা হোক সহজ—আমরা প্রয়োজনীয় সেবার সাথে যুক্ত করি।"/><div className="workflow-grid"><div><span>01</span><Search size={24}/><h3>Find your place / বাসা খুঁজুন</h3><p>Explore listings and contact the owner about a viewing. / বাসা দেখার জন্য মালিকের সাথে যোগাযোগ করুন।</p></div><div><span>02</span><Package size={24}/><h3>Plan your move / স্থানান্তরের পরিকল্পনা</h3><p>Add furniture manually or scan a photo with live AI when configured. / আসবাবের তালিকা লিখুন বা ছবি দিয়ে যোগ করুন।</p></div><div><span>03</span><Phone size={24}/><h3>Compare & confirm / দর তুলনা ও নিশ্চিত করুন</h3><p>Independent movers send quotations; choose one and confirm by phone. / মুভাররা নিজেরা দর দেবেন—তুলনা করে একজনকে বেছে নিন।</p></div></div></section>
        {(demoMode||!profile||profile.role==='owner')&&<section className="container end-banner"><div><span className="eyebrow">HAVE A PROPERTY TO RENT? / বাসা ভাড়া দিতে চান?</span><h2>Make your empty place someone's next chapter.</h2><p>Publish an apartment with its details and photos in minutes. / বাসার তথ্য ও ছবি দিয়ে সহজেই তালিকা প্রকাশ করুন।</p></div><button className="btn btn-light" aria-label="List your property" onClick={()=>demoMode||profile?go('owner'):setAuthDialog('owner')}>List your property / বাসার তালিকা দিন <ArrowRight size={17}/></button></section>}
      </>}
      {page==='owner'&&(!demoMode&&profile?.role!=='owner'?accountGate('owner'):<OwnerWorkspace
        demoMode={demoMode} ownerTab={ownerTab} setOwnerTab={setOwnerTab} newProperty={newProperty}
        newListing={newListing} setNewListing={setNewListing} publishListing={publishListing}
        saving={saving} editingProperty={editingProperty} setEditingProperty={setEditingProperty}
        ownerImage={ownerImage} ownerListingCount={ownerListingCount} ownerListings={ownerListings}
        removeListing={removeListing} profile={profile} db={db} acknowledge={acknowledge}/>)}
      {page==='moving'&&(!demoMode&&profile?.role!=='renter'?accountGate('renter'):<section className="container workspace"><LayoutTitle title="Plan your move / স্থানান্তরের পরিকল্পনা" desc="Create one request and compare independent quotations from nearby movers. / অনুরোধ দিন এবং কাছের মুভারদের দর তুলনা করুন।" icon={Truck}/><div className="move-layout"><form className="form-panel" onSubmit={createRequest}><div className="panel-intro"><span className="eyebrow">STEP 1 OF 2 / ধাপ ১</span><h3>Where are you going? / কোথা থেকে কোথায় যাবেন?</h3><p>Only your general area is shared publicly with matching movers. / মুভাররা শুধু এলাকা দেখবেন; ফোন নম্বর গোপন থাকবে।</p></div><div className="form-grid"><SelectField label="Moving from" value={move.fromArea} options={areas} onChange={e=>setMove(s=>({...s,fromArea:e.target.value}))}/><SelectField label="Moving to" value={move.toArea} options={areas} onChange={e=>setMove(s=>({...s,toArea:e.target.value}))}/><TextField label="Moving date" type="date" min={new Date().toISOString().slice(0,10)} value={move.date} onChange={e=>setMove(s=>({...s,date:e.target.value}))}/><TextField label="Approx. distance (km)" type="number" min="0" max="500" value={move.km} onChange={e=>setMove(s=>({...s,km:e.target.value}))}/><TextField label="Current floor" type="number" min="0" max="50" value={move.fromFloor} onChange={e=>setMove(s=>({...s,fromFloor:e.target.value}))}/><TextField label="Destination floor" type="number" min="0" max="50" value={move.toFloor} onChange={e=>setMove(s=>({...s,toFloor:e.target.value}))}/></div><label className="check-control lift-check"><input type="checkbox" checked={move.hasLift} onChange={e=>setMove(s=>({...s,hasLift:e.target.checked}))}/> Working lift accessible at both buildings / দুই ভবনেই লিফট আছে</label><div className="panel-split"/><div className="panel-intro"><span className="eyebrow">YOUR FURNITURE / আপনার আসবাব</span><h3>What's coming with you? / কী কী আসবাব নেবেন?</h3><p>Adjust the quantities. The optional AI scan simply helps build this list. / পরিমাণ ঠিক করুন; ছবি দিয়ে তালিকা করাও ঐচ্ছিক।</p></div><FurnitureRecognition key={demoMode?'demo':profile?.id} prepareImage={imageToData} token={demoMode?null:auth.session?.access_token} demoMode={demoMode} onPendingChange={setAiPending} onApply={items=>{setMove(old=>({...old,items}));notify('Reviewed inventory applied. Add any missing items below.');}}/><div className="inventory-list">{furniture.map(f=>{const count=move.items.find(i=>i.name===f.key)?.qty||0;return <div className="inventory-item" key={f.key}><span>{f.label}</span><div className="stepper"><button type="button" onClick={()=>setItemQty(f.key,-1)} aria-label={`Remove ${f.label}`} disabled={!count}><Minus size={15}/></button><b>{count}</b><button type="button" onClick={()=>setItemQty(f.key,1)} aria-label={`Add ${f.label}`}><Plus size={15}/></button></div></div>})}</div><div className="panel-split"/><div className="panel-intro"><span className="eyebrow">CONTACT & NOTES</span><h3>How can movers reach you?</h3></div><div className="form-grid"><TextField label="Your name *" placeholder="Full name" value={move.customerName} onChange={e=>setMove(s=>({...s,customerName:e.target.value}))} required/><TextField label="Phone number *" placeholder="01XXXXXXXXX" value={move.customerPhone} onChange={e=>setMove(s=>({...s,customerPhone:e.target.value}))} required/></div><label className="field"><span>Notes for movers</span><textarea rows="3" className="form-control" placeholder="e.g. fridge on third floor, narrow stairs" value={move.notes} onChange={e=>setMove(s=>({...s,notes:e.target.value}))}/></label><label className="check-control consent-check"><input type="checkbox" checked={move.customerConsent} onChange={e=>setMove(s=>({...s,customerConsent:e.target.checked}))}/> I agree to share my phone number and move details with the worker I explicitly select, so we can confirm by phone.</label>{aiPending&&<p role="status" className="small muted">Review or discard your photo suggestions before publishing.</p>}<button type="submit" className="btn btn-primary btn-block" disabled={saving||aiPending}>Publish moving request <ArrowRight size={17}/></button></form>
      <aside className="quote-aside"><MovingBudget move={move} pending={aiPending}/><div className="quote-card"><span className="eyebrow">MOVER QUOTATIONS</span><h3>Move request summary</h3><div className="route-dots"><span><span className="route-point start"/>{move.fromArea}</span><span className="route-divider"/><span><span className="route-point end"/>{move.toArea}</span></div><div className="quote-row"><span>Items selected</span><strong>{move.items.reduce((s,x)=>s+x.qty,0)}</strong></div><div className="quote-row"><span>Approximate distance</span><strong>{move.km} km</strong></div><div className="quote-row"><span>Scheduled date</span><strong>{move.date||'Not set'}</strong></div><div className="quote-row"><span>Floors and access</span><strong>{move.fromFloor} → {move.toFloor} · {move.hasLift?'Lift available':'No lift'}</strong></div><p className="marketplace-note">Independent movers set their own prices. Compare their quotations and choose one before contact details are shared.</p></div><div className="help-card"><ShieldCheck size={22}/><h4>How phone confirmation works</h4><p>A mover submits a quotation, you compare and select them, then their contact is shown for the call. No upfront payment is collected.</p></div></aside></div></section>)}
      {page==='activity'&&(!demoMode&&!profile?accountGate('renter'):<section className="container workspace"><LayoutTitle title="My requests" desc="Track viewings, compare mover quotations, and confirm by phone. / বাসা দেখার অনুরোধ ও মুভারদের দর তুলনা করুন।" icon={LayoutDashboard}/><div className="dashboard-grid activity-grid"><div className="form-panel"><h3>Moving service requests / স্থানান্তরের অনুরোধ <Badge>{db.requests.length}</Badge></h3>{!db.requests.length?<Empty icon={Truck} title="No moving requests yet / কোনো অনুরোধ নেই" description="Build an inventory and publish a moving request. / আসবাবের তালিকা দিয়ে অনুরোধ প্রকাশ করুন।" action={<button aria-label="Plan a move" className="btn btn-soft" onClick={()=>go('moving')}>Plan a move / স্থানান্তরের পরিকল্পনা <ArrowRight size={15}/></button>}/>:db.requests.map(req=>{const chosen=req.offers.find(o=>o.id===req.selectedOfferId);const worker=chosen&&db.workers.find(w=>w.id===chosen.workerId);const pendingOffers=req.offers.filter(o=>o.status==='pending');return <div className="request-card" key={req.id}><div className="request-top"><div><strong>{req.fromArea} <ArrowRight size={14}/> {req.toArea}</strong><small>{req.date} · {req.items.reduce((s,x)=>s+x.qty,0)} items /টি</small></div><div><Badge tone={req.status==='confirmed'?'success':req.status==='open'?'warm':'neutral'}>{req.status==='open'?(pendingOffers.length?'Quotations received':'Waiting for mover quotations'):req.status==='awaiting_call'?'Call to confirm':req.status==='confirmed'?'Confirmed':req.status}</Badge>{req.status==='open'&&<small className="request-state-bn" lang="bn">{pendingOffers.length?'মুভারের দর পাওয়া গেছে':'মুভারের দরপত্রের অপেক্ষায়'}</small>}</div></div><div className="request-summary"><span>Mover quotations / মুভারের দর <b>{pendingOffers.length+req.offers.filter(o=>o.status==='selected').length}</b></span></div>{req.status==='open'&&<div className="offers-list">{pendingOffers.length===0?<><p className="muted small">Waiting for mover quotations.</p><small lang="bn">মুভারের দরপত্রের অপেক্ষায়</small></>:<><p className="muted small">Compare independent mover quotations and select one. / মুভারদের দর তুলনা করে একজনকে বেছে নিন।</p><QuoteComparison offers={pendingOffers} workers={db.workers} saving={saving} onChoose={id=>choose(req,id)}/></>}</div>}{(req.status==='awaiting_call'||req.status==='confirmed')&&worker&&<div className="selected-worker"><div className="selected-worker-top"><CheckCircle2 size={19}/><div><strong>{worker.name} — {money(chosen.amount)}</strong><small>{worker.sample?'Demo account; cannot make a real call.':'User-added account; identity unverified.'}</small></div></div>{phoneLink(worker.phone)?<a className="btn btn-primary btn-block" href={phoneLink(worker.phone)}><Phone size={17}/> Call mover / মুভারকে কল: {worker.phone}</a>:<div className="inline-alert"><Info size={15}/> Demo worker has no callable number. / ডেমো মুভারের নম্বর নেই।</div>}{req.status==='awaiting_call'&&<div className="dual-buttons"><button aria-label="Mark confirmed after call" className="btn btn-primary" disabled={saving} onClick={()=>confirmRequest(req.id)}><Check size={15}/> Mark confirmed after call / কলের পর নিশ্চিত করুন</button><button aria-label="Decline & reopen" className="btn btn-outline" disabled={saving} onClick={()=>declineRequest(req.id)}>Decline & reopen / প্রত্যাখ্যান করে আবার খুলুন</button></div>}{req.status==='confirmed'&&<Badge tone="success">Confirmed by customer / গ্রাহক নিশ্চিত করেছেন</Badge>}</div>}</div>})}</div>
        <div className="form-panel"><h3>Property viewing inquiries <Badge>{db.inquiries.length}</Badge></h3>{!db.inquiries.length?<Empty icon={CalendarDays} title="No viewing requests" description="Choose a rental listing and send the owner an inquiry." action={<button className="btn btn-soft" onClick={()=>go('explore')}>Explore homes</button>}/>:db.inquiries.map(i=><div className="mini-entry" key={i.id}><div><strong>{i.listingTitle}</strong><small>Viewing: {i.date}</small><small>Status: {i.status}</small></div><Badge>{i.status}</Badge></div>)}<div className="aside-tip"><Info size={17}/><span>{demoMode?'Prototype data lives only in this browser. Real cross-device messaging requires authentication and a shared database.':'Your requests are saved to your account. Use Refresh listings to load the latest responses.'}</span></div></div></div></section>)}
      {page==='worker'&&(!demoMode&&profile?.role!=='mover'?accountGate('mover'):<MoverWorkspace
        demoMode={demoMode} db={db} activeWorker={activeWorker} setDb={setDb}
        setAvailability={setAvailability} workerForm={workerForm} setWorkerForm={setWorkerForm}
        workerRegister={workerRegister} saving={saving} workerQuote={workerQuote}
        setWorkerQuote={setWorkerQuote} offer={offer} go={go}/>)}
    </main>
    <footer className="footer"><div className="container footer-grid"><div className="footer-brand"><span className="brand-logo"><House size={19}/></span><strong>BashaShift</strong><p>One calmer journey from your old home to the next.</p></div><div><strong>{demoMode?'Prototype disclosures':'Account and listing notice'}</strong><p>{demoMode?'All seeded rental listings and worker accounts are fictional. No identity verification, public messaging, or real bookings are provided by this browser-only MVP.':'Listings and requests are shared through accounts. Owners and movers remain unverified. Confirm details by phone; no payments are collected.'}</p></div><div><strong>Explore / খুঁজুন</strong>{visibleNav.map(item=><button key={item.key} aria-label={item.english} onClick={()=>go(item.key)}>{item.english} / {item.bangla}</button>) }{demoMode&&<button className="reset-demo" onClick={resetDemo}>Reset demo data</button>}</div></div><div className="container footer-bottom">{demoMode?'BashaShift · Hackathon prototype · Made for Bangladesh · No payment collected':'BashaShift · Rental to relocation · Made for Bangladesh · No payment collected'}</div></footer>
    {currentListing&&<div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Property details" onMouseDown={e=>{if(e.target===e.currentTarget)setListing(null)}}><div className="listing-modal"><button className="modal-close" onClick={()=>setListing(null)} aria-label="Close"><X size={20}/></button><PropertyArt listing={currentListing} className="modal-art"/><div className="modal-content"><div className="modal-top"><div><span className="eyebrow">{currentListing.sample?'DEMO LISTING — NOT REAL':'USER LISTING — UNVERIFIED'}</span><h2>{currentListing.title}</h2><p className="muted"><MapPin size={15}/>{currentListing.block}, {currentListing.area}, Dhaka</p></div><div className="modal-rent"><strong>{money(currentListing.rent)}</strong><small>per month</small></div></div><div className="modal-facts"><span><BedDouble size={18}/>{currentListing.beds} bedrooms</span><span><DoorOpen size={18}/>{currentListing.baths} baths</span><span><Building2 size={18}/>{currentListing.sqft} sqft</span><span><CalendarDays size={18}/>{currentListing.available}</span></div><p>{currentListing.description||'No description provided.'}</p><p className="small muted">Amenities: {['lift','balcony','parking'].filter(x=>currentListing[x]).join(' · ')||'Not specified'}. No availability or ownership verification in prototype.</p><div className="panel-split"/><h3>Request a viewing / বাসা দেখতে চান?</h3>{(!profile||profile.role==='renter'||demoMode)?<form onSubmit={requestVisit}><div className="form-grid"><TextField label="Your name" value={inquiry.name} onChange={e=>setInquiry(s=>({...s,name:e.target.value}))} required/><TextField label="Your phone" placeholder="01XXXXXXXXX" value={inquiry.phone} onChange={e=>setInquiry(s=>({...s,phone:e.target.value}))} required/><TextField label="Preferred viewing date" type="date" value={inquiry.date} onChange={e=>setInquiry(s=>({...s,date:e.target.value}))}/><TextField label="Message (optional)" placeholder="Any questions?" value={inquiry.message} onChange={e=>setInquiry(s=>({...s,message:e.target.value}))}/></div><div className="modal-actions"><button aria-label="Send inquiry" className="btn btn-primary" type="submit" disabled={saving}>Send inquiry / অনুরোধ পাঠান <ArrowRight size={16}/></button>{(!profile||profile.role==='renter')&&!currentListing.sample&&phoneLink(currentListing.ownerPhone)&&<a aria-label="Call owner" className="btn btn-outline" href={phoneLink(currentListing.ownerPhone)}><Phone size={16}/> Call owner / মালিককে কল</a>}{(demoMode||!profile||profile.role==='renter')&&<button aria-label="Plan move here" className="btn btn-soft" type="button" onClick={()=>planMove(currentListing)}><Truck size={16}/> Plan move here / এখানে স্থানান্তর</button>}</div></form>:<p className="muted small">Viewing requests are for renter accounts. / বাসা দেখার অনুরোধ শুধু ভাড়াটিয়ারা পাঠাতে পারবেন</p>}{currentListing.sample&&<p className="muted small">No real owner is associated with this listing. / ডেমো বাসার কোনো প্রকৃত মালিক নেই</p>}</div></div></div>}
    {authDialog&&supabase&&!demoMode&&<AuthModal client={supabase} initialRole={authDialog==='reset'?'renter':authDialog} initialMode={authDialog==='reset'?'reset':'login'} onAuthenticated={authenticatedAs} onClose={()=>setAuthDialog(null)}/>}
    {toast&&<div role="status" className="toast"><Info size={17}/>{toast}<button onClick={()=>setToast('')} aria-label="Dismiss"><X size={15}/></button></div>}
  </div>;
}
export default App;
