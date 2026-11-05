// Start with node scripts/test-guidance-server.mjs, then run tests/guidance_smoke.py.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
const app=await createServer({configFile:false,optimizeDeps:{entries:['tests/fixtures/guidance.html']},server:{host:'127.0.0.1',port:5192,strictPort:true},
  plugins:[react(),{name:'test-scan-only',configureServer(server){server.middlewares.use('/api/scan',(req,res)=>{
    req.resume();res.setHeader('Content-Type','application/json');
    if(req.headers['x-bashashift-demo']!=='1'){res.statusCode=401;return res.end(JSON.stringify({error:'Test fixture requires demo header'}));}
    return res.end(JSON.stringify({source:'openai',reviewRequired:true,items:[{name:'Bed',qty:2,confidence:'medium'}]}));
  });}}]});
await app.listen();console.log('Guidance browser fixtures: http://127.0.0.1:5192/tests/fixtures/guidance.html');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await app.close();process.exit(0);});
