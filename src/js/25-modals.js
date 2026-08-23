/* ════════════════════════════════════════════
   MODALS
════════════════════════════════════════════ */
function openConf(id){
  S.cId=id;const r=S.recs.find(x=>x.id===id);
  document.getElementById("cT1").innerHTML=`<strong>${esc(r.plate)}</strong> (${esc(r.driver)})`;
  document.getElementById("cT2").innerHTML=`${whFieldLbl(r.wh)}: <strong>${esc(whName(r.wh))}</strong> | الكلي: <strong>${fKG(r.gross)}</strong>`;
  document.getElementById("cPrc").value="";document.getElementById("cCalc").textContent="";
  document.getElementById("mConf").classList.add("active");
}
function prevConf(){const p=numIn("cPrc");const el=document.getElementById("cCalc");if(!p||p<=0){el.textContent="";return;}el.textContent="مثال ١٠,٠٠٠ كغم = "+fIQD(10000*p);}
function confWH(){
  const id=S.cId;const p=numIn("cPrc");
  if(!p||p<=0){document.getElementById("cCalc").textContent="⚠ أدخل سعراً";document.getElementById("cCalc").style.color="var(--owing)";return;}
  const r=S.recs.find(x=>x.id===id);if(!r)return;
  const upd={...r,status:"confirmed",ppkg:p,confAt:nowStr(),confBy:S.cu.name};
  saveRec(upd);closeM();showToast("🏭 تم تأكيد المخزن");
}

function openWeigh(id){
  S.wId=id;const r=S.recs.find(x=>x.id===id);
  document.getElementById("wT").innerHTML=`<strong>${esc(r.plate)}</strong> (${esc(r.driver)})<br>الكلي: <strong>${fKG(r.gross)}</strong> | سعر: <strong>${fIQD(r.ppkg)}</strong>/كغم`;
  document.getElementById("eWI").value="";document.getElementById("wCalc").textContent="";
  document.getElementById("mWeigh").classList.add("active");
}
function prevW(){
  const r=S.recs.find(x=>x.id===S.wId);if(!r)return;
  const ev=numIn("eWI");
  const el=document.getElementById("wCalc");
  if(!ev||ev<=0){el.textContent="";return;}
  if(ev>=r.gross){el.textContent="⚠ الوزن الفارغ أكبر من الكلي!";el.style.color="var(--owing)";return;}
  const c=calcFees(r.gross,ev,r.ppkg,r.kOn,r.kC,r.kUP,r.nOn,getNaqlEntries(r),r.wOn,r.wPrice,r.nDeduct);
  if(r.kOn)t+=` − كبس: ${fIQD(c.kabsFee)}`;
  if(r.nOn)t+=c.naqlDeduct?` − نقل: ${fIQD(c.naqlFee)}`:` | نقل (للناقل، غير مطروح): ${fIQD(c.naqlFee)}`;
  if(r.wOn)t+=` − وصل: ${fIQD(c.waslFee)}`;
  t+=` = ${fIQD(c.final)}`;
  el.textContent=t;el.style.color="var(--wheat-hi)";
}
/* ── فحص الوصولات المكررة (نفس الفلاح + الكلي + الفارغ + السعر) ── */
function _findDuplicateRec(recsArray,driver,gross,empty,ppkg,excludeId){
  const dName=(driver||"").trim().toLowerCase();
  return recsArray.find(x=>
    x.id!==excludeId &&
    (x.driver||"").trim().toLowerCase()===dName &&
    Number(x.gross)===Number(gross) &&
    Number(x.empty)===Number(empty) &&
    Number(x.ppkg)===Number(ppkg)
  )||null;
}

/* ── مودال تنبيه التكرار — مشترك للشراء والبيع ── */
let _dupPendingFn=null;
function showDupWarning(dupRec,onConfirm){
  _dupPendingFn=onConfirm;
  document.getElementById("dupWarnTxt").innerHTML=
    `وُجد وصل آخر بنفس البيانات تماماً:<br>
     <strong>${esc(dupRec.driver)}</strong> — لوحة <strong>${esc(dupRec.plate||"—")}</strong><br>
     الكلي: <strong>${fKG(dupRec.gross)}</strong> | الفارغ: <strong>${fKG(dupRec.empty)}</strong> | السعر: <strong>${fIQD(dupRec.ppkg)}</strong>/كغم`;
  document.getElementById("mWeigh")?.classList.remove("active");
  document.getElementById("mSellWeigh")?.classList.remove("active");
  document.getElementById("mDupWarn").classList.add("active");
}
function confirmDupSave(){
  const fn=_dupPendingFn;_dupPendingFn=null;
  closeM();
  if(fn)fn();
}

function confWeigh(){
  const id=S.wId;const ev=numIn("eWI");
  const r=S.recs.find(x=>x.id===id);if(!r)return;
  if(!ev||ev<=0||ev>=r.gross){document.getElementById("wCalc").textContent="⚠ أدخل وزناً صحيحاً!";document.getElementById("wCalc").style.color="var(--owing)";return;}
  const c=calcFees(r.gross,ev,r.ppkg,r.kOn,r.kC,r.kUP,r.nOn,getNaqlEntries(r),r.wOn,r.wPrice,r.nDeduct);
  const upd={...r,empty:ev,net:c.net,wFee:c.wFee,kabsFee:c.kabsFee,naqlFee:c.naqlFee,waslFee:c.waslFee,final:c.final,status:"weighed",weighAt:nowStr(),weighBy:S.cu.name};
  const dup=_findDuplicateRec(S.recs,r.driver,r.gross,ev,r.ppkg,r.id);
  const doSave=()=>{saveRec(upd);closeM();showToast("✅ مكتمل — "+fIQD(c.final));};
  if(dup){showDupWarning(dup,doSave);return;}
  doSave();
}

