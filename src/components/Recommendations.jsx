import { useState } from 'react';
import { areas } from '../data.js';
import { facilities, rankMoverOffers } from '../lib/recommendations.js';
import { money } from '../domain.js';

export const defaultPreferences = {required:[],optional:[],preferredArea:'',priority:'balanced'};
const labels = {lift:'Lift / লিফট',parking:'Parking / পার্কিং',balcony:'Balcony / বারান্দা'};
export function ApartmentPreferences({value,onChange,maxRent,onBudgetChange}) {
  const toggle = (kind,key) => onChange(old=>({...old,[kind]:old[kind].includes(key)?old[kind].filter(x=>x!==key):[...old[kind],key]}));
  return <section className="guidance-panel" aria-label="Apartment preferences">
    <h3>Find your fit / আপনার পছন্দের বাসা</h3>
    <p className="small">Budget, area filter, bedrooms and required facilities are hard limits. Partial matches miss only optional preferences. / আবশ্যিক শর্ত শিথিল করা হবে না; আংশিক মিল শুধু ঐচ্ছিক পছন্দে।</p>
    <div className="guidance-fields"><label className="field"><span>Exact maximum budget / সর্বোচ্চ মাসিক ভাড়া</span><input aria-label="Exact maximum budget" className="form-control" type="number" min="1" max="10000000" value={maxRent} onChange={e=>onBudgetChange(e.target.value)}/></label>
      <label className="field"><span>Preferred area (optional) / পছন্দের এলাকা</span><select className="form-control" aria-label="Preferred area" value={value.preferredArea} onChange={e=>onChange(old=>({...old,preferredArea:e.target.value}))}><option value="">No preference / যেকোনো</option>{areas.map(area=><option key={area}>{area}</option>)}</select></label>
      <label className="field"><span>Priority / অগ্রাধিকার</span><select className="form-control" aria-label="Apartment priority" value={value.priority} onChange={e=>onChange(old=>({...old,priority:e.target.value}))}><option value="balanced">Balanced / ভারসাম্য</option><option value="affordability">Affordability / কম ভাড়া</option><option value="facilities">Optional facilities / সুবিধা</option><option value="area">Preferred area / এলাকা</option></select></label></div>
    <fieldset><legend>Required facilities / আবশ্যিক সুবিধা</legend><div className="check-row">{facilities.map(key=><label key={key} className="check-control"><input type="checkbox" checked={value.required.includes(key)} onChange={()=>toggle('required',key)}/>{labels[key]} required</label>)}</div></fieldset>
    <fieldset><legend>Optional facilities / ঐচ্ছিক সুবিধা</legend><div className="check-row">{facilities.map(key=><label key={key} className="check-control"><input type="checkbox" checked={value.optional.includes(key)} onChange={()=>toggle('optional',key)}/>{labels[key]} preferred</label>)}</div></fieldset>
    <p className="small muted">Preference/value score measures your stated preferences and budget headroom. It is not apartment quality or verified reliability. Listings are unverified. / স্কোরটি আপনার পছন্দ ও বাজেটের হিসাব; এটি বাসার মান বা যাচাইকৃত নির্ভরযোগ্যতা নয়। তালিকা যাচাই করা হয়নি।</p>
  </section>;
}
export function ApartmentExplanation({recommendation}) {
  return <div className="recommendation-explanation">
    {recommendation.meetsRequiredCriteria&&<strong className="required-criteria-status">Meets all required criteria / সব আবশ্যিক শর্ত পূরণ</strong>}
    <p className="preference-score">{recommendation.match==='exact'
      ? 'All selected preferences match / বাছাই করা পছন্দের সবগুলো মিলে গেছে'
      : 'Some selected preferences do not match / বাছাই করা কিছু পছন্দ মেলেনি'}
      {recommendation.score!==null&&<> · Preference/value score / পছন্দ ও বাজেটের স্কোর: {recommendation.score}/100</>}
    </p>
    {recommendation.budgetRemaining!==null&&<p className="budget-headroom">
      Budget headroom / বাজেটের বাকি: {money(recommendation.budgetRemaining)} below budget limit / সর্বোচ্চ ভাড়ার চেয়ে {money(recommendation.budgetRemaining)} কম
    </p>}
    <ul>{recommendation.explanations.map(text=><li key={text}>{text}</li>)}</ul>
    {recommendation.score!==null&&<details><summary>Why this score? / হিসাব দেখুন</summary><p>Preference/value score is a weighted average of available dimensions: affordability {recommendation.weights.affordability}%, optional facilities {recommendation.weights.facilities}%, preferred area {recommendation.weights.area}%. Weights are re-normalized when a dimension is not requested. Affordability = (budget − rent) / budget; facilities = matched / requested; area = 1 for a match, otherwise 0. This score is not apartment quality or verified reliability. / স্কোরটি শুধু আপনার দেওয়া পছন্দ ও বাজেটের হিসাব; বাসার মান বা যাচাইকৃত নির্ভরযোগ্যতা নয়।</p></details>}
  </div>;
}
export function QuoteComparison({offers,workers,onChoose,saving}) {
  const [priority,setPriority] = useState('affordability');
  const ranked = rankMoverOffers(offers,priority);
  return <section className="quotation-guidance" aria-label="Quotation comparison">
    <label className="field"><span>Compare by / তুলনার অগ্রাধিকার</span><select className="form-control" aria-label="Quotation priority" value={priority} onChange={e=>setPriority(e.target.value)}><option value="affordability">Affordability / কম খরচ</option><option value="reliability">Verified reliability / যাচাইকৃত নির্ভরযোগ্যতা</option></select></label>
    <p className="small muted">Guidance, not a guarantee. Choose any offer. / পরামর্শ, নিশ্চয়তা নয়; সিদ্ধান্ত আপনার। No verified reviews are available; reliability cannot be ranked. / যাচাইকৃত রিভিউ নেই।</p>
    {!ranked.length?<p>No valid pending quotations / বৈধ দর এখনো নেই</p>:ranked.map(row=>{
      const offer=offers.find(o=>o.id===row.id), worker=workers.find(w=>w.id===offer.workerId);
      return <div className="offer" key={row.id}><div><strong>{worker?.name||'Independent mover / স্বতন্ত্র মুভার'}</strong><small>{worker?.sample?'Demo mover / ডেমো মুভার':`Service area / কাজের এলাকা: ${worker?.area||'Not specified / উল্লেখ নেই'}`}</small>
        <small className="offer-rating">No reviews yet / এখনো রিভিউ নেই</small>
        {row.recommended&&<strong className="small">Lowest quoted price / সর্বনিম্ন দর{ranked.length===1?' · Only offer / একমাত্র দর':''}</strong>}
        <small>{row.difference===0?'At lowest quote / সর্বনিম্ন দরে':`${money(row.difference)} above lowest / সর্বনিম্ন দরের চেয়ে বেশি`}</small>
      </div><div><strong>{money(row.amount)}</strong><button aria-label="Choose" className="btn btn-small btn-primary" disabled={saving} onClick={()=>onChoose(row.id)}>Choose / বেছে নিন</button></div></div>;
    })}
    {!!ranked.length&&<p className="small">{ranked[0].explanation}. Price score = lowest / quote × 100. Services such as packing, vehicle size and helpers are unspecified; a higher price alone does not prove better service. Confirm scope before booking. / প্যাকিং, গাড়ি ও কর্মীর সংখ্যা উল্লেখ নেই; বেশি দর মানেই ভালো সেবা নয়।</p>}
  </section>;
}
