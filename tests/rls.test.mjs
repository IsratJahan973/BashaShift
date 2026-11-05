// Execute the real migration/RLS in embedded PostgreSQL. These fixtures model
// Supabase platform schemas; they do NOT mock the PostgreSQL policy engine.
// Hosted Auth, Storage HTTP and concurrent REST tests live in integration/.
import { before, after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

let db, owner, owner2, renter, stranger, mover, mover2, remote, property, request, firstOffer, secondOffer;
const query = (sql,args=[]) => db.query(sql,args);
const value = async (sql,args=[]) => (await query(sql,args)).rows[0];
async function as(uid, action, role='authenticated') {
  assert.ok(['authenticated','anon'].includes(role));
  await db.exec('reset role');
  await query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);
  await db.exec('set role '+role);
  try { return await action(); }
  finally { await db.exec('reset role');await query("select set_config('request.jwt.claim.sub','',false)"); }
}
async function rejected(action, code='42501') {
  await assert.rejects(action, error=>error.code===code);
}
async function account(role, area='Banasree') {
  const id=randomUUID();
  await query('insert into auth.users(id,raw_user_meta_data) values ($1,$2)',[id,JSON.stringify({ role,display_name:'SQL test '+role,phone:'01812345678',service_area:area })]);
  return id;
}

