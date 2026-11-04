// Only used by the browser test: real upload route + explicitly mocked OpenAI.
import { randomUUID } from 'node:crypto';
import { createApp } from '../../server/app.mjs';

const app=createApp({env:{OPENAI_API_KEY:randomUUID(),NODE_ENV:'development',AI_ALLOW_DEMO_SCAN:'true'},
  dist:process.argv[2],fetchImpl:async()=>Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items:[
    {name:'Bed',qty:2,confidence:'high'}, {name:'Refrigerator',qty:1,confidence:'medium'}, {name:'Boxes',qty:4,confidence:'low'},
  ]})}]}]})});
const server=app.listen(0,'127.0.0.1',()=>{
  console.log('Browser fixture: OpenAI responses are mocked; no real provider call.');
  process.send?.({url:'http://127.0.0.1:'+server.address().port});
});
process.on('message',message=>{if(message==='stop'){server.closeAllConnections();server.close(()=>process.exit(0));}});
process.on('disconnect',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
