import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeItems,validateDesign,applyCheckout,summarize,findItem} from '../dist/inventory-model.mjs';
const initial=()=>normalizeItems([{code:'S779',quantities:[3,4,6,4,3],price:3500},{code:'CF56',quantities:[1,0,2,1,0],price:4000}]);
const draft=()=>({itemId:'legacy-S779',expectedCode:'S779',expectedPrice:3500,size:42,quantity:2,paymentMethod:'COD',paymentStatus:'Pending'});
test('existing inventory and old array format survive normalization',()=>{
  const source=[['S779',[3,4,6,4,3]]];
  assert.equal(normalizeItems(source)[0].price,0);
  assert.deepEqual(normalizeItems(source)[0].quantities,[3,4,6,4,3]);
  assert.deepEqual(source,[['S779',[3,4,6,4,3]]]);
});
test('stable ID persists through code change and list reorder',()=>{
  const items=initial(),id=items[0].id;
  items[0].code='AE-NEW';
  assert.equal(findItem(normalizeItems(items.reverse()),id).code,'AE-NEW');
});
test('checkout deducts selected shoe and size without changing source',()=>{
  const items=initial(), result=applyCheckout(items.reverse(),draft());
  assert.equal(findItem(result.items,'legacy-S779').quantities[2],4);
  assert.equal(findItem(items,'legacy-S779').quantities[2],6);
  assert.equal(result.sale.total,7000);
  assert.equal(result.sale.paymentStatus,'Pending');
  assert.equal(findItem(result.items,'legacy-CF56').quantities[2],2);
});
test('rejects overselling, invalid sizes, fractional counts, stale price and code',()=>{
  for(const changes of [{quantity:7},{quantity:1.5},{quantity:0},{size:39},{expectedPrice:1},{expectedCode:'OLD'},{paymentMethod:'other'},{paymentStatus:'other'}]){
    assert.throws(()=>applyCheckout(initial(),{...draft(),...changes}));
  }
});
test('competing checkouts cannot sell the last pair twice',()=>{
  const items=initial();items[0].quantities[2]=1;
  const first=applyCheckout(items,{...draft(),quantity:1});
  assert.throws(()=>applyCheckout(first.items,{...draft(),quantity:1}),/Not enough/);
});
test('archived shoes stay recoverable and cannot be sold',()=>{
  const items=initial();items[0].archived=true;
  assert.throws(()=>applyCheckout(items,draft()),/archived/);
  assert.equal(summarize(items).pairs,4);
  items[0].archived=false;
  assert.equal(summarize(items).pairs,24);
});
test('duplicate codes including archived shoes rejected; decimal prices rounded',()=>{
  const items=initial();items[1].archived=true;
  assert.throws(()=>validateDesign(items,items[0].id,' cf56 ',1),/already exists/);
  assert.equal(validateDesign(items,items[0].id,' ae-1 ',3500.155).price,3500.16);
  assert.throws(()=>validateDesign(items,'new','',1));
  assert.throws(()=>validateDesign(items,'new','X',Infinity));
});
test('unpriced stock blocked; sale has immutable snapshot fields',()=>{
  const items=initial();items[0].price=0;
  assert.throws(()=>applyCheckout(items,{...draft(),expectedPrice:0}),/selling price/);
  const result=applyCheckout(initial(),draft());
  result.items[0].price=6000;result.items[0].code='DIFFERENT';
  assert.equal(result.sale.price,3500);assert.equal(result.sale.shoeCode,'S779');
});
