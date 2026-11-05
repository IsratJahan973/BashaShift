import test from 'node:test';
import assert from 'node:assert/strict';
import { rankApartments, rankMoverOffers } from '../src/lib/recommendations.js';
import { calculateMovingBudget } from '../src/lib/pricing.js';

const property = (id,change={}) => ({id,status:'published',rent:18000,beds:2,area:'Banasree',lift:true,parking:false,balcony:true,...change});
test('apartments enforce every hard requirement and never recommend demo or unpublished listings',()=>{
  const properties=[property('yes'),property('expensive',{rent:21000}),property('small',{beds:1}),property('no-lift',{lift:false}),property('unknown',{lift:undefined}),property('elsewhere',{area:'Mirpur'}),property('sample',{sample:true}),property('demo',{is_demo:true}),property('draft',{status:'draft'}),property('invalid',{rent:null})];
  const result=rankApartments(properties,{maxBudget:20000,minBeds:2,required:['lift'],requiredArea:'banasree'});
  assert.deepEqual(result.map(p=>p.id),['yes']);
  assert.deepEqual(rankApartments(properties,{maxBudget:-1}),[]);
  assert.deepEqual(rankApartments(properties,{required:['pool']}),[]);
  assert.deepEqual(rankApartments([]),[]);
});
test('priority changes weighted rankings without relaxing requirements; exact and partial matches are explicit',()=>{
  const listings=[property('cheap',{rent:10000,parking:false,area:'Mirpur'}),property('fit',{rent:19000,parking:true})];
  const prefs={maxBudget:20000,optional:['parking'],preferredArea:'Banasree'};
  const affordable=rankApartments(listings,{...prefs,priority:'affordability'});
  assert.equal(affordable[0].id,'cheap');assert.equal(affordable[0].match,'partial');
  const suitable=rankApartments(listings,{...prefs,priority:'facilities'});
  assert.equal(suitable[0].id,'fit');assert.equal(suitable[0].match,'exact');
  assert.equal(suitable[0].components.facilities,1);
  assert.equal(suitable[1].explanations.some(x=>x.includes('parking')),true);
  assert.deepEqual(rankApartments(listings,{...prefs,required:['parking']}).map(p=>p.id),['fit']);
});
test('equal-to-budget apartments meet requirements while headroom and preference scores stay distinct',()=>{
  const listings=[
    property('at-limit',{rent:20000,parking:true}),
    property('mid-price',{rent:16000,parking:false,area:'Mirpur'}),
    property('lower-price',{rent:12000,parking:true,balcony:false}),
  ];
  const ranked=rankApartments(listings,{
    maxBudget:20000,required:['lift'],optional:['parking'],preferredArea:'Banasree',
    priority:'balanced',
  });
  assert.deepEqual(ranked.map(row=>row.id),['lower-price','at-limit','mid-price']);
  const atLimit=ranked.find(row=>row.id==='at-limit');
  assert.equal(atLimit.meetsRequiredCriteria,true);
  assert.equal(atLimit.budgetRemaining,0);
  assert.equal(atLimit.components.affordability,0);
  assert.equal(atLimit.components.facilities,1);
  assert.equal(atLimit.components.area,1);
  assert.equal(atLimit.score,60);
  assert.equal(atLimit.weights.affordability,40);
  assert.equal(atLimit.weights.facilities,35);
  assert.equal(atLimit.weights.area,25);
  assert.equal(ranked.find(row=>row.id==='lower-price').budgetRemaining,8000);
  assert.equal(ranked.find(row=>row.id==='lower-price').score,76);
  assert.equal(ranked.find(row=>row.id==='mid-price').budgetRemaining,4000);
  assert.equal(ranked.find(row=>row.id==='mid-price').score,8);
});
test('unknown facilities are never claimed, no preferences fabricate no score, sorting is stable',()=>{
  const listings=[property('b',{parking:undefined}),property('a',{parking:false})];
  const ranked=rankApartments(listings,{optional:['parking']});
  assert.ok(ranked.every(p=>p.match==='partial'&&p.components.facilities===0));
  assert.deepEqual(rankApartments(listings).map(p=>p.id),['a','b']);
  assert.equal(rankApartments(listings)[0].score,null);
  assert.equal(JSON.stringify(ranked).includes('ownerPhone'),false);
});
test('offer comparison handles empty, single, tied, invalid, stale and multiple quotations',()=>{
  const offer=(id,amount,change={})=>({id,amount,status:'pending',...change});
  assert.deepEqual(rankMoverOffers([]),[]);
  const single=rankMoverOffers([offer('one','2200')]);
  assert.equal(single[0].recommended,true);assert.equal(single[0].difference,0);assert.equal(single[0].reviews,null);
  const ranked=rankMoverOffers([offer('high',3000),offer('low',2000),offer('tie',2000),offer('invalid',NaN),offer('empty',''),offer('selected',1500,{status:'selected'})]);
  assert.deepEqual(ranked.map(o=>o.id),['low','tie','high']);
  assert.equal(ranked[2].difference,1000);assert.equal(ranked[2].score,67);
  assert.ok(ranked.slice(0,2).every(o=>o.recommended));
});
test('missing reviews cannot fabricate reliability or modify independent offers',()=>{
  const offers=[{id:'a',workerId:'wa',status:'pending',amount:2000,rating:5,reviewCount:99},{id:'b',workerId:'wb',status:'pending',amount:2500}];
  const ranked=rankMoverOffers(offers,'reliability');
  assert.ok(ranked.every(o=>o.reviews===null));assert.match(ranked[0].explanation,/unavailable/);
  assert.deepEqual(offers.map(o=>o.status),['pending','pending']);
});
const move={items:[{name:'Bed',qty:2},{name:'Boxes',qty:4}],km:10,fromFloor:2,toFloor:3,hasLift:false};
// Arbitrary TEST inputs only, not market price defaults.
const costs={base:100,perKm:20,perUnit:30,perFloorUnit:5,workload:1,margin:20};
test('budget formula is itemized, deterministic and uses actual corrected quantities, access and workload',()=>{
  const before=structuredClone(move);const budget=calculateMovingBudget(move,costs);
  assert.equal(budget.units,10);assert.equal(budget.stairs,5);
  assert.deepEqual(budget.parts,{base:100,distance:200,handling:300,stairs:250});
  assert.equal(budget.low,680);assert.equal(budget.high,1020);
  assert.deepEqual(move,before);
  assert.equal(calculateMovingBudget({...move,hasLift:true},costs).parts.stairs,0);
  assert.equal(calculateMovingBudget({...move,fromLift:true,toLift:false},costs).stairs,3);
  assert.equal(calculateMovingBudget(move,{...costs,workload:2}).parts.handling,600);
  assert.equal(calculateMovingBudget({...move,items:[{name:'Boxes',qty:1}]},costs).units,1);
});
test('invalid or incomplete budget inputs show fallback rather than a made-up price',()=>{
  for(const value of [{...move,km:-1},{...move,fromFloor:1.5},{...move,items:[]},{...move,items:[{name:'Car',qty:1}]},{...move,items:[{name:'Bed',qty:-2}]}])assert.equal(calculateMovingBudget(value,costs),null);
  for(const value of [{},{...costs,base:''},{...costs,margin:0},{...costs,workload:Infinity},{...costs,perKm:-1},{base:0,perKm:0,perUnit:0,perFloorUnit:0,workload:1,margin:20}])assert.equal(calculateMovingBudget(move,value),null);
});
