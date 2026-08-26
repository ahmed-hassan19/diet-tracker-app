"use strict";
/* ================= الحالة وحدود الثقة ================= */
const STATE_TOP_KEYS=["days","settings","foods","calref"];
const STATE_WARN_BYTES=500*1024;
const STATE_MAX_CLOUD_BYTES=600*1024;
const IMPORT_MAX_BYTES=10*1024*1024;
const IDB_NAME="diet_tracker";
const IDB_VERSION=1;
const IDB_STORE="states";
const DAY_KEYS=new Set([...Object.keys(MEALS),"extras","water","workout","steps","cardio","weight","sleep","notes","_ts"]);
const FOOD_KEYS=new Set([...Object.keys(MEALS),"extras","_ts"]);
const SETTINGS_KEYS=new Set([...Object.keys(DEF),"_ts","targetFormulaVersion","healthNoticeVersion","healthNoticeAcceptedAt","aiDisclosureVersion","aiDisclosureAcceptedAt"]);
const ACTIVITY_VALUES=new Set([1.2,1.375,1.55,1.725]);
const LEGACY_SOURCES=new Set(["legacy","import","remote"]);
const OBJECT_PROTO_KEYS=new Set(["constructor","__defineGetter__","__defineSetter__","hasOwnProperty","__lookupGetter__","__lookupSetter__","isPrototypeOf","propertyIsEnumerable","toString","valueOf","__proto__","toLocaleString"]);
let KEY=null;
let S=null;
let stateSizeClass="normal";
let storageWarning=false;
const idbWriteChains=new Map();

function normalizationFailure(reason){ return {ok:false,reason}; }
function plainPrototype(proto){
  if(proto===null||proto===Object.prototype) return true;
  if(Object.getPrototypeOf(proto)!==null) return false;
  const keys=Reflect.ownKeys(proto);
  if(keys.length!==OBJECT_PROTO_KEYS.size||keys.some(key=>typeof key!=="string"||!OBJECT_PROTO_KEYS.has(key))) return false;
  const descriptors=Object.getOwnPropertyDescriptors(proto),native=/\{ \[native code\] \}$/;
  for(const key of keys){
    const descriptor=descriptors[key];
    if(key==="__proto__"){
      if(typeof descriptor.get!=="function"||typeof descriptor.set!=="function"||!native.test(Function.prototype.toString.call(descriptor.get))||!native.test(Function.prototype.toString.call(descriptor.set))) return false;
    }else if(!Object.prototype.hasOwnProperty.call(descriptor,"value")||typeof descriptor.value!=="function"||!native.test(Function.prototype.toString.call(descriptor.value))) return false;
  }
  return descriptors.constructor.value.name==="Object";
}
function plainDataObject(value){
  if(!value||typeof value!=="object"||Array.isArray(value)) return false;
  const proto=Object.getPrototypeOf(value);
  if(!plainPrototype(proto)) return false;
  return Reflect.ownKeys(value).every(key=>{
    if(typeof key!=="string") return false;
    const d=Object.getOwnPropertyDescriptor(value,key);
    return !!d&&d.enumerable&&Object.prototype.hasOwnProperty.call(d,"value");
  });
}
function denseDataArray(value){
  if(!Array.isArray(value)) return false;
  const keys=Reflect.ownKeys(value);
  if(keys.some(key=>key!=="length"&&(typeof key!=="string"||!/^(0|[1-9]\d*)$/.test(key)))) return false;
  for(let i=0;i<value.length;i++){
    const d=Object.getOwnPropertyDescriptor(value,String(i));
    if(!d||!d.enumerable||!Object.prototype.hasOwnProperty.call(d,"value")) return false;
  }
  return true;
}
function knownObject(value,allowed){ return plainDataObject(value)&&Object.keys(value).every(key=>allowed.has(key)); }
function charLength(value){ return [...value].length; }
function finiteNumber(value,coerce){
  if(typeof value==="number") return Number.isFinite(value)?value:null;
  if(coerce&&typeof value==="string"&&value.trim()!==""){
    const n=Number(value);
    return Number.isFinite(n)?n:null;
  }
  return null;
}
function boundedNumber(value,min,max,{coerce=false,integer=false}={}){
  const n=finiteNumber(value,coerce);
  if(n===null||n<min||n>max||(integer&&!Number.isInteger(n))) return null;
  return n;
}
function validIsoTime(value){
  return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}
