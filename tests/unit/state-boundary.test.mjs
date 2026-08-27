import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = { console, TextEncoder, TextDecoder, setTimeout, clearTimeout };
vm.createContext(context);
vm.runInContext(`${fs.readFileSync("public/data.js", "utf8")}
${fs.readFileSync("public/calc.js", "utf8")}
${fs.readFileSync("public/state.js", "utf8")}
Object.assign(globalThis,{normalizeState,canonicalJson,validDayKey,STATE_WARN_BYTES,STATE_MAX_CLOUD_BYTES,IMPORT_MAX_BYTES,
  totals,getOpt,getExtra,setStateForTest:value=>{S=value;},BUILTIN_SELECTION_VERSION});`, context);
const normalize = (value, source = "mutation") => context.normalizeState(value, source);
const base = () => ({ days: {}, settings: {}, foods: {}, calref: {} });
const food = (overrides = {}) => ({ t: "أكلة", k: 100, p: 10, f: 4, c: 6, ...overrides });
const calref = (overrides = {}) => ({ t: "مرجع", k: 100, p: 10, f: 4, c: 6, ...overrides });
const dateMap = (count, day = {}) => Object.fromEntries(Array.from({ length: count }, (_, index) => [
  new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10), { ...day },
]));

test("canonical normalization freezes a known four-map state and is key-order stable", () => {
  const one = normalize({ settings: {}, days: { "2024-02-29": { water: 1 } }, calref: {}, foods: {} });
  const two = normalize({ foods: {}, calref: {}, days: { "2024-02-29": { water: 1 } }, settings: {} });
  assert.equal(one.ok, true);
  assert.equal(one.canonicalBytes, two.canonicalBytes);
  assert.equal(one.sizeClass, "normal");
  assert.deepEqual(Object.keys(one.value), ["days", "settings", "foods", "calref"]);
  assert.equal(Object.isFrozen(one.value), true);
  assert.equal(Object.isFrozen(one.value.days["2024-02-29"]), true);
});

test("unknown, prototype-bearing, accessor, symbol, and non-object inputs fail without reading values", () => {
  let reads = 0;
  const accessor = base();
  Object.defineProperty(accessor, "extra", { enumerable: true, get() { reads++; return "hostile"; } });
  for (const value of [null, [], { ...base(), unknown: true }, Object.assign(Object.create({ inherited: true }), base()), accessor]) {
    assert.equal(normalize(value).ok, false);
  }
  const symbol = base(); symbol[Symbol("hostile")]=true;
  assert.equal(normalize(symbol).ok, false);
  const forgedPrototype=Object.create(null);
  Object.defineProperty(forgedPrototype,"constructor",{value:function Object(){},enumerable:false});
  assert.equal(normalize(Object.assign(Object.create(forgedPrototype),base())).ok,false);
  assert.equal(reads, 0);
});

test("legacy, import, and remote sources coerce numeric strings while strict sources reject them", () => {
  const old = {
    days: { "2026-08-25": { water: "2", steps: "100", weight: "80.5", b: "0" } },
    settings: { age: "35", ht: "170", act: "1.55", sw: "85", gw: "75", tw: "85", klo: "1950", khi: "2050", plo: "150", phi: "165", sex: "m" },
    foods: { b: [{ t: "قديم", k: "400", p: "30", f: "10", c: "48" }] },
    calref: { items: [{ t: "قديم", k: "100", p: "10", f: "4", c: "6" }] },
  };
  assert.equal(normalize(old).ok, false);
  for (const source of ["legacy", "import", "remote"]) {
    const result=normalize(source==="remote"?{...old,updated:String(Date.now())}:old,source);
    assert.equal(result.ok,true,source);
    assert.equal(typeof result.value.days["2026-08-25"].water,"number");
    assert.equal(typeof result.value.settings.klo,"number");
  }
  assert.equal(normalize(old,"remote").ok,false,"remote Firestore payloads require updated");
});

