import {createClient} from '@supabase/supabase-js';
import {readSupabaseConfig} from '../src/lib/auth.js';
import {ScanError} from './ai.mjs';

export function readScanConfig(env){
  return readSupabaseConfig({VITE_SUPABASE_URL:env.SUPABASE_URL||env.VITE_SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY:env.SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_ANON_KEY:env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY},
    {requireHosted:env.NODE_ENV==='production'});
}

export function createRenterVerifier(env,fetchImpl){
  let config;
  try{config=readScanConfig(env);}catch{return null;}
  if(!config.configured)return null;
  return async token=>{
    const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{headers:{Authorization:`Bearer ${token}`},fetch:(url,init)=>fetchImpl(url,{...init,signal:AbortSignal.timeout(5000)})}});
    const {data,error}=await client.auth.getUser(token);
    if(error && (!error.status || error.status>=500))throw new ScanError(503,'account_service_unavailable','Account verification is unavailable. Try again or enter items manually.');
    if(error || !data.user)throw new ScanError(401,'sign_in_required','Sign in again to analyze furniture photos.');
    const profile=await client.from('profiles').select('id,role').eq('id',data.user.id).single().retry(false);
    if(profile.status>=500 || (profile.error && !profile.status))throw new ScanError(503,'account_service_unavailable','Account verification is unavailable. Try again or enter items manually.');
    if(profile.error || profile.data?.id!==data.user.id || profile.data?.role!=='renter')throw new ScanError(403,'renter_required','Photo analysis requires a renter account.');
    return profile.data;
  };
}
