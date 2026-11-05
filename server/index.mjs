import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
import {createApp} from './app.mjs';
import {readSupabaseConfig} from '../src/lib/auth.js';
import {readScanConfig} from './scan-auth.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.env.NODE_ENV!=='production')dotenv.config({path:[path.join(root,'.env.local'),path.join(root,'.env')]});
if(process.env.NODE_ENV==='production'){
  const publicConfig=readSupabaseConfig(process.env,{requireHosted:true});
  const scanConfig=readScanConfig(process.env);
  if(scanConfig.url!==publicConfig.url)throw new Error('Frontend and scan authorization must use the same Supabase project.');
}
const port=process.env.PORT===undefined?8787:Number(process.env.PORT);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer between 1 and 65535.');
const server=createApp().listen(port,'0.0.0.0',()=>console.log(`BashaShift server on :${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
  server.close(()=>process.exit(0));
  setTimeout(()=>{server.closeAllConnections();process.exit(0);},25000).unref();
});
