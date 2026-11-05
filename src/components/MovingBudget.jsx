import { useState } from 'react';
import { calculateMovingBudget, effortUnits } from '../lib/pricing.js';
import { money } from '../domain.js';

// Invented planning assumptions only. Independent movers still choose their own quotation.
const demoAssumptions={base:850,perKm:45,perUnit:150,perFloorUnit:20,workload:1,margin:20};
const fields=[
  ['base','Base (BDT)',0,100000],['perKm','Per km (BDT)',0,100000],
  ['perUnit','Per effort unit (BDT)',0,100000],['perFloorUnit','Per stair-floor × unit (BDT)',0,100000],
  ['workload','Workload multiplier',0.5,3],['margin','Range ± %',1,80],
];
export default function MovingBudget({move,pending=false,mover=false}) {
  const [assumptions,setAssumptions]=useState(()=>({...demoAssumptions}));
  const budget=calculateMovingBudget(move,assumptions);
  const content=<>
    <p className="small muted">{move.items.reduce((sum,item)=>sum+Number(item.qty||0),0)} items · {move.km} km · Floors {move.fromFloor} → {move.toFloor} · {move.hasLift?'Lift at both ends':'Stairs'}</p>
    {pending?<p role="status" className="budget-pending">Review or discard photo suggestions to update the range.</p>:budget?<div role="status" className="budget-result">
      <strong className="budget-range">{money(budget.low)}–{money(budget.high)}</strong><span>Illustrative planning range</span>
    </div>:<p role="status" className="small">Add furniture and valid distance/floors to see a range. Check any edited assumptions.</p>}
    <p className="small budget-disclosure">Demo assumptions, not verified market rates or a guaranteed quote. Movers set their own final price.</p>
    <details className="budget-calculation"><summary>How calculated · Edit assumptions</summary>
      <div className="guidance-fields">{fields.map(([key,label,min,max])=><label className="field" key={key}><span>{label}</span>
        <input className="form-control" aria-label={label} type="number" min={min} max={max} step={key==='workload'?'0.1':'1'} value={assumptions[key]}
          onChange={event=>setAssumptions(old=>({...old,[key]:event.target.value}))}/></label>)}</div>
      <p className="small">Base + distance × per-km + effort units × workload × (handling rate + stair floors × stair rate). Range = total ± {assumptions.margin}%.</p>
      {budget&&<p className="small">Base {money(budget.parts.base)} + distance {money(budget.parts.distance)} + handling {money(budget.parts.handling)} + stairs {money(budget.parts.stairs)}.</p>}
      <p className="small">Effort units: {Object.entries(effortUnits).map(([name,units])=>`${name} ${units}`).join(' · ')}. These are planning units, not measured weights.</p>
      <p className="small">Ground floor = 0. The request’s lift setting applies at both ends. Workload 1 assumes ordinary access; adjust for packing or narrow stairs. Tolls, tax and special handling are excluded unless included in your assumptions.</p>
    </details>
    {mover&&<p className="small">Your quotation stays under your control; this helper never fills or changes it.</p>}
  </>;
  return <section data-planning-only className={`guidance-panel moving-budget ${mover?'mover-budget':''}`} aria-label={mover?'Mover pricing assistant':'Illustrative moving budget'}>
    {mover?<details><summary>Optional pricing helper <small lang="bn">দর হিসাব</small></summary>{content}</details>:<><span className="eyebrow">PLANNING ESTIMATE</span><h4>Your moving budget <small lang="bn">আনুমানিক খরচ</small></h4>{content}</>}
  </section>;
}