test("legacy cleared inputs and tombstoned selections become safe canonical absences", () => {
  const raw={
    days:{"2026-08-25":{b:"c0",extras:["c0"],steps:"",cardio:"",weight:"",sleep:""}},
    settings:{},foods:{b:[null],extras:[null]},calref:{},
  };
  assert.equal(normalize(raw).ok,false);
  for(const source of ["legacy","import","remote"]){
    const result=normalize(source==="remote"?{...raw,updated:Date.now()}:raw,source);
    assert.equal(result.ok,true,source);
    const day=result.value.days["2026-08-25"];
    assert.equal(day.b,null);
    assert.deepEqual([...day.extras],[]);
    for(const key of ["steps","cardio","weight","sleep"]) assert.equal(Object.hasOwn(day,key),false,key);
  }
});

test("unversioned coffee and honey indexes migrate without changing historical labels or totals", () => {
  const raw={...base(),days:{"2026-08-25":{bc:0,cf:0,extras:[6]}}};
  const migrated=normalize(raw);
  assert.equal(migrated.ok,true);
  assert.equal(migrated.value.settings.builtinSelectionVersion,context.BUILTIN_SELECTION_VERSION);
  assert.deepEqual(JSON.parse(JSON.stringify(migrated.value.days["2026-08-25"])),{
    bc:"legacy-v310-bc0",cf:"legacy-v310-cf0",extras:["legacy-v310-extras6"],
  });
  context.setStateForTest(migrated.value);
  assert.equal(context.getOpt("bc",migrated.value.days["2026-08-25"].bc).t,"نيسكافيه Coffee Break 2×1 (ظرف ١٢ جم) + سويتال");
  assert.equal(context.getOpt("cf",migrated.value.days["2026-08-25"].cf).t,"قهوة بن أرابيكا وسط سادة + سويتال");
  assert.equal(context.getExtra(migrated.value.days["2026-08-25"].extras[0]).t,"ملعقة صغيرة عسل نحل (٧ جم)");
  assert.deepEqual(JSON.parse(JSON.stringify(context.totals(migrated.value.days["2026-08-25"]))),{k:80,p:1,f:3,c:12});

  const current=normalize({...raw,settings:{builtinSelectionVersion:1}});
  assert.equal(current.ok,true);
  context.setStateForTest(current.value);
  assert.deepEqual(JSON.parse(JSON.stringify(current.value.days["2026-08-25"])),{bc:0,cf:0,extras:[6]});
  assert.deepEqual(JSON.parse(JSON.stringify(context.totals(current.value.days["2026-08-25"]))),{k:117,p:4,f:1,c:23});
});

test("imports ignore every stored timestamp and regenerate one current timestamp", () => {
  const raw={
    days:{"2026-08-25":{water:1,_ts:1}},settings:{name:"اسم",_ts:2},
    foods:{b:[food()],_ts:3},calref:{items:[calref()],_ts:4},updated:5,
  };
  const before=Date.now(),result=normalize(raw,"import"),after=Date.now();
  assert.equal(result.ok,true);
  const times=[result.value.days["2026-08-25"]._ts,result.value.settings._ts,result.value.foods._ts,result.value.calref._ts];
  assert.equal(new Set(times).size,1);
  assert.ok(times[0]>=before&&times[0]<=after);
});

test("day keys must be real dates and the 1095-day boundary is exact", () => {
  for (const key of ["2023-02-29","2024-13-01","2024-00-01","2024-04-31","today","__proto__"]) assert.equal(context.validDayKey(key),false,key);
  assert.equal(context.validDayKey("2024-02-29"),true);
  assert.equal(normalize({ ...base(),days:dateMap(1095) }).ok,true);
  assert.equal(normalize({ ...base(),days:dateMap(1096) }).ok,false);
});

test("day field ranges, built-in workouts, unique extras, and notes are bounded", () => {
  const cases=[
    {water:101},{water:1.5},{steps:200001},{steps:1.5},{cardio:1441},{weight:29.9},{weight:300.1},{sleep:-1},{sleep:24.1},
    {workout:"<img src=x onerror=alert(1)>"},{notes:"x".repeat(2001)},{extras:[0,0]},
    {extras:Array.from({length:51},(_,index)=>index%9)},
  ];
  for(const day of cases) assert.equal(normalize({...base(),days:{"2026-08-25":day}}).ok,false,JSON.stringify(day).slice(0,80));
  assert.equal(normalize({...base(),days:{"2026-08-25":{water:100,steps:200000,cardio:1440,weight:300,sleep:24,workout:"راحة",notes:"x".repeat(2000),extras:[0,1,2,3,4,5,6,7,8]}}}).ok,true);
});