describe('Migration and database authorization in PostgreSQL', { concurrency:false }, () => {
  before(async () => {
    db=new PGlite();
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
    owner=await account('owner');owner2=await account('owner');renter=await account('renter');
    stranger=await account('renter');mover=await account('mover');mover2=await account('mover');remote=await account('mover','Rampura');
  });

  test('all eight application tables have RLS and private columns/function execution stay revoked',async () => {
    const rows=(await query("select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'")).rows;
    assert.equal(rows.length,8); assert.ok(rows.every(row=>row.relrowsecurity));
    assert.equal((await value("select has_column_privilege('authenticated','public.moving_requests','customer_phone','select') as allowed")).allowed,false);
    assert.equal((await value("select has_function_privilege('anon','public.get_request_contact(uuid)','execute') as allowed")).allowed,false);
    assert.equal((await value("select public from storage.buckets where id='property-images'")).public,false);
  });

  test('signup trigger validates roles and clients cannot promote themselves or read another profile',async () => {
    await rejected(()=>account('admin'),'23514');
    await as(renter,async () => {
      assert.equal((await value('select role from public.profiles')).role,'renter');
      await rejected(()=>query("update public.profiles set role='owner' where id=$1",[renter]));
      assert.equal((await query('select phone from public.profiles where id=$1',[owner])).rows.length,0);
      await query("update public.profiles set display_name='Updated self' where id=$1",[renter]);
    });
    await query("update auth.users set raw_user_meta_data=raw_user_meta_data || '{\"role\":\"owner\"}'::jsonb where id=$1",[renter]);
    assert.equal((await value('select role from public.profiles where id=$1',[renter])).role,'renter');
  });

  test('only owners create/manage their listings; guests/renters see published records',async () => {
    property=(await as(owner,()=>value(`insert into public.properties(title,owner_name,area,block,rent,beds,baths,available,status)
      values ('SQL fixture','Owner','Banasree','Test Block',18000,2,1,'2027-01-01','draft') returning id`))).id;
    await as(null,async () => assert.equal((await query('select id from public.properties where id=$1',[property])).rows.length,0),'anon');
    await as(owner2,async () => assert.equal((await query("update public.properties set title='stolen' where id=$1 returning id",[property])).rows.length,0));
    await as(owner,async () => {
      await rejected(()=>query('update public.properties set owner_id=$1 where id=$2',[owner2,property]));
      await query("update public.properties set status='published' where id=$1",[property]);
    });
    await as(null,async () => assert.equal((await query('select id from public.properties where id=$1',[property])).rows.length,1),'anon');
    await as(renter,()=>rejected(()=>query(`insert into public.properties(title,owner_name,area,block,rent,beds,baths,available)
      values ('invalid','Renter','Banasree','Block',18000,2,1,'2027-01-01')`)));
  });

  test('private photo policies restrict draft reads and other-owner uploads',async () => {
    const path=`${owner}/${property}/${randomUUID()}.jpg`;
    await as(owner,async () => {
      await query("update public.properties set status='draft' where id=$1",[property]);
      await query("insert into storage.objects(bucket_id,name) values ('property-images',$1)",[path]);
      await query('insert into public.property_images(property_id,storage_path) values ($1,$2)',[property,path]);
    });
    await as(owner2,()=>rejected(()=>query("insert into storage.objects(bucket_id,name) values ('property-images',$1)",[`${owner}/${property}/unauthorized.jpg`])));
    await as(null,async () => assert.equal((await query('select name from storage.objects')).rows.length,0),'anon');
    await as(owner,()=>query("update public.properties set status='published' where id=$1",[property]));
    await as(null,async () => assert.equal((await query('select name from storage.objects')).rows.length,1),'anon');
  });

  test('viewing inquiry and owner contact access are limited to the owning participants',async () => {
    await as(mover,()=>rejected(()=>query('select * from public.get_property_contact($1)',[property])));
    const inquiry=(await as(renter,()=>value(`insert into public.viewing_inquiries(property_id,renter_name,renter_phone,preferred_date)
      values ($1,'Test renter','01812345678','2027-01-01') returning id`,[property]))).id;
    await as(stranger,async () => assert.equal((await query('select id from public.viewing_inquiries')).rows.length,0));
    await as(mover,async () => assert.equal((await query('select renter_phone from public.viewing_inquiries')).rows.length,0));
    await as(owner2,()=>rejected(()=>query('select public.acknowledge_inquiry($1,true)',[inquiry])));
    await as(owner,()=>query('select public.acknowledge_inquiry($1,true)',[inquiry]));
    await as(renter,async () => {
      assert.equal((await value('select status from public.viewing_inquiries where id=$1',[inquiry])).status,'acknowledged');
      assert.equal((await value('select * from public.get_property_contact($1)',[property])).phone,'01812345678');
    });
  });

  test('request/inventory creation validates the role, rolls back invalid input, and ignores forged ownership',async () => {
    const details=JSON.stringify({ renter_id:stranger,status:'confirmed',from_area:'Banasree',to_area:'Dhanmondi',moving_date:'2027-01-01',
      km:5,from_floor:1,to_floor:2,has_lift:true,estimate:2000,contact_consent:true,customer_name:'Private customer',
      customer_phone:'01812345678',from_address:'Private unit 9',to_address:'Private unit 10',notes:'Private notes' });
    await as(owner,()=>rejected(()=>query('select public.create_moving_request($1,$2)',[details,'[{"name":"Bed","qty":1}]'])));
    await as(renter,async () => {
      await rejected(()=>query('select public.create_moving_request($1,$2)',[details,'[{"name":"Bed","qty":0}]']),'23514');
      assert.equal((await query('select id from public.moving_requests')).rows.length,0);
      request=(await value('select public.create_moving_request($1,$2) as id',[details,'[{"name":"Bed","qty":1}]'])).id;
      const row=await value('select id,renter_id,status from public.moving_requests where id=$1',[request]);
      assert.equal(row.renter_id,renter);assert.equal(row.status,'open');
      const boxes=(await value('select public.create_moving_request($1,$2) as id',[details,'[{"name":"Boxes","qty":50}]'])).id;
      assert.equal((await value('select quantity from public.moving_inventory where request_id=$1',[boxes])).quantity,50);
      await rejected(()=>query("update public.moving_requests set status='confirmed' where id=$1",[request]));
    });
  });

  test('matching movers can read job/inventory fields but cannot scrape private columns, profiles or contact RPCs',async () => {
    await as(mover,async () => {
      assert.equal((await query('select id,from_area,estimate from public.moving_requests where id=$1',[request])).rows.length,1);
      assert.equal((await query('select category from public.moving_inventory where request_id=$1',[request])).rows.length,1);
      await query('update public.profiles set is_available=false where id=$1',[mover]);
      assert.equal((await query('select id from public.moving_requests where id=$1',[request])).rows.length,0);
      await query('update public.profiles set is_available=true where id=$1',[mover]);
      for(const field of ['*','customer_name','customer_phone','from_address','to_address','notes']) {
        await rejected(()=>query(`select ${field} from public.moving_requests where id=$1`,[request]));
      }
      assert.equal((await value('select p.phone from public.moving_requests r left join public.profiles p on p.id=r.renter_id where r.id=$1',[request])).phone,null);
      await rejected(()=>query('select * from public.get_request_contact($1)',[request]));
    });
    for(const id of [remote,stranger])await as(id,async () => assert.equal((await query('select id from public.moving_requests where id=$1',[request])).rows.length,0));
  });

  test('offer eligibility, duplicate prevention, renter-only selection, contact release and revocation are enforced',async () => {
    await as(remote,()=>rejected(()=>query('insert into public.mover_offers(request_id,amount) values ($1,2200)',[request])));
    firstOffer=(await as(mover,()=>value('insert into public.mover_offers(request_id,amount) values ($1,2200) returning id',[request]))).id;
    secondOffer=(await as(mover2,()=>value('insert into public.mover_offers(request_id,amount) values ($1,2300) returning id',[request]))).id;
    await as(mover,()=>rejected(()=>query('insert into public.mover_offers(request_id,amount) values ($1,2400)',[request]),'23505'));
    await as(stranger,()=>rejected(()=>query('select public.select_mover_offer($1)',[firstOffer])));
    await as(renter,()=>query('select public.select_mover_offer($1)',[firstOffer]));
    await as(renter,()=>rejected(()=>query('select public.select_mover_offer($1)',[secondOffer]),'23514'));
    await as(mover,async () => {
      assert.equal((await value('select * from public.get_request_contact($1)',[request])).from_address,'Private unit 9');
      await rejected(()=>query('select public.confirm_booking($1)',[request]));
    });
    await as(mover2,()=>rejected(()=>query('select * from public.get_request_contact($1)',[request])));
    await as(renter,()=>query('select public.reopen_moving_request($1)',[request]));
    await as(mover,()=>rejected(()=>query('select * from public.get_request_contact($1)',[request])));
    const again=(await as(mover,()=>value('insert into public.mover_offers(request_id,amount) values ($1,2250) returning id',[request]))).id;
    await as(renter,async () => {
      await query('select public.select_mover_offer($1)',[again]);
      await query('select public.confirm_booking($1)',[request]);
      assert.equal((await value("select status from public.bookings where request_id=$1 and status='confirmed'",[request])).status,'confirmed');
    });
  });

  test('the active-booking unique index rejects a second active selection independently of the UI',async () => {
    const current=await value("select * from public.bookings where request_id=$1 and status='confirmed'",[request]);
    await rejected(()=>query(`insert into public.bookings(request_id,offer_id,renter_id,mover_id,amount)
      values ($1,$2,$3,$4,$5)`,[request,current.offer_id,renter,current.mover_id,current.amount]),'23505');
  });

  test('direct booking writes are forbidden and unconsented contact stays private even after selection',async () => {
    await as(renter,()=>rejected(()=>query('insert into public.bookings(request_id,offer_id,renter_id,mover_id,amount) values ($1,$2,$3,$4,2200)',[request,firstOffer,renter,mover])));
    const details=JSON.stringify({ from_area:'Banasree',to_area:'Rampura',moving_date:'2027-01-01',km:2,from_floor:0,to_floor:0,
      has_lift:true,estimate:1500,contact_consent:false,customer_name:'No consent',customer_phone:'01812345678' });
    const id=(await as(renter,()=>value('select public.create_moving_request($1,$2) as id',[details,'[{"name":"Boxes","qty":1}]']))).id;
    const offer=(await as(mover,()=>value('insert into public.mover_offers(request_id,amount) values ($1,1500) returning id',[id]))).id;
    await as(renter,()=>query('select public.select_mover_offer($1)',[offer]));
    await as(mover,()=>rejected(()=>query('select * from public.get_request_contact($1)',[id])));
  });

  after(async () => { if(db)await db.close(); });
});
