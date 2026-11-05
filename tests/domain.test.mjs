import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesArea, addOffer, chooseOffer, declineAndReopen, safePhone } from '../src/domain.js';
const worker={id:'w',name:'Worker',area:'Banasree',skills:['Moving'],available:true};
const req={id:'r',status:'open',fromArea:'Banasree',offers:[]};
test('only available local movers receive requests',()=>{
  assert.equal(matchesArea(worker,req),true);
  assert.equal(matchesArea({...worker,area:'Uttara'},req),false);
  assert.equal(matchesArea({...worker,available:false},req),false);
});
test('independent mover quotations are selected by renter before booking confirmation',()=>{
  const withOffer=addOffer(req,worker,2700);
  assert.equal(withOffer.status,'open');
  assert.equal(withOffer.offers[0].amount,2700);
  assert.throws(()=>addOffer(req,worker,0),/valid price/);
  const chosen=chooseOffer(withOffer,withOffer.offers[0].id);
  assert.equal(chosen.status,'awaiting_call');
  assert.equal(chosen.offers[0].status,'selected');
  const reopened=declineAndReopen(chosen);
  assert.equal(reopened.status,'open');
  assert.equal(reopened.offers[0].status,'declined');
});
test('no duplicate pending offer by the same worker',()=>{
  const withOffer=addOffer(req,worker,2500);
  assert.throws(()=>addOffer(withOffer,worker,3000),/already responded/);
});
test('phone validation rejects placeholders and invalid numbers',()=>{
  assert.equal(safePhone('01712345678'),true);
  assert.equal(safePhone('01XX-XXXXXXX'),false);
  assert.equal(safePhone('0171234567'),false);
});
