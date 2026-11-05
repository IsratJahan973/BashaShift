import {useEffect,useRef,useState} from 'react';
import {fetchDrivingRoute} from '../lib/routes.js';
import RouteMap from './RouteMap.jsx';

export default function RouteDistance({move,setMove,token}){
  const [state,setState]=useState({status:'loading',route:null,message:''}),[retry,setRetry]=useState(0),[mapOpen,setMapOpen]=useState(false);
  const sequence=useRef(0),request=useRef(null),input=useRef(null),force=useRef(false);
  const from=move.fromArea,to=move.toArea,pair=from+'|'+to;
  const patch=fields=>setMove(old=>old.fromArea===from&&old.toArea===to?{...old,...fields}:old);
  useEffect(()=>{
    const id=++sequence.current,controller=new AbortController();request.current=controller;setMapOpen(false);
    if(!force.current&&move.distanceSource==='manual'&&move.distanceFor===pair){setState({status:'manual',route:null,message:''});return()=>controller.abort();}
    force.current=false;
    patch({km:'',distanceSource:null,distanceFor:pair});
    setState({status:'loading',route:null,message:'Calculating driving distance…'});
    fetchDrivingRoute({from,to,token,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(11000)])}).then(route=>{
      if(sequence.current!==id||controller.signal.aborted)return;
      patch({km:route.distanceKm,distanceSource:'heigit',distanceFor:pair});setState({status:'success',route,message:''});
    }).catch(error=>{
      if(sequence.current!==id||controller.signal.aborted)return;
      setState({status:'error',route:null,message:error.name==='TimeoutError'?'Driving distance took too long. Enter distance manually.':error.message});
    });
    return()=>{++sequence.current;controller.abort();};
  },[from,to,token,retry]);
  function manual(value){
    ++sequence.current;request.current?.abort();patch({km:value,distanceSource:'manual',distanceFor:pair});
    setState({status:'manual',route:null,message:''});setMapOpen(false);
  }
  return <div className="route-distance">
    <label className="field"><span>Approx. distance (km)</span><small lang="bn">আনুমানিক সড়ক দূরত্ব</small>
      <input ref={input} className="form-control" aria-label="Approx. distance (km)" aria-describedby="route-distance-status" type="number" min="0" max="500" step="any" required value={move.km} onChange={event=>manual(event.target.value)}/>
    </label>
    <p id="route-distance-status" className="small muted" role="status">{state.status==='loading'?state.message:state.status==='success'?`Approximate driving distance: ${state.route.distanceKm} km · HeiGIT/openrouteservice`:state.status==='manual'?'Manual distance — not verified by a routing service.':state.message}</p>
    <div className="route-actions">
      {state.status!=='manual'&&<button type="button" className="btn btn-small btn-outline" onClick={()=>{manual(move.km);input.current?.focus();}}>Enter distance manually</button>}
      {state.status!=='loading'&&<button type="button" className="btn btn-small btn-soft" onClick={()=>{force.current=true;setRetry(value=>value+1);}}>Use road distance</button>}
    </div>
    {state.route&&<details className="route-map-disclosure" onToggle={event=>setMapOpen(event.currentTarget.open)}>
      <summary>View route</summary>
      <p className="small">Approximate road route between area centers; exact pickup and delivery may differ.</p>
      {mapOpen&&<RouteMap route={state.route}/>}
    </details>}
  </div>;
}
