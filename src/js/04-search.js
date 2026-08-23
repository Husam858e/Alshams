/* ════════════════════════════════════════════
   البحث الذكي — تطبيع النص العربي
   ─────────────────────────────────────────
   يتجاهل: المسافات الزائدة، الهمزات (أ إ آ ← ا)،
   التاء المربوطة (ة ← ه)، الألف المقصورة (ى ← ي)،
   التطويل (ـ)، التشكيل، "ال" التعريف، فروقات الكيبورد
   الإنجليزي/العربي البسيطة
════════════════════════════════════════════ */
function normArabic(s){
  if(!s)return"";
  return String(s)
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g,"")      // تشكيل + تطويل
    .replace(/[أإآا]/g,"ا")                            // توحيد الهمزات
    .replace(/ة/g,"ه")                                 // تاء مربوطة ← هاء
    .replace(/[ىی]/g,"ي")                              // ألف مقصورة/ياء فارسية ← ياء
    .replace(/ؤ/g,"و")
    .replace(/ئ/g,"ي")
    .replace(/^ال(?=.)/,"")                             // إزالة "ال" التعريف من البداية (وليس لو الكلمة بأكملها)
    .replace(/(\s)ال(?=[^\sه]{2,})/g,"$1")               // إزالة "ال" بعد مسافة (لتطابق الكلمات الثانية) — تتجاهل "الله"
    .replace(/[^\u0600-\u06FFa-z0-9]+/g," ")            // أي رمز غريب/علامة ترقيم ← مسافة
    .replace(/\s+/g," ")                                // مسافات متعددة ← مسافة واحدة
    .trim();
}
/* ══════════════════════════════════════════════════════
   مفتاح الاسم القانوني — v17.5
   ──────────────────────────────────────────────────────
   normArabic تُبقي المسافات، فكان "علاء حسين" و"علاءحسين"
   مفتاحين مختلفين — أي أن الفلاح الواحد يُحسب شخصين
   في السجل الجامع ويُقسَّم رصيده بينهما.
   nameKey يحذف المسافات نهائياً بعد التطبيع، ويُسقط ما بعد
   علامة "+" ليطابق منطق السجل الجامع.
══════════════════════════════════════════════════════ */
function nameKey(s){
  if(!s)return"";
  let t=String(s);
  const plus=t.indexOf("+");
  if(plus!==-1)t=t.slice(0,plus);
  /* الأسماء المركّبة تُكتب موصولة أو مفصولة: "عبد العظيم" و"عبدالعظيم".
     normArabic تُسقط "ال" بعد مسافة فقط، فتبقى في الصيغة الموصولة.
     نُسقطها هنا بعد بادئة مركّبة معروفة — ولا نمسّ "ال" داخل اسم
     مثل "سالم" أو "خالد" كي لا تندمج أسماء مختلفة خطأً. */
  return normArabic(t)
    .split(" ")
    .map(w=>w.replace(/^(عبد|ابو|ابن|بن|ام|اخو|اخت|ذو|اهل|است)ال(?=.)/,"$1"))
    .join("");
}

/* مسافة تحرير مختصرة — للكشف عن الأسماء المتقاربة (أخطاء إملائية) */
function _editDist(a,b,max){
  max=max||2;
  if(Math.abs(a.length-b.length)>max)return max+1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];let best=i;
    for(let j=1;j<=b.length;j++){
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
      if(cur[j]<best)best=cur[j];
    }
    if(best>max)return max+1;
    prev=cur;
  }
  return prev[b.length];
}

/* مطابقة ذكية: تُطبّع الطرفين وتفحص الاحتواء — مع تجاهل كامل للمسافات كطبقة احتياطية */
function smartMatch(text,query){
  if(!query)return true;
  /* ══════════════════════════════════════════════════════
     علامة + في البحث — v17.38
     ──────────────────────────────────────────────────────
     الاسم المشترك يُكتب «ابو خطاب +حجى سعدون». وnameKey
     تقصّ عمداً كل ما بعد + لأن حساب الشراكة يُنسب لصاحبه
     الأول — وهذا صحيح ولا يُمسّ (تغييره يُعيد توزيع أرصدة
     الزبائن كلها).
     لكن ذلك جعل البحث عن الشراكة يتحوّل إلى بحث عن
     «ابو خطاب» وحده، فتظهر كل وصولاته — بل وشراكاته مع
     غيره مثل «ابو خطاب +علي».
     الحل هنا فقط: إن حوى *الاستعلام* علامة +، نطلب حضور
     كل أطرافه معاً في الاسم، فلا يطابق إلا الشراكة نفسها.
  ══════════════════════════════════════════════════════ */
  if(String(query).indexOf("+")!==-1){
    const parts=String(query).split("+").map(p=>p.trim()).filter(Boolean);
    if(parts.length>1)return parts.every(p=>smartMatch(text,p));
  }
  const nText=normArabic(text), nQuery=normArabic(query);
  if(nText.includes(nQuery))return true;
  // طبقة ٢: تجاهل المسافات تماماً (يطابق "علاء حسين" مع "علاءحسين")
  if(nText.replace(/\s+/g,"").includes(nQuery.replace(/\s+/g,"")))return true;
  // طبقة ٣: مفتاح الاسم القانوني — يوحّد "عبد الكريم" مع "عبدالكريم"
  const kT=nameKey(text), kQ=nameKey(query);
  return !!kQ && kT.includes(kQ);
}

