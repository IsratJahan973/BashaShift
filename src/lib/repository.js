export const REQUEST_FIELDS = 'id,renter_id,property_id,from_area,to_area,moving_date,km,from_floor,to_floor,has_lift,estimate,contact_consent,status,created_at';
export const emptyDatabase = () => ({ listings: [], inquiries: [], requests: [], workers: [], selectedWorkerId: null });

export async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function loadDatabase(client, profile) {
  const listings = await result(client.from('properties').select('*,property_images(*)').order('created_at', { ascending: false }));
  const images = listings.flatMap(p => p.property_images).map(i => i.storage_path);
  const signed = images.length ? await result(client.storage.from('property-images').createSignedUrls(images, 300)) : [];
  const urls = new Map(signed.map(i => [i.path, i.signedUrl]));
  const data = emptyDatabase();
  data.listings = listings.map(p => ({ ...p, ownerName: p.owner_name, ownerPhone: '', sample: p.is_demo,
    image: urls.get([...p.property_images].sort((a,b) => a.position - b.position || b.created_at.localeCompare(a.created_at))[0]?.storage_path) || '', tone: 'sage' }));
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
      selectedOfferId: active.find(b => b.request_id === r.id)?.offer_id || null, sample: false };
  });
  const moverIds = [...new Set([...offers.map(o => o.mover_id), ...(profile.role === 'mover' ? [profile.id] : [])])];
  const workers = moverIds.length ? await result(client.rpc('mover_summaries', { mover_ids: moverIds })) : [];
  data.workers = workers.map(w => ({ id: w.id, name: w.display_name, area: w.service_area, available: w.is_available,
    phone: w.phone || '', sample: false, skills: ['Moving'], avatar: w.display_name.slice(0,2).toUpperCase() }));
  data.selectedWorkerId = profile.role === 'mover' ? profile.id : null;
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
  await saveProfile(client, profile.id, { display_name: listing.ownerName.trim(), phone: listing.ownerPhone.replace(/\D/g, '') });
  let property;
  if (editingId) property = await result(client.from('properties').update(fields).eq('id', editingId).select().single());
  else property = await result(client.from('properties').insert({ ...fields, status: 'draft' }).select().single());
  if (listing.image?.startsWith('data:')) {
    const image = await (await fetch(listing.image)).blob();
    const path = `${profile.id}/${property.id}/${crypto.randomUUID()}.jpg`;
    await result(client.storage.from('property-images').upload(path, image, { contentType: 'image/jpeg' }));
    try { await result(client.from('property_images').insert({ property_id: property.id, storage_path: path })); }
    catch (error) { await client.storage.from('property-images').remove([path]); throw error; }
  }
  await result(client.from('properties').update({ status: 'published' }).eq('id', property.id));
  return property;
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