/* ── دعم تعدد الناقلين داخل مودال التعديل ── */
let _editNaqlRows=[];   // نسخة من بيانات الناقلين الحالية (id/مدفوعات محفوظة) مع كل تغيير عدّاد
let _editNaqlCount=1;
function _captureEditNaqlInputs(){
  const names=[...document.querySelectorAll('.editNaql-name')].map(el=>el.value.trim());
  const kabs=[...document.querySelectorAll('.editNaql-kabs')].map(el=>parseFloat(el.value)||0);
  const prices=[...document.querySelectorAll('.editNaql-price')].map(el=>numIn(el)||0);
  return names.map((name,i)=>({transporter:name,nC:kabs[i]||0,nUP:prices[i]||0}));
}
function changeEditNaqlCount(delta){
  const inputs=_captureEditNaqlInputs();
  inputs.forEach((inp,i)=>{
    _editNaqlRows[i]=_editNaqlRows[i]||{};
    _editNaqlRows[i].transporter=inp.transporter;
    _editNaqlRows[i].nC=inp.nC;
    _editNaqlRows[i].nUP=inp.nUP;
  });
  _editNaqlCount=Math.max(1,Math.min(10,_editNaqlCount+delta));
  document.getElementById("editNaqlCountDisp").textContent=AR(_editNaqlCount);
  renderEditNaqlRows();
}
function renderEditNaqlRows(){
  const cont=document.getElementById("editNaqlRowsContainer");
  if(!cont)return;
  let html="";
  for(let i=0;i<_editNaqlCount;i++){
    const row=_editNaqlRows[i]||{};
    const hasPaid=(row.naqlPaidTotal||0)>0;
    html+=`<div style="background:var(--ink-050);border-radius:9px;padding:9px;margin-bottom:7px;border:1px solid var(--rule)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <span style="font-size:11px;color:var(--wheat);font-weight:700">🚚 الناقل ${AR(i+1)}</span>
        ${hasPaid?`<span style="font-size:10px;color:var(--settled)">✅ مدفوع منه ${fIQD(row.naqlPaidTotal)}</span>`:""}
      </div>
      <div class="fg">
        <div class="fi-g"><label class="fl">اسم الناقل</label><input class="fi editNaql-name" type="text" placeholder="اسم الناقل" value="${esc((row.transporter||'').replace(/"/g,'&quot;'))}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true"></div>
        <div class="fi-g"><label class="fl">عدد الكبسات</label><input class="fi editNaql-kabs" type="number" min="0" placeholder="0" value="${row.nC||''}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true" inputmode="numeric"></div>
        <div class="fi-g"><label class="fl">سعر الكبسة (د.ع)</label><input style="text-align:right" oninput="fmtPayInput(this)" class="fi editNaql-price" type="text" inputmode="decimal" dir="ltr" value="${row.nUP||''}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true" inputmode="numeric"></div>
      </div>
    </div>`;
  }
  cont.innerHTML=html;
}

/* ── أيقونات المواد داخل مودالات التعديل (بديل عن <select> الذي لا يدعم عرض الصور) ── */
function _fillMatIcons(prefix){
  ["jet","gravel","mixed","straw"].forEach(function(k){
    const el=document.getElementById(prefix+"MtIco_"+k);
    if(el)el.innerHTML=MAT[k].icon;
  });
}
function _updateMatBtnActive(prefix,mat){
  ["jet","gravel","mixed","straw"].forEach(function(k){
    const btn=document.getElementById(prefix+"MtBtn_"+k);
    if(btn)btn.classList.toggle("active",k===mat);
  });
}
function selEditMat(prefix,mat){
  const inp=document.getElementById(prefix+"Mt");
  if(inp)inp.value=mat;
  _updateMatBtnActive(prefix,mat);
}

let _eOrigDk=null;
function openEdit(id){
  const r=S.recs.find(x=>x.id===id);if(!r)return;
  document.getElementById("eId").value=id;
  _eOrigDk=r.dk||toDay();
  document.getElementById("eDk").value=_eOrigDk;
  document.getElementById("eDv").value=r.driver;
  document.getElementById("ePl").value=r.plate;
  document.getElementById("eWh").value=r.wh;
  document.getElementById("eMt").value=r.mat;
  _fillMatIcons("e");
  _updateMatBtnActive("e",r.mat);
  setNumIn("ePrc",r.ppkg||"");
  setNumIn("eGr",r.gross);
  setNumIn("eEm",r.empty||"");
  document.getElementById("eKC").value=r.kC||"";
  setNumIn("eKP",r.kUP||"");
  document.getElementById("eKT").value=r.kType||"";
  document.getElementById("eNDeduct").value=(r.nDeduct===false)?"no":"yes";
  // تحميل الناقلين (يدعم ناقل واحد قديم أو عدة ناقلين)
  const naqlEntries=getNaqlEntries(r);
  _editNaqlRows=naqlEntries.length?naqlEntries.map(en=>({
    id:en._entryId||null,transporter:en.transporter||"",nC:en.nC||0,nUP:en.nUP||0,
    naqlPayments:en.naqlPayments||[],naqlPaidTotal:en.naqlPaidTotal||0,naqlPaid:en.naqlPaid||false,naqlPaidAt:en.naqlPaidAt||null
  })):[{id:null,transporter:"",nC:0,nUP:0,naqlPayments:[],naqlPaidTotal:0,naqlPaid:false,naqlPaidAt:null}];
  _editNaqlCount=_editNaqlRows.length;
  document.getElementById("editNaqlCountDisp").textContent=AR(_editNaqlCount);
  renderEditNaqlRows();
  setNumIn("eWPEdit",r.wPrice||"");
  document.getElementById("ePaid").value=r.paid?"paid":"unpaid";
  document.getElementById("eNote").value=r.note||"";
  document.getElementById("mEdit").classList.add("active");
}
/* ══════════════════════════════════════════════════════
   حارس التعديل — v17.48
   ──────────────────────────────────────────────────────
   ① الأوزان: كان الوصل يُحفظ حتى لو صار الفارغ أكبر من
     الكلي — تُكتب الأوزان الجديدة ويبقى المبلغ محسوباً
     على القديم، فيخرج وصلٌ يناقض نفسه: كلي ١٢٠٠٠ وصافي
     ٦٠٠٠ ومبلغ لا يوافق أيّاً منهما. (saveArbEdit كانت
     تفحص هذا منذ البداية؛ نُعمّم فحصها.)
   ② الفائض: تخفيض مبلغ وصلٍ قُبض كاملاً يُنشئ فائضاً
     للساحة عند صاحبه. لا نمنعه — قد يكون التصحيح صحيحاً —
     لكن لا يمرّ صامتاً.
══════════════════════════════════════════════════════ */
function _guardWeights(g,e,required){
  if(e==null||isNaN(e)){
    if(required){showToast("⚠ أدخل الوزن الفارغ");return false;}
    return true;                       // وصل لم يُوزن بعد — مسموح
  }
  if(e<=0){showToast("⚠ الوزن الفارغ يجب أن يكون أكبر من صفر");return false;}
  if(!g||isNaN(g)){showToast("⚠ أدخل الوزن الكلي");return false;}
  if(e>=g){showToast("⚠ الوزن الفارغ يجب أن يكون أصغر من الوزن الكلي");return false;}
  return true;
}
function _guardOverpay(oldRec,newTotal){
  const paid=getPaidTotal(oldRec);
  if(!(newTotal>0)||paid<=newTotal)return true;
  const n=x=>Math.round(x).toLocaleString("en");
  return confirm(
`المدفوع فعلاً ${n(paid)} د.ع
والمبلغ بعد التعديل ${n(newTotal)} د.ع

سينتج فائض ${n(paid-newTotal)} د.ع للساحة عند صاحب الوصل.
سيظهر التنبيه في الوصل وفي زرّ الدفع.

هل تريد المتابعة؟`);
}