function validPastIsoTime(value){ return validIsoTime(value)&&Date.parse(value)<=Date.now(); }
function validDayKey(value){
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if(!m) return false;
  const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  if(month<1||month>12||day<1) return false;
  const leap=y%4===0&&(y%100!==0||y%400===0);
  const monthDays=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return day<=monthDays[month-1];
}
function normalizeTimestamp(value,coerce){ return boundedNumber(value,0,Number.MAX_SAFE_INTEGER,{coerce,integer:true}); }
function normalizeFood(raw,maxLabel,coerce,requireMacros){
  if(!knownObject(raw,new Set(["t","k","p","f","c"]))) return null;
  if(typeof raw.t!=="string"||charLength(raw.t.trim())<1||charLength(raw.t.trim())>maxLabel) return null;
  const value={t:raw.t.trim()};
  const limits={k:[1,5000],p:[0,1250],f:[0,556],c:[0,1250]};
  for(const key of ["k","p","f","c"]){
    const n=boundedNumber(raw[key],limits[key][0],limits[key][1],{coerce});
    if(n===null) return null;
    value[key]=n;
  }
  if(requireMacros&&macroMismatch(value)) return null;
  return value;
}
function normalizeFoods(raw,coerce,importedAt){
  if(raw===undefined) return {ok:true,value:{}};
  if(!knownObject(raw,FOOD_KEYS)) return normalizationFailure("foods");
  const value={}; let active=0;
  for(const key of Object.keys(raw)){
    if(key==="_ts") continue;
    const list=raw[key];
    if(!denseDataArray(list)||list.length>200) return normalizationFailure("food-count");
    value[key]=[];
    for(const item of list){
      if(item===null){ value[key].push(null); continue; }
      const food=normalizeFood(item,160,coerce,false);
      if(!food) return normalizationFailure("food");
      active++; value[key].push(food);
    }
  }
  if(active>200) return normalizationFailure("food-count");
  if(importedAt!==null){ if(Object.keys(value).length) value._ts=importedAt; }
  else if(raw._ts!==undefined){
    const ts=normalizeTimestamp(raw._ts,coerce);
    if(ts===null) return normalizationFailure("timestamp");
    value._ts=ts;
  }
  return {ok:true,value};
}
function normalizeCalref(raw,coerce,importedAt){
  if(raw===undefined) return {ok:true,value:{}};
  if(!knownObject(raw,new Set(["items","_ts"]))) return normalizationFailure("calref");
  const value={};
  if(raw.items!==undefined){
    if(!denseDataArray(raw.items)||raw.items.length>500) return normalizationFailure("calref-count");
    value.items=[];
    for(const item of raw.items){
      const food=normalizeFood(item,80,coerce,true);
      if(!food) return normalizationFailure("calref");
      value.items.push(food);
    }
  }
  if(importedAt!==null){ if(Object.keys(value).length) value._ts=importedAt; }
  else if(raw._ts!==undefined){
    const ts=normalizeTimestamp(raw._ts,coerce);
    if(ts===null) return normalizationFailure("timestamp");
    value._ts=ts;
  }
  return {ok:true,value};
}
function normalizeSettings(raw,coerce,importedAt){
  if(raw===undefined) return {ok:true,value:{}};
  if(!knownObject(raw,SETTINGS_KEYS)) return normalizationFailure("settings");
  const value={};
  if(raw.name!==undefined){
    if(typeof raw.name!=="string"||charLength(raw.name)>40) return normalizationFailure("settings");
    value.name=raw.name;
  }
  if(raw.sex!==undefined){ if(raw.sex!=="m"&&raw.sex!=="f") return normalizationFailure("settings"); value.sex=raw.sex; }
  const ranges={age:[18,100,true],ht:[120,230,true],klo:[1200,6000,false],khi:[1200,6000,false],plo:[40,300,false],phi:[40,300,false],sw:[30,300,false],gw:[30,300,false]};
  for(const [key,[min,max,integer]] of Object.entries(ranges)){
    if(raw[key]===undefined) continue;
    const n=boundedNumber(raw[key],min,max,{coerce,integer});
    if(n===null) return normalizationFailure("settings");
    value[key]=n;
  }
  if(raw.tw!==undefined){
    const n=boundedNumber(raw.tw,0,300,{coerce});
    if(n===null||(n>0&&n<30)) return normalizationFailure("settings");
    value.tw=n;
  }
  if(raw.act!==undefined){
    const n=finiteNumber(raw.act,coerce);
    if(n===null||!ACTIVITY_VALUES.has(n)) return normalizationFailure("settings");
    value.act=n;
  }
  if(value.klo!==undefined&&value.khi!==undefined&&value.klo>value.khi) return normalizationFailure("settings");
  if(value.plo!==undefined&&value.phi!==undefined&&value.plo>value.phi) return normalizationFailure("settings");
  if(raw.targetFormulaVersion!==undefined){
    const version=boundedNumber(raw.targetFormulaVersion,1,TARGET_FORMULA_VERSION,{coerce,integer:true});
    if(version!==TARGET_FORMULA_VERSION) return normalizationFailure("settings");
    value.targetFormulaVersion=TARGET_FORMULA_VERSION;
  }
  const hasHealthVersion=raw.healthNoticeVersion!==undefined;
  const hasHealthTime=raw.healthNoticeAcceptedAt!==undefined;
  if(hasHealthVersion!==hasHealthTime) return normalizationFailure("settings");
  if(hasHealthVersion){
    const version=boundedNumber(raw.healthNoticeVersion,1,HEALTH_NOTICE_VERSION,{coerce,integer:true});
    if(version!==HEALTH_NOTICE_VERSION||!validPastIsoTime(raw.healthNoticeAcceptedAt)) return normalizationFailure("settings");
    value.healthNoticeVersion=HEALTH_NOTICE_VERSION; value.healthNoticeAcceptedAt=raw.healthNoticeAcceptedAt;
  }
  const hasDisclosureVersion=raw.aiDisclosureVersion!==undefined;
  const hasDisclosureTime=raw.aiDisclosureAcceptedAt!==undefined;
  if(hasDisclosureVersion!==hasDisclosureTime) return normalizationFailure("settings");
  if(hasDisclosureVersion){
    const version=boundedNumber(raw.aiDisclosureVersion,1,1,{coerce,integer:true});
    if(version!==1||!validIsoTime(raw.aiDisclosureAcceptedAt)) return normalizationFailure("settings");
    value.aiDisclosureVersion=1; value.aiDisclosureAcceptedAt=raw.aiDisclosureAcceptedAt;
  }
  if(importedAt!==null){ if(Object.keys(value).length) value._ts=importedAt; }
  else if(raw._ts!==undefined){
    const ts=normalizeTimestamp(raw._ts,coerce);
    if(ts===null) return normalizationFailure("timestamp");
    value._ts=ts;
  }
  return {ok:true,value};
}
function normalizeSelection(raw,key,foods,coerce){
  if(raw===null) return {ok:true,value:null};
  const n=boundedNumber(raw,0,MEALS[key].opts.length-1,{coerce,integer:true});
  if(n!==null) return {ok:true,value:n};
  if(typeof raw!=="string") return normalizationFailure("selection");
  const m=/^c(0|[1-9]\d*)$/.exec(raw),list=foods[key]||[];
  const index=m?Number(m[1]):-1;
  if(m&&index<list.length){
    if(list[index]!==null) return {ok:true,value:"c"+index};
    if(coerce) return {ok:true,value:null};
  }
  return normalizationFailure("selection");
}
function normalizeDays(raw,foods,coerce,importedAt){
  if(raw===undefined) return {ok:true,value:{}};
  if(!plainDataObject(raw)) return normalizationFailure("days");
  const keys=Object.keys(raw);
  if(keys.length>1095||!keys.every(validDayKey)) return normalizationFailure("day-count");
  const value={};
  for(const date of keys){
    const sourceDay=raw[date];
    if(!knownObject(sourceDay,DAY_KEYS)) return normalizationFailure("day");
    const d={};
    for(const key of Object.keys(MEALS)){
      if(sourceDay[key]===undefined) continue;
      const selected=normalizeSelection(sourceDay[key],key,foods,coerce);
      if(!selected.ok) return selected;
      d[key]=selected.value;
    }
    if(sourceDay.extras!==undefined){
      if(!denseDataArray(sourceDay.extras)||sourceDay.extras.length>50) return normalizationFailure("extras-count");
      const seen=new Set(); d.extras=[];
      for(const rawItem of sourceDay.extras){
        let item;
        const builtin=boundedNumber(rawItem,0,EXTRAS.length-1,{coerce,integer:true});
        if(builtin!==null) item=builtin;
        else if(typeof rawItem==="string"&&/^c(0|[1-9]\d*)$/.test(rawItem)){
          const index=Number(rawItem.slice(1)),list=foods.extras||[];
          if(index>=list.length) return normalizationFailure("selection");
          if(list[index]===null){ if(coerce) continue; return normalizationFailure("selection"); }
          item="c"+index;
        }else return normalizationFailure("selection");
        const marker=typeof item+":"+item;
        if(seen.has(marker)) return normalizationFailure("extras-duplicate");
        seen.add(marker); d.extras.push(item);
      }
    }
    const integerFields={water:[0,100],steps:[0,200000],cardio:[0,1440]};
    for(const [key,[min,max]] of Object.entries(integerFields)){
      if(sourceDay[key]===undefined) continue;
      if(coerce&&key!=="water"&&sourceDay[key]==="") continue;
      const n=boundedNumber(sourceDay[key],min,max,{coerce,integer:true});
      if(n===null) return normalizationFailure("day");
      d[key]=n;
    }
    const numberFields={weight:[30,300],sleep:[0,24]};
    for(const [key,[min,max]] of Object.entries(numberFields)){
      if(sourceDay[key]===undefined) continue;
      if(coerce&&sourceDay[key]==="") continue;
      const n=boundedNumber(sourceDay[key],min,max,{coerce});
      if(n===null) return normalizationFailure("day");
      d[key]=n;
    }
    if(sourceDay.workout!==undefined){
      if(sourceDay.workout!==null&&!WORKOUTS.includes(sourceDay.workout)) return normalizationFailure("workout");
      d.workout=sourceDay.workout;
    }
    if(sourceDay.notes!==undefined){
      if(typeof sourceDay.notes!=="string"||charLength(sourceDay.notes)>2000) return normalizationFailure("notes");
      d.notes=sourceDay.notes;
    }
    if(importedAt!==null) d._ts=importedAt;
    else if(sourceDay._ts!==undefined){
      const ts=normalizeTimestamp(sourceDay._ts,coerce);
      if(ts===null) return normalizationFailure("timestamp");
      d._ts=ts;
    }
    value[date]=d;
  }
  return {ok:true,value};
}
function sortedJsonValue(value){
  if(Array.isArray(value)) return value.map(sortedJsonValue);
  if(value&&typeof value==="object"){
    const out={}; Object.keys(value).sort().forEach(key=>{ out[key]=sortedJsonValue(value[key]); }); return out;
  }
  return value;
}
function canonicalJson(value){ return JSON.stringify(sortedJsonValue(value)); }
function utf8Bytes(value){ return new TextEncoder().encode(value).byteLength; }
function deepFreeze(value){
  if(value&&typeof value==="object"&&!Object.isFrozen(value)){ Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
function normalizeState(raw,source){
  try{
    const coerce=LEGACY_SOURCES.has(source);
    const allowedTop=new Set([...STATE_TOP_KEYS,...(coerce?["updated"]:[])]);
    if(!knownObject(raw,allowedTop)) return normalizationFailure("shape");
    if(!coerce&&!STATE_TOP_KEYS.every(key=>Object.prototype.hasOwnProperty.call(raw,key))) return normalizationFailure("shape");
    if(source==="remote"&&!Object.prototype.hasOwnProperty.call(raw,"updated")) return normalizationFailure("shape");
    const importedAt=source==="import"?Date.now():null;
    const foods=normalizeFoods(raw.foods,coerce,importedAt); if(!foods.ok) return foods;
    const days=normalizeDays(raw.days,foods.value,coerce,importedAt); if(!days.ok) return days;
    const settings=normalizeSettings(raw.settings,coerce,importedAt); if(!settings.ok) return settings;
    const calref=normalizeCalref(raw.calref,coerce,importedAt); if(!calref.ok) return calref;
    if(source==="remote"&&normalizeTimestamp(raw.updated,true)===null) return normalizationFailure("timestamp");
    const value={days:days.value,settings:settings.value,foods:foods.value,calref:calref.value};
    const updated=source==="remote"?Number(raw.updated):Date.now();
    const canonicalBytes=utf8Bytes(canonicalJson({...value,updated}));
    const sizeClass=canonicalBytes>STATE_MAX_CLOUD_BYTES?"oversized":canonicalBytes>=STATE_WARN_BYTES?"warning":"normal";
    if((source==="import"||source==="cloud")&&sizeClass==="oversized") return normalizationFailure("size");
    return {ok:true,value:deepFreeze(value),canonicalBytes,sizeClass};
  }catch(_error){ return normalizationFailure("shape"); }
}
function emptyState(){ return normalizeState({days:{},settings:{},foods:{},calref:{}},"mutation").value; }
function mutableState(value=S){ return JSON.parse(JSON.stringify(value)); }
function setStorageMessage(){
  storageWarning=true;
  const note=document.getElementById("storage-note");
  if(note){
    note.textContent="⚠️ الحفظ على الجهاز مش متاح دلوقتي. بياناتك الحالية لسه في الذاكرة والسحابة؛ نزّل نسخة احتياطية قبل ما تقفل الصفحة.";
    note.style.display="";
  }
  if(typeof setSyncStatus==="function") setSyncStatus("⚠️ الحفظ على الجهاز مش متاح دلوقتي. بياناتك لسه في الذاكرة والسحابة؛ نزّل نسخة احتياطية قبل ما تقفل الصفحة.");
}

/* ================= تخزين IndexedDB ================= */
function openStateDb(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==="undefined") return reject(new Error("storage unavailable"));
    let request;
    try{ request=indexedDB.open(IDB_NAME,IDB_VERSION); }catch(_error){ reject(new Error("storage unavailable")); return; }
    request.onupgradeneeded=()=>{ const db=request.result; if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error("storage unavailable"));
    request.onblocked=()=>reject(new Error("storage unavailable"));
  });
}
async function idbAction(mode,uid,value){
  const db=await openStateDb();
  try{
    return await new Promise((resolve,reject)=>{
      try{
        const tx=db.transaction(IDB_STORE,mode);
        const request=value===undefined?tx.objectStore(IDB_STORE).get(uid):value===null?tx.objectStore(IDB_STORE).delete(uid):tx.objectStore(IDB_STORE).put(value,uid);
        let result;
        request.onsuccess=()=>{ result=request.result; };
        request.onerror=()=>reject(new Error("storage unavailable"));
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(new Error("storage unavailable"));
        tx.onerror=()=>reject(new Error("storage unavailable"));
      }catch(_error){ reject(new Error("storage unavailable")); }
    });
  }finally{ db.close(); }
}
function enqueueIdbWrite(uid,operation){
  const prior=idbWriteChains.get(uid);
  let current;
  try{ current=prior?prior.catch(()=>{}).then(operation):Promise.resolve(operation()); }
  catch(error){ current=Promise.reject(error); }
  idbWriteChains.set(uid,current);
  current.finally(()=>{ if(idbWriteChains.get(uid)===current) idbWriteChains.delete(uid); }).catch(()=>{});
  return current;
}
function flushStateWrites(uid=KEY){ return (idbWriteChains.get(uid)||Promise.resolve()).then(()=>true,()=>false); }
function readStateRecord(uid){ return idbAction("readonly",uid); }
function writeStateRecord(uid,value){ return enqueueIdbWrite(uid,()=>idbAction("readwrite",uid,value)); }
function deleteStateRecord(uid){ return enqueueIdbWrite(uid,()=>idbAction("readwrite",uid,null)); }
function legacyKey(uid){ return "diet_tracker_v1_"+uid; }
function migratedKey(uid){ return "diet_tracker_idb_v1_"+uid; }
function sameCanonicalState(a,b){ return canonicalJson(a)===canonicalJson(b); }
async function load(uid=KEY){
  let cached;
  try{
    cached=await readStateRecord(uid);
    if(cached!==undefined){
      const normalized=normalizeState(cached,"idb");
      if(normalized.ok){ stateSizeClass=normalized.sizeClass; return normalized.value; }
      setStorageMessage();
    }
  }catch(_error){ setStorageMessage(); }
  let raw=null;
  try{ raw=localStorage.getItem(legacyKey(uid)); }catch(_error){ setStorageMessage(); }
  if(raw!==null){
    let legacy;
    try{ legacy=normalizeState(JSON.parse(raw),"legacy"); }catch(_error){ legacy=normalizationFailure("parse"); }
    if(legacy.ok){
      stateSizeClass=legacy.sizeClass;
      try{
        await writeStateRecord(uid,legacy.value);
        const check=normalizeState(await readStateRecord(uid),"idb");
        if(!check.ok||!sameCanonicalState(check.value,legacy.value)) throw new Error("storage verification failed");
        localStorage.removeItem(legacyKey(uid));
        localStorage.setItem(migratedKey(uid),"migrated");
      }catch(_error){ setStorageMessage(); }
      return legacy.value;
    }
    setStorageMessage();
  }else{
    try{ if(localStorage.getItem(migratedKey(uid))==="migrated"&&cached===undefined) setStorageMessage(); }catch(_error){ setStorageMessage(); }
  }
  return emptyState();
}
function persistLiveState(){
  if(!KEY||!S) return Promise.resolve(false);
  const uid=KEY,value=S;
  return writeStateRecord(uid,value).then(()=>true).catch(()=>{ setStorageMessage(); return false; });
}
function applyNormalizedState(normalized,{persist=true,push=true}={}){
  if(!normalized||!normalized.ok) return false;
  S=normalized.value; stateSizeClass=normalized.sizeClass;
  if(persist) persistLiveState();
  if(push) schedulePush();
  if(normalized.sizeClass==="warning"&&typeof setSyncStatus==="function") setSyncStatus("⚠️ بياناتك قربت من حد المزامنة؛ نزّل نسخة احتياطية وقلّل الملاحظات أو العناصر المخصصة.");
  if(normalized.sizeClass==="oversized"&&typeof setSyncStatus==="function") setSyncStatus("⚠️ البيانات أكبر من حد المزامنة. النسخة الحالية للقراءة والتصدير والحذف لحد ما تقلّل حجمها.");
  return true;
}
function commitMutation(change,{touchDay=null,touchSections=[]}={}){
  if(!S||typeof change!=="function") return false;
  const candidate=mutableState(),now=Date.now();
  try{ change(candidate,now); }catch(_error){ return false; }
  if(touchDay&&candidate.days[touchDay]) candidate.days[touchDay]._ts=now;
  touchSections.forEach(key=>{ if(candidate[key]&&Object.keys(candidate[key]).length) candidate[key]._ts=now; });
  return applyNormalizedState(normalizeState(candidate,"mutation"));
}

