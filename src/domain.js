export const money = n => '৳' + Math.round(Number(n) || 0).toLocaleString('en-BD');
export const uid = (prefix='id') => `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2)}`;
export const safePhone = p => /^01[3-9]\d{8}$/.test(String(p || '').replace(/\D/g, ''));
export const phoneLink = p => safePhone(p) ? 'tel:' + String(p).replace(/\D/g,'') : null;
export function matchesArea(worker, request) {
  if (!worker || !request || !worker.available) return false;
  if (!worker.skills?.includes('Moving')) return false;
  const a = (worker.area || '').toLowerCase().trim();
  const from = (request.fromArea || '').toLowerCase().trim();
  return a === from || a === 'other';
}
export function addOffer(request, worker, amount) {
  if (!request || request.status !== 'open') throw new Error('Request is no longer open');
  if (!matchesArea(worker, request)) throw new Error('Worker is not eligible for this request');
  if (request.offers.some(o=>o.workerId===worker.id && o.status==='pending')) throw new Error('You already responded');
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 100 || value > 500000) throw new Error('Enter a valid price');
  return { ...request, offers: [...request.offers, { id: uid('offer'), workerId: worker.id, amount: value, status: 'pending', createdAt: new Date().toISOString() }] };
}
export function chooseOffer(request, offerId) {
  if (request.status !== 'open') throw new Error('Request is not open');
  if (!request.offers.some(o => o.id === offerId && o.status === 'pending')) throw new Error('Offer unavailable');
  return { ...request, status: 'awaiting_call', selectedOfferId: offerId, offers: request.offers.map(o => ({ ...o, status: o.id === offerId ? 'selected' : 'not_selected' })) };
}
export function declineAndReopen(request) {
  if (request.status !== 'awaiting_call') throw new Error('No selected worker');
  return { ...request, status: 'open', selectedOfferId: null, offers: request.offers.map(o=>({...o,status:'declined'})) };
}
