"use strict";
const APP_VERSION="3.13.0";
const TARGET_FORMULA_VERSION=1;
const BUILTIN_SELECTION_VERSION=1;
const LEGACY_BUILTIN_SELECTIONS=Object.freeze({
  "legacy-v310-bc0":Object.freeze({key:"bc",food:Object.freeze({t:"نيسكافيه Coffee Break 2×1 (ظرف ١٢ جم) + سويتال",k:55,p:1,f:3,c:6})}),
  "legacy-v310-cf0":Object.freeze({key:"cf",food:Object.freeze({t:"قهوة بن أرابيكا وسط سادة + سويتال",k:4,p:0,f:0,c:1})}),
  "legacy-v310-extras6":Object.freeze({key:"extras",food:Object.freeze({t:"ملعقة صغيرة عسل نحل (٧ جم)",k:21,p:0,f:0,c:5})})
});
const LEGACY_BUILTIN_MIGRATIONS=Object.freeze({
  bc:Object.freeze({0:"legacy-v310-bc0"}),
  cf:Object.freeze({0:"legacy-v310-cf0"}),
  extras:Object.freeze({6:"legacy-v310-extras6"})
});
/* ================= بيانات الوجبات المدمجة ================= */
const MEALS = {
  b:{name:"🌅 الفطار", examples:true, note:"اختار وجبة وسجّل اختلافات العبوة أو الكمية: ≈ 435–545 سعر · 29–42 جم بروتين", opts:[
    {t:"٣ بيضات + ٣ توست أسمر + خيار وطماطم", k:527, p:33, f:19, c:55},
    {t:"٢٥٠ جم جبنة قريش + ٣ توست أسمر + ملعقة صغيرة زيت زيتون + خيار", k:542, p:42, f:15, c:61},
    {t:"٧٠ جم شوفان + ٣٠٠ مل لبن قليل الدسم + نص سكوب واي", k:456, p:30, f:8, c:66},
    {t:"٧ ملاعق فول + ٣ بيضات مسلوقة + ١ توست أسمر", k:437, p:29, f:22, c:32}]},
  bc:{name:"☕ مشروب الصبح (اختياري)", note:"بيتحسب في مجموع اليوم — المقادير المكتوبة جزء من الحساب", opts:[
    {t:"قهوة سادة + ١٠٠ مل لبن قليل الدسم + ملعقة صغيرة سكر", k:63, p:4, f:1, c:9}]},
  s:{name:"🍎 سناك", examples:true, note:"اختار حسب باقي يومك: ≈ 235–300 سعر · 15–22 جم بروتين", opts:[
    {t:"زبادي يوناني عالي البروتين (١٧٠ جم) + تفاحة + ١٠ جم لوز", k:297, p:20, f:8, c:38},
    {t:"٢٠٠ جم زبادي قليل الدسم + ٢٠ جم لوز", k:247, p:15, f:14, c:18},
    {t:"١٥٠ جم جبنة قريش + ١ توست أسمر + طماطم", k:235, p:22, f:5, c:26},
    {t:"كوب لبن قليل الدسم (٢٥٠ مل) + ٢٥ جم فول سوداني", k:256, p:15, f:15, c:18}]},
  l:{name:"🍗 الغدا", examples:true, note:"الأوزان مطبوخة والزيت موزون: ≈ 810–920 سعر · 58–70 جم بروتين", opts:[
    {t:"٢٠٠ جم صدور فراخ مشوية + ٣٠٠ جم رز مطبوخ + سلطة + ١٠ جم زيت", k:835, p:70, f:18, c:91},
    {t:"٢٢٠ جم سمك مشوي + ٤٠٠ جم بطاطس مسلوقة + سلطة + ١٠ جم زيت", k:813, p:58, f:24, c:93},
    {t:"٢٠٠ جم لحم أحمر قليل الدهن + ٢٥٠ جم رز مطبوخ + خضار سوتيه", k:919, p:68, f:29, c:93}]},
  cf:{name:"☕ قهوة قبل التمرين (اختياري)", note:"بيتحسب في مجموع اليوم؛ راجع كمية الكافيين على العبوة", opts:[
    {t:"قهوة سادة + ملعقة صغيرة عسل نحل (٧ جم)", k:24, p:0, f:0, c:6}]},
  pw:{name:"🍌 وجبة اختيارية قبل التمرين بـ٦٠–١٢٠ دقيقة", dayNote:"لو محتاجها، كلها قبل بداية التمرين بـ٦٠–١٢٠ دقيقة؛ دي مش وجبة بعد التمرين.", note:"اختيارية قبل بداية التمرين بـ٦٠–١٢٠ دقيقة؛ لو مش محتاجها سيبها من غير اختيار: ≈ 185–255 سعر", opts:[
    {t:"سكوب واي بروتين بالمياه + موزة", k:222, p:25, f:2, c:26, legacyOnly:true},
    {t:"علبة تونة لايت مصفاة (~١٠٠ جم) + ١ توست أسمر", k:177, p:23, f:2, c:16},
    {t:"٢٠٠ جم جبنة قريش + تفاحة", k:286, p:22, f:5, c:38},
    {t:"٢٥٠ جم زبادي يوناني عالي البروتين + موزة", k:290, p:26, f:4, c:38}]},
  nt:{legacyOnly:true, opts:[
    {t:"سكوب Nitro-Tech (٤٤ جم) بالمياه + موزة", k:246, p:31, f:2.5, c:26},
    {t:"سكوب Nitro-Tech (٤٤ جم) + ٢٥٠ مل لبن قليل الدسم", k:270, p:38, f:6.5, c:15}]},
  d:{name:"🌙 العشا", examples:true, note:"اختيارات كاملة بدل سناك صغير: ≈ 465–600 سعر · 37–41 جم بروتين", opts:[
    {t:"٢٥٠ جم جبنة قريش + سلطة + ملعقة صغيرة زيت زيتون + ٢ توست أسمر", k:470, p:38, f:14, c:49},
    {t:"٣ بيضات + ١٥٠ جم جبنة قريش + خضار + ١ توست أسمر", k:466, p:41, f:20, c:31},
    {t:"علبة تونة مصفاة + ٢٥٠ جم بطاطس مسلوقة + ٢ توست + سلطة بملعقة صغيرة زيت", k:595, p:37, f:9, c:92},
    {t:"٢٥٠ جم زبادي يوناني عالي البروتين + ٣٠ جم لوز + ٤٠ جم شوفان", k:501, p:37, f:22, c:42}]}
};
/* أمثلة عامة من الأربع مجموعات الأساسية فقط؛ الدالة نقية ومبتقرأش حالة المستخدم. */
function rankedExampleDays(targets,limit=3){
  if(!targets||typeof targets!=="object"||!Number.isInteger(limit)||limit<0) return [];
  const values=[targets.klo,targets.khi,targets.plo,targets.phi];
  if(!values.every(Number.isFinite)||targets.klo<=0||targets.plo<=0||targets.klo>targets.khi||targets.plo>targets.phi) return [];
  const km=(targets.klo+targets.khi)/2, pm=(targets.plo+targets.phi)/2;
  const groups=Object.entries(MEALS).filter(([,meal])=>meal.examples===true);
  if(groups.length!==4) return [];
  let days=[{picks:[],total:{k:0,p:0,f:0,c:0}}];
  groups.forEach(([key,meal])=>{
    const next=[];
    meal.opts.forEach((food,index)=>{
      if(food.legacyOnly) return;
      days.forEach(day=>next.push({
        picks:day.picks.concat({key,index}),
        total:{k:day.total.k+food.k,p:day.total.p+food.p,f:day.total.f+(food.f||0),c:day.total.c+(food.c||0)}
      }));
    });
    days=next;
  });
  return days.map(day=>{
    const calorieError=Math.abs(day.total.k-km), proteinError=Math.abs(day.total.p-pm);
    const signature=day.picks.map(pick=>pick.key+":"+pick.index).join("|");
    return Object.assign(day,{distance:(calorieError/km)**2+(proteinError/pm)**2,signature,calorieError,proteinError});
  }).sort((a,b)=>a.distance-b.distance||a.calorieError-b.calorieError||a.proteinError-b.proteinError||(a.signature<b.signature?-1:a.signature>b.signature?1:0))
    .slice(0,limit).map(({picks,total,distance,signature})=>({picks,total,distance,signature}));
}
const EXTRAS = [
  {t:"موزة", k:122, p:1, f:0, c:29},
  {t:"رغيف بلدي صغير", k:149, p:6, f:1, c:32},
  {t:"١٥٠ جم رز مطبوخ زيادة", k:194, p:4, f:0, c:42},
  {t:"فاكهة إضافية", k:77, p:1, f:0, c:18},
  {t:"٣٠ جم مكسرات", k:185, p:6, f:16, c:6},
  {t:"١٤ جم زيت في الطبيخ فوق المحسوب", k:126, p:0, f:14, c:0},
  {t:"ملعقة صغيرة ممتلئة عسل نحل (١٠ جم)", k:30, p:0, f:0, c:8},
  {t:"ملعقة كبيرة عسل نحل (٢١ جم)", k:64, p:0, f:0, c:17},
  {t:"وحدة طاقة: موزة + ٤٠ جم شوفان + ٢٥٠ مل لبن قليل الدسم", k:383, p:15, f:5, c:69}
];
/* مرجع سعرات تقريبي؛ ملصق العبوة والوصفة الموزونة لهما الأولوية */
const CALREF=[
 {cat:"🥄 زيوت ودهون", items:[
  {t:"ملعقة كبيرة زيت (١٤ جم)", k:126, p:0, f:14, c:0},
  {t:"ملعقة صغيرة زيت (٥ جم)", k:45, p:0, f:5, c:0},
  {t:"ملعقة كبيرة زيت زيتون", k:126, p:0, f:14, c:0},
  {t:"ملعقة كبيرة سمنة بلدي", k:123, p:0, f:14, c:0},
  {t:"ملعقة كبيرة زبدة", k:104, p:0, f:12, c:0},
  {t:"ملعقة كبيرة طحينة", k:105, p:3, f:9, c:2}]},
 {cat:"🍞 عيش ونشويات", items:[
  {t:"رغيف عيش بلدي صغير", k:149, p:6, f:1, c:32},
  {t:"توست أسمر (شريحة)", k:92, p:4, f:1, c:16},
  {t:"عيش فينو (رغيف)", k:120, p:4, f:2, c:22},
  {t:"رز مطبوخ (١٠٠ جم)", k:129, p:3, f:0, c:28},
  {t:"مكرونة مطبوخة (١٠٠ جم)", k:157, p:6, f:1, c:31},
  {t:"بطاطس مسلوقة (١٠٠ جم)", k:93, p:2, f:0, c:21},
  {t:"شوفان (٥٠ جم)", k:190, p:7, f:3, c:34}]},
 {cat:"🍗 بروتين", items:[
  {t:"بيضة مسلوقة", k:72, p:6, f:5, c:0},
  {t:"صدور فراخ مشوية (١٠٠ جم)", k:161, p:30, f:4, c:0},
  {t:"وراك فراخ بالجلد (١٠٠ جم)", k:231, p:23, f:15, c:0},
  {t:"لحم أحمر قليل الدهن (١٠٠ جم)", k:216, p:28, f:11, c:0},
  {t:"كبدة (١٠٠ جم)", k:174, p:26, f:5, c:5},
  {t:"سمك مشوي (١٠٠ جم)", k:143, p:22, f:6, c:0},
  {t:"علبة تونة لايت مصفاة", k:98, p:22, f:1, c:0},
  {t:"سكوب واي بروتين", k:119, p:21, f:2, c:6},
  {t:"فول مدمس (٥ ملاعق)", k:93, p:4, f:4, c:11},
  {t:"قرص طعمية", k:87, p:1, f:7, c:5}]},
 {cat:"🥛 ألبان", items:[
  {t:"جبنة قريش (١٠٠ جم)", k:82, p:11, f:2, c:4},
  {t:"جبنة بيضاء (٥٠ جم)", k:137, p:10, f:10, c:3},
  {t:"جبنة رومي (٣٠ جم)", k:124, p:9, f:9, c:3},
  {t:"زبادي يوناني (١٧٠ جم)", k:114, p:17, f:2, c:6},
  {t:"زبادي قليل الدسم (٢٠٠ جم)", k:126, p:11, f:3, c:14},
  {t:"كوب لبن قليل الدسم (٢٥٠ مل)", k:109, p:9, f:2, c:13}]},
 {cat:"🍌 فاكهة وسكريات", items:[
  {t:"موزة وسط", k:122, p:1, f:0, c:29},
  {t:"تفاحة وسط", k:122, p:0, f:0, c:30},
  {t:"برتقالة", k:77, p:1, f:0, c:18},
  {t:"تمرة", k:23, p:0, f:0, c:6},
  {t:"ملعقة صغيرة سكر", k:17, p:0, f:0, c:4},
  {t:"ملعقة صغيرة ممتلئة عسل نحل (١٠ جم)", k:30, p:0, f:0, c:8},
  {t:"ملعقة كبيرة عسل نحل (٢١ جم)", k:64, p:0, f:0, c:17},
  {t:"حلاوة طحينية (٣٠ جم)", k:165, p:3, f:9, c:17},
  {t:"لوز (١٠ جم)", k:61, p:2, f:5, c:2},
  {t:"مكسرات مشكلة (٣٠ جم)", k:185, p:6, f:16, c:6}]},
 {cat:"🍲 أكلات مصرية", items:[
  {t:"طبق كشري وسط", k:553, p:21, f:7, c:102},
  {t:"حبة محشي وسط", k:48, p:2, f:4, c:2},
  {t:"طبق ملوخية بالتقلية", k:156, p:7, f:10, c:13},
  {t:"طبق فول بالزيت", k:287, p:11, f:15, c:27}]}
];
console.assert(CALREF.every(g=>g.items.every(o=>o.t&&o.k>=0&&o.p>=0)),"CALREF shape");
console.assert(
  Object.values(MEALS).flatMap(m=>m.opts).concat(EXTRAS,CALREF.flatMap(g=>g.items))
    .every(o=>o.k===0||Math.abs(o.k-(o.p*4+o.f*9+o.c*4))/o.k<=0.10),
  "food calories should reconcile with displayed macros within 10%"
);
const WORKOUTS = ["Push","Pull","Legs","كورة (حراسة)","كارديو فقط","راحة"];
/* tw = الوزن اللي الأهداف اتراجعت عنده آخر مرة؛ 0 يعني لسه متراجعتش */
const DEF={name:"",sex:"",age:0,ht:0,act:0,klo:1200,khi:1200,plo:40,phi:40,sw:0,gw:0,tw:0};
