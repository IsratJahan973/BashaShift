export const money = n => '৳' + Math.round(Number(n) || 0).toLocaleString('en-BD');
export const safePhone = p => /^01[3-9]\d{8}$/.test(String(p || '').replace(/\D/g, ''));
export const phoneLink = p => safePhone(p) ? 'tel:' + String(p).replace(/\D/g,'') : null;
export function matchesArea(worker, request) {
  if (!worker || !request || !worker.available) return false;
  if (!worker.skills?.includes('Moving')) return false;
  const a = (worker.area || '').toLowerCase().trim();
  const from = (request.fromArea || '').toLowerCase().trim();
  return a === from || a === 'other';
}
