import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { REQUEST_FIELDS, result } from '../../src/lib/repository.js';

const url = process.env.BASHASHIFT_TEST_SUPABASE_URL;
const key = process.env.BASHASHIFT_TEST_SUPABASE_KEY;
const adminKey = process.env.BASHASHIFT_TEST_SUPABASE_ADMIN_KEY;
if (!url || !key || !adminKey || !['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname)) {
  throw new Error('Use npm run test:integration against local Supabase only. No tests were executed.');
}
const options = { auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } };
const client = () => createClient(url, key, options);
const admin = createClient(url, adminKey, options);
const anon = client();
const actors = [];
const paths = [];
let owner, otherOwner, renter, otherRenter, mover, secondMover, remoteMover, property, draft, request;
const phone = '01812345678';
const fields = title => ({ title, owner_name:'Local Test Owner', area:'Banasree', block:'Test Block', rent:18000,
  beds:2, baths:1, available:'2027-01-01', status:'published' });

async function signup(role, area='Banasree') {
  const sdk = client();
  const password = randomUUID()+'aA1!';
  const email = `phase2-${randomUUID()}@example.test`;
  const { data, error } = await sdk.auth.signUp({ email, password, options:{ data:{ role, display_name:'Local Test '+role, phone, service_area:area } } });
  if (error) throw new Error(error.message);
  assert.equal(Boolean(data.session),true,'Local test config must have email confirmations disabled');
  actors.push(data.user.id);
  return { sdk, id:data.user.id, email, password };
}
const denied = async query => assert.equal(Boolean((await query).error),true,'Operation should be rejected');