function today(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
let cur=today();
const EMPTY_DAY=Object.freeze({});
function day(){ return (S&&S.days&&S.days[cur])||EMPTY_DAY; }
function ensureDay(candidate,date=cur){ return candidate.days[date]||(candidate.days[date]={}); }

function getOpt(key,sel){
  if(typeof sel==="string"&&sel[0]==="c"){ const a=(S.foods&&S.foods[key])||[]; return a[+sel.slice(1)]||null; }
  return MEALS[key].opts[sel];
}

/* ================= صفحة التقدم ================= */
function weightSeries(){
  return Object.keys(S.days).filter(k=>Number.isFinite(S.days[k].weight)).sort().map(k=>({date:k,w:S.days[k].weight}));
}

/* ================= Export / Import ================= */
function downloadJson(value,name){
  try{
    const blob=new Blob([JSON.stringify(value,null,1)],{type:"application/json"});
    const a=document.createElement("a"),url=URL.createObjectURL(blob);
    a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),0); return true;
  }catch(_error){ alert("مش قادر أجهّز النسخة الاحتياطية دلوقتي."); return false; }
}
function exportData(){ if(S) downloadJson(S,"diet-tracker-backup-"+today()+".json"); }
async function importData(inp){
  const f=inp.files&&inp.files[0]; if(!f) return;
  const uid=KEY,generation=typeof syncGeneration==="number"?syncGeneration:null,trackerRef=typeof FB==="object"&&FB?FB.ref:null;
  const sessionCurrent=()=>{
    const user=window.firebaseBridge&&window.firebaseBridge.currentUser();
    return !!uid&&KEY===uid&&(generation===null||syncGeneration===generation)&&(!trackerRef||FB.ref===trackerRef)&&!!user&&user.uid===uid;
  };
  inp.value="";
  if(f.size>IMPORT_MAX_BYTES){ alert("الملف أكبر من الحد المسموح (١٠ ميجابايت)."); return; }
  let normalized;
  try{
    const text=new TextDecoder("utf-8",{fatal:true}).decode(await f.arrayBuffer());
    normalized=normalizeState(JSON.parse(text),"import");
  }catch(_error){ alert("الملف مش صالح."); return; }
  if(!sessionCurrent()){ alert("جلسة الدخول اتغيرت قبل ما الاسترجاع يكتمل. بياناتك الحالية متغيّرتش."); return; }
  if(!normalized.ok){ alert(normalized.reason==="size"?"النسخة أكبر من حد الاسترجاع والمزامنة (٦٠٠ كيلوبايت).":"الملف مش صالح أو فيه قيم خارج الحدود."); return; }
  try{
    await writeStateRecord(uid,normalized.value);
    if(!sessionCurrent()) return;
    const check=normalizeState(await readStateRecord(uid),"idb");
    if(!check.ok||!sameCanonicalState(check.value,normalized.value)) throw new Error("storage verification failed");
  }catch(_error){ setStorageMessage(); alert("الاسترجاع ماكملش لأن الحفظ على الجهاز مش متاح. بياناتك الحالية متغيّرتش."); return; }
  if(!sessionCurrent()) return;
  applyNormalizedState(normalized,{persist:false,push:true});
  if(typeof setWho==="function") setWho();
  const user=window.firebaseBridge&&window.firebaseBridge.currentUser();
  if(!healthNoticeAccepted()&&typeof routeSignedIn==="function") routeSignedIn(user);
  else{
    renderFormulaReview(); renderDay();
    if(curTab==="prog") renderProg();
    if(curTab==="examples") renderExamples();
    if(curTab==="cal") renderCalRef();
  }
  alert(normalized.sizeClass==="warning"?"تم الاسترجاع ✅ — حجم البيانات قرب من حد المزامنة.":"تم الاسترجاع ✅");
}

