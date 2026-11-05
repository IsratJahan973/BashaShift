import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesArea, safePhone } from '../src/domain.js';
const worker={id:'w',name:'Worker',area:'Banasree',skills:['Moving'],available:true};
const req={id:'r',status:'open',fromArea:'Banasree',offers:[]};
test('only available local movers receive requests',()=>{
  assert.equal(matchesArea(worker,req),true);
  assert.equal(matchesArea({...worker,area:'Uttara'},req),false);
  assert.equal(matchesArea({...worker,available:false},req),false);
});
test('mover eligibility uses pickup area and never destination alone',()=>{
  assert.equal(matchesArea(worker,{...req,fromArea:'Rampura',toArea:'Banasree'}),false);
  assert.equal(matchesArea({...worker,area:'Other'},req),true);
  assert.equal(matchesArea({...worker,skills:[]},req),false);
  assert.equal(matchesArea(null,req),false);
});
// Quotation selection, duplicate bids and reopening are exercised against the real
// production SQL/RPCs in acceptance-matrix.test.mjs, rather than local reducers.
test('phone validation rejects placeholders and invalid numbers',()=>{
  assert.equal(safePhone('01712345678'),true);
  assert.equal(safePhone('01XX-XXXXXXX'),false);
  assert.equal(safePhone('0171234567'),false);
});
