import { furniture } from '../data.js';

export const photoLimits = Object.freeze({ count:3,each:3*1024*1024,total:6*1024*1024 });
const names=new Set(furniture.map(item=>item.key));

export function reviewInventory(items) {
  if(!Array.isArray(items) || items.length>names.size)throw new Error('Review the detected items before applying them.');
  const seen=new Set();
  return items.map(item=>{
    const qty=Number(item.qty);
    if(!names.has(item.name) || seen.has(item.name) || item.qty==='' || !Number.isInteger(qty) || qty<0 || qty>1000) {
      throw new Error('Use whole quantities from 0 to 1,000. Set an incorrect item to 0 to remove it.');
    }
    seen.add(item.name);
    return { name:item.name,qty };
  }).filter(item=>item.qty>0);
}

export async function scanFurniture({ images,token,demoMode,signal,fetchImpl=fetch }) {
  const headers={ 'Content-Type':'application/json' };
  if(token && !demoMode)headers.Authorization='Bearer '+token;
  if(demoMode)headers['X-BashaShift-Demo']='1';
  const response=await fetchImpl('/api/scan',{ method:'POST',headers,body:JSON.stringify({ images,consent:true }),signal });
  let data;
  try{data=await response.json();}catch{throw new Error('Photo analysis is unavailable. Your manual inventory is unchanged.');}
  if(!response.ok)throw new Error(data.error || 'Photo analysis is unavailable. Enter items manually.');
  if(data.source!=='openai' || !Array.isArray(data.items) || data.items.some(item=>!item || !Number.isInteger(item.qty) || item.qty<1 || item.qty>100 || !['high','medium','low'].includes(item.confidence))) {
    throw new Error('The photo analysis could not be read. Enter items manually.');
  }
  reviewInventory(data.items);
  return data.items;
}
