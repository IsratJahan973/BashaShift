import { useState } from 'react';
import { areas } from '../data.js';
import { facilities, rankMoverOffers } from '../lib/recommendations.js';
import { money } from '../domain.js';

export const defaultPreferences = {required:[],optional:[],preferredArea:'',priority:'balanced'};
const labels = {lift:'Lift / লিফট',parking:'Parking / পার্কিং',balcony:'Balcony / বারান্দা'};
export function ApartmentPreferences({value,onChange}) {
  const toggle=(kind,key)=>onChange(old=>({...old,[kind]:old[kind].includes(key)?old[kind].filter(x=>x!==key):[...old[kind],key]}));
  return <details className="guidance-panel apartment-preferences" aria-label="Apartment preferences">
    <summary>More preferences{value.required.length+value.optional.length>0&&<span> · {value.required.length+value.optional.length} selected</span>}</summary>
    <p className="small muted">Required filters stay firm. Optional preferences help order the matches.</p>
    <div className="guidance-fields"><label className="field"><span>Preferred area (optional)</span>
      <select className="form-control" aria-label="Preferred area" value={value.preferredArea} onChange={e=>onChange(old=>({...old,preferredArea:e.target.value}))}><option value="">No preference</option>{areas.map(area=><option key={area}>{area}</option>)}</select></label>
      <label className="field"><span>Sort priority</span><select className="form-control" aria-label="Apartment priority" value={value.priority} onChange={e=>onChange(old=>({...old,priority:e.target.value}))}><option value="balanced">Balanced</option><option value="affordability">Affordability</option><option value="facilities">Optional facilities</option><option value="area">Preferred area</option></select></label></div>
    {[['required','Required facilities'],['optional','Nice to have']].map(([kind,title])=><fieldset key={kind}><legend>{title}</legend><div className="check-row">{facilities.map(key=><label key={key} className="check-control"><input type="checkbox" aria-label={labels[key]+(kind==='required'?' required':' preferred')} checked={value[kind].includes(key)} onChange={()=>toggle(kind,key)}/>{labels[key].split(' / ')[0]}<small lang="bn">{labels[key].split(' / ')[1]}</small></label>)}</div></fieldset>)}
    <p className="small muted">Matches use your filters and listed details. Listings remain unverified.</p>
  </details>;
}
export function ApartmentExplanation({recommendation,listing}) {
  const reasons=[];
  if(recommendation.budgetRemaining!==null)reasons.push('Within budget · '+money(recommendation.budgetRemaining)+' remaining');
  if(recommendation.components.area!==null)reasons.push(recommendation.components.area===1?'Preferred area':'Outside preferred area');
  if(reasons.length<2&&listing)reasons.push(listing.area,listing.beds+' bedrooms');
  if(reasons.length<2&&recommendation.components.facilities!==null)reasons.push(recommendation.components.facilities===1?'All optional facilities listed':'Some optional facilities missing');
  return <div className="recommendation-explanation">
    {recommendation.meetsRequiredCriteria&&<strong className="required-criteria-status">Matches your requirements</strong>}
    <span className={recommendation.match==='exact'?'match-status exact':'match-status partial'}>{recommendation.match==='exact'?'Exact preference match':'Partial preference match'}</span>
    <ul className="match-reasons">{reasons.slice(0,2).map(reason=><li key={reason}>{reason}</li>)}</ul>
    <details><summary>Why this match?</summary>
      <p>All required filters match. Optional preferences determine exact or partial matches.</p>
      {recommendation.budgetRemaining!==null&&<p>Budget headroom: {money(recommendation.budgetRemaining)} below your limit.</p>}
      {!!recommendation.explanations.length&&<ul>{recommendation.explanations.map(text=><li key={text}>{text}</li>)}</ul>}
      {recommendation.score!==null&&<p>Preference/value score: {recommendation.score}/100. Weighted dimensions: affordability {recommendation.weights.affordability}%, facilities {recommendation.weights.facilities}%, area {recommendation.weights.area}%. Unrequested dimensions are omitted. Affordability = (budget − rent) / budget; facilities = matched / requested; area = 1 for a match, otherwise 0.</p>}
      <p>This is deterministic matching of listed details, not AI, apartment quality, or ownership verification.</p>
    </details>
  </div>;
}
export function QuoteComparison({offers,workers,onChoose,saving}) {
  const [priority,setPriority] = useState('affordability');
  const ranked = rankMoverOffers(offers,priority);
  return <section className="quotation-guidance" aria-label="Quotation comparison">
    <label className="field"><span>Compare quotes</span><select className="form-control" aria-label="Quotation priority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="affordability">Lowest price</option><option value="reliability">Verified reliability</option></select></label>
    <p className="small muted">Guidance only. Choose any offer; verified reliability data is unavailable.</p>
    {!ranked.length?<p>No valid pending quotations / বৈধ দর এখনো নেই</p>:ranked.map(row=>{
      const offer=offers.find(o=>o.id===row.id), worker=workers.find(w=>w.id===offer.workerId);
      return <div className="offer" key={row.id}><div><strong>{worker?.name||'Independent mover / স্বতন্ত্র মুভার'}</strong><small>{worker?.sample?'Demo mover / ডেমো মুভার':`Service area / কাজের এলাকা: ${worker?.area||'Not specified / উল্লেখ নেই'}`}</small>
        <small className="offer-rating">No reviews yet / এখনো রিভিউ নেই</small>
        {row.recommended&&<strong className="small">Lowest quote{ranked.length===1?' · Only offer':''}</strong>}
        <small>{row.difference===0?'At the lowest quote':`${money(row.difference)} above the lowest quote`}</small>
      </div><div><strong>{money(row.amount)}</strong><button aria-label="Choose" className="btn btn-small btn-primary" disabled={saving} onClick={()=>onChoose(row.id)}>Choose</button></div></div>;
    })}
    {!!ranked.length&&<details className="quote-explanation"><summary>Compare prices & services</summary><p className="small">{ranked[0].explanation}. Price score = lowest / quote × 100. Packing, vehicle size and helpers are unspecified. Confirm scope before booking; a higher price does not prove better service.</p></details>}
  </section>;
}
