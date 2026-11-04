// Only used by the browser test: real upload route + explicitly mocked Cloudflare.
import { randomUUID } from 'node:crypto';
import { createApp } from '../../server/app.mjs';

const items=[{name:'Bed',qty:2,confidence:'high'},{name:'Refrigerator',qty:1,confidence:'medium'},{name:'Boxes',qty:4,confidence:'low'}];
// Ordered, test-only provider outputs: structured, wrapped, malformed, then empty.
const responses=[{items},'Detected furniture:\n```json\n'+JSON.stringify({items})+'\n```\nPlease review.','{"items":[',{items:[]}];
const app=createApp({env:{CLOUDFLARE_ACCOUNT_ID:'0'.repeat(32),CLOUDFLARE_AI_TOKEN:randomUUID(),NODE_ENV:'development',AI_ALLOW_DEMO_SCAN:'true'},
  dist:process.argv[2],fetchImpl:async()=>{
    if(!responses.length)throw new Error('Unexpected provider call in browser test');
    return Response.json({success:true,errors:[],result:{response:responses.shift()}});
  }});
const server=app.listen(0,'127.0.0.1',()=>{
  console.log('Browser fixture: Cloudflare responses are mocked; no real provider call.');
  process.send?.({url:'http://127.0.0.1:'+server.address().port});
});
process.on('message',message=>{if(message==='stop'){server.closeAllConnections();server.close(()=>process.exit(0));}});
process.on('disconnect',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
