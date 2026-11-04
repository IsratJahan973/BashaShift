import { reviewInventory } from './recognition.js';

// Planning effort units, NOT measured weights or local price data.
export const effortUnits = Object.freeze({ Bed:3, Sofa:3, Refrigerator:4, Wardrobe:4, 'Dining table':3, 'Washing machine':3, Boxes:1, Other:2 });
const number = (value, min, max) => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max;
export function calculateMovingBudget(move, assumptions) {
  try {
    const items = reviewInventory(move.items);
    if(!items.length || !number(move.km,0,1000) || !number(move.fromFloor,0,50) || !number(move.toFloor,0,50) ||
      !Number.isInteger(Number(move.fromFloor)) || !Number.isInteger(Number(move.toFloor)) || typeof move.hasLift !== 'boolean') throw new Error();
    const fromLift = move.fromLift ?? move.hasLift, toLift = move.toLift ?? move.hasLift;
    if(typeof fromLift !== 'boolean' || typeof toLift !== 'boolean') throw new Error();
    for(const key of ['base','perKm','perUnit','perFloorUnit']) if(!number(assumptions[key],0,100000)) throw new Error();
    if(!number(assumptions.workload,0.5,3) || !number(assumptions.margin,1,80)) throw new Error();
    const units = items.reduce((sum,item) => sum + effortUnits[item.name] * item.qty,0);
    const stairs = (fromLift ? 0 : Number(move.fromFloor)) + (toLift ? 0 : Number(move.toFloor));
    const parts = { base:Number(assumptions.base), distance:Number(move.km) * Number(assumptions.perKm),
      handling:units * Number(assumptions.perUnit) * Number(assumptions.workload),
      stairs:units * stairs * Number(assumptions.perFloorUnit) * Number(assumptions.workload) };
    const center = Object.values(parts).reduce((a,b) => a+b,0);
    if(center <= 0) throw new Error();
    const spread = Number(assumptions.margin) / 100;
    return { units, stairs, parts, center, low:Math.floor(center * (1-spread)), high:Math.ceil(center * (1+spread)), quantity:items.reduce((n,i)=>n+i.qty,0) };
  } catch { return null; }
}