function saveEdit(){
  const id=document.getElementById("eId").value;
  const r=S.recs.find(x=>x.id===id);if(!r)return;
  const p=numIn("ePrc")||r.ppkg;
  const g=numIn("eGr")||r.gross;
  const _eRaw=numIn("eEm");
  const e=isNaN(_eRaw)?null:_eRaw;
  // v17.48 — الوزن الفارغ مطلوب متى كان الوصل موزوناً أصلاً
  if(!_guardWeights(g,e,r.status==="weighed"))return;
  const kC=parseFloat(document.getElementById("eKC").value)||0;
  const kP=numIn("eKP")||0;
  const kT=document.getElementById("eKT").value;
  // بناء قائمة الناقلين من الصفوف الديناميكية — مع الحفاظ على هوية ودفعات كل ناقل حسب ترتيبه
  const naqlInputs=_captureEditNaqlInputs();
  const newNaqlList=[];
  naqlInputs.forEach((inp,i)=>{
    if(!(inp.nC>0&&inp.nUP>0))return;
    const meta=_editNaqlRows[i]||{};
    newNaqlList.push({
      id:meta.id||genId(),
      transporter:inp.transporter,
      nC:inp.nC,nUP:inp.nUP,naqlFee:inp.nC*inp.nUP,
      naqlPayments:meta.naqlPayments||[],
      naqlPaidTotal:meta.naqlPaidTotal||0,
      naqlPaid:meta.naqlPaid||false,
      naqlPaidAt:meta.naqlPaidAt||null,
    });
  });
  const nOn=newNaqlList.length>0;
  const nTransporter=newNaqlList.length===1?(newNaqlList[0].transporter||""):newNaqlList.map(x=>x.transporter).filter(Boolean).join("، ");
  const nDeduct=document.getElementById("eNDeduct")?.value!=="no";
  const wP=numIn("eWPEdit")||0;
  const paidVal=document.getElementById("ePaid").value==="paid";
  const eDkNow=document.getElementById("eDk").value;
  const dkVal=eDkNow||_eOrigDk||toDay();
  const kOn=kC>0&&kP>0&&kT!=="";
  const wOn=wP>0;
  let upd={
    ...r,
    driver:document.getElementById("eDv").value.trim()||r.driver,
    plate:document.getElementById("ePl").value.trim()||r.plate,
    wh:document.getElementById("eWh").value,
    mat:document.getElementById("eMt").value,
    dk:dkVal,
    note:(document.getElementById("eNote")?.value||"").trim(),
    ppkg:p,gross:g,kOn,kC,kUP:kP,kType:kT,
    nOn,naqlList:newNaqlList,transporter:nTransporter,nDeduct,
    nC:newNaqlList.length===1?newNaqlList[0].nC:null,
    nUP:newNaqlList.length===1?newNaqlList[0].nUP:null,
    wOn,wPrice:wP,
    paid:paidVal,
    paidAt:paidVal?(r.paidAt||nowStr()):null,
    paidBy:paidVal?(r.paidBy||S.cu.name):null,
    // علامة التعديل
    edited:true,
    editAt:nowStr(),
    editBy:S.cu.name,
  };
  if(p&&e&&e>0&&e<g){
    const c=calcFees(g,e,p,kOn,kC,kP,nOn,newNaqlList,wOn,wP,nDeduct);
    upd={...upd,empty:e,net:c.net,wFee:c.wFee,kabsFee:c.kabsFee,naqlFee:c.naqlFee,waslFee:c.waslFee,final:c.final};
  }
  if(!_guardOverpay(r,getRecTotal(upd)))return;      // v17.48
  saveRec(upd);closeM();showToast("✏️ تم التعديل — "+upd.plate);
}

/* ── مدفوع / غير مدفوع ───────────────────────────────────── */
function togglePaid(id){
  const r=S.recs.find(x=>x.id===id);if(!r)return;
  openPartialPay(id,'buy');
}

/* ════ نظام الدفع الجزئي ════ */
let _ppId=null,_ppType=null;

