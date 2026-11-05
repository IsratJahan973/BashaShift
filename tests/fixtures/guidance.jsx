// Synthetic browser fixtures only; never included in the production entry point.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApartmentPreferences, ApartmentExplanation, QuoteComparison, defaultPreferences } from '../../src/components/Recommendations.jsx';
import MovingBudget from '../../src/components/MovingBudget.jsx';
import FurnitureRecognition from '../../src/components/FurnitureRecognition.jsx';
import { rankApartments } from '../../src/lib/recommendations.js';
import { chooseOffer } from '../../src/domain.js';
import '../../src/styles.css';
const properties=[{id:'a',title:'Test apartment A',status:'published',rent:20000,beds:2,area:'Banasree',lift:true,parking:false,balcony:true},{id:'b',title:'Test apartment B',status:'published',rent:15000,beds:2,area:'Mirpur',lift:false,parking:true,balcony:false}];
const move={items:[{name:'Bed',qty:2},{name:'Boxes',qty:4}],km:10,fromFloor:2,toFloor:3,hasLift:false};
const workers=[{id:'a',name:'Test mover A',area:'Banasree'},{id:'b',name:'Test mover B',area:'Banasree'}];
const offers=[{id:'a',workerId:'a',status:'pending',amount:2000},{id:'b',workerId:'b',status:'pending',amount:3000}];
function Harness(){
  const [preferences,setPreferences]=useState(defaultPreferences),[budget,setBudget]=useState('20000');
  const [request,setRequest]=useState({status:'open',offers}),[inventory,setInventory]=useState(move.items),[pending,setPending]=useState(false);
  const ranked=rankApartments(properties,{...preferences,maxBudget:budget});
  return <main className="container"><h1>Test fixtures / পরীক্ষার তথ্য</h1>
    <label>Maximum monthly rent<input aria-label="Maximum monthly rent" className="form-control" type="number" value={budget} onChange={event=>setBudget(event.target.value)}/></label>
    <ApartmentPreferences value={preferences} onChange={setPreferences}/>
    <div aria-label="Ranked apartments">{ranked.map(row=><article key={row.id}><h3>{properties.find(p=>p.id===row.id).title}</h3><ApartmentExplanation recommendation={row}/></article>)}</div>
    {request.status==='open'?<QuoteComparison offers={request.offers} workers={workers} onChoose={id=>setRequest(old=>chooseOffer(old,id))}/>:<p role="status">Selected: {request.selectedOfferId}; statuses: {request.offers.map(o=>o.status).join(',')}</p>}
    <FurnitureRecognition demoMode token={null} onPendingChange={setPending} onApply={setInventory} prepareImage={file=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(file);})}/>
    <p aria-label="Approved inventory">{inventory.map(i=>`${i.name} ${i.qty}`).join(', ')}</p>
    <MovingBudget move={{...move,items:inventory}} pending={pending}/><MovingBudget move={move} mover/>
    <label>Independent quotation<input aria-label="Independent quotation" type="number" defaultValue="4500"/></label>
  </main>;
}
createRoot(document.getElementById('root')).render(<Harness/>);
