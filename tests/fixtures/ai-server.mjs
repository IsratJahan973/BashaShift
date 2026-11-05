// Test-only HTTP Auth adapter + embedded PostgreSQL/RLS + mocked Cloudflare.
// No hosted accounts, provider requests or production data are used.
import express from 'express';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createApp} from '../../server/app.mjs';

const db=new PGlite(),actors=new Map();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  create schema auth;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb not null);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
  create function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
`);
await db.exec(await readFile(new URL('../../supabase/migrations/202611040001_phase2_foundation.sql',import.meta.url),'utf8'));
for(const [index,key] of ['R1','R2','R3','O1','M1','M2','M3'].entries()){
  const role=key[0]==='R'?'renter':key[0]==='O'?'owner':'mover',id=randomUUID();
  const actor={id,role,email:key+'@example.test',phone:'0171111000'+(index+1)};
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
  actor.user={id,email:actor.email,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  actor.token=[encode({alg:'HS256',typ:'JWT'}),encode({sub:id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600}),randomUUID()].join('.');
  actors.set(key,actor);
  await db.query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[id,JSON.stringify({role,display_name:'TEST '+key,phone:actor.phone,service_area:'Rampura'})]);
}
let queue=Promise.resolve();
function scoped(actor,action){
  const pending=queue.then(async()=>{
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor?.id||'']);
    await db.exec('set role '+(actor?'authenticated':'anon'));
    try{return await action();}
    finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");}
  });
  queue=pending.catch(()=>{});return pending;
}
const lookup=req=>[...actors.values()].find(actor=>req.get('authorization')==='Bearer '+actor.token);
const app=express();
app.use(['/auth','/rest'],express.json());
app.post('/auth/v1/token',(req,res)=>{
  const actor=[...actors.values()].find(actor=>actor.email===req.body.email);
  if(!actor||req.body.password!=='isolated-test-password')return res.status(400).json({error:'invalid_grant',error_description:'Invalid login credentials'});
  res.json({access_token:actor.token,refresh_token:randomUUID(),expires_in:3600,token_type:'bearer',user:actor.user});
});
app.get('/auth/v1/user',(req,res)=>{const actor=lookup(req);res.status(actor?200:401).json(actor?.user||{message:'Invalid token'});});
app.post('/auth/v1/logout',(_req,res)=>res.json({}));
const columns=new Map((await db.query("select table_name,array_agg(column_name::text) as names from information_schema.columns where table_schema='public' group by table_name")).rows.map(row=>[row.table_name,new Set(row.names)]));
const rpcs={create_moving_request:['details','inventory'],get_property_contact:['property_id'],get_request_contact:['request_id'],mover_summaries:['mover_ids'],acknowledge_inquiry:['inquiry_id','acknowledged'],select_mover_offer:['offer_id'],confirm_booking:['request_id'],reopen_moving_request:['request_id']};
app.post('/rest/v1/rpc/:name',async(req,res)=>{
  try{
    const params=rpcs[req.params.name];assert.ok(params,'Unsupported fixture RPC');
    const args=params.map(key=>['details','inventory'].includes(key)?JSON.stringify(req.body[key]):req.body[key]);
    const rows=await scoped(lookup(req),async()=>(await db.query(`select * from public.${req.params.name}(${params.map((_,i)=>'$'+(i+1)).join(',')})`,args)).rows);
    res.json(rows);
  }catch(error){res.status(403).json({code:error.code||'fixture_error',message:'Test RPC rejected'});}
});
app.all('/rest/v1/:table',async(req,res)=>{
  try{
    const table=req.params.table,allowed=columns.get(table);assert.ok(allowed,'Unsupported fixture table');
    const selected=(req.query.select||'*').replace(/,\w+\([^)]*\)/g,'').split(',');
    assert.ok(selected.every(key=>key==='*'||allowed.has(key)),'Unsupported fixture columns');
    const select=selected.join(','),args=[],where=[];
    for(const [key,value] of Object.entries(req.query)){
      if(['select','order'].includes(key))continue;
      assert.ok(allowed.has(key)&&String(value).startsWith('eq.'),'Unsupported fixture filter');
      args.push(String(value).slice(3));where.push(key+'=$'+args.length);
    }
    const clause=where.length?' where '+where.join(' and '):'';
    const rows=await scoped(lookup(req),async()=>{
      let rows;
      if(req.method==='GET'){
        const order=req.query.order;assert.ok(!order||order==='created_at.desc','Unsupported fixture ordering');
        rows=(await db.query(`select ${select} from public.${table}${clause}${order?' order by created_at desc':''}`,args)).rows;
      }else{
        const fields=Object.keys(req.body);assert.ok(fields.length&&fields.every(key=>allowed.has(key)),'Unsupported fixture fields');
        let sql;
        if(req.method==='POST')sql=`insert into public.${table}(${fields.join(',')}) values (${fields.map((_,i)=>'$'+(args.length+i+1)).join(',')}) returning ${select}`;
        else{assert.equal(req.method,'PATCH');sql=`update public.${table} set ${fields.map((key,i)=>key+'=$'+(args.length+i+1)).join(',')}${clause} returning ${select}`;}
        rows=(await db.query(sql,[...args,...fields.map(key=>req.body[key])])).rows;
      }
      if(table==='properties')for(const row of rows)row.property_images=(await db.query('select * from public.property_images where property_id=$1',[row.id])).rows;
      if(table==='viewing_inquiries')for(const row of rows)row.properties=(await db.query('select title,owner_name from public.properties where id=$1',[row.property_id])).rows[0];
      return rows;
    });
    res.json(req.get('accept')?.includes('vnd.pgrst.object')?rows[0]||null:rows);
  }catch(error){res.status(403).json({code:error.code||'fixture_error',message:'Test table access rejected'});}
});
const items=[{name:'Bed',qty:2,confidence:'high'},{name:'Refrigerator',qty:1,confidence:'medium'},{name:'Boxes',qty:4,confidence:'low'}];
const outputs=[{items},'Detected furniture:\n```json\n'+JSON.stringify({items})+'\n```\nPlease review.','{"items":[',{items:[]}];
const origin='http://127.0.0.1:'+process.argv[3];
app.use(createApp({env:{NODE_ENV:'test',VITE_SUPABASE_URL:origin,VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_browser_fixture',
  CLOUDFLARE_ACCOUNT_ID:'0'.repeat(32),CLOUDFLARE_AI_TOKEN:randomUUID(),CLOUDFLARE_VISION_MODEL:'@cf/mistralai/mistral-small-3.1-24b-instruct'},
  dist:process.argv[2],scanLimit:20,fetchImpl:async(url,init)=>{
    if(String(url).startsWith(origin+'/'))return fetch(url,init);
    assert.ok(String(url).startsWith('https://api.cloudflare.com/'),'Unexpected external request');
    const payload=JSON.parse(init.body);
    assert.ok(payload.messages[0].content.some(part=>part.type==='image_url'&&part.image_url.url.startsWith('data:image/jpeg;base64,')));
    assert.ok(outputs.length,'Unexpected provider call');
    return Response.json({success:true,errors:[],result:{response:outputs.shift()}});
  }}));
const server=app.listen(Number(process.argv[3]),'127.0.0.1',()=>{
  console.log('Browser fixture: embedded production RLS; Auth HTTP and Cloudflare are mocked.');
  process.send?.({url:origin});
});
const close=()=>{server.closeAllConnections();server.close(async()=>{await db.close();process.exit(0);});};
process.on('message',message=>{if(message==='stop')close();});process.on('disconnect',close);
