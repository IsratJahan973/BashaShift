import { Children, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

const labels=['Route & date','Furniture · Scan with AI','Estimate & submit'];

export default function MovingSteps({children,onSubmit,pending,items}) {
  const [step,setStep]=useState(0),[error,setError]=useState('');
  const form=useRef(null),heading=useRef(null);
  const panels=Children.toArray(children);
  function select(next){
    setStep(next);setError('');
    requestAnimationFrame(()=>heading.current?.focus());
  }
  function validate(until){
    for(let index=0;index<=until;index++){
      const panel=form.current.querySelector(`[data-move-step="${index}"]`);
      const invalid=[...panel.querySelectorAll('input,select,textarea')].find(input=>!input.closest('[data-planning-only]')&&!input.checkValidity());
      if(invalid){select(index);requestAnimationFrame(()=>invalid.reportValidity());return false;}
    }
    if(until>=1&&(pending||!items.some(item=>item.qty>0))){
      select(1);setError(pending?'Review or discard the photo suggestions first.':'Add at least one furniture item.');return false;
    }
    return true;
  }
  function advance(){if(validate(step))select(step+1);}
  function submit(event){
    event.preventDefault();
    if(step<2){advance();return;}
    if(validate(2))onSubmit(event);
  }
  return <form ref={form} className="form-panel moving-steps" noValidate onSubmit={submit}>
    <ol className="step-nav" aria-label="Moving steps">{labels.map((label,index)=><li key={label}>
      <button type="button" aria-current={step===index?'step':undefined} disabled={index>step}
        onClick={()=>select(index)}><span>{index<step?<Check size={15}/>:index+1}</span>{label}</button>
    </li>)}</ol>
    <div className="step-heading"><span className="eyebrow">Step {step+1} of 3</span>
      <h3 ref={heading} tabIndex="-1">{labels[step]}</h3></div>
    {panels.map((panel,index)=><section key={index} data-move-step={index} hidden={step!==index}>{panel}</section>)}
    {error&&<p role="alert" className="inline-alert">{error}</p>}
    <div className="step-actions">
      {step>0&&<button type="button" className="btn btn-outline" aria-label="Previous step" onClick={()=>select(step-1)}><ArrowLeft size={16}/> Back</button>}
      {step<2&&<button type="button" className="btn btn-primary" disabled={step===1&&pending} onClick={advance}
        aria-label={step===0?'Continue to furniture':'Continue to estimate'}>{step===0?'Continue to furniture':'See estimate'}<ArrowRight size={16}/></button>}
    </div>
  </form>;
}
