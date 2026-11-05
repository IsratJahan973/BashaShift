import {sortPropertyPhotos,stagePropertyPhotos,validatePropertyPhotos} from './property-photos.js';
export const REQUEST_FIELDS = 'id,renter_id,property_id,from_area,to_area,moving_date,km,from_floor,to_floor,has_lift,estimate,contact_consent,status,created_at';
export const emptyDatabase = () => ({ listings: [], inquiries: [], requests: [], workers: [] });

export async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function loadDatabase(client, profile) {
  const listings = await result(client.from('properties').select('*,property_images(*)').order('created_at', { ascending: false }));
  const images = listings.flatMap(p => p.property_images).map(i => i.storage_path);
  const data = emptyDatabase();
  let signed=[];
  try{if(images.length)signed=await result(client.storage.from('property-images').createSignedUrls(images,300));}
  catch{data.photoError='Property photos are temporarily unavailable. Try refreshing.';}
  if(signed.some(photo=>photo.error||!photo.signedUrl))data.photoError='Some property photos are temporarily unavailable. Try refreshing.';
  const urls=new Map(signed.filter(i=>i.signedUrl&&!i.error).map(i=>[i.path,i.signedUrl]));
  data.listings = listings.map(p => {
    const photos=sortPropertyPhotos(p.property_images).map(photo=>({id:photo.id,path:photo.storage_path,position:photo.position,url:urls.get(photo.storage_path)||''}));
    return {...p,ownerName:p.owner_name,ownerPhone:'',sample:p.is_demo,photos,image:photos[0]?.url||'',tone:'sage'};
  });
  if (!profile) return data;
  const [inquiries, requests, inventory, offers, bookings] = await Promise.all([
    result(client.from('viewing_inquiries').select('*,properties(title,owner_name)').order('created_at', { ascending: false })),
    result(client.from('moving_requests').select(REQUEST_FIELDS).order('created_at', { ascending: false })),
    result(client.from('moving_inventory').select('*')),
    result(client.from('mover_offers').select('*')),
    result(client.from('bookings').select('*')),
  ]);
  data.inquiries = inquiries.map(i => ({ ...i, listingId: i.property_id, listingTitle: i.properties?.title || 'Unpublished property',
    ownerName: i.properties?.owner_name || '', name: i.renter_name, phone: i.renter_phone, date: i.preferred_date }));
  await Promise.all(data.listings.map(async listing => {
    if (listing.owner_id === profile.id || inquiries.some(i => i.property_id === listing.id && i.renter_id === profile.id)) {
      const contact = await result(client.rpc('get_property_contact', { property_id: listing.id }));
      listing.ownerPhone = contact[0]?.phone || '';
    }
  }));
  const active = bookings.filter(b => ['awaiting_call', 'confirmed'].includes(b.status));
  const contacts = await Promise.all(requests.map(async r => {
    if (r.renter_id !== profile.id && !active.some(b => b.request_id === r.id && b.mover_id === profile.id && r.contact_consent)) return [r.id, {}];
    const rows = await result(client.rpc('get_request_contact', { request_id: r.id }));
    return [r.id, rows[0] || {}];
  }));
  const contactMap = new Map(contacts);
  data.requests = requests.map(r => {
    const contact = contactMap.get(r.id) || {};
    return { ...r, fromArea: r.from_area, toArea: r.to_area, date: r.moving_date, km: Number(r.km),
      fromFloor: r.from_floor, toFloor: r.to_floor, hasLift: r.has_lift, customerConsent: r.contact_consent,
      customerName: contact.customer_name || '', customerPhone: contact.customer_phone || '', notes: contact.notes || '',
      items: inventory.filter(i => i.request_id === r.id).map(i => ({ name: i.category, qty: i.quantity })),
      offers: offers.filter(o => o.request_id === r.id).map(o => ({ ...o, workerId: o.mover_id })),
      selectedOfferId: active.find(b => b.request_id === r.id)?.offer_id || null };
  });
  const moverIds = [...new Set([...offers.map(o => o.mover_id), ...(profile.role === 'mover' ? [profile.id] : [])])];
  const workers = moverIds.length ? await result(client.rpc('mover_summaries', { mover_ids: moverIds })) : [];
  data.workers = workers.map(w => ({ id: w.id, name: w.display_name, area: w.service_area, available: w.is_available,
    phone: w.phone || '', skills: ['Moving'], avatar: w.display_name.slice(0,2).toUpperCase() }));
  return data;
}