function getRecTotal(r){
  // للضمانات: الدفع دائماً على r.price (الضمانة الأصلية فقط)
  // الوصولات الفرعية كل منها تُدفع منفصلاً عبر openSubPay
  return r.final||r.price||r.amount||0;
}
/* ══════════════════════════════════════════════════════
   مجموع المدفوع — v17.43
   ──────────────────────────────────────────────────────
   كان الرجوع الاحتياطي (للسجلات القديمة المعلَّمة paid:true
   بلا مصفوفة payments) يقرأ r.final||r.price فقط — وهذان
   الحقلان غير موجودين في الصرفيات وأجور الأعمال والسلف
   وحركات العمال، فمبلغها في r.amount.
   النتيجة: صرفية قديمة مسدَّدة بالكامل كانت تُحسب «مدفوع ٠»
   بينما إجماليها كامل، فتظهر ديناً وهمياً في كل مكان:
   شريط الدفع · بطاقة الزبون · البحث الشامل · مجاميع المتبقي.
   الآن يُقرأ الإجمالي من getRecTotal نفسها التي يقيس بها
   باقي النظام — فلا يختلف المصدران أبداً.
══════════════════════════════════════════════════════ */
function getPaidTotal(r){
  if(!r.payments||!r.payments.length) return r.paid?getRecTotal(r):0;
  return r.payments.reduce((s,p)=>s+(p.amount||0),0);
}
function getRemaining(r){return Math.max(0,getRecTotal(r)-getPaidTotal(r));}
/* ══════════════════════════════════════════════════════
   الفائض — v17.48
   ──────────────────────────────────────────────────────
   getRemaining تقصّ عند الصفر، وهذا صحيح للعرض، لكنه كان
   يُخفي حالةً خطيرة: أن يكون المدفوع أكبر من مبلغ الوصل.
   تحدث حين يُعدَّل وصلٌ مدفوع فيُخفَّض مبلغه (سعر أقلّ أو
   وزن أقلّ) بعد أن قُبض كاملاً. حينها يعرض التطبيق
   «✅ مدفوع كامل» ويظهر المتبقي صفراً — والفارق مالٌ
   للساحة عند الفلاح لا يظهر في أي شاشة.
   getOverpay تُخرجه إلى السطح ليُطالَب به.
══════════════════════════════════════════════════════ */
function getOverpay(r){return Math.max(0,getPaidTotal(r)-getRecTotal(r));}
function isFullyPaid(r){
  const tot=getRecTotal(r);
  if(!tot)return r.paid;
  return getPaidTotal(r)>=tot;
}

/* ══════════════════════════════════════════════════════
   الدفع الجامع — محرّك واحد لكل الأقسام — v17.44
   ──────────────────────────────────────────────────────
   يوزّع مبلغاً واحداً على سجلات شخص واحد غير المسدَّدة،
   من الأقدم إلى الأحدث حتى نفاد المبلغ.
   كان مكتوباً للشراء وحده؛ صار مُعرَّفاً بجدول _BULK فيعمل
   للشراء والصرفيات وأجور الأعمال بنفس السلوك والمنطق —
   وإضافة قسم جديد لاحقاً تعني سطراً في الجدول لا نسخة
   ثالثة من الدالة.
   ⚠️ السلوك للشراء لم يتغيّر إطلاقاً: نفس الفلترة
   (الموزونة فقط) ونفس الترتيب ونفس نص الدفعة.
══════════════════════════════════════════════════════ */
const _BULK={
  buy:{
    label:"الفلاح", ph:"مثال: علاء حسين", color:"var(--wheat)",
    match:["driver"],
    recs:()=>S.recs||[],
    filter:r=>r.status==="weighed",       // الشراء: الموزونة فقط
    save:r=>saveRec(r),
    tag:"(دفع جامع)",
    rowLabel:r=>"🚛 "+(r.plate||"—"),
    empty:"✅ لا توجد وصولات غير مسدَّدة لـ",
    hint:"وصولاته",
    after:()=>{try{renderRecs();renderStats();renderWH();}catch(e){}},
  },
  sell:{
    label:"الفلاح / المستلم", ph:"مثال: كريم الساعدي", color:"var(--settled)",
    /* البيع يُبحث فيه بالفلاح أو المستلم — نفس ما يفعله سجلّ البيع
       وتبويب الزبون، فلا يختلف مكانان في التطبيق عن بعضهما. */
    match:["driver","receiver"],
    recs:()=>SELL_RECS||[],
    filter:r=>r.status==="weighed",       // المبلغ النهائي لا يوجد قبل الوزن
    save:r=>saveSellRec(r),
    tag:"(دفع جامع بيع)",
    rowLabel:r=>"🚛 "+(r.plate||"—")+(r.dest?" · "+r.dest:""),
    empty:"✅ لا توجد وصولات بيع غير مسدَّدة لـ",
    hint:"وصولاته",
    after:()=>{try{renderSellRecs();renderSellStats();}catch(e){}},
  },
  srf:{
    label:"المستفيد", ph:"مثال: أبو محمد", color:"var(--pending)",
    match:["recv"],
    recs:()=>SRF_RECS||[],
    filter:()=>true,
    save:r=>saveSrfRec(r),
    tag:"(دفع جامع صرفيات)",
    rowLabel:r=>"🧾 "+(r.purp||"—"),
    empty:"✅ لا توجد صرفيات غير مسدَّدة لـ",
    hint:"صرفياته",
    after:()=>{try{renderSrfRecs();}catch(e){}},
  },
  wrk:{
    label:"مقدّم الخدمة", ph:"مثال: ورشة الأمين", color:"var(--steel)",
    match:["provider"],
    recs:()=>WRK_RECS||[],
    filter:()=>true,
    save:r=>saveWrkRec(r),
    tag:"(دفع جامع أجور)",
    rowLabel:r=>"🔧 "+(r.service||"—"),
    empty:"✅ لا توجد أجور غير مسدَّدة لـ",
    hint:"أجوره",
    after:()=>{try{renderWrkRecs();}catch(e){}},
  },
};
/* معرّفات الحقول في الصفحة — مشتقّة من اسم القسم */
const _bulkId=(sec,part)=>(sec==="buy"?"bulkPay":sec+"BulkPay")+part;
const _bulkName={buy:"",srf:"",wrk:""};

