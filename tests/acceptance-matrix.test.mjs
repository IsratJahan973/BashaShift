// Issue #11: isolated embedded PostgreSQL actors + real application RLS/RPCs.
// Auth HTTP and Cloudflare responses are MOCKED. No hosted accounts, data, or API calls.
import {before,after,describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {PGlite} from '@electric-sql/pglite';
import sharp from 'sharp';
import {rankApartments,rankMoverOffers} from '../src/lib/recommendations.js';
import {calculateMovingBudget} from '../src/lib/pricing.js';
import {reviewInventory} from '../src/lib/recognition.js';
import {matchesArea} from '../src/domain.js';
import {createApp} from '../server/app.mjs';

let db,approved;
const actors={},properties={},jobs={},bids={};
const query=(sql,args=[])=>db.query(sql,args);
const row=async(sql,args=[]) => (await query(sql,args)).rows[0];
async function as(key,action,role='authenticated'){
  assert.ok(['authenticated','anon'].includes(role));
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub',$1,false)",[key?actors[key].id:'']);
  await db.exec('set role '+role);
  try{return await action();}
  finally{await db.exec('reset role');await query("select set_config('request.jwt.claim.sub','',false)");}
}
const denied=(action,code='42501')=>assert.rejects(action,error=>error.code===code);
const ids=rows=>rows.map(value=>value.id).sort();
const preferences={
  R1:{requiredArea:'Banasree',maxBudget:20000,minBeds:2,required:['lift']},
  R2:{requiredArea:'Banasree',maxBudget:25000,minBeds:3,required:['parking']},
  R3:{requiredArea:'Mirpur',maxBudget:14000,minBeds:1},
};
const assumptions={base:850,perKm:45,perUnit:150,perFloorUnit:20,workload:1,margin:20};
const feed=()=>query('select id,title,status,is_demo,rent,beds,area,lift,parking,balcony from public.properties');
const details=(key,from,to)=>({
  renter_id:actors.R3.id,status:'confirmed',from_area:from,to_area:to,moving_date:'2027-01-01',
  km:8,from_floor:2,to_floor:3,has_lift:false,estimate:0,contact_consent:true,
  customer_name:'TEST '+key,customer_phone:actors[key].phone,
  from_address:'TEST pickup '+key,to_address:'TEST destination '+key,notes:'TEST private '+key,
});
async function request(key,from,to,inventory){
  return (await as(key,()=>row('select public.create_moving_request($1,$2) as id',[JSON.stringify(details(key,from,to)),JSON.stringify(inventory)]))).id;
}

describe('Issue 11 seven-actor acceptance — embedded RLS, mocked Auth/AI, never production',{concurrency:false},()=>{
  before(async()=>{
    db=new PGlite();
    // Same minimal Supabase platform schemas used by the existing RLS regression harness.
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
    await db.exec(await readFile(new URL('../supabase/migrations/202611040001_phase2_foundation.sql',import.meta.url),'utf8'));
    for(const [index,key] of ['R1','R2','R3','O1','M1','M2','M3'].entries()){
      const role=key[0]==='R'?'renter':key[0]==='O'?'owner':'mover';
      actors[key]={id:randomUUID(),role,phone:'0171111000'+(index+1)};
      await query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[actors[key].id,JSON.stringify({
        role,display_name:'TEST '+key+' — embedded only',phone:actors[key].phone,service_area:'Rampura',
      })]);
    }
    const rows=[
      ['P1','Banasree',15000,2,true,false,true,'published',false],
      ['P2','Banasree',22000,3,true,true,false,'published',false],
      ['P3','Rampura',18000,2,true,false,false,'published',false],
      ['P4','Mirpur',12000,1,false,false,false,'published',false],
      ['P5','Banasree',14000,2,false,false,false,'published',false],
      ['DRAFT','Banasree',10000,3,true,true,true,'draft',false],
      ['DEMO','Banasree',10000,3,true,true,true,'published',true],
    ];
    for(const [key,area,rent,beds,lift,parking,balcony,status,isDemo] of rows){
      properties[key]=(await as('O1',()=>row(`insert into public.properties(title,owner_name,area,block,rent,beds,baths,available,lift,parking,balcony,status)
        values ($1,'TEST O1',$2,'TEST — not a real available home',$3,$4,1,'2027-01-01',$5,$6,$7,$8) returning id`,
        ['TEST '+key+' — synthetic acceptance fixture',area,rent,beds,lift,parking,balcony,status]))).id;
      // Platform-only fixture metadata cannot be written by an owner; never relax that grant.
      if(isDemo)await query('update public.properties set is_demo=true where id=$1',[properties[key]]);
    }
  });

  test('All seven actors have distinct protected identities; fixtures are isolated and RLS stays enabled',async()=>{
    assert.equal(new Set(Object.values(actors).map(actor=>actor.id)).size,7);
    for(const key of Object.keys(actors))await as(key,async()=>{
      const profiles=(await query('select id,role from public.profiles')).rows;
      assert.deepEqual(profiles,[{id:actors[key].id,role:actors[key].role}]);
      await denied(()=>query("update public.profiles set role='owner' where id=$1",[actors[key].id]));
    });
    const tables=(await query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows;
    assert.equal(tables.length,8);assert.ok(tables.every(table=>table.relrowsecurity));
    assert.equal((await as('O1',feed)).rows.length,7);
  });

  for(const [key,expected] of [['R1','P1'],['R2','P2'],['R3','P4']]){
    test(key+' rental hard filters return only '+expected+' from the real RLS-scoped fixture feed',async()=>{
      const rows=(await as(key,feed)).rows;
      assert.equal(rows.some(property=>property.id===properties.DRAFT),false);
      for(const priority of ['balanced','affordability','facilities','area']){
        const ranked=rankApartments(rows,{...preferences[key],priority});
        assert.deepEqual(ranked.map(property=>property.id),[properties[expected]]);
        assert.equal(ranked[0].meetsRequiredCriteria,true);
        assert.ok(ranked.every(property=>rows.some(source=>source.id===property.id)));
        assert.equal(ranked.some(property=>[properties.DEMO,properties.DRAFT].includes(property.id)),false);
      }
      assert.deepEqual(rankApartments(rows,{...preferences[key],required:['unknown-facility']}),[]);
    });
  }

  test('Preference priority reorders eligible P1/P2 without relaxing area, bedroom, budget or lift requirements',async()=>{
    const rows=(await as('R1',feed)).rows;
    const prefs={requiredArea:'Banasree',maxBudget:22500,minBeds:2,required:['lift'],optional:['parking']};
    const low=rankApartments(rows,{...prefs,priority:'affordability'});
    const fit=rankApartments(rows,{...prefs,priority:'facilities'});
    assert.deepEqual(low.map(property=>property.id),[properties.P1,properties.P2]);
    assert.deepEqual(fit.map(property=>property.id),[properties.P2,properties.P1]);
    assert.equal(low[0].match,'partial');assert.equal(fit[0].match,'exact');
    assert.equal(fit[0].components.facilities,1);assert.ok(fit[0].score>low[0].score);
    const unknown={...rows.find(property=>property.id===properties.P1),id:randomUUID(),lift:undefined};
    assert.equal(rankApartments([unknown],preferences.R1).length,0);
    assert.deepEqual(rankApartments([],preferences.R1),[]);
    assert.equal(JSON.stringify(fit).includes(actors.O1.phone),false);
  });

  test('O1 edits/unpublishes own fixtures and acknowledges a viewing; other actors cannot edit or scrape owner contacts',async()=>{
    for(const key of ['R1','R2','R3','M1','M2','M3']){
      await as(key,async()=>{
        assert.equal((await query("update public.properties set title='INVALID TEST' where id=$1 returning id",[properties.P5])).rows.length,0);
        await denied(()=>query('select * from public.get_property_contact($1)',[properties.P1]));
      });
    }
    await as('O1',()=>query("update public.properties set description='TEST edited',status='draft' where id=$1",[properties.P5]));
    assert.equal((await as('R1',()=>query('select id from public.properties where id=$1',[properties.P5]))).rows.length,0);
    await as('O1',()=>query("update public.properties set status='published' where id=$1",[properties.P5]));
    const inquiry=(await as('R1',()=>row(`insert into public.viewing_inquiries(property_id,renter_name,renter_phone,preferred_date)
      values ($1,'TEST R1',$2,'2027-01-01') returning id`,[properties.P1,actors.R1.phone]))).id;
    for(const key of ['R2','R3','M1','M2','M3'])await as(key,async()=>{
      assert.equal((await query('select id from public.viewing_inquiries where id=$1',[inquiry])).rows.length,0);
      await denied(()=>query('select public.acknowledge_inquiry($1,true)',[inquiry]));
    });
    await as('O1',()=>query('select public.acknowledge_inquiry($1,true)',[inquiry]));
    await as('R1',async()=>{
      assert.equal((await row('select status from public.viewing_inquiries where id=$1',[inquiry])).status,'acknowledged');
      assert.equal((await row('select * from public.get_property_contact($1)',[properties.P1])).phone,actors.O1.phone);
    });
  });

  test('Profile-authorized local scan checks consent, expiry, roles, size, limits and fallback; mocked Mistral inventory requires review before the budget changes',async()=>{
    const image='data:image/png;base64,'+(await sharp({create:{width:64,height:48,channels:3,background:'beige'}}).png().toBuffer()).toString('base64');
    let calls=0,broken=false,result;
    const env={NODE_ENV:'production',VITE_SUPABASE_URL:'https://fixture.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',
      CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),CLOUDFLARE_AI_TOKEN:randomUUID(),AI_ENABLE_OPENAI_FALLBACK:'false'};
    const upstream=async(url,init)=>{
      const pathname=new URL(url).pathname;
      const key=new Headers(init.headers).get('authorization')?.replace('Bearer TEST-session-','');
      if(pathname==='/auth/v1/user'){
        if(!actors[key])return Response.json({code:'bad_jwt',message:'Expired TEST session'},{status:401});
        return Response.json({id:actors[key].id,user_metadata:{role:'renter'}});
      }
      if(pathname==='/rest/v1/profiles')return Response.json(await as(key,()=>row('select id,role from public.profiles where id=$1',[actors[key].id])));
      assert.match(String(url),/api.cloudflare.com.*mistral-small-3.1-24b-instruct$/);
      const body=JSON.parse(init.body);assert.match(body.messages[0].content[1].image_url.url,/^data:image\/jpeg;base64,/);
      assert.ok(body.guided_json);calls++;
      return Response.json({success:true,errors:[],result:{response:broken?'malformed TEST output':{items:[
        {name:'Bed',qty:2,confidence:'high'},{name:'Other',qty:4,confidence:'low'},
      ]}}});
    };
    const server=createApp({env,fetchImpl:upstream,scanLimit:3,logScanFailure:()=>{},dist:null}).listen(0,'127.0.0.1');
    await once(server,'listening');
    const post=(key,body={images:[image],consent:true})=>fetch('http://127.0.0.1:'+server.address().port+'/api/scan',{
      method:'POST',headers:{Authorization:'Bearer TEST-session-'+key,'Content-Type':'application/json'},body:JSON.stringify(body),
    });
    try{
      for(const key of ['O1','M1','M2','M3'])assert.equal((await post(key)).status,403);
      assert.equal((await post('EXPIRED')).status,401);
      assert.equal((await post('R1',{images:[image],consent:false})).status,400);
      assert.equal((await post('R1',{images:['data:image/jpeg;base64,'+Buffer.alloc(3*1024*1024+1).toString('base64')],consent:true})).status,413);
      assert.equal(calls,0);
      const response=await post('R1');assert.equal(response.status,200);result=await response.json();
      assert.equal(result.source,'cloudflare');assert.equal(result.reviewRequired,true);assert.equal(calls,1);
      assert.equal((await post('R1')).status,429);assert.equal(calls,1);
      broken=true;const failure=await post('R2');assert.equal(failure.status,502);
      const error=await failure.json();assert.equal(error.code,'invalid_ai_response');assert.equal(Object.hasOwn(error,'items'),false);
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    const move={items:[{name:'Boxes',qty:1}],km:8,fromFloor:2,toFloor:3,hasLift:false};
    const before=structuredClone(move),original=calculateMovingBudget(move,assumptions);
    assert.deepEqual(move,before);assert.equal(result.items[1].qty,4);
    approved=reviewInventory([...result.items.map(item=>({...item,qty:item.name==='Other'?1:item.qty})),{name:'Boxes',qty:3}]);
    const budget=calculateMovingBudget({...move,items:approved},assumptions);
    assert.deepEqual(move,before);assert.equal(budget.units,11);
    assert.equal(budget.low,3168);assert.equal(budget.high,4752);assert.notEqual(budget.center,original.center);
    assert.equal(approved.find(item=>item.name==='Other').qty,1);
  });

  test('R1/R2/R3 create separate requests; pickup matching and private contact scopes ignore forged ownership/status',async()=>{
    jobs.R1=await request('R1','Rampura','Banasree',approved);
    jobs.R2=await request('R2','Banasree','Rampura',[{name:'Wardrobe',qty:1}]);
    jobs.R3=await request('R3','Rampura','Mirpur',[{name:'Boxes',qty:6}]);
    for(const key of ['R1','R2','R3'])await as(key,async()=>{
      assert.deepEqual(ids((await query('select id from public.moving_requests')).rows),[jobs[key]]);
      const own=await row('select renter_id,status,estimate from public.moving_requests where id=$1',[jobs[key]]);
      assert.deepEqual(own,{renter_id:actors[key].id,status:'open',estimate:0});
      for(const other of ['R1','R2','R3'].filter(other=>other!==key))await denied(()=>query('select * from public.get_request_contact($1)',[jobs[other]]));
    });
    await as('O1',()=>denied(()=>query('insert into public.mover_offers(request_id,amount) values ($1,2500)',[jobs.R1])));
  });

  for(const [key,amount] of [['M1',2500],['M2',3000],['M3',3400]]){
    test(key+' sees only Rampura pickups, cannot scrape contacts, and independently quotes R1 at TEST '+amount+' BDT',async()=>{
      const worker={id:actors[key].id,area:'Rampura',available:true,skills:['Moving']};
      assert.equal(matchesArea(worker,{fromArea:'Banasree',toArea:'Rampura'}),false);
      assert.equal(matchesArea(worker,{fromArea:'Rampura',toArea:'Banasree'}),true);
      await as(key,async()=>{
        assert.deepEqual(ids((await query('select id from public.moving_requests')).rows),[jobs.R1,jobs.R3].sort());
        await denied(()=>query('insert into public.mover_offers(request_id,amount) values ($1,2500)',[jobs.R2]));
        await denied(()=>query('select customer_phone from public.moving_requests where id=$1',[jobs.R1]));
        await denied(()=>query('select * from public.get_request_contact($1)',[jobs.R1]));
        bids[key]=(await row('insert into public.mover_offers(request_id,amount) values ($1,$2) returning id',[jobs.R1,amount])).id;
        await denied(()=>query('insert into public.mover_offers(request_id,amount) values ($1,$2)',[jobs.R1,amount]),'23505');
      });
    });
  }

  test('R1 compares all three real fixture offers; missing reviews never become synthetic reliability or hidden contact data',async()=>{
    const offers=(await as('R1',()=>query('select id,amount,status from public.mover_offers where request_id=$1',[jobs.R1]))).rows;
    assert.deepEqual(rankMoverOffers(offers).map(offer=>offer.id),[bids.M1,bids.M2,bids.M3]);
    // Adversarial, untrusted fields must be ignored, never treated as genuine reviews.
    const ranked=rankMoverOffers(offers.map(offer=>({...offer,rating:5,reviewCount:100})),'reliability');
    assert.ok(ranked.every(offer=>offer.reviews===null));assert.equal(ranked[0].recommended,true);
    assert.deepEqual(ranked.map(offer=>offer.difference),[0,500,900]);
    const contacts=await as('R1',()=>query('select * from public.mover_summaries($1)',[[actors.M1.id,actors.M2.id,actors.M3.id]]));
    assert.equal(contacts.rows.length,3);assert.ok(contacts.rows.every(mover=>mover.phone===null));
    for(const key of ['R2','R3','O1','M1','M2','M3'])await as(key,()=>denied(()=>query('select public.select_mover_offer($1)',[bids.M2])));
  });

  test('R1 selects non-cheapest M2: transaction marks competitors not selected, only M2 gets contact, and only R1 confirms',async()=>{
    await as('R1',()=>query('select public.select_mover_offer($1)',[bids.M2]));
    const states=(await as('R1',()=>query('select id,status from public.mover_offers where request_id=$1',[jobs.R1]))).rows;
    assert.deepEqual(Object.fromEntries(states.map(offer=>[offer.id,offer.status])),{[bids.M1]:'not_selected',[bids.M2]:'selected',[bids.M3]:'not_selected'});
    for(const key of ['R2','R3','O1','M1','M3'])await as(key,()=>denied(()=>query('select * from public.get_request_contact($1)',[jobs.R1])));
    await as('M2',async()=>{
      assert.equal((await row('select * from public.get_request_contact($1)',[jobs.R1])).customer_phone,actors.R1.phone);
      await denied(()=>query('select public.confirm_booking($1)',[jobs.R1]));
    });
    await as('R1',async()=>{
      const summaries=(await query('select * from public.mover_summaries($1)',[[actors.M1.id,actors.M2.id,actors.M3.id]])).rows;
      assert.equal(summaries.find(mover=>mover.id===actors.M2.id).phone,actors.M2.phone);
      assert.ok(summaries.filter(mover=>mover.id!==actors.M2.id).every(mover=>mover.phone===null));
      await query('select public.confirm_booking($1)',[jobs.R1]);
      const booking=await row("select mover_id,amount,status,confirmed_at from public.bookings where request_id=$1 and status='confirmed'",[jobs.R1]);
      assert.equal(booking.mover_id,actors.M2.id);assert.equal(booking.amount,3000);assert.ok(booking.confirmed_at);
    });
    assert.equal((await as('R3',()=>row('select status from public.moving_requests where id=$1',[jobs.R3]))).status,'open');
  });

  test('R3 decline/reopen revokes M1 contact and permits a new independent M3 booking without changing R1/M2',async()=>{
    const first=(await as('M1',()=>row('insert into public.mover_offers(request_id,amount) values ($1,2700) returning id',[jobs.R3]))).id;
    await as('R3',()=>query('select public.select_mover_offer($1)',[first]));
    assert.equal((await as('M1',()=>row('select * from public.get_request_contact($1)',[jobs.R3]))).customer_phone,actors.R3.phone);
    await as('R1',()=>denied(()=>query('select public.reopen_moving_request($1)',[jobs.R3])));
    await as('R3',()=>query('select public.reopen_moving_request($1)',[jobs.R3]));
    await as('M1',()=>denied(()=>query('select * from public.get_request_contact($1)',[jobs.R3])));
    assert.equal((await as('R3',()=>row('select status from public.mover_offers where id=$1',[first]))).status,'declined');
    const second=(await as('M3',()=>row('insert into public.mover_offers(request_id,amount) values ($1,3200) returning id',[jobs.R3]))).id;
    await as('R3',async()=>{await query('select public.select_mover_offer($1)',[second]);await query('select public.confirm_booking($1)',[jobs.R3]);});
    assert.equal((await as('M3',()=>row('select * from public.get_request_contact($1)',[jobs.R3]))).customer_phone,actors.R3.phone);
    assert.equal((await as('R1',()=>row("select mover_id,amount,status from public.bookings where request_id=$1 and status='confirmed'",[jobs.R1]))).mover_id,actors.M2.id);
  });

  after(async()=>{if(db)await db.close();});
});