/* ================= قراءات اعتمادها على الحالة ================= */
function T(){ return Object.assign({},DEF,S.settings||{}); }
function getExtra(i){ return (typeof i==="string"&&i[0]==="c")?((S.foods&&S.foods.extras)||[])[+i.slice(1)]:EXTRAS[i]; }
console.assert(getExtra(0)===EXTRAS[0],"getExtra predefined");
function foodNames(){
  const f=S.foods||{};
  const mine=Object.keys(f).filter(k=>k!=="_ts"&&!(MEALS[k]&&MEALS[k].legacyOnly)).flatMap(k=>f[k]||[]).filter(Boolean).reverse();
  const refs=(((S.calref||{}).items)||[]).slice().reverse();
  const builtin=[...Object.values(MEALS).filter(m=>!m.legacyOnly).flatMap(m=>m.opts.filter(o=>!o.legacyOnly)),...EXTRAS,...CALREF.flatMap(g=>g.items)];
  const out=new Map(); [...mine,...refs,...builtin].forEach(o=>{ if(o&&o.t&&!out.has(o.t)) out.set(o.t,o); }); return [...out.values()];
}
function foodByName(t){ return foodNames().find(o=>o.t===t)||null; }
const CRQTY=/\s*\(([^()]+)\)\s*$/;
function crNames(){ return [...new Set(foodNames().map(o=>o.t.replace(CRQTY,"")).filter(Boolean))]; }
function qtyNames(){
  const items=[...(((S.calref||{}).items)||[]).slice().reverse(),...CALREF.flatMap(g=>g.items)];
  return [...new Set(items.map(o=>(CRQTY.exec((o&&o.t)||"")||[])[1]).filter(Boolean))];
}
function totals(d){
  let k=0,p=0,f=0,c=0;
  for(const key in MEALS){ const o=getOpt(key,d[key]); if(d[key]!==undefined&&d[key]!==null&&o){ k+=o.k;p+=o.p;f+=o.f||0;c+=o.c||0; } }
  (d.extras||[]).forEach(i=>{ const o=getExtra(i); if(o){k+=o.k;p+=o.p;f+=o.f||0;c+=o.c||0;} });
  return {k,p,f,c};
}
function project(fromW,fromDate){
  const g=T(),gw=g.gw,intake=(g.klo+g.khi)/2;
  if(!Number.isFinite(fromW)||fromW<30||fromW>300||!validDayKey(fromDate)
    ||!validProfile({sex:g.sex,age:g.age,ht:g.ht,act:g.act,w:fromW,gw})||!validTargets(g)) return {points:[],reached:false,reason:"invalid"};
  if(fromW===gw) return {points:[],reached:true,reason:"already-at-goal"};
  const dir=gw<fromW?-1:1,points=[];
  let w=fromW,time=Date.parse(fromDate+"T00:00:00.000Z");
  for(let i=0;i<60;i++){
    const tdee=calcTargets({sex:g.sex,age:g.age,ht:g.ht,act:g.act,w,gw}).tdee,balance=tdee-intake;
    if(Math.abs(balance)<1) return {points,reached:false,reason:"equilibrium"};
    const next=w-balance*7/7700;
    if((next-w)*dir<=0) return {points,reached:false,reason:"wrong-direction"};
    time+=7*864e5;
    if((gw-next)*dir<=0){
      points.push({date:new Date(time).toISOString().slice(0,10),w:gw});
      return {points,reached:true,reason:"reached"};
    }
    w=next; points.push({date:new Date(time).toISOString().slice(0,10),w});
  }
  return {points,reached:false,reason:"limit"};
}
