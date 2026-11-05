import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {EnvHttpProxyAgent,fetch as proxyFetch} from 'undici';
import {ScanError,validatePhotos} from './ai.mjs';
import {createRenterVerifier} from './scan-auth.mjs';
import {createFurnitureRecognizer} from './scan-provider.mjs';

const proxyAgent=new EnvHttpProxyAgent();
const outboundFetch=(url,init)=>proxyFetch(url,{...init,dispatcher:proxyAgent});
function windowLimit(max,windowMs,clock){
  const clients=new Map();
  return key=>{
    const now=clock();
    for(const [id,value] of clients)if(value.end<=now)clients.delete(id);
    let entry=clients.get(key);
    if(!entry){if(clients.size>=1000)return 60;entry={count:0,end:now+windowMs};clients.set(key,entry);}
    entry.count++;
    return entry.count>max?Math.max(1,Math.ceil((entry.end-now)/1000)):0;
  };
}
export function createApp({env=process.env,fetchImpl=outboundFetch,verifyRenter=createRenterVerifier(env,fetchImpl),
  timeoutMs=25000,scanLimit=5,concurrencyLimit=2,clock=Date.now,logScanFailure,
  dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist')}={}){
  const app=express();app.disable('x-powered-by');
  // Render terminates the public connection at one ingress proxy. Trust only that hop.
  app.set('trust proxy',env.RENDER==='true'?1:false);
  app.use((_req,res,next)=>{res.set('X-Content-Type-Options','nosniff');next();});
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const recognizer=createFurnitureRecognizer({env,fetchImpl,timeoutMs,logScanFailure});
  const attempts=windowLimit(40,60000,clock),scans=windowLimit(scanLimit,60000,clock);
  let active=0;
  app.get('/api/health',(_req,res)=>res.json({ok:true,aiConfigured:recognizer.configured,aiRequiresRenterLogin:true}));
  app.post('/api/scan',async(req,res,next)=>{
    req.scanRequestId=randomUUID();res.set('X-Request-ID',req.scanRequestId);
    try{
      if(!recognizer.configured)throw new ScanError(503,'ai_not_configured','AI photo analysis is not configured here. Add items manually.');
      const retry=attempts(req.ip);
      if(retry){res.set('Retry-After',String(retry));throw new ScanError(429,'rate_limited','Too many attempts. Wait a minute or enter items manually.');}
      const bearer=req.get('Authorization')?.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/);
      if(!bearer||bearer[1].length>8192)throw new ScanError(401,'sign_in_required','Sign in as a renter to analyze furniture photos.');
      if(!verifyRenter)throw new ScanError(503,'account_service_unavailable','Account verification is unavailable. Manual inventory is still available.');
      let actor;
      try{actor=await verifyRenter(bearer[1]);}catch(error){if(error instanceof ScanError)throw error;throw new ScanError(503,'account_service_unavailable','Account verification is unavailable. Try again or enter items manually.');}
      if(actor?.role!=='renter'||!actor.id)throw new ScanError(403,'renter_required','Photo analysis requires a renter account.');
      req.scanActor=actor.id;
      next();
    }catch(error){next(error);}
  },express.json({limit:'9mb',strict:true}),async(req,res,next)=>{
    const retry=scans(req.scanActor);
    if(retry){res.set('Retry-After',String(retry));return next(new ScanError(429,'rate_limited','Photo limit reached. Wait a minute or enter items manually.'));}
    if(active>=concurrencyLimit){res.set('Retry-After','2');return next(new ScanError(503,'ai_busy','Photo analysis is busy. Retry shortly or enter items manually.'));}
    active++;
    const controller=new AbortController();
    const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on('close',disconnected);
    try{
      const images=await validatePhotos(req.body);
      const data=await recognizer.recognize({images,signal:controller.signal,requestId:req.scanRequestId});
      if(!res.destroyed)res.json(data);
    }catch(error){if(!res.destroyed)next(error);}
    finally{active--;res.off('close',disconnected);}
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'API route not found.',code:'not_found'}));
  app.use((error,_req,res,_next)=>{
    let failure=error;
    if(error.type==='entity.too.large')failure=new ScanError(413,'upload_too_large','Use up to three photos, under 3 MB each and 6 MB total.');
    else if(error.type==='entity.parse.failed')failure=new ScanError(400,'invalid_json','The upload could not be read. Try again or enter items manually.');
    if(!(failure instanceof ScanError))failure=new ScanError(500,'scan_unavailable','Photo analysis is unavailable. Enter items manually.');
    res.status(failure.status).json({error:failure.message,code:failure.code});
  });
  const index=dist&&path.join(dist,'index.html');
  if(env.NODE_ENV==='production'&&dist&&!fs.existsSync(index)) {
    throw new Error('Frontend build missing. Run npm run build before starting production.');
  }
  if(index&&fs.existsSync(index)){
    app.use('/assets',express.static(path.join(dist,'assets'),{maxAge:'1y',immutable:true}));
    app.use(express.static(dist,{index:false}));
    app.get('*',(req,res)=>{
      if(!req.accepts('html')||req.path.startsWith('/assets/')||path.extname(req.path)||req.path.split('/').some(part=>part.startsWith('.'))) {
        return res.status(404).type('text').send('Not found');
      }
      res.set('Cache-Control','no-cache').sendFile(index);
    });
  }
  return app;
}