test("custom-food, per-list, calorie-reference, label, nutrition, and macro bounds are enforced", () => {
  assert.equal(normalize({...base(),foods:{b:Array(200).fill(food())}}).ok,true);
  assert.equal(normalize({...base(),foods:{b:Array(201).fill(food())}}).ok,false);
  assert.equal(normalize({...base(),foods:{b:Array(101).fill(food()),s:Array(100).fill(food())}}).ok,false);
  assert.equal(normalize({...base(),calref:{items:Array(500).fill(calref())}}).ok,true);
  assert.equal(normalize({...base(),calref:{items:Array(501).fill(calref())}}).ok,false);
  for(const bad of [food({t:"x".repeat(161)}),food({k:0}),food({k:5001}),food({p:1251}),food({f:557}),food({c:1251})]) assert.equal(normalize({...base(),foods:{b:[bad]}}).ok,false);
  assert.equal(normalize({...base(),foods:{b:[food({k:500,p:1,f:1,c:1})]}}).ok,true,"custom food mismatch remains warnable");
  assert.equal(normalize({...base(),calref:{items:[calref({k:500,p:1,f:1,c:1})]}}).ok,false,"calorie references require macro agreement");
});

test("settings retain profile, target, enum, name, formula, selection, health notice, and disclosure boundaries", () => {
  const valid={name:"ن".repeat(40),sex:"f",age:100,ht:230,act:1.725,klo:1200,khi:6000,plo:40,phi:300,sw:30,gw:300,tw:0,targetFormulaVersion:1,builtinSelectionVersion:1,healthNoticeVersion:1,healthNoticeAcceptedAt:"2026-08-25T00:00:00.000Z",aiDisclosureVersion:1,aiDisclosureAcceptedAt:"2026-08-25T00:00:00.000Z"};
  assert.equal(normalize({...base(),settings:valid}).ok,true);
  for(const settings of [{name:"x".repeat(41)},{sex:"x"},{age:17},{age:18.5},{ht:231},{act:1.3},{klo:1199},{klo:2000,khi:1900},{plo:100,phi:90},{sw:29},{gw:301},{tw:1},{targetFormulaVersion:0},{targetFormulaVersion:2},{targetFormulaVersion:1.5},{builtinSelectionVersion:0},{builtinSelectionVersion:2},{builtinSelectionVersion:1.5},{healthNoticeVersion:1},{healthNoticeAcceptedAt:"2026-08-25T00:00:00.000Z"},{healthNoticeVersion:2,healthNoticeAcceptedAt:"2026-08-25T00:00:00.000Z"},{healthNoticeVersion:1,healthNoticeAcceptedAt:"2026-08-25T00:00:00Z"},{healthNoticeVersion:1,healthNoticeAcceptedAt:"2026-02-30T00:00:00.000Z"},{healthNoticeVersion:1,healthNoticeAcceptedAt:"2999-01-01T00:00:00.000Z"},{aiDisclosureVersion:1},{aiDisclosureAcceptedAt:"0"}]) assert.equal(normalize({...base(),settings}).ok,false,JSON.stringify(settings));
});

test("UTF-8 cloud sizing warns at 500 KiB and rejects imports or writes above 600 KiB", () => {
  const warning={...base(),days:dateMap(130,{notes:"أ".repeat(2000)})};
  const oversized={...base(),days:dateMap(160,{notes:"أ".repeat(2000)})};
  const warned=normalize(warning),large=normalize(oversized);
  assert.ok(warned.canonicalBytes>=context.STATE_WARN_BYTES);
  assert.equal(warned.sizeClass,"warning");
  assert.ok(large.canonicalBytes>context.STATE_MAX_CLOUD_BYTES);
  assert.equal(large.sizeClass,"oversized");
  assert.equal(normalize({...oversized,updated:Date.now()},"remote").ok,true);
  assert.equal(normalize(oversized,"import").reason,"size");
  assert.equal(normalize(oversized,"cloud").reason,"size");
  assert.equal(context.IMPORT_MAX_BYTES,10*1024*1024);
});
