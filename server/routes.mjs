import {ScanError} from './ai.mjs';
import {routingArea,routingAreas} from './routing-areas.mjs';
import {validRoadGeometry} from '../src/lib/routes.js';
export const DIRECTIONS_URL='https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson';
const unavailable=()=>new ScanError(503,'route_unavailable','Driving distance is unavailable. Enter distance manually.');
export function parseDrivingRoute(data,from,to){
  const feature=data?.type==='FeatureCollection'&&data.features?.[0];
  const meters=feature?.properties?.summary?.distance,geometry=feature?.geometry;
  if(!Number.isFinite(meters)||meters<1||meters>500000||!validRoadGeometry(geometry))throw new ScanError(502,'invalid_route','Driving distance could not be verified. Enter distance manually.');
  const points=geometry.coordinates;
  const radians=value=>value*Math.PI/180;
  const a=points[0],b=points.at(-1);
  const haversine=Math.sin(radians(b[1]-a[1])/2)**2+Math.cos(radians(a[1]))*Math.cos(radians(b[1]))*Math.sin(radians(b[0]-a[0])/2)**2;
  // A plausibility bound only; the returned road distance always comes from
  // the provider's meter summary, never from this straight-line calculation.
  const directMeters=12742000*Math.asin(Math.sqrt(Math.min(1,haversine)));
  if(directMeters<1||meters<directMeters*.85)throw new ScanError(502,'invalid_route','Driving distance could not be verified. Enter distance manually.');
  for(const [point,name] of [[points[0],from],[points.at(-1),to]]){
    const center=routingAreas[name].coordinates;
    if(Math.abs(point[0]-center[0])>.02||Math.abs(point[1]-center[1])>.02)throw new ScanError(502,'invalid_route','The route did not match the selected areas. Enter distance manually.');
  }
  return {from,to,distanceKm:Number((meters/1000).toFixed(3)),geometry:{type:'LineString',coordinates:points.map(point=>[...point])},source:'heigit',approximate:true};
}
export function createDrivingRouter({env,fetchImpl,clock=Date.now,timeoutMs=8000}){
  const cache=new Map(),inflight=new Map();
  return async function route(rawFrom,rawTo){
    const from=routingArea(rawFrom),to=routingArea(rawTo);
    if(!from||!to)throw new ScanError(400,'unsupported_area','Choose supported neighborhoods, or enter distance manually for Other.');
    if(from===to)throw new ScanError(422,'same_area','Both addresses are in the same neighborhood. Enter their approximate distance manually.');
    if(!env.HEIGIT_API_KEY?.trim())throw new ScanError(503,'routing_not_configured','Automatic driving distance is not configured. Enter distance manually.');
    const key=from+'|'+to;
    for(const [id,entry] of cache)if(entry.expires<=clock())cache.delete(id);
    if(cache.has(key))return cache.get(key).route;
    if(inflight.has(key))return inflight.get(key);
    if(inflight.size>=2)throw new ScanError(503,'routing_busy','Driving routes are busy. Enter distance manually or retry shortly.');
    const pending=Promise.resolve().then(async()=>{
      try{
        const response=await fetchImpl(DIRECTIONS_URL,{method:'POST',redirect:'error',headers:{Authorization:env.HEIGIT_API_KEY,'Content-Type':'application/json',Accept:'application/geo+json, application/json'},
          body:JSON.stringify({coordinates:[routingAreas[from].coordinates,routingAreas[to].coordinates],instructions:false}),signal:AbortSignal.timeout(timeoutMs)});
        if(!response.ok)throw unavailable();
        if(!/^application\/(?:geo\+)?json\b/i.test(response.headers.get('content-type')||''))throw new ScanError(502,'invalid_route','Driving distance could not be read. Enter distance manually.');
        const reader=response.body.getReader();let bytes=0;const parts=[];
        try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1024*1024)throw new Error('Oversized route');parts.push(value);}}
        catch(error){await reader.cancel().catch(()=>{});throw error;}
        const raw=Buffer.concat(parts).toString('utf8');
        const route=parseDrivingRoute(JSON.parse(raw),from,to);
        if(cache.size>=72)cache.delete(cache.keys().next().value);
        cache.set(key,{route,expires:clock()+300000});return route;
      }catch(error){
        if(error instanceof ScanError)throw error;
        if(error?.name==='TimeoutError'||error?.name==='AbortError')throw new ScanError(504,'route_timeout','Driving distance took too long. Enter distance manually.');
        throw new ScanError(502,'invalid_route','Driving distance could not be verified. Enter distance manually.');
      }finally{inflight.delete(key);}
    });
    inflight.set(key,pending);return pending;
  };
}
