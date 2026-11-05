// Approximate OSM neighborhood centers [longitude, latitude], checked 2026-11-05
// against the linked place records (Mapcarta mirrors used where OSM was unavailable).
// These are routing waypoints, never customer addresses or example road distances.
const center=(lon,lat,osm,reference)=>Object.freeze({coordinates:Object.freeze([lon,lat]),osm,reference});
export const routingAreas=Object.freeze({
  Banasree:center(90.43128,23.76171,'node/642560699','https://mapcarta.com/N642560699'),
  Rampura:center(90.42057,23.76261,'node/9027812715','https://mapcarta.com/31153104'),
  Khilgaon:center(90.42328,23.75066,'node/2822082507','https://mapcarta.com/30937142'),
  Mirpur:center(90.36409,23.81236,'node/8953925035','https://mapcarta.com/27739598'),
  Dhanmondi:center(90.37460,23.74790,'node/5162463804','https://mapcarta.com/27713626'),
  Uttara:center(90.39269,23.86933,'node/141466267','https://mapcarta.com/27739894'),
  Mohammadpur:center(90.36033,23.76324,'way/318722840','https://mapcarta.com/30937140'),
  Bashundhara:center(90.43682,23.81893,'node/264889126','https://mapcarta.com/N264889126'),
  Gulshan:center(90.41555,23.79218,'node/9439896189','https://mapcarta.com/N9439896189'),
});
export function routingArea(value){
  if(typeof value!=='string'||value.length>40)return null;
  return Object.keys(routingAreas).find(name=>name.toLowerCase()===value.trim().toLowerCase())||null;
}
