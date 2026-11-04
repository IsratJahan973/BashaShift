import { useState } from 'react';
import { calculateMovingBudget, effortUnits } from '../lib/pricing.js';
import { money } from '../domain.js';

const fields = [
  ['base','Base / প্রাথমিক খরচ (BDT)',0,100000],
  ['perKm','Per km / প্রতি কিমি (BDT)',0,100000],
  ['perUnit','Per effort unit / শ্রম একক (BDT)',0,100000],
  ['perFloorUnit','Per stair-floor × effort unit / সিঁড়ি একক (BDT)',0,100000],
  ['workload','Workload multiplier / শ্রমের গুণক',0.5,3],
  ['margin','Range ± % / সীমা',1,80],
];
export default function MovingBudget({ move, pending = false, mover = false }) {
  const [assumptions,setAssumptions] = useState({base:'',perKm:'',perUnit:'',perFloorUnit:'',workload:1,margin:20});
  const budget = calculateMovingBudget(move,assumptions);
  return <section className="guidance-panel" aria-label={mover?'Mover pricing assistant':'Illustrative moving budget'}>
    <h4>{mover?'Optional pricing helper / ঐচ্ছিক দর সহায়তা':'Illustrative moving budget / আনুমানিক মুভিং বাজেট'}</h4>
    <p className="small">{move.items.reduce((sum,i)=>sum+Number(i.qty||0),0)} items /টি · {move.km} km · Floors / তলা {move.fromFloor} → {move.toFloor} · {move.hasLift?'Lift at both ends assumed / দুই বাসায় লিফট ধরা হয়েছে':'No lift at either end / দুই বাসায় লিফট নেই'}</p>
    <p className="small muted">Enter your own cost assumptions below. No verified market rates. / নিজের খরচের ধারণা দিন; এগুলো যাচাইকৃত বাজারদর নয়।</p>
    <details><summary>Cost assumptions & formula / খরচের হিসাব</summary>
      <div className="guidance-fields">{fields.map(([key,label,min,max])=><label className="field" key={key}><span>{label}</span><input className="form-control" aria-label={label} type="number" min={min} max={max} step={key==='workload'?'0.1':'1'} value={assumptions[key]} onChange={e=>setAssumptions(old=>({...old,[key]:e.target.value}))}/></label>)}</div>
      <p className="small">Base + km × per-km + effort units × workload × (handling rate + stair floors × stair rate). Range = total ± selected %. / মোটের উপর আপনার দেওয়া সীমা।</p>
      <p className="small">Planning units / শ্রম একক: {Object.entries(effortUnits).map(([name,units])=>`${name} ${units}`).join(' · ')}. These are rough effort assumptions, not weight measurements. / এগুলো ওজনের মাপ নয়।</p>
      <p className="small">Ground floor = 0. Working lifts remove stair effort. Both ends use the request’s lift setting. Workload 1 = ordinary access; increase for packing, disassembly or narrow access. Parking, tolls, tax and special handling are excluded unless included in your assumptions. / অতিরিক্ত সেবা আলাদা করে আলোচনা করুন।</p>
    </details>
    {pending?<p role="status">Review or discard photo suggestions first / আগে ছবি থেকে পাওয়া তালিকা যাচাই করুন।</p>:budget?<div role="status"><strong>{money(budget.low)}–{money(budget.high)} · Illustrative / শুধু ধারণা</strong><p className="small">{budget.units} effort units · {budget.stairs} stair floors · Base {money(budget.parts.base)} + distance {money(budget.parts.distance)} + handling {money(budget.parts.handling)} + stairs {money(budget.parts.stairs)}</p></div>:<p role="status" className="small">Add inventory and complete valid cost assumptions to see a range. / তালিকা ও খরচের ধারণা পূরণ করুন।</p>}
    <p className="small muted">Guidance only, never a guaranteed quotation. Movers set their own final price. / নিশ্চয়তা নয়; মুভার নিজের চূড়ান্ত দর দেবেন। {mover?'Your quotation is never filled or changed automatically. / আপনার দর স্বয়ংক্রিয়ভাবে বদলাবে না।':''}</p>
  </section>;
}