function calcFees(gross,empty,ppkg,kOn,kC,kUP,nOn,naqlList,wOn,wPrice,nDeduct){
  const net=gross-empty;
  const wFee=net*ppkg;
  const kabsFee=kOn?(kC*kUP):0;
  // naqlList: مصفوفة ناقلين [{nC,nUP,naqlFee}, ...] — يدعم أكثر من ناقل بالوصل الواحد
  const list=Array.isArray(naqlList)?naqlList:[];
  const naqlFee=nOn?list.reduce((s,x)=>s+(x.naqlFee!=null?x.naqlFee:(x.nC||0)*(x.nUP||0)),0):0;
  const waslFee=wOn?wPrice:0;
  // nDeduct: هل يُطرح أجر النقل من الوصل؟ (افتراضياً نعم — للتوافق مع السجلات القديمة)
  const naqlDeduct=nDeduct!==false;
  const naqlDeductAmt=(nOn&&naqlDeduct)?naqlFee:0;
  // سعر الوصل يُطرح من المجموع
  return{net,wFee,kabsFee,naqlFee,waslFee,naqlDeduct,final:wFee-kabsFee-naqlDeductAmt-waslFee};
}

/* ════════════════════════════════════════════
   تعدد الناقلين في الوصل الواحد (شراء)
   ─────────────────────────────────────────
   يدعم الشكل الجديد r.naqlList=[{id,transporter,nC,nUP,naqlFee,naqlPayments,...}]
   مع توافق كامل مع السجلات القديمة (حقل ناقل واحد: r.transporter/r.nC/r.nUP)
════════════════════════════════════════════ */
function getNaqlEntries(r){
  if(Array.isArray(r.naqlList)&&r.naqlList.length){
    return r.naqlList.map(x=>({...x,_entryId:x.id||null}));
  }
  if(r.nOn){
    return [{transporter:r.transporter||"",nC:r.nC||r.kC||0,nUP:r.nUP||0,naqlFee:r.naqlFee||0,naqlPayments:r.naqlPayments||[],naqlPaidTotal:r.naqlPaidTotal||0,naqlPaid:r.naqlPaid||false,naqlPaidAt:r.naqlPaidAt||null,_entryId:null}];
  }
  return [];
}
function _naqlCompositeId(recId,entryId){return entryId?(recId+"::"+entryId):recId;}
function _parseNaqlMultiId(id){
  if(typeof id==="string"&&id.includes("::")){
    const i=id.indexOf("::");
    return{recId:id.slice(0,i),entryId:id.slice(i+2)};
  }
  return{recId:id,entryId:null};
}

/* ══════════════════════════════════════════════════════
   التنبيهات والمؤشرات — v17.43
   ──────────────────────────────────────────────────────
   الـ JS كله في <head> بلا defer، و_ensureLib و
   _loadFirebaseDynamic ينادون showToast عند فشل الشبكة —
   وقد يقع ذلك قبل أن يُرسم <body>. كان الوصول إلى
   t.textContent يرمي TypeError فيتوقّف مسار الإقلاع كلّه
   عند أول انقطاع إنترنت. الحارس يُبقي التطبيق يعمل.
══════════════════════════════════════════════════════ */
let _toastTimer=null;
function showToast(m,d=2400){
  const t=document.getElementById("toast");
  if(!t){console.info("toast:",m);return;}
  t.textContent=m;t.classList.add("show");
  // مؤقّت واحد فقط: تنبيهان متتاليان كانا يُخفيان بعضهما مبكراً
  if(_toastTimer)clearTimeout(_toastTimer);
  _toastTimer=setTimeout(()=>{t.classList.remove("show");_toastTimer=null;},d);
}
function syncBar(on){
  const b=document.getElementById("syncBar");
  if(!b)return;
  // ملاحظة: شريط التقدم العلوي يعكس "جاري الحفظ" فقط — لا يُغيّر نقطة الاتصال (syncDot)
  // نقطة الاتصال تعكس حالة الاتصال الفعلية بفايربيس عبر مراقب .info/connected
  if(on){b.classList.add("active");b.classList.remove("done");}
  else{b.classList.remove("active");b.classList.add("done");setTimeout(()=>b.classList.remove("done"),800);}
}