export async function saveProfile(client, profileId, fields) {
  const allowed = Object.fromEntries(Object.entries(fields).filter(([key]) => ['display_name','phone','service_area','is_available'].includes(key)));
  return result(client.from('profiles').update(allowed).eq('id', profileId).select().single());
}

export async function saveProperty(client, profile, listing, editingId) {
  const fields = { title: listing.title.trim(), owner_name: listing.ownerName.trim(), area: listing.area,
    block: listing.block.trim(), rent: Number(listing.rent), beds: Number(listing.beds), baths: Number(listing.baths),
    sqft: Number(listing.sqft) || 0, floor: Number(listing.floor), lift: listing.lift, balcony: listing.balcony,
    parking: listing.parking, available: listing.available, description: listing.description };
  if(profile?.role!=='owner')throw new Error('An owner account is required.');
  let property,staged;
  if(editingId){property=await result(client.from('properties').select('id,owner_id,status').eq('id',editingId).single());if(property.owner_id!==profile.id)throw new Error('You can only edit your own property.');}
  const photos=listing.photos;
  const unchangedLarge=photos?.length>6&&listing.originalPhotos?.length===photos.length&&photos.every((photo,i)=>photo.path===listing.originalPhotos[i].path);
  if(photos&&!unchangedLarge)validatePropertyPhotos(photos);
  await saveProfile(client,profile.id,{display_name:listing.ownerName.trim(),phone:listing.ownerPhone.replace(/\D/g,'')});
  if(!editingId)property=await result(client.from('properties').insert({...fields,status:'draft'}).select().single());
  try{
    if(photos)staged=await stagePropertyPhotos(client,profile.id,property.id,photos,editingId?listing.originalPhotos:[]);
    else if(listing.image?.startsWith('data:')){
      // Compatibility with callers of the original single-photo repository API.
      const current=await result(client.from('property_images').select('*').eq('property_id',property.id));
      staged=await stagePropertyPhotos(client,profile.id,property.id,[...sortPropertyPhotos(current).map(p=>({path:p.storage_path})),{data:listing.image}]);
    }
    await result(client.from('properties').update({...fields,status:'published'}).eq('id',property.id));
  }catch(error){
    if(staged&&!(await staged.rollback()))throw new Error('Property was not published. Original photo files are retained. Refresh before retrying.');
    throw error;
  }
  const cleanupPending=await staged?.cleanup();
  return {...property,photoWarning:cleanupPending?'Listing saved. Some photos could not be removed. Refresh and retry their removal.':''};
}

export const archiveProperty = (client, id) => result(client.from('properties').update({ status: 'archived' }).eq('id', id));
export const createInquiry = (client, propertyId, form) => result(client.from('viewing_inquiries').insert({ property_id: propertyId,
  renter_name: form.name.trim(), renter_phone: form.phone.replace(/\D/g,''), preferred_date: form.date, message: form.message }));
export const acknowledgeInquiry = (client, inquiry) => result(client.rpc('acknowledge_inquiry', { inquiry_id: inquiry.id, acknowledged: inquiry.status === 'requested' }));
export const createMove = (client, move) => result(client.rpc('create_moving_request', {
  details: { property_id: move.listingId, from_area: move.fromArea, to_area: move.toArea, moving_date: move.date,
    km: Number(move.km), from_floor: Number(move.fromFloor), to_floor: Number(move.toFloor), has_lift: move.hasLift,
    estimate: 0, customer_name: move.customerName.trim(), customer_phone: move.customerPhone.replace(/\D/g,''),
    contact_consent: move.customerConsent, notes: move.notes }, inventory: move.items,
}));
export const sendOffer = (client, requestId, amount) => result(client.from('mover_offers').insert({ request_id: requestId, amount }));
export const selectOffer = (client, offerId) => result(client.rpc('select_mover_offer', { offer_id: offerId }));
export const confirmBooking = (client, requestId) => result(client.rpc('confirm_booking', { request_id: requestId }));
export const reopenRequest = (client, requestId) => result(client.rpc('reopen_moving_request', { request_id: requestId }));