function bulkPaySearch(sec){
  sec=sec||"buy";
  _bulkName[sec]=(document.getElementById(_bulkId(sec,"Name"))?.value||"").trim();
  const res=document.getElementById(_bulkId(sec,"Result"));
  if(res)res.innerHTML="";
  renderBulkPayPreview(sec);
}

/* سجلات الشخص غير المسدَّدة بالكامل، من الأقدم إلى الأحدث */
function _getBulkPayRecs(name,sec){
  sec=sec||"buy";
  const C=_BULK[sec]; if(!C||!name)return[];
  return C.recs()
    .filter(r=>C.filter(r)&&C.match.some(f=>smartMatch(r[f],name))&&!isFullyPaid(r)&&getRecTotal(r)>0)
    .sort((a,b)=>{
      const dkA=a.dk||"",dkB=b.dk||"";
      if(dkA!==dkB)return dkA.localeCompare(dkB);
      return (a.seq||0)-(b.seq||0);
    });
}

/* الأسماء المتمايزة فعلاً ضمن مجموعة سجلات (بمفتاح الاسم القانوني) */
function _bulkDistinctNames(recs,sec){
  const C=_BULK[sec||"buy"]; if(!C)return[];
  const seen={},out=[];
  recs.forEach(r=>{
    const nm=(C.match.map(f=>r[f]).find(v=>v&&String(v).trim())||"").trim();
    const k=nameKey(nm)||nm;
    if(k&&!seen[k]){seen[k]=1;out.push(nm);}
  });
  return out;
}

