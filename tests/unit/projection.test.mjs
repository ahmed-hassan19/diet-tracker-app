import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context={console,TextEncoder,TextDecoder,setTimeout,clearTimeout};
vm.createContext(context);
vm.runInContext(`${fs.readFileSync("public/data.js","utf8")}
${fs.readFileSync("public/calc.js","utf8")}
${fs.readFileSync("public/state.js","utf8")}
Object.assign(globalThis,{project,setProjectionState:value=>{S=value;}});`,context);
const profile={name:"",sex:"m",age:30,ht:175,act:1.55,sw:90,gw:80,tw:90,klo:2000,khi:2100,plo:140,phi:160};
const setSettings=settings=>context.setProjectionState({days:{},settings:{...profile,...settings},foods:{},calref:{}});

test("projection reports actual loss and gain arrivals without passing the goal",()=>{
  setSettings({});
  const loss=context.project(90,"2026-01-01");
  assert.equal(loss.reason,"reached"); assert.equal(loss.reached,true);
  assert.equal(loss.points.at(-1).w,80);
  setSettings({sw:60,gw:70,klo:2800,khi:2900});
  const gain=context.project(60,"2026-01-01");
  assert.equal(gain.reason,"reached"); assert.equal(gain.reached,true);
  assert.equal(gain.points.at(-1).w,70);
});

test("projection distinguishes already-at-goal, equilibrium, wrong direction, and invalid profiles",()=>{
  setSettings({}); const atGoal=context.project(80,"2026-01-01"); assert.equal(atGoal.reason,"already-at-goal"); assert.equal(atGoal.reached,true); assert.equal(atGoal.points.length,0);
  setSettings({klo:2816,khi:2916}); assert.equal(context.project(90,"2026-01-01").reason,"equilibrium");
  setSettings({klo:3000,khi:3100}); assert.equal(context.project(90,"2026-01-01").reason,"wrong-direction");
  setSettings({ht:0}); assert.equal(context.project(90,"2026-01-01").reason,"invalid");
  setSettings({}); assert.equal(context.project(90,"2026-02-30").reason,"invalid");
});

test("a slow path stops at 60 UTC weeks and is never presented as arrival",()=>{
  setSettings({sw:60,gw:70,klo:2500,khi:2600});
  const result=context.project(60,"2020-12-31");
  assert.equal(result.reason,"limit"); assert.equal(result.reached,false); assert.equal(result.points.length,60);
  assert.equal(result.points[0].date,"2021-01-07"); assert.notEqual(result.points.at(-1).w,70);
});
