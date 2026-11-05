// Deterministic guidance only. Inputs come from the existing RLS-scoped feed.
export const facilities = ['lift', 'parking', 'balcony'];
export const apartmentWeights = Object.freeze({
  balanced: { affordability: 40, facilities: 35, area: 25 },
  affordability: { affordability: 70, facilities: 20, area: 10 },
  facilities: { affordability: 20, facilities: 65, area: 15 },
  area: { affordability: 20, facilities: 20, area: 60 },
});
const normalized = value => String(value || '').trim().toLowerCase();
const validNumber = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
const compareId = (a,b) => String(a).localeCompare(String(b));

export function rankApartments(listings, preferences = {}) {
  const { maxBudget = '', minBeds = '', requiredArea = '', preferredArea = '', required = [], optional = [], priority = 'balanced' } = preferences;
  if ((maxBudget !== '' && (!validNumber(maxBudget) || Number(maxBudget) <= 0)) ||
      (minBeds !== '' && (!validNumber(minBeds) || Number(minBeds) < 0)) ||
      required.some(key => !facilities.includes(key)) || optional.some(key => !facilities.includes(key))) return [];
  const wants = [...new Set(optional)];
  const weights = apartmentWeights[priority] || apartmentWeights.balanced;
  return listings.filter(p => p.status === 'published' && !p.sample && !p.is_demo && validNumber(p.rent) && Number(p.rent) > 0 && validNumber(p.beds) && Number(p.beds) >= 0)
    .filter(p => (maxBudget === '' || Number(p.rent) <= Number(maxBudget)) &&
      (minBeds === '' || Number(p.beds) >= Number(minBeds)) &&
      (!requiredArea || normalized(p.area) === normalized(requiredArea)) && required.every(key => p[key] === true))
    .map(p => {
      const matched = wants.filter(key => p[key] === true);
      const missing = wants.filter(key => p[key] !== true);
      const areaMatch = !preferredArea || normalized(p.area) === normalized(preferredArea);
      // No budget or optional facilities: omit that dimension, rather than invent a fit.
      const components = {
        affordability: maxBudget === '' ? null : 1 - Number(p.rent) / Number(maxBudget),
        facilities: wants.length ? matched.length / wants.length : null,
        area: preferredArea ? Number(areaMatch) : null,
      };
      const totalWeight = Object.keys(components).reduce((n,key) => n + (components[key] === null ? 0 : weights[key]),0);
      const score = totalWeight ? Math.round(Object.keys(components).reduce((n,key) => n + (components[key] ?? 0) * weights[key],0) / totalWeight * 100) : null;
      const budgetRemaining = maxBudget === '' ? null : Number(maxBudget) - Number(p.rent);
      const explanations = [];
      if(preferredArea) explanations.push(areaMatch ? 'Preferred area / পছন্দের এলাকা' : 'Different from preferred area / পছন্দের এলাকার বাইরে');
      if(matched.length) explanations.push(`Listed optional facilities / তালিকায় আছে: ${matched.join(', ')}`);
      if(missing.length) explanations.push(`Optional facilities absent or unspecified / নেই বা উল্লেখ নেই: ${missing.join(', ')}`);
      return {
        id:p.id, score, components, weights, budgetRemaining,
        meetsRequiredCriteria:true,
        match:areaMatch && !missing.length ? 'exact' : 'partial',
        explanations,
      };
    }).sort((a,b) => (b.score ?? 0) - (a.score ?? 0) || compareId(a.id,b.id));
}

// No reviews source exists in the current schema. Reliability remains unknown;
// do not turn profile text, demo data or arbitrary numeric ratings into evidence.
export function rankMoverOffers(offers, priority = 'affordability') {
  const eligible = offers.filter(o => o.status === 'pending' && validNumber(o.amount) && Number(o.amount) >= 100 && Number(o.amount) <= 500000);
  const lowest = Math.min(...eligible.map(o => Number(o.amount)));
  return eligible.map(o => ({ id:o.id, amount:Number(o.amount), difference:Number(o.amount) - lowest,
    score:Math.round(lowest / Number(o.amount) * 100), reviews:null,
    explanation:priority === 'reliability'
      ? 'Verified reliability data unavailable; sorted by price / নির্ভরযোগ্য রিভিউ নেই, দর অনুযায়ী সাজানো'
      : 'Lowest price first; service scope may differ / কম দর আগে; সেবার পরিধি ভিন্ন হতে পারে',
    recommended:Number(o.amount) === lowest,
  })).sort((a,b) => a.amount - b.amount || compareId(a.id,b.id));
}