function renderBulkPayPreview(sec){
  sec=sec||"buy";
  const C=_BULK[sec]; if(!C)return;
  const el=document.getElementById(_bulkId(sec,"Preview"));
  if(!el)return;
  const name=_bulkName[sec];
  if(!name){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:22px;font-size:12px">🔍 اكتب اسم ${esc(C.label)} لعرض ${esc(C.hint)} غير المسدَّدة</div>`;
    return;
  }
  const recs=_getBulkPayRecs(name,sec);
  if(!recs.length){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:22px;font-size:12px">${esc(C.empty)} "${esc(name)}"</div>`;
    return;
  }
  const totalRem=recs.reduce((s,r)=>s+getRemaining(r),0);
  /* v17.55 — الاسم القصير («عبد») يطابق أشخاصاً مختلفين. نُظهرهم
     صراحةً قبل الدفع بدل أن يمرّ المال بينهم بلا أن ينتبه أحد. */
  const names=_bulkDistinctNames(recs,sec);
  const warn=names.length>1?`
    <div style="background:var(--owing-wash);border:1px solid var(--owing);border-radius:9px;
        padding:8px 10px;margin-bottom:8px;font-size:11px;color:var(--paper-2);line-height:1.7">
      ⚠️ <strong style="color:var(--owing)">هذا البحث يطابق ${AR(names.length)} أسماء مختلفة</strong> —
      سيوزَّع المبلغ عليها جميعاً. اكتب الاسم كاملاً إن أردت شخصاً بعينه.
      <div style="margin-top:4px;color:var(--paper-3);font-size:10px">${names.map(n=>esc(n)).join(" · ")}</div>
    </div>`:"";
  const rows=recs.map((r,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 9px;border-bottom:1px solid var(--rule);font-size:11px">
    <span style="color:var(--paper-2)">${AR(i+1)}. 📅 ${tAr(r.dk)} — ${esc(C.rowLabel(r))}${getPaidTotal(r)>0?' | 💰 جزئي':''}</span>
    <span style="color:var(--wheat-hi);font-weight:700">${fIQD(getRemaining(r))}</span>
  </div>`).join("");
  el.innerHTML=warn+`
    <div style="background:var(--ink-200);border-radius:9px;padding:9px 11px;margin-bottom:8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:12px">
      <span style="color:var(--paper-2)">عدد السجلات: <strong style="color:var(--wheat-hi)">${AR(recs.length)}</strong></span>
      <span style="color:var(--paper-2)">إجمالي المتبقي: <strong style="color:var(--owing)">${fIQD(totalRem)}</strong></span>
    </div>
    <div style="max-height:260px;overflow-y:auto;background:var(--ink-100);border-radius:9px;border:1px solid var(--rule)">${rows}</div>`;
}

function execBulkPay(sec){
  sec=sec||"buy";
  const C=_BULK[sec]; if(!C)return;
  const name=_bulkName[sec]||(document.getElementById(_bulkId(sec,"Name"))?.value||"").trim();
  const amount=payAmt(_bulkId(sec,"Amount"));
  const note=(document.getElementById(_bulkId(sec,"Note"))?.value||"").trim();
  if(!name){showToast("⚠ أدخل اسم "+C.label);return;}
  if(!amount||amount<=0){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  const recs=_getBulkPayRecs(name,sec);
  if(!recs.length){showToast("⚠ لا توجد سجلات غير مسدَّدة لهذا الاسم");return;}
  /* v17.55 — تأكيد صريح حين يشمل التوزيع أكثر من شخص */
  const _names=_bulkDistinctNames(recs,sec);
  if(_names.length>1&&!confirm(
`تنبيه: هذا البحث يطابق ${_names.length} أسماء مختلفة، وسيوزَّع المبلغ عليها جميعاً:

${_names.join("\n")}

إن أردت شخصاً بعينه، أغلق هذه الرسالة واكتب اسمه كاملاً.

هل تريد المتابعة؟`))return;
  let pool=amount;
  const results=[];
  const bid=genId();                    // v17.63 — عملية واحدة، سطر واحد في سجل الدفعات
  for(const r of recs){
    if(pool<=0)break;
    const rem=getRemaining(r);
    if(rem<=0)continue;
    const pay=Math.min(pool,rem);
    const payments=[...(r.payments||[]),{amount:pay,at:nowStr(),by:S.cu.name+" "+C.tag,note:note||null,bid}];
    const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
    const tot=getRecTotal(r);
    const fullyPaid=paidTotal>=tot;
    C.save({...r,payments,paidTotal,paid:fullyPaid,
      paidAt:fullyPaid?(r.paidAt||nowStr()):null,
      paidBy:fullyPaid?(r.paidBy||S.cu.name):null});
    results.push({label:C.rowLabel(r),dk:r.dk,paid:pay,fullyPaid});
    pool-=pay;
  }
  const totalPaid=amount-pool;
  if(!results.length){showToast("⚠ لم يتم تسجيل أي دفعة");return;}
  const summary=`<div style="background:var(--settled-wash);border:1px solid var(--settled);border-radius:10px;padding:11px;margin-top:8px">
    <div style="font-size:12px;color:var(--settled);font-weight:700;margin-bottom:7px">✅ تم توزيع الدفعة على ${AR(results.length)} سجل</div>
    <div style="max-height:200px;overflow-y:auto">
    ${results.map(r=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px dashed var(--settled-rule)">
      <span style="color:var(--paper-2)">📅 ${tAr(r.dk)} — ${esc(r.label)}</span>
      <span style="color:var(--settled);font-weight:700">${fIQD(r.paid)}${r.fullyPaid?' ✅ مكتمل':' 💰 جزئي'}</span>
    </div>`).join("")}
    </div>
    <div style="margin-top:7px;font-size:13px;color:var(--wheat-hi);font-weight:700">إجمالي المدفوع: ${fIQD(totalPaid)}</div>
    ${pool>0?`<div style="margin-top:4px;font-size:11px;color:var(--owing)">⚠ متبقٍّ من المبلغ المُدخل لم يُستعمل (لا توجد سجلات أخرى لهذا الاسم): ${fIQD(pool)}</div>`:""}
  </div>`;
  const res=document.getElementById(_bulkId(sec,"Result"));
  if(res)res.innerHTML=summary;
  const amtEl=document.getElementById(_bulkId(sec,"Amount"));if(amtEl)amtEl.value="";
  const noteEl=document.getElementById(_bulkId(sec,"Note"));if(noteEl)noteEl.value="";
  renderBulkPayPreview(sec);
  C.after();
  showToast("✅ تم الدفع الجامع — "+fIQD(totalPaid));
}

function clrBulkPay(sec){
  sec=sec||"buy";
  ["Name","Amount","Note"].forEach(k=>{const e=document.getElementById(_bulkId(sec,k));if(e)e.value="";});
  ["Preview","Result"].forEach(k=>{const e=document.getElementById(_bulkId(sec,k));if(e)e.innerHTML="";});
  _bulkName[sec]="";
}


/* ── قسم الدفعات في الوصل المطبوع ── */
function buildPaymentsSection(r){
  const payments=r.payments||[];
  const tot=getRecTotal(r);
  const paidSoFar=getPaidTotal(r);
  const remaining=Math.max(0,tot-paidSoFar);
  const pct=tot>0?Math.min(100,Math.round(paidSoFar/tot*100)):0;
  if(!payments.length&&!r.paid)return "";
  const payRows=payments.map((p,i)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px dashed var(--paper);font-size:10px">
      <span style="color:var(--paper-4)">💳 دفعة ${AR(i+1)} — ${tAr(p.at)} | ${esc(p.by)}${p.note?`<br><span style="color:var(--wheat-dim)">📝 ${esc(p.note)}</span>`:""}</span>
      <span style="font-weight:700;color:var(--settled)">+ ${fIQD(p.amount)}</span>
    </div>`).join("");
  const bar=`<div style="background:var(--paper);border-radius:3px;height:6px;margin:5px 0;overflow:hidden">
    <div style="width:${pct}%;height:100%;background:var(--settled)"></div>
  </div>`;
  const summary=`
    <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:5px">
      <span style="color:var(--settled);font-weight:700">✅ مدفوع: ${fIQD(paidSoFar)}</span>
      <span style="color:var(--paper-3)">${pct}%</span>
      <span style="${remaining>0?"color:var(--owing)":"color:var(--settled)"};font-weight:700">${remaining>0?"⏳ متبقي: "+fIQD(remaining):"✅ مسدّد بالكامل"}</span>
    </div>
    ${getOverpay(r)>0?`<div style="margin-top:4px;font-size:10px;font-weight:700;color:#C6362E">⚠️ فائض: ${fIQD(getOverpay(r))}</div>`:""}`;
  return`<div style="background:var(--settled-wash);border:1.5px solid var(--settled);border-radius:7px;padding:8px 10px;margin:5px 0">
    <!-- v17.43 — كان اللون هنا var(--settled-wash) وهو نفسه لون خلفية
         الصندوق، فالعنوان كان غير مرئي تماماً في الوضعين الفاتح
         والداكن وفي الوصل المطبوع. اللون الصحيح هو لون الحالة نفسه. -->
    <div style="font-size:10px;font-weight:700;color:var(--settled);margin-bottom:5px">💰 سجل الدفعات</div>
    ${payRows}
    ${bar}${summary}
  </div>`;
}

function openPartialPay(id,type){
  _ppId=id;_ppType=type;
  let r=null;
  if(type==='buy')r=S.recs.find(x=>x.id===id);
  else if(type==='sell')r=SELL_RECS.find(x=>x.id===id);
  else if(type==='dam')r=DAM_RECS.find(x=>x.id===id);
  else if(type==='wrk')r=WRK_RECS.find(x=>x.id===id);
  else if(type==='adv')r=ADV_RECS.find(x=>x.id===id);
  else if(type==='srf')r=SRF_RECS.find(x=>x.id===id);
  if(!r)return;
  const tot=getRecTotal(r);
  const paidSoFar=getPaidTotal(r);
  const remaining=Math.max(0,tot-paidSoFar);
  const pct=tot>0?Math.min(100,Math.round(paidSoFar/tot*100)):0;
  const payments=r.payments||[];
  const histHTML=payments.length?`
    <div class="pay-hist">
      ${payments.map((p,i)=>`
        <div class="pay-hist-row">
          <span style="color:var(--paper-2)">💳 ${tAr(p.at)} — ${esc(p.by)}${p.note?`<br><span style="color:var(--wheat);font-size:9px">📝 ${esc(p.note)}</span>`:""}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--settled);font-weight:700">${fIQD(p.amount)}</span>
            <button onclick="removePayment('${id}','${type}',${i})" style="background:rgba(239,68,68,.15);color:var(--owing);border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>
          </div>
        </div>`).join("")}
    </div>`:'<div style="font-size:11px;color:var(--paper-4);margin-top:4px">لا توجد دفعات مسجّلة</div>';
  const el=document.getElementById("mPartialPay");
  el.innerHTML=`
    <div class="mhd"></div>
    <div class="mtit" style="color:var(--settled)">💰 الدفع الجزئي — الطرح من الأجور</div>
    <p class="mtxt" style="margin-bottom:8px">
      ${type==='dam'?`${esc(r.damin)} ← ${esc(r.madmun)}`:`${esc(r.driver||r.damin||"")} — ${esc(r.plate||"")}`}
    </p>
    <div class="pay-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">
        <span style="color:var(--paper-2)">إجمالي الأجور: <strong style="color:var(--wheat-hi)">${fIQD(tot)}</strong></span>
        <span style="color:var(--wheat-hi);font-weight:700">${pct}% مدفوع</span>
      </div>
      <div class="pay-bar-track"><div class="pay-bar-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px">
        <span style="color:var(--settled);font-weight:700">✅ مدفوع: ${fIQD(paidSoFar)}</span>
        <span style="${remaining>0?"color:var(--owing)":"color:var(--settled)"};font-weight:700">${remaining>0?"⏳ متبقي: "+fIQD(remaining):"✅ مسدّد كامل"}</span>
      </div>
      ${(()=>{const ov=getOverpay(r);return ov>0?`
      <div style="background:var(--owing-wash);border:1px solid var(--owing);border-radius:8px;padding:8px 10px;margin-top:8px;font-size:12px;color:var(--owing);line-height:1.7">
        ⚠️ <strong>فائض قدره ${fIQD(ov)}</strong><br>
        <span style="font-size:11px">المدفوع (${fIQD(paidSoFar)}) أكبر من مبلغ الوصل (${fIQD(tot)}) — غالباً لأن الوصل عُدِّل بعد الدفع. هذا المبلغ للساحة عند صاحب الوصل.</span>
      </div>`:"";})()}
      ${histHTML}
    </div>
    ${remaining>0?`
    <div class="fi-g" style="margin-top:12px">
      <label class="fl">مبلغ الدفعة الجديدة (د.ع) — الحد الأقصى: ${fIQD(remaining)}</label>
      <input class="fi" id="ppAmount" type="text" inputmode="numeric" autocomplete="off" placeholder="0" dir="ltr" style="text-align:right" oninput="fmtPayInput(this,${remaining})" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div class="fi-g" style="margin-top:8px">
      <label class="fl">ملاحظة (اختياري)</label>
      <input class="fi" id="ppNote" type="text" placeholder="أي تفاصيل عن الدفعة" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn bgn" style="flex:1;justify-content:center" onclick="addPayment()">+ تسجيل دفعة</button>
      <button class="btn" style="flex:1;justify-content:center;background:var(--settled-wash);color:var(--settled);border:1px solid var(--settled-wash)" onclick="payFull()">✅ دفع الكل (${fIQD(remaining)})</button>
    </div>`:`
    <div style="background:var(--settled-wash);border:1px solid var(--settled);border-radius:8px;padding:10px;text-align:center;color:var(--settled);font-weight:700;margin-top:10px;font-size:13px">
      ✅ تم سداد المبلغ كاملاً
    </div>`}
    <div class="mbtns" style="margin-top:12px">
      <button class="btn bgh" style="width:100%;justify-content:center" onclick="closeM()">إغلاق</button>
    </div>`;
  document.getElementById("mPartialPay-ov").classList.add("on");
}

function addPayment(){
  const amount=payAmt("ppAmount");
  const note=(document.getElementById("ppNote")?.value||"").trim();
  if(!amount||amount<=0){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  applyPayment(amount,note);
}
function payFull(){
  let r=getPayRec();if(!r)return;
  const tot=getRecTotal(r);
  const paid=getPaidTotal(r);
  const rem=tot-paid;
  if(rem<=0){showToast("✅ الوصل مدفوع بالكامل بالفعل");return;}
  const note=(document.getElementById("ppNote")?.value||"").trim();
  applyPayment(rem,note);
}
function getPayRec(){
  if(_ppType==='buy')return S.recs.find(x=>x.id===_ppId);
  if(_ppType==='sell')return SELL_RECS.find(x=>x.id===_ppId);
  if(_ppType==='dam')return DAM_RECS.find(x=>x.id===_ppId);
  if(_ppType==='wrk')return WRK_RECS.find(x=>x.id===_ppId);
  if(_ppType==='adv')return ADV_RECS.find(x=>x.id===_ppId);
  if(_ppType==='srf')return SRF_RECS.find(x=>x.id===_ppId);
  return null;
}
function applyPayment(amount,note){
  const r=getPayRec();if(!r)return;
  // v17: حاجز ضد الدفع الزائد — يقصّ المبلغ على المتبقي مهما كان مصدر الإدخال
  const _rem=Math.max(0,getRecTotal(r)-getPaidTotal(r));
  if(_rem<=0){showToast("✅ مدفوع بالكامل بالفعل");return;}
  if(amount>_rem){showToast("⚠ المبلغ أكبر من المتبقي — تم ضبطه على "+fIQD(_rem));amount=_rem;}
  const payments=[...(r.payments||[]),{amount,at:nowStr(),by:S.cu.name,note:(note||"").trim()||null}];
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const tot=getRecTotal(r);
  const fullyPaid=paidTotal>=tot;
  const upd={...r,payments,paidTotal,
    paid:fullyPaid,
    paidAt:fullyPaid?(r.paidAt||nowStr()):null,
    paidBy:fullyPaid?(r.paidBy||S.cu.name):null};
  if(_ppType==='buy')saveRec(upd);
  else if(_ppType==='sell')saveSellRec(upd);
  else if(_ppType==='dam')saveDamRec(upd);
  else if(_ppType==='wrk')saveWrkRec(upd);
  else if(_ppType==='adv')saveAdvRec(upd);
  else if(_ppType==='srf')saveSrfRec(upd);
  showToast("✅ تم تسجيل "+fIQD(amount));
  openPartialPay(_ppId,_ppType);
}
function removePayment(id,type,idx){
  _ppId=id;_ppType=type;
  const r=getPayRec();if(!r)return;
  const payments=(r.payments||[]).filter((_,i)=>i!==idx);
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const tot=getRecTotal(r);
  const fullyPaid=paidTotal>=tot;
  const upd={...r,payments,paidTotal,
    paid:fullyPaid,
    paidAt:fullyPaid?(r.paidAt||nowStr()):null,
    paidBy:fullyPaid?(r.paidBy||S.cu.name):null};
  if(type==='buy')saveRec(upd);
  else if(type==='sell')saveSellRec(upd);
  else if(type==='dam')saveDamRec(upd);
  else if(type==='wrk')saveWrkRec(upd);
  else if(type==='adv')saveAdvRec(upd);
  else if(type==='srf')saveSrfRec(upd);
  showToast("↩️ تم إلغاء الدفعة");
  openPartialPay(id,type);
}

/* ── تحديث أزرار الدفع في السجلات ── */
function payBtnHTML(r,type){
  const tot=getRecTotal(r);
  const paid=getPaidTotal(r);
  const pct=tot>0?Math.min(100,Math.round(paid/tot*100)):0;
  const full=isFullyPaid(r);
  const over=getOverpay(r);
  const onclick=`openPartialPay('${r.id}','${type}')`;
  // v17.48 — الفائض لا يُخفى خلف «مدفوع كامل»
  if(over>0) return `<button class="btn bsm" style="background:rgba(198,54,46,.14);color:var(--owing);border:1px solid var(--owing)" onclick="${onclick}">⚠️ فائض ${fIQD(over)}</button>`;
  if(full) return `<button class="btn bsm" style="background:rgba(16,185,129,.15);color:var(--settled);border:1px solid var(--settled)" onclick="${onclick}">✅ مدفوع كامل</button>`;
  if(paid>0) return `<button class="btn bsm" style="background:rgba(251,191,36,.12);color:var(--wheat-hi);border:1px solid var(--wheat-hi)" onclick="${onclick}">💰 ${pct}% — جزئي</button>`;
  return `<button class="btn bsm" style="background:rgba(239,68,68,.12);color:var(--owing);border:1px solid var(--owing)" onclick="${onclick}">⏳ تسجيل دفع</button>`;
}
function payBarMiniHTML(r){
  const tot=getRecTotal(r);
  const paid=getPaidTotal(r);
  if(!tot||!paid)return "";
  const pct=Math.min(100,Math.round(paid/tot*100));
  return `<div style="margin:4px 0">
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--paper-3);margin-bottom:3px">
      <span>مدفوع: <span style="color:var(--settled);font-weight:700">${fIQD(paid)}</span></span>
      <span>باقي: <span style="color:var(--owing);font-weight:700">${fIQD(tot-paid)}</span></span>
    </div>
    <div style="background:var(--ink-300);border-radius:3px;height:5px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:var(--settled)"></div>
    </div>
  </div>`;
}

/* ── حذف الوصل ───────────────────────────────────────────── */
let _delId=null;
function openDel(id){
  _delId=id;
  const r=S.recs.find(x=>x.id===id);if(!r)return;
  document.getElementById("delTxt").innerHTML=
    `هل تريد حذف وصل <strong>${esc(r.plate)}</strong> — <strong>${esc(r.driver)}</strong> بتاريخ <strong>${tAr(r.dk)}</strong>؟`;
  document.getElementById("mDel").classList.add("active");
}
function confirmDel(){
  if(!_delId)return;
  delBuyRec(_delId);           // v17: نسخة للسلة + طابور دون اتصال
  showToast("🗑️ تم الحذف — يمكن استرجاعه من الأدوات ← سلة المحذوفات");
  _delId=null;
  closeM();renderRecs();renderStats();renderWH();
}

function closeM(){
  S.cId=null;S.wId=null;_delId=null;_dlRecId=null;_sellConfId=null;_sellWeighId=null;_sellDelId=null;_damDelId=null;_ppId=null;_srfDelId=null;_wrkDelId=null;_delEmpId=null;_delSalId=null;_dupPendingFn=null;_arbDelId=null;
  ["mConf","mWeigh","mEdit","mDel","mDownload","mSellConf","mSellWeigh","mSellEdit","mSellDel","mDamEdit","mDamDel","mDamSub","mDamSubDel","mSrfEdit","mSrfDel","mWrkEdit","mWrkDel","mEmp","mAddSal","mAddAdv","mDelEmp","mDelSal","mAddBonus","mAddDeduct","mAddAbsent","mMnlEdit","mMnlDel","mDupWarn","mArbEdit","mArbDel"].forEach(function(id){
    const el=document.getElementById(id);
    if(el) el.classList.remove("active");
  });
  const ppov=document.getElementById("mPartialPay-ov");
  if(ppov)ppov.classList.remove("on");
  // v17.13 — حرّر التركيز من حقول المودال المغلق، وإلا بقيت
  // الاختصارات معطّلة لأن المعالج يظنّ أن المستخدم يكتب
  const a=document.activeElement;
  if(a&&a!==document.body&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName||"")){
    try{a.blur();}catch(e){}
  }
}