describe('Local Supabase authentication, ownership and privacy', { concurrency:false }, () => {
  before(async () => {
    owner=await signup('owner'); otherOwner=await signup('owner'); renter=await signup('renter');
    otherRenter=await signup('renter'); mover=await signup('mover'); secondMover=await signup('mover'); remoteMover=await signup('mover','Rampura');
    property=await result(owner.sdk.from('properties').insert(fields('Published local integration fixture')).select().single());
    draft=await result(owner.sdk.from('properties').insert({ ...fields('Private draft fixture'), status:'draft' }).select().single());
  });

  test('signup creates the correct profile; login and logout use real Auth sessions', async () => {
    const profile = await result(renter.sdk.from('profiles').select('*').single());
    assert.equal(profile.id,renter.id); assert.equal(profile.role,'renter');
    const fresh=client();
    await denied(fresh.auth.signInWithPassword({ email:renter.email, password:randomUUID() }));
    const login=await fresh.auth.signInWithPassword({ email:renter.email, password:renter.password });
    assert.equal(login.error,null); assert.equal(login.data.user.id,renter.id);
    assert.equal((await fresh.auth.signOut()).error,null);
    assert.equal((await fresh.auth.getSession()).data.session,null);
  });

  test('a user cannot grant themselves another role or read another profile', async () => {
    await denied(renter.sdk.from('profiles').update({ role:'owner' }).eq('id',renter.id));
    await result(renter.sdk.auth.updateUser({ data:{ role:'owner' } }));
    const unchanged=await result(renter.sdk.from('profiles').select('role').single());
    assert.equal(unchanged.role,'renter');
    assert.deepEqual(await result(renter.sdk.from('profiles').select('*').eq('id',owner.id)),[]);
    await denied(anon.from('profiles').select('phone'));
    const bad=client();
    await denied(bad.auth.signUp({ email:`bad-${randomUUID()}@example.test`, password:randomUUID(), options:{ data:{ role:'admin', display_name:'Invalid role', phone } } }));
  });

  test('published rentals are shared; draft rentals and ownership changes are protected', async () => {
    assert.equal((await result(anon.from('properties').select('id').eq('id',property.id))).length,1);
    assert.equal((await result(anon.from('properties').select('id').eq('id',draft.id))).length,0);
    assert.equal((await result(otherOwner.sdk.from('properties').update({ title:'stolen' }).eq('id',property.id).select('id'))).length,0);
    await denied(owner.sdk.from('properties').update({ owner_id:otherOwner.id }).eq('id',property.id));
    await denied(renter.sdk.from('properties').insert(fields('Unauthorized renter listing')));
    await result(owner.sdk.from('properties').update({ title:'Owner-managed rental' }).eq('id',property.id));
    assert.equal((await result(renter.sdk.from('properties').select('title').eq('id',property.id).single())).title,'Owner-managed rental');
  });

  test('property photos use private storage and enforce ownership and publication', async () => {
    const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1cAAAAASUVORK5CYII=','base64');
    const path=`${owner.id}/${draft.id}/${randomUUID()}.png`; paths.push(path);
    await result(owner.sdk.storage.from('property-images').upload(path,bytes,{ contentType:'image/png' }));
    await result(owner.sdk.from('property_images').insert({ property_id:draft.id, storage_path:path }));
    await denied(otherOwner.sdk.storage.from('property-images').upload(`${owner.id}/${draft.id}/${randomUUID()}.png`,bytes,{ contentType:'image/png' }));
    await denied(anon.storage.from('property-images').createSignedUrl(path,60));
    await result(owner.sdk.from('properties').update({ status:'published' }).eq('id',draft.id));
    const signed=await result(anon.storage.from('property-images').createSignedUrl(path,60));
    assert.equal(typeof signed.signedUrl,'string');
    await result(owner.sdk.from('properties').update({ status:'draft' }).eq('id',draft.id));
    await denied(otherOwner.sdk.from('property_images').insert({ property_id:property.id, storage_path:path }));
  });

  test('viewing inquiries and owner phone numbers are limited to their participants', async () => {
    await denied(mover.sdk.rpc('get_property_contact',{ property_id:property.id }));
    const inquiry=await result(renter.sdk.from('viewing_inquiries').insert({ property_id:property.id,
      renter_name:'Test Renter', renter_phone:phone, preferred_date:'2027-01-01' }).select().single());
    assert.equal((await result(owner.sdk.from('viewing_inquiries').select('*').eq('id',inquiry.id))).length,1);
    assert.equal((await result(otherRenter.sdk.from('viewing_inquiries').select('*').eq('id',inquiry.id))).length,0);
    assert.equal((await result(mover.sdk.from('viewing_inquiries').select('*').eq('id',inquiry.id))).length,0);
    await denied(otherOwner.sdk.rpc('acknowledge_inquiry',{ inquiry_id:inquiry.id, acknowledged:true }));
    await result(owner.sdk.rpc('acknowledge_inquiry',{ inquiry_id:inquiry.id, acknowledged:true }));
    assert.equal((await result(renter.sdk.from('viewing_inquiries').select('status').eq('id',inquiry.id).single())).status,'acknowledged');
    assert.equal((await result(renter.sdk.rpc('get_property_contact',{ property_id:property.id })))[0].phone,phone);
  });

  test('request creation is renter-only, atomic, and ignores forged ownership/status', async () => {
    const details={ from_area:'Banasree', to_area:'Dhanmondi', moving_date:'2027-01-02', km:5,
      from_floor:2, to_floor:3, has_lift:false, estimate:2200, contact_consent:true,
      customer_name:'Private test customer', customer_phone:phone, from_address:'Private unit 9',
      to_address:'Private unit 10', notes:'Private access notes', renter_id:otherRenter.id, status:'confirmed' };
    await denied(owner.sdk.rpc('create_moving_request',{ details, inventory:[{ name:'Bed', qty:1 }] }));
    await denied(renter.sdk.rpc('create_moving_request',{ details, inventory:[{ name:'Bed', qty:0 }] }));
    const before=await result(admin.from('moving_requests').select('id').eq('renter_id',renter.id));
    assert.equal(before.length,0,'Invalid inventory must roll back its request');
    request=await result(renter.sdk.rpc('create_moving_request',{ details, inventory:[{ name:'Bed', qty:1 }] }));
    const safe=await result(renter.sdk.from('moving_requests').select(REQUEST_FIELDS).eq('id',request).single());
    assert.equal(safe.renter_id,renter.id); assert.equal(safe.status,'open');
    await denied(renter.sdk.from('moving_requests').update({ status:'confirmed' }).eq('id',request));
  });

  test('eligible movers get safe job/inventory data; direct and RPC contact scraping fail', async () => {
    assert.equal((await result(mover.sdk.from('moving_requests').select(REQUEST_FIELDS).eq('id',request))).length,1);
    assert.equal((await result(mover.sdk.from('moving_inventory').select('*').eq('request_id',request))).length,1);
    const nested=await result(mover.sdk.from('moving_requests').select('id,profiles!moving_requests_renter_id_fkey(phone)').eq('id',request));
    assert.equal(nested[0].profiles,null,'Embedding a profile must not bypass its RLS');
    assert.equal((await result(remoteMover.sdk.from('moving_requests').select(REQUEST_FIELDS).eq('id',request))).length,0);
    assert.equal((await result(otherRenter.sdk.from('moving_requests').select(REQUEST_FIELDS).eq('id',request))).length,0);
    for (const columns of ['*','customer_phone','notes','from_address,to_address']) {
      await denied(mover.sdk.from('moving_requests').select(columns).eq('id',request));
    }
    await denied(mover.sdk.rpc('get_request_contact',{ request_id:request }));
    await denied(otherRenter.sdk.rpc('get_request_contact',{ request_id:request }));
    await result(mover.sdk.from('profiles').update({ is_available:false }).eq('id',mover.id));
    assert.equal((await result(mover.sdk.from('moving_requests').select(REQUEST_FIELDS).eq('id',request))).length,0);
    await result(mover.sdk.from('profiles').update({ is_available:true }).eq('id',mover.id));
  });

  test('offers are eligible-mover-only; selection is atomic and only the selected mover gets contact', async () => {
    await denied(remoteMover.sdk.from('mover_offers').insert({ request_id:request, amount:2300 }));
    await denied(renter.sdk.from('mover_offers').insert({ request_id:request, amount:2300 }));
    const first=await result(mover.sdk.from('mover_offers').insert({ request_id:request, amount:2400 }).select().single());
    const second=await result(secondMover.sdk.from('mover_offers').insert({ request_id:request, amount:2500 }).select().single());
    await denied(mover.sdk.from('mover_offers').insert({ request_id:request, amount:2600 }));
    await denied(otherRenter.sdk.rpc('select_mover_offer',{ offer_id:first.id }));
    await denied(mover.sdk.from('bookings').insert({ request_id:request, offer_id:first.id, renter_id:renter.id, mover_id:mover.id, amount:2400 }));
    const competing=await Promise.all([first.id,second.id].map(id => renter.sdk.rpc('select_mover_offer',{ offer_id:id })));
    assert.equal(competing.filter(r=>!r.error).length,1);
    const booking=await result(renter.sdk.from('bookings').select('*').eq('request_id',request).eq('status','awaiting_call').single());
    const winner=booking.mover_id===mover.id?mover:secondMover;
    const loser=booking.mover_id===mover.id?secondMover:mover;
    assert.equal((await result(winner.sdk.rpc('get_request_contact',{ request_id:request })))[0].from_address,'Private unit 9');
    await denied(loser.sdk.rpc('get_request_contact',{ request_id:request }));
    await denied(winner.sdk.rpc('confirm_booking',{ request_id:request }));
    await result(renter.sdk.rpc('reopen_moving_request',{ request_id:request }));
    await denied(winner.sdk.rpc('get_request_contact',{ request_id:request }));
    const again=await result(mover.sdk.from('mover_offers').insert({ request_id:request, amount:2450 }).select().single());
    await result(renter.sdk.rpc('select_mover_offer',{ offer_id:again.id }));
    await result(renter.sdk.rpc('confirm_booking',{ request_id:request }));
    assert.equal((await result(renter.sdk.from('bookings').select('*').eq('request_id',request).eq('status','confirmed'))).length,1);
    await denied(renter.sdk.rpc('select_mover_offer',{ offer_id:second.id }));
  });

  test('without contact consent even the selected mover cannot retrieve contact details', async () => {
    const id=await result(renter.sdk.rpc('create_moving_request',{ details:{ from_area:'Banasree',to_area:'Rampura',moving_date:'2027-01-03',km:2,
      from_floor:1,to_floor:1,has_lift:true,estimate:1500,contact_consent:false,customer_name:'No consent',customer_phone:phone },inventory:[{ name:'Boxes',qty:1 }] }));
    const offer=await result(mover.sdk.from('mover_offers').insert({ request_id:id,amount:1500 }).select().single());
    await result(renter.sdk.rpc('select_mover_offer',{ offer_id:offer.id }));
    await denied(mover.sdk.rpc('get_request_contact',{ request_id:id }));
    assert.equal((await result(renter.sdk.rpc('get_request_contact',{ request_id:id })))[0].customer_phone,phone);
  });

  after(async () => {
    if (!actors.length) return;
    if (paths.length) await admin.storage.from('property-images').remove(paths);
    const ids=(await result(admin.from('moving_requests').select('id').in('renter_id',actors))).map(r=>r.id);
    if (ids.length) {
      await result(admin.from('bookings').delete().in('request_id',ids));
      await result(admin.from('mover_offers').delete().in('request_id',ids));
      await result(admin.from('moving_inventory').delete().in('request_id',ids));
      await result(admin.from('moving_requests').delete().in('id',ids));
    }
    await result(admin.from('viewing_inquiries').delete().in('renter_id',actors));
    await result(admin.from('properties').delete().in('owner_id',actors));
    for (const id of actors) { const { error }=await admin.auth.admin.deleteUser(id); if (error) throw new Error(error.message); }
  });
});
