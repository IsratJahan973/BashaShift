const coordinate=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&point[0]>=90.1&&point[0]<=90.7&&point[1]>=23.5&&point[1]<=24.1;
export function validRoadGeometry(geometry){
  return geometry?.type==='LineString'&&Array.isArray(geometry.coordinates)&&geometry.coordinates.length>=2&&geometry.coordinates.length<=10000&&geometry.coordinates.every(coordinate);
}
export function validateDrivingRoute(data,from,to){
  if(data?.source!=='heigit'||data.approximate!==true||typeof data.from!=='string'||typeof data.to!=='string'||data.from.toLowerCase()!==from.trim().toLowerCase()||data.to.toLowerCase()!==to.trim().toLowerCase()||!Number.isFinite(data.distanceKm)||data.distanceKm<=0||data.distanceKm>500||!validRoadGeometry(data.geometry))throw new Error('Driving distance could not be verified. Enter distance manually.');
  return {source:'heigit',approximate:true,from:data.from,to:data.to,distanceKm:data.distanceKm,geometry:{type:'LineString',coordinates:data.geometry.coordinates.map(point=>[...point])}};
}
export async function fetchDrivingRoute({from,to,token,signal,fetchImpl=fetch}){
  const response=await fetchImpl('/api/route?'+new URLSearchParams({from,to}),{headers:{Authorization:'Bearer '+token},signal});
  let data;
  try{data=await response.json();}catch{throw new Error('Driving distance could not be read. Enter distance manually.');}
  if(!response.ok)throw new Error(data.error||'Driving distance is unavailable. Enter distance manually.');
  return validateDrivingRoute(data,from,to);
}
