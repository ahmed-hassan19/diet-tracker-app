"use strict";
/* Mifflin-St Jeor: p = {sex,age,ht,w,act,gw} */
function calcTargets(p){
  const bmr=10*p.w+6.25*p.ht-5*p.age+(p.sex==="m"?5:-161);
  const tdee=Math.round(bmr*p.act);
  /* عجز مربوط بوزن الجسم (~0.75% من الوزن/أسبوع = 8.25 سعر/كجم/يوم) مش بنسبة من TDEE:
     النسبة من TDEE كانت بتكبّر العجز مع النشاط، والنشاط مش بيزود مخزون الدهون */
  const delta=p.gw<p.w?-Math.min(1100,Math.max(300,8.25*p.w)):p.gw>p.w?300:0;
  /* أرضية BMR: الحد الأدنى المدعوم 1200، مع التقريب لأعلى عشان الاقتراح مينزلش تحت حرق الراحة */
  /* مفيش سقف سعرات هنا: القص لـ6000 كان بيقلب العجز المقصود لعجز أكبر بكتير، فالنتيجة الخارجة عن النطاق بتترفض */
  const floor=Math.max(1200,Math.ceil(bmr/50)*50);
  const desiredLow=Math.round((tdee+delta)/50)*50-50;
  const klo=Math.max(floor,desiredLow);
  const proteinWeight=p.gw<p.w?p.gw:p.w;
  const phi=Math.min(300,Math.round(2.2*proteinWeight));
  return {klo,khi:klo+100,plo:Math.min(phi,Math.round(2.0*proteinWeight)),phi,tdee};
}
/* نطاق النزول اللي ينتجه هدف السعرات الحالي: طرف السعرات الأعلى أبطأ، والأقل أسرع.
   نفس تقريب 7700 سعر/كجم المستخدم في المسار؛ لو النطاق مفيهوش عجز مش بنعرضه كنزول. */
function rateBand(tdee,klo,khi){
  if(![tdee,klo,khi].every(Number.isFinite)||tdee<=0||klo<=0||khi<klo) return null;
  const lo=Math.max(0,(tdee-khi)*7/7700),hi=(tdee-klo)*7/7700;
  return hi>0?{lo:lo.toFixed(2),hi:hi.toFixed(2)}:null;
}
/* وزن الأساس: متوسط أوزان آخر 14 يوم — الوزن اليومي فيه مياه بتلعب،
   والمتوسط بيمنع المقترح إنه يروح ويجي حوالين حدود التقريب */
function basisWeight(ws,asOf,days=14){
  if(!ws.length) return null;
  const cut=new Date(asOf+"T12:00:00").getTime()-days*864e5;
  const win=ws.filter(p=>new Date(p.date+"T12:00:00").getTime()>=cut);
  const use=win.length?win:[ws[ws.length-1]];
  return use.reduce((a,p)=>a+p.w,0)/use.length;
}
/* الأهداف بتتقرب لأقرب 50 سعر، فأي فرق أصغر من خطوة كاملة مش تغيير حقيقي */
function targetsMoved(a,b){ return Math.abs(a.klo-b.klo)>=50; }
/* ISO week-year نقي وبحساب UTC؛ الأسبوع بيبدأ الاثنين وW01 فيه أول خميس. */
function isoWeekYear(day){
  if(typeof day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [year,month,date]=day.split("-").map(Number),utc=new Date(Date.UTC(year,month-1,date));
  if(utc.toISOString().slice(0,10)!==day) return null;
  const weekday=utc.getUTCDay()||7;
  utc.setUTCDate(utc.getUTCDate()+4-weekday);
  const weekYear=utc.getUTCFullYear(),yearStart=new Date(Date.UTC(weekYear,0,1));
  const week=Math.ceil((((utc-yearStart)/864e5)+1)/7);
  return weekYear+"-W"+String(week).padStart(2,"0");
}
function validProfile(p){
  const goalBmi=p.gw/(p.ht/100)**2;
  return (p.sex==="m"||p.sex==="f")&&p.act>=1.2&&p.act<=1.9
    && p.age>=18&&p.age<=100 && p.ht>=120&&p.ht<=230 && p.w>=30&&p.w<=300
    && p.gw>=30&&p.gw<=300 && goalBmi>=18.5&&goalBmi<=40;
}
function validTargets(t){
  return t.klo>=1200&&t.khi>=t.klo&&t.khi<=6000&&t.plo>=40&&t.phi>=t.plo&&t.phi<=300;
}
function macroHints(g){
  const kmid=(g.klo+g.khi)/2, pmid=(g.plo+g.phi)/2;
  const flo=Math.round(kmid*0.25/9);
  const preferredFhi=Math.round(kmid*0.30/9);
  return {flo,fhi:preferredFhi,clo:Math.max(0,Math.round((kmid-pmid*4-preferredFhi*9)/4)),chi:Math.max(0,Math.round((kmid-pmid*4-flo*9)/4))};
}

function macroMismatch(o){
  const macroCalories=(Number(o.p)||0)*4+(Number(o.f)||0)*9+(Number(o.c)||0)*4;
  return Number(o.k)>0 && Math.abs(Number(o.k)-macroCalories)/Number(o.k)>0.10;
}
function macroValues(o){ return {k:o.k,p:o.p,f:o.f||0,c:o.c||0}; }

/* نفس حدود suRead/suSave عشان لوحة التقدم متقبلش قيم بترفضها صفحة الإعداد */
const KMSG="السعرات لازم تكون بين 1200 و6000؛ دي حدود التطبيق المدعومة.";
const PMSG="راجع هدف البروتين (40–300 جم)؛ دي حدود التطبيق المدعومة.";
const TLIMITS={
  klo:[1200,6000,KMSG], khi:[1200,6000,KMSG], plo:[40,300,PMSG], phi:[40,300,PMSG],
  age:[18,100,"التطبيق للبالغين فقط: السن لازم يكون بين 18 و100 سنة."],
  ht:[120,230,"الطول لازم يكون بين 120 و230 سم."],
  sw:[30,300,"الوزن لازم يكون بين 30 و300 كجم."]
};
