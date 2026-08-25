"use strict";
/* Mifflin-St Jeor: p = {sex,age,ht,w,act,gw} */
function calcTargets(p){
  const bmr=10*p.w+6.25*p.ht-5*p.age+(p.sex==="m"?5:-161);
  const tdee=Math.round(bmr*p.act);
  /* عجز مربوط بوزن الجسم (~0.75% من الوزن/أسبوع = 8.25 سعر/كجم/يوم) مش بنسبة من TDEE:
     النسبة من TDEE كانت بتكبّر العجز مع النشاط، والنشاط مش بيزود مخزون الدهون */
  const delta=p.gw<p.w?-Math.min(1100,Math.max(300,8.25*p.w)):p.gw>p.w?300:0;
  /* أرضية BMR: التطبيق ميقترحش أقل من حرق الراحة. 1250 يخلي الحد الأدنى 1200، نفس اللي بيرفضه التحقق عند الحفظ */
  /* مفيش سقف سعرات هنا: القص لـ6000 كان بيقلب العجز المقصود لعجز أكبر بكتير، والرفض أأمن من رقم غلط */
  const floor=Math.max(1250,Math.ceil(bmr/50)*50);
  const mid=Math.max(floor,Math.round((tdee+delta)/50)*50);
  const proteinWeight=p.gw<p.w?p.gw:p.w;
  const phi=Math.min(300,Math.round(2.2*proteinWeight));
  return {klo:mid-50,khi:mid+50,plo:Math.min(phi,Math.round(2.0*proteinWeight)),phi,tdee};
}
/* شباك قبول معدل النزول: 0.5–1.0% من الوزن/أسبوع، حاضن هدف الـ0.75% اللي العجز مبني عليه */
function rateBand(w){ return {lo:(0.005*w).toFixed(1),hi:(0.01*w).toFixed(1)}; }
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
const KMSG="السعرات لازم تكون بين 1200 و6000، وأي هدف شديد الانخفاض يحتاج إشراف طبي.";
const PMSG="راجع هدف البروتين (40–300 جم).";
const TLIMITS={
  klo:[1200,6000,KMSG], khi:[1200,6000,KMSG], plo:[40,300,PMSG], phi:[40,300,PMSG],
  age:[18,100,"التطبيق للبالغين فقط: السن لازم يكون بين 18 و100 سنة."],
  ht:[120,230,"الطول لازم يكون بين 120 و230 سم."],
  sw:[30,300,"الوزن لازم يكون بين 30 و300 كجم."]
};
