import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context={console}; vm.createContext(context);
vm.runInContext(`${fs.readFileSync("public/data.js","utf8")};Object.assign(globalThis,{MEALS,EXTRAS,CALREF,rankedExampleDays});`,context);
const ledger=JSON.parse(fs.readFileSync("public/nutrition-sources.json","utf8"));
const fnddsUrl="https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_csv_2024-10-31.zip";
const runtime=[];
for(const [key,meal] of Object.entries(context.MEALS)) meal.opts.forEach((food,index)=>runtime.push({id:`meals.${key}.${index}`,food}));
context.EXTRAS.forEach((food,index)=>runtime.push({id:`extras.${index}`,food}));
context.CALREF.forEach((group,groupIndex)=>group.items.forEach((food,index)=>runtime.push({id:`calref.${groupIndex}.${index}`,food})));

test("ledger covers exactly the 75 unique stable runtime paths",()=>{
  assert.equal(ledger.inventoryCount,75); assert.equal(ledger.entries.length,75);
  assert.equal(new Set(ledger.entries.map(entry=>entry.id)).size,75);
  assert.deepEqual(ledger.entries.map(entry=>entry.id),runtime.map(entry=>entry.id));
});

test("every ledger value agrees with runtime and has complete review evidence",()=>{
  for(let index=0;index<runtime.length;index++){
    const {id,food}=runtime[index],entry=ledger.entries[index];
    assert.equal(entry.id,id); assert.equal(entry.title,food.t);
    for(const key of ["k","p","f","c"]) assert.equal(entry[key],food[key]);
    assert.ok(entry.preparation&&entry.servingBasis&&entry.conversion);
    assert.match(entry.reviewDate,/^\d{4}-\d{2}-\d{2}$/); assert.ok(entry.sourceIds.length);
    for(const sourceId of entry.sourceIds){ const source=ledger.sources[sourceId]; assert.ok(source); assert.match(source.url,/^https:\/\//); }
    for(const component of entry.components){
      assert.ok(entry.sourceIds.includes(component.sourceId)); assert.ok(component.amountG>0);
      const source=ledger.sources[component.sourceId]; assert.ok(source.fdcId||component.sourceId==="muscletech-nitrotech");
    }
    assert.ok(food.k===0||Math.abs(food.k-(food.p*4+food.f*9+food.c*4))/food.k<=0.1);
  }
});

test("all 72 current entries use exact sources and source-scaled rounded values",()=>{
  const current=ledger.entries.filter(entry=>!entry.legacy);
  assert.equal(current.length,72); assert.ok(current.every(entry=>entry.reviewOutcome==="recalculated"));
  assert.ok(!Object.keys(ledger.sources).some(id=>id.includes("method")));
  const displayExceptions=new Set(["meals.bc.0","meals.cf.0","extras.6","calref.4.5"]);
  for(const entry of current){
    if(entry.id==="meals.bc.0"){
      assert.deepEqual(entry.sourceIds,["nescafe-2in1"]); continue;
    }
    assert.ok(entry.components.length);
    const raw={k:0,p:0,f:0,c:0};
    for(const component of entry.components){
      const source=ledger.sources[component.sourceId];
      assert.equal(source.basis,"per 100 g edible portion");
      assert.equal(source.url,fnddsUrl); assert.equal(source.datasetSourceId,"fndds-download"); assert.ok(Number.isInteger(source.fdcId));
      for(const key of Object.keys(raw)) raw[key]+=source.nutrients[key]*component.amountG/100;
    }
    if(displayExceptions.has(entry.id)) continue;
    for(const key of Object.keys(raw)) assert.equal(entry[key],Math.round(raw[key]),`${entry.id} ${key}`);
  }
});

test("three historical options are frozen and example inventory remains 192",()=>{
  const legacy=ledger.entries.filter(entry=>entry.legacy);
  assert.deepEqual(legacy.map(entry=>entry.id),["meals.pw.0","meals.nt.0","meals.nt.1"]);
  assert.ok(legacy.every(entry=>entry.reviewOutcome==="frozen-legacy"));
  assert.deepEqual(legacy.map(({k,p,f,c})=>({k,p,f,c})),[
    {k:222,p:25,f:2,c:26},{k:246,p:31,f:2.5,c:26},{k:270,p:38,f:6.5,c:15}
  ]);
  assert.equal(context.rankedExampleDays({klo:1,khi:10000,plo:1,phi:1000},1000).length,192);
});
