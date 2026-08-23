/* ══════════════════════════════════════════════════════
   الدفع الشامل — تسديد ما يظهر في البحث الشامل — v17.44
   ──────────────────────────────────────────────────────
   البحث الشامل يجمع سجلات الشخص من كل الأقسام في شاشة
   واحدة، لكن التسديد كان يتطلّب فتح كل قسم على حدة ودفع
   وصولاته يدوياً. هنا يُدفع كل ما تراه أمامك بمبلغ واحد.

   قواعد مقصودة:
   ① يوزَّع من الأقدم إلى الأحدث عبر الأقسام كلها معاً —
     لا قسماً بعد قسم — فالدَّين الأقدم يُسدَّد أولاً.
   ② يحترم مدى التاريخ ونصّ البحث كما هما على الشاشة
     بالضبط: ما لا يظهر لا يُدفع.
   ③ لا تكرار: البحث يستعمل _UNIQ_DATASETS، ووصولات النقل
     اليدوي محسوبة مرة واحدة ضمن «أجور النقل».
   ④ أجور النقل لها مسار دفع مستقل (naqlPayments) ويُستعمل
     كما هو، فلا تختلط أجرة الناقل بمبلغ وصل الفلاح.
   ⑤ الأقسام غير القابلة للدفع مُستبعَدة عمداً: «العمال»
     بيانات أساسية لا دَين، و«السلف» مال على العامل لا له،
     و«حركات العمال» قيود حوافز وخصومات لا فواتير،
     و«مخزن أربيل» بلا مبالغ. تبقى ظاهرة في البحث ولا تُدفع.
══════════════════════════════════════════════════════ */
const _GPAY={
  buy :{save:r=>saveRec(r),     get:id=>(S.recs||[]).find(x=>x.id===id),     total:getRecTotal, paid:getPaidTotal, after:()=>{renderRecs();renderStats();renderWH();}},
  sell:{save:r=>saveSellRec(r), get:id=>(SELL_RECS||[]).find(x=>x.id===id),  total:getRecTotal, paid:getPaidTotal, after:()=>{renderSellRecs();}},
  dam :{save:r=>saveDamRec(r),  get:id=>(DAM_RECS||[]).find(x=>x.id===id),   total:getRecTotal, paid:getPaidTotal, after:()=>{renderDamRecs();}},
  srf :{save:r=>saveSrfRec(r),  get:id=>(SRF_RECS||[]).find(x=>x.id===id),   total:getRecTotal, paid:getPaidTotal, after:()=>{renderSrfRecs();}},
  wrk :{save:r=>saveWrkRec(r),  get:id=>(WRK_RECS||[]).find(x=>x.id===id),   total:getRecTotal, paid:getPaidTotal, after:()=>{renderWrkRecs();}},
  /* الراتب مبلغه في finalNet لا في final/price/amount، فله قارئاه الخاصان */
  sal :{save:r=>saveSalRec(r),  get:id=>(SAL_RECS||[]).find(x=>x.id===id),   total:r=>r.finalNet||0, after:()=>{renderSalRecs();},
        paid:r=>(r.payments&&r.payments.length)
                 ? r.payments.reduce((s,p)=>s+(p.amount||0),0)
                 : (r.paid?(r.finalNet||0):0)},
  naql:{naql:true, after:()=>{try{renderNaqlColl();renderNaqlRecs();}catch(e){}}},
};

/* يُرجع مدخل الدفع الحقيقي لسجل أجرة نقل مُشتقّ من _allNaqlFees */
function _naqlEntryFromFee(f){
  if(!f)return null;
  if(f._kind==="buy"){
    const {recId,entryId}=_parseNaqlMultiId(f.id);
    const rec=(S.recs||[]).find(x=>x.id===recId); if(!rec)return null;
    const en=getNaqlEntries(rec).find(e=>(e._entryId||null)===(entryId||null)); if(!en)return null;
    return{type:"buy",damId:null,rRef:{...en,id:f.id,driver:rec.driver,plate:rec.plate,dk:rec.dk}};
  }
  if(f._kind==="sell"){
    const r=(SELL_RECS||[]).find(x=>x.id===f.id);
    return r?{type:"sell",damId:null,rRef:r}:null;
  }
  if(f._kind==="dam"){
    const dam=(DAM_RECS||[]).find(x=>x.id===f._recId);
    if(!dam||!dam.subRecs)return null;
    const sub=Object.values(dam.subRecs).find(x=>x.id===f.id);
    return sub?{type:"dam-sub",damId:dam.id,rRef:sub}:null;
  }
  if(f._kind==="mnl"){
    const r=(MNL_RECS||[]).find(x=>x.id===f.id);
    return r?{type:"mnl",damId:null,rRef:r}:null;
  }
  return null;
}

/* كل ما هو قابل للدفع ضمن نتائج البحث الحالية — من الأقدم للأحدث */
/* ══════════════════════════════════════════════════════════════
   الدفع يُقاد بالهوية لا بالبحث — v17.55
   ──────────────────────────────────────────────────────────────
   ⚠️ عطل بالغ الخطورة: كان الدفع الشامل يدفع كل ما يُرجعه
   البحث. والبحث — بحكم وظيفته — يطابق حقولاً كثيرة: الملاحظة
   واللوحة واسم المخزن والناقل، لا اسم صاحب الوصل وحده.

   فحدث هذا فعلاً: دفعةٌ لـ«عبد الرحمن واثق» ذهب جزء منها إلى
   وصل «عبد الله احمد» لأن ملاحظته كانت تذكر «عبد الرحمن واثق».
   وأخطر منه: البحث باسم مخزن («ابراهيم») كان يلتقط وصولات
   كل من في ذلك المخزن — أي مال الناس جميعاً.

   الحلّ طبقتان لا واحدة:
   ① لا يُدفع إلا ما طابق **اسم صاحب الوصل** نفسه. ما طابق
     بالملاحظة أو اللوحة أو المخزن يُعرض منفصلاً ولا يُدفع.
   ② وإن بقي أكثر من شخص (اسم قصير مثل «عبد» يطابق عدّة
     أسماء)، لا يُنفَّذ الدفع حتى يُختار الشخص صراحةً.
   البحث يبقى واسعاً كما هو — وهذا صحيح. الدفع وحده ضاق.
══════════════════════════════════════════════════════════════ */
let _gPayOwner=null;                    // مفتاح اسم الشخص المختار

/* هل يخصّ هذا السجل الشخصَ المطلوب؟ — بالاسم وحده */
function _ownerMatches(owner,q){
  if(!q)return true;
  if(!owner)return false;
  return smartMatch(String(owner),q);
}

function _globalPayItems(){
  const R=_toolsSearchData();
  const items=[],offName=[];
  R.groups.forEach(g=>{
    const d=g.d, G=_GPAY[d.k];
    if(!G)return;                                   // قسم غير قابل للدفع
    g.hits.forEach(r=>{
      const amt=G.naql?(r.naqlFee||0):G.total(r);
      if(!amt||amt<=0)return;
      const paid=G.naql?(r.naqlPaid||0):G.paid(r);
      const rem=Math.max(0,amt-paid);
      if(rem<=0)return;
      const label=d.rowLabel?d.rowLabel(r)
                 :(d.fields||[]).map(f=>r[f]).filter(Boolean).slice(0,3).join(" · ");
      const owner=(d.who?d.who(r):"")||"";
      const it={k:d.k,icon:d.icon,section:d.label,rec:r,owner,
                ownerKey:nameKey(owner)||"—",
                dk:r.dk||"",amt,paid,rem,label:label||r.id||"—"};
      /* الطبقة ①: ما لم يطابق اسمُ صاحبه لا يدخل الدفع */
      if(_ownerMatches(owner,R.q))items.push(it); else offName.push(it);
    });
  });
  const bySeq=(a,b)=>{
    const A=a.dk||"￿", B=b.dk||"￿";       // بلا تاريخ ← آخر الصف
    if(A!==B)return A.localeCompare(B);
    return (a.rec.seq||0)-(b.rec.seq||0);
  };
  items.sort(bySeq); offName.sort(bySeq);

  /* الطبقة ②: تجميع بالأشخاص */
  const owners=[];
  items.forEach(it=>{
    let o=owners.find(x=>x.key===it.ownerKey);
    if(!o){o={key:it.ownerKey,name:it.owner,n:0,rem:0};owners.push(o);}
    o.n++; o.rem+=it.rem;
  });
  owners.sort((a,b)=>b.rem-a.rem);
  /* شخص واحد ⇒ يُختار تلقائياً. أكثر ⇒ يبقى الاختيار للمستخدم */
  if(owners.length===1)_gPayOwner=owners[0].key;
  else if(_gPayOwner&&!owners.some(o=>o.key===_gPayOwner))_gPayOwner=null;
  const selected=_gPayOwner?items.filter(it=>it.ownerKey===_gPayOwner):[];
  return{items:selected,all:items,owners,offName,q:R.q};
}

/* ══════════════════════════════════════════════════════
   تطبيق دفعة على عنصر واحد — يُرجع المبلغ المدفوع فعلياً
   ──────────────────────────────────────────────────────
   ⚠️ يقرأ السجل من مصدره الحيّ لحظة الدفع، ولا يعتمد على
   النسخة الملتقطة في _globalPayItems.
   السبب: الوصل الواحد قد يظهر مرتين في نفس التوزيع — مرة
   بمبلغه ومرة بأجرة ناقله — وهما يُكتبان في حقلين مختلفين
   من نفس السجل (payments و naqlPayments). لو انطلقنا من
   اللقطة القديمة في المرة الثانية لكتبنا فوق ما سجّلته
   المرة الأولى فتضيع إحدى الدفعتين بلا أثر.
   ونُعيد حساب المتبقي هنا أيضاً للسبب نفسه.
══════════════════════════════════════════════════════ */
function _globalPayApply(item,budget,note,bid){
  const G=_GPAY[item.k]; if(!G)return 0;

  if(G.naql){
    const entry=_naqlEntryFromFee(item.rec);   // يقرأ الحيّ أصلاً
    if(!entry)return 0;
    const isSub=entry.type==="dam-sub";
    const fee=isSub?(entry.rRef.trans||0):(entry.rRef.naqlFee||0);
    const paid=isSub?getDamSubNaqlPaid(entry.rRef):getNaqlPaidTotal(entry.rRef);
    const pay=Math.min(budget,Math.max(0,fee-paid));
    if(pay<=0)return 0;
    _applyBulkNaqlEntryPayment(entry,pay,note,bid);
    return pay;
  }

  const r=(G.get&&G.get(item.rec.id))||item.rec;
  const pay=Math.min(budget,Math.max(0,G.total(r)-G.paid(r)));
  if(pay<=0)return 0;
  const payments=[...(r.payments||[]),
    {amount:pay,at:nowStr(),by:S.cu.name+" (دفع شامل)",note:note||null,forName:item.owner||null,...(bid?{bid}:{})}];
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const fullyPaid=paidTotal>=G.total(r);
  G.save({...r,payments,paidTotal,paid:fullyPaid,
    paidAt:fullyPaid?(r.paidAt||nowStr()):null,
    paidBy:fullyPaid?(r.paidBy||S.cu.name):null});
  return pay;
}

function gPayPickOwner(k){_gPayOwner=k||null;renderGlobalPayPreview();}

function renderGlobalPayPreview(){
  const el=document.getElementById("gPayPreview");
  if(!el)return;
  const {items,all,owners,offName,q}=_globalPayItems();
  if(!q){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:16px;font-size:12px">🔎 ابحث أولاً — ثم يظهر هنا ما يمكن تسديده</div>`;
    return;
  }
  /* المستبعَد: طابق البحث بالملاحظة أو اللوحة أو المخزن لا بالاسم */
  const offBox=offName.length?`
    <div style="background:var(--pending-wash);border:1px solid var(--pending-rule);border-radius:9px;
        padding:8px 10px;margin-bottom:8px;font-size:11px;color:var(--paper-2);line-height:1.7">
      🛡️ <strong style="color:var(--pending)">استُبعد ${AR(offName.length)} سجل من الدفع</strong> —
      ظهرت في البحث لأن الاسم ورد في ملاحظتها أو لوحتها أو مخزنها، لا لأنها تخصّ صاحبها.
      <div style="margin-top:4px;color:var(--paper-3);font-size:10px">
        ${offName.slice(0,4).map(x=>esc((x.owner||"—")+" · "+x.label)).join("<br>")}
        ${offName.length>4?"<br>…و"+AR(offName.length-4)+" غيرها":""}</div>
    </div>`:"";

  if(!all.length){
    el.innerHTML=offBox+`<div style="text-align:center;color:var(--settled);padding:16px;font-size:12px">✅ لا يوجد متبقٍّ باسم صاحب الوصل في هذا البحث</div>`;
    return;
  }
  /* أكثر من شخص ⇒ اختيار صريح قبل أي دفع */
  const ownerBox=owners.length>1?`
    <div style="background:var(--owing-wash);border:1px solid var(--owing);border-radius:10px;
        padding:9px 11px;margin-bottom:9px">
      <div style="font-size:12px;font-weight:700;color:var(--owing);margin-bottom:3px">
        ⚠️ البحث يطابق ${AR(owners.length)} أشخاص — اختر صاحب المال</div>
      <div style="font-size:10px;color:var(--paper-2);line-height:1.6;margin-bottom:7px">
        لن يُنفَّذ الدفع قبل الاختيار، كي لا يذهب مال شخص إلى وصولات غيره.</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${owners.map(o=>`<button onclick="gPayPickOwner('${esc(o.key)}')"
          style="padding:5px 9px;border-radius:8px;cursor:pointer;font-size:11px;
            border:1px solid ${_gPayOwner===o.key?"var(--wheat)":"var(--rule)"};
            background:${_gPayOwner===o.key?"var(--wheat-wash)":"var(--ink-100)"};
            color:${_gPayOwner===o.key?"var(--wheat-hi)":"var(--paper-2)"};font-weight:700">
          ${_gPayOwner===o.key?"✔ ":""}${esc(o.name||"—")}
          <span style="color:var(--paper-3);font-weight:400"> · ${AR(o.n)} · ${fIQD(o.rem)}</span>
        </button>`).join("")}
      </div>
    </div>`:"";

  if(!items.length){
    el.innerHTML=offBox+ownerBox+`<div style="text-align:center;color:var(--paper-4);padding:14px;font-size:12px">👆 اختر الشخص لعرض ما سيُسدَّد له</div>`;
    return;
  }
  const totalRem=items.reduce((s,x)=>s+x.rem,0);
  // تلخيص لكل قسم
  const bySec={};
  items.forEach(x=>{
    bySec[x.k]=bySec[x.k]||{icon:x.icon,section:x.section,n:0,rem:0};
    bySec[x.k].n++; bySec[x.k].rem+=x.rem;
  });
  const secRows=Object.values(bySec).map(s=>
    `<span style="background:var(--ink-100);border:1px solid var(--rule);border-radius:7px;padding:3px 7px;font-size:10px;color:var(--paper-2)">
       ${s.icon} ${esc(s.section)}: <strong style="color:var(--wheat-hi)">${AR(s.n)}</strong> · ${fIQD(s.rem)}</span>`).join("");
  const rows=items.slice(0,40).map((x,i)=>
    `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 9px;border-bottom:1px solid var(--rule);font-size:11px">
      <span style="color:var(--paper-2);flex:1;min-width:0">${AR(i+1)}. ${x.icon} 📅 ${tAr(x.dk||"—")} — ${esc(x.label)}${x.paid>0?' <span style="color:var(--wheat)">| جزئي</span>':''}</span>
      <span style="color:var(--wheat-hi);font-weight:700;white-space:nowrap">${fIQD(x.rem)}</span>
    </div>`).join("");
  const who=(items[0]&&items[0].owner)||"";
  el.innerHTML=offBox+ownerBox+`
    <div style="background:var(--ink-200);border-radius:9px;padding:9px 11px;margin-bottom:8px">
      <div style="font-size:12px;color:var(--paper-2);margin-bottom:5px">
        💳 التسديد باسم: <strong style="color:var(--wheat-hi)">${esc(who||"—")}</strong></div>
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:12px;margin-bottom:6px">
        <span style="color:var(--paper-2)">سجلات قابلة للتسديد: <strong style="color:var(--wheat-hi)">${AR(items.length)}</strong></span>
        <span style="color:var(--paper-2)">إجمالي المتبقي: <strong style="color:var(--owing)">${fIQD(totalRem)}</strong></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${secRows}</div>
    </div>
    <div style="max-height:240px;overflow-y:auto;background:var(--ink-100);border-radius:9px;border:1px solid var(--rule)">${rows}
      ${items.length>40?`<div style="padding:6px 9px;font-size:10px;color:var(--paper-3)">…و ${AR(items.length-40)} سجل آخر ضمن التوزيع</div>`:""}
    </div>`;
}

/* يملأ الحقل بكامل المتبقي — الحالة الأكثر استعمالاً */
function gPayFillAll(){
  const {items,owners}=_globalPayItems();
  if(owners.length>1&&!_gPayOwner){showToast("⚠ اختر صاحب المال أولاً");return;}
  const totalRem=items.reduce((s,x)=>s+x.rem,0);
  if(totalRem<=0){showToast("✅ لا يوجد متبقٍّ لتسديده");return;}
  setPayAmt("gPayAmount",totalRem);
  showToast("💰 المبلغ = كامل المتبقي "+fIQD(totalRem));
}

function execGlobalPay(){
  const amount=payAmt("gPayAmount");
  const note=(document.getElementById("gPayNote")?.value||"").trim();
  const {items,owners,offName,q}=_globalPayItems();
  if(!q){showToast("⚠ ابحث أولاً");return;}
  if(!amount||amount<=0){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  /* v17.55 — لا دفع قبل تحديد الشخص حين يطابق البحث أكثر من واحد */
  if(owners.length>1&&!_gPayOwner){
    showToast("⚠ البحث يطابق أكثر من شخص — اختر صاحب المال أولاً",3600);return;}
  if(!items.length){showToast("⚠ لا يوجد متبقٍّ باسم هذا الشخص");return;}
  const who=(items[0]&&items[0].owner)||"";
  const totalRem=items.reduce((s,x)=>s+x.rem,0);
  /* التأكيد يذكر الاسم صراحةً — فمن يقرأه يكتشف الخطأ قبل وقوعه */
  if(!confirm(
`التسديد باسم: ${who||"—"}

سيوزَّع ${Math.round(amount).toLocaleString("en")} د.ع على ${items.length} سجلاً من الأقدم إلى الأحدث.
إجمالي المتبقي لهذا الشخص: ${Math.round(totalRem).toLocaleString("en")} د.ع.${
offName.length?`\n\n🛡️ استُبعد ${offName.length} سجل ظهر في البحث لكنه يخصّ غيره.`:""}

هل تريد المتابعة؟`))return;

  let pool=amount;
  const results=[],touched=new Set();
  const bid=genId();                    // v17.63 — عملية واحدة، سطر واحد في سجل الدفعات
  for(const it of items){
    if(pool<=0)break;
    const paid=_globalPayApply(it,pool,note,bid);
    if(paid<=0)continue;
    results.push({...it,paidNow:paid,fullyPaid:paid>=it.rem});   // rem محسوب قبل التوزيع
    touched.add(it.k);
    pool-=paid;
  }
  const totalPaid=amount-pool;
  if(!results.length){showToast("⚠ لم يتم تسجيل أي دفعة");return;}

  document.getElementById("gPayResult").innerHTML=`
    <div style="background:var(--settled-wash);border:1px solid var(--settled);border-radius:10px;padding:11px;margin-top:8px">
      <div style="font-size:12px;color:var(--settled);font-weight:700;margin-bottom:7px">✅ تم التسديد باسم ${esc(who||"—")} — ${AR(results.length)} سجل في ${AR(touched.size)} قسم</div>
      <div style="max-height:220px;overflow-y:auto">
      ${results.map(r=>`<div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;padding:3px 0;border-bottom:1px dashed var(--settled-rule)">
        <span style="color:var(--paper-2);flex:1;min-width:0">${r.icon} 📅 ${tAr(r.dk||"—")} — ${esc(r.label)}</span>
        <span style="color:var(--settled);font-weight:700;white-space:nowrap">${fIQD(r.paidNow)}${r.fullyPaid?' ✅':' 💰'}</span>
      </div>`).join("")}
      </div>
      <div style="margin-top:7px;font-size:13px;color:var(--wheat-hi);font-weight:700">إجمالي المدفوع: ${fIQD(totalPaid)}</div>
      ${pool>0?`<div style="margin-top:4px;font-size:11px;color:var(--owing)">⚠ متبقٍّ من المبلغ المُدخل لم يُستعمل (سُدِّد كل ما ظهر في البحث): ${fIQD(pool)}</div>`:""}
    </div>`;
  const a=document.getElementById("gPayAmount");if(a)a.value="";
  const n=document.getElementById("gPayNote");if(n)n.value="";
  // حدّث الأقسام المتأثّرة ثم أعِد البحث فيظهر المتبقي الجديد
  touched.forEach(k=>{try{_GPAY[k].after&&_GPAY[k].after();}catch(e){}});
  toolsGlobalSearch();
  renderGlobalPayPreview();
  showToast("✅ تم الدفع الشامل — "+fIQD(totalPaid));
}

function clrGlobalPay(){
  _gPayOwner=null;
  ["gPayAmount","gPayNote"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});
  const r=document.getElementById("gPayResult");if(r)r.innerHTML="";
  renderGlobalPayPreview();
}

/* v17.37 — ينتقل إلى تبويب «حساب النقال» ويملأ بحثه بنفس الاسم،
   فيرى كشفه الكامل مع أزرار الدفع بدل تجميع الأرقام يدوياً. */
function openNaqlAcctFrom(q){
  const btn=[...document.querySelectorAll(".tbb")].find(b=>
    (b.getAttribute("onclick")||"").includes("'naql-coll'"));
  if(btn)btn.click(); else sT("naql-coll",null);
  setTimeout(()=>{
    const i=document.getElementById("naqlSrch");
    if(!i)return;
    i.value=q;
    try{doNaqlSearch();}catch(e){}
    i.scrollIntoView({block:"center",behavior:"smooth"});
  },260);
}
function toolsClearSearch(){
  const i=document.getElementById("toolsSearchInp");if(i)i.value="";
  const f=document.getElementById("toolsSrchFrom");if(f)f.value="";
  const t=document.getElementById("toolsSrchTo");if(t)t.value="";
  toolsGlobalSearch();
}



/* ══════════════════════════════════════════════════════
   سجل الدفعات الموحّد — v17.30
   ──────────────────────────────────────────────────────
   يجمع كل عملية دفع تمّت في التطبيق من كل الأقسام في
   قائمة واحدة: من دفع · لمن · كم · متى · في أي قسم.
   المصادر: الشراء · البيع · الضمانات ووصولاتها الفرعية ·
   الصرفيات · أجور الأعمال · الرواتب · السلف · حركات
   العمال · وأجور النقل بمصادرها الأربعة.
══════════════════════════════════════════════════════ */
let _payLogRange="month";   // week | month | 30 | all | custom
let _payLogSrc="all";       // all | buy | sell | dam | srf | wrk | naql | sal

const _PAYSRC={
  buy :{label:"شراء",     icon:"🛒", color:"var(--wheat)"},
  sell:{label:"بيع",      icon:"💰", color:"var(--settled)"},
  dam :{label:"ضمانات",   icon:"🤝", color:"var(--steel)"},
  srf :{label:"صرفيات",   icon:"🧾", color:"var(--pending)"},
  wrk :{label:"أجور عمل", icon:"🔧", color:"var(--steel)"},
  naql:{label:"نقل",      icon:"🚚", color:"var(--pending)"},
  sal :{label:"رواتب",    icon:"📋", color:"var(--settled)"},
};

/* يجمع كل الدفعات من كل مكان في التطبيق */
function collectAllPayments(){
  const out=[];
  const push=(src,who,ref,p,extra)=>{
    if(!p||!(p.amount>0))return;
    out.push({
      src, who:who||"—", ref:ref||"",
      amount:p.amount, at:p.at||"", by:p.by||"—", note:p.note||"",
      bid:p.bid||"",                       // معرّف العملية الجامعة — v17.63
      dk:(p.at||"").slice(0,10),
      ...(extra||{})
    });
  };

  /* v17.63 — `rdk` تاريخ الوصل نفسه (لا تاريخ الدفعة)، واللوحة في بيان النقل:
     بهما يميّز المرء وصولات العملية الجامعة الواحدة بعضها عن بعض. */
  const _pl=r=>r&&r.plate?" | "+r.plate:"";

  // ── الشراء ──
  (S.recs||[]).forEach(r=>{
    (r.payments||[]).forEach(p=>push("buy",r.driver,r.plate,p,{recId:r.id,kind:"buy",rdk:r.dk||""}));
  });
  // ── البيع ──
  (SELL_RECS||[]).forEach(r=>{
    (r.payments||[]).forEach(p=>push("sell",r.driver||r.receiver,r.plate,p,{recId:r.id,kind:"sell",rdk:r.dk||""}));
  });
  // ── الضمانات: الأصلية والفرعية ──
  (DAM_RECS||[]).forEach(d=>{
    (d.payments||[]).forEach(p=>push("dam",d.madmun,"ضامن: "+(d.damin||"—"),p,{recId:d.id,kind:"dam",rdk:d.dk||""}));
    const subs=d.subRecs?Object.values(d.subRecs):[];
    subs.forEach(sub=>{
      (sub.payments||[]).forEach(p=>push("dam",d.madmun,sub.desc||"وصل فرعي",p,{recId:d.id,kind:"dam",rdk:sub.dk||d.dk||""}));
      (sub.naqlPayments||[]).forEach(p=>push("naql",sub.transporter,"ضمانة: "+(sub.desc||"—"),p,{recId:d.id,kind:"dam",rdk:sub.dk||d.dk||""}));
    });
  });
  // ── الصرفيات ──
  (SRF_RECS||[]).forEach(r=>{
    (r.payments||[]).forEach(p=>push("srf",r.recv,r.purp,p,{recId:r.id,kind:"srf",rdk:r.dk||""}));
  });
  // ── أجور الأعمال ──
  (WRK_RECS||[]).forEach(r=>{
    (r.payments||[]).forEach(p=>push("wrk",r.provider,r.service,p,{recId:r.id,kind:"wrk",rdk:r.dk||""}));
  });
  // ── الرواتب والسلف وحركات العمال ──
  (SAL_RECS||[]).forEach(r=>{
    (r.payments||[]).forEach(p=>push("sal",r.empName,"راتب "+(r.month||""),p,{recId:r.id,kind:"sal",rdk:r.dk||""}));
  });
  (ADV_RECS||[]).forEach(r=>{
    (r.payments||[]).forEach(p=>push("sal",r.empName,"سلفة",p,{recId:r.id,kind:"adv",rdk:r.dk||""}));
  });
  (EMP_TXNS||[]).forEach(r=>{
    (r.payments||[]).forEach(p=>push("sal",r.empName,r.note||"حركة",p,{recId:r.id,kind:"etx",rdk:r.dk||""}));
  });
  // ── أجور النقل: شراء (متعدد الناقلين) · بيع · يدوي ──
  (S.recs||[]).forEach(r=>{
    getNaqlEntries(r).forEach(en=>{
      (en.naqlPayments||[]).forEach(p=>
        push("naql",en.transporter,"شراء: "+(r.driver||"—")+_pl(r),p,{recId:r.id,kind:"buy",rdk:r.dk||""}));
    });
  });
  (SELL_RECS||[]).forEach(r=>{
    (r.naqlPayments||[]).forEach(p=>
      push("naql",r.transporter,"بيع: "+(r.driver||"—")+_pl(r),p,{recId:r.id,kind:"sell",rdk:r.dk||""}));
  });
  (MNL_RECS||[]).forEach(r=>{
    (r.naqlPayments||[]).forEach(p=>
      push("naql",r.transporter,"نقل: "+(r.farmer||"—")+_pl(r),p,{recId:r.id,kind:"mnl",rdk:r.dk||""}));
  });

  out.sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
  return out;
}

/* الترشيح حسب المدة والقسم والبحث */
function _payLogFiltered(){
  let list=collectAllPayments();
  const from=(document.getElementById("payLogFrom")?.value||"").trim();
  const to=(document.getElementById("payLogTo")?.value||"").trim();
  if(from)list=list.filter(x=>x.dk&&x.dk>=from);
  if(to)  list=list.filter(x=>x.dk&&x.dk<=to);
  if(_payLogSrc!=="all")list=list.filter(x=>x.src===_payLogSrc);
  const q=(document.getElementById("payLogSrch")?.value||"").trim();
  if(q){
    list=list.filter(x=>
      smartMatch(String(x.who||""),q)||smartMatch(String(x.ref||""),q)||
      smartMatch(String(x.by||""),q)||smartMatch(String(x.note||""),q)||
      String(x.at||"").includes(q)||tAr(String(x.at||"")).includes(tAr(q))||
      smartMatch(_PAYSRC[x.src]?.label||"",q));
  }
  return {list,from,to,q};
}

/* ══════════════════════════════════════════════════════
   تجميع العملية الجامعة في سطر واحد — v17.63
   ──────────────────────────────────────────────────────
   الدفعة الواحدة التي وُزّعت على عشرة وصولات كانت تظهر
   عشرة أسطر متطابقة، فيضيع السؤال الأول: «كم دفعتُ له؟»
   بين تفاصيل «على ماذا وُزّع؟». صارت سطراً واحداً بالمجموع،
   يُفتح بالنقر على الوصولات التي تحته.

   المفتاح `bid` يُكتب مع كل جزء من العملية منذ v17.63.
   وللدفعات الأقدم — ومنها كل ما في قاعدة البيانات اليوم —
   نستنتج المجموعة من (القسم · الوقت · المنفِّذ · الملاحظة):
   ‏`nowStr()` بدقّة الدقيقة وحلقة التوزيع متزامنة، فكل أجزاء
   العملية الواحدة تحمل الوقت نفسه حرفياً.

   ⚠️ الدفعة المفردة لا تُجمَع أبداً — مفتاحها فريد بالفهرس.
   جمع دفعتين منفصلتين في سطر واحد يُخفي عملية، وهذا أسوأ
   من تكرار سطر.
══════════════════════════════════════════════════════ */
const _isBulkPay=by=>/\(دفع\s*(جامع|شامل)/.test(String(by||""));

/* عدّ الوصولات بعربية سليمة — "٣ وصولات" لا "٣ وصلاً" */
const _nRec=n=>n===1?"وصل واحد":n===2?"وصلين":(n>=3&&n<=10)?AR(n)+" وصولات":AR(n)+" وصلاً";

function _payGroupKey(x,i){
  if(x.bid)return "b:"+x.bid;                                  // العمليات الجديدة — دقيق
  if(_isBulkPay(x.by))                                          // الأقدم — استنتاج
    return "h:"+x.src+"|"+(x.at||"")+"|"+(x.by||"")+"|"+(x.note||"");
  return "s:"+i;                                                // مفردة — لا تُجمَع
}

/* يحوّل قائمة الدفعات إلى عمليات. كل عملية تحتفظ بأجزائها. */
function _payGroups(list){
  const map=new Map();
  list.forEach((x,i)=>{
    const k=_payGroupKey(x,i);
    let g=map.get(k);
    if(!g){
      g={key:k,items:[],amount:0,at:x.at,by:x.by,note:x.note,src:x.src,who:x.who,
         bulk:!!(x.bid||_isBulkPay(x.by)),names:new Set()};
      map.set(k,g);
    }
    g.items.push(x);
    g.amount+=x.amount;
    g.names.add(nameKey(x.who)||x.who||"—");
    if(String(x.at||"")>String(g.at||""))g.at=x.at;
  });
  return [...map.values()].sort((a,b)=>String(b.at||"").localeCompare(String(a.at||"")));
}

/* فتح/طيّ تفاصيل العملية */
function payLogToggle(id){
  const el=document.getElementById(id), c=document.getElementById(id+"c");
  if(!el)return;
  const open=el.style.display!=="none";
  el.style.display=open?"none":"block";
  if(c)c.textContent=open?"▾":"▴";
}

function payLogSetRange(kind){
  const f=document.getElementById("payLogFrom"), t=document.getElementById("payLogTo");
  if(!f||!t)return;
  _payLogRange=kind;
  const today=_D(toDay());
  if(kind==="all"){f.value="";t.value="";}
  else if(kind==="week"){f.value=_ds(_weekStart(today));t.value=toDay();}
  else if(kind==="month"){f.value=_ds(new Date(today.getFullYear(),today.getMonth(),1));t.value=toDay();}
  else if(kind==="30"){f.value=_ds(_addDays(today,-29));t.value=toDay();}
  renderPayLog();
}
function payLogSetSrc(src,btn){
  _payLogSrc=src;
  document.querySelectorAll("#tc-paylog .plsrc").forEach(b=>{
    b.style.background="transparent";b.style.color="var(--paper-3)";b.style.borderColor="var(--rule)";
  });
  if(btn){btn.style.background="var(--wheat)";btn.style.color="var(--on-accent)";btn.style.borderColor="var(--wheat)";}
  renderPayLog();
}
function payLogClearSrch(){
  const i=document.getElementById("payLogSrch");
  if(i)i.value="";
  renderPayLog();
}

function renderPayLog(){
  const el=document.getElementById("payLogResult");
  if(!el||!S.cu)return;
  const {list}=_payLogFiltered();
  const total=list.reduce((a,x)=>a+x.amount,0);

  // ملخّص حسب القسم
  const bySrc={};
  list.forEach(x=>{bySrc[x.src]=(bySrc[x.src]||0)+x.amount;});
  const chips=Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
    const m=_PAYSRC[k]||{label:k,icon:"•",color:"var(--paper-2)"};
    return`<span style="background:var(--ink-200);border:1px solid var(--rule);border-radius:999px;
      padding:4px 10px;font-size:11px;color:${m.color};font-weight:700">${m.icon} ${m.label}: ${fIQD(v)}</span>`;
  }).join("");

  // ملخّص حسب المستلم — الأهم للمحاسبة
  const groups=_payGroups(list);
  const byWho={};
  groups.forEach(g=>{
    const k=nameKey(g.who)||g.who;
    (byWho[k]=byWho[k]||{name:g.who,amt:0,n:0});
    byWho[k].amt+=g.amount;byWho[k].n++;       // n = عدد العمليات لا عدد الأجزاء
  });
  const topWho=Object.values(byWho).sort((a,b)=>b.amt-a.amt).slice(0,8);

  const _goto=x=>x.recId?`gotoRecord('${x.kind}','${String(x.recId).replace(/'/g,"\\'")}')`:"";

  const rows=groups.slice(0,400).map((g,gi)=>{
    const m=_PAYSRC[g.src]||{label:g.src,icon:"•",color:"var(--paper-2)"};
    const n=g.items.length;
    const one=g.items[0];

    /* عملية من جزء واحد — كما كانت تماماً: نقرة واحدة تفتح الوصل */
    if(n===1){
      return`<div onclick="${_goto(one)}"
        style="display:flex;justify-content:space-between;gap:8px;padding:9px 10px;
               border-bottom:1px solid var(--rule);${one.recId?'cursor:pointer':''}">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--paper);font-weight:700">
            <span style="color:${m.color}">${m.icon}</span> ${esc(one.who)}
          </div>
          <div style="font-size:10px;color:var(--paper-3);margin-top:2px">
            ${m.label}${one.ref?" · "+esc(one.ref):""}
          </div>
          <div style="font-size:10px;color:var(--paper-4);margin-top:2px">
            🕐 ${tAr(one.at||"—")} · ${esc(one.by)}${one.note?" · 📝 "+esc(one.note):""}
          </div>
        </div>
        <div style="text-align:left;white-space:nowrap">
          <div style="font-size:14px;font-weight:800;color:var(--settled)">${fIQD(one.amount)}</div>
        </div>
      </div>`;
    }

    /* عملية جامعة — سطر واحد بالمجموع، يُفتح على أجزائه */
    const id="pgr"+gi;
    /* أكثر من اسم في عملية واحدة: تحذير صريح — هذا بالضبط ما كلّف مالاً من قبل */
    const multiName=g.names.size>1;
    const kids=g.items.map(x=>`
      <div onclick="event.stopPropagation();${_goto(x)}"
        style="display:flex;justify-content:space-between;gap:8px;padding:7px 10px 7px 22px;
               border-bottom:1px solid var(--rule);${x.recId?'cursor:pointer':''}">
        <div style="flex:1;min-width:0">
          <div style="font-size:11px;color:var(--paper-2)">
            ↳ ${x.rdk?`📅 ${tAr(x.rdk)} — `:""}${esc(x.ref||"—")}${multiName?` · <span style="color:var(--owing)">${esc(x.who)}</span>`:""}
          </div>
          ${x.note?`<div style="font-size:10px;color:var(--paper-4);margin-top:1px">📝 ${esc(x.note)}</div>`:""}
        </div>
        <div style="font-size:12px;font-weight:700;color:var(--settled);white-space:nowrap">${fIQD(x.amount)}</div>
      </div>`).join("");

    return`<div>
      <div onclick="payLogToggle('${id}')"
        style="display:flex;justify-content:space-between;gap:8px;padding:9px 10px;
               border-bottom:1px solid var(--rule);cursor:pointer">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--paper);font-weight:700">
            <span style="color:${m.color}">${m.icon}</span> ${esc(multiName?AR(g.names.size)+" أشخاص":g.who)}
          </div>
          <div style="font-size:10px;color:var(--paper-3);margin-top:2px">
            ${m.label} · <span style="color:var(--wheat-hi);font-weight:700">دفعة واحدة على ${_nRec(n)}</span>
            ${multiName?` · <span style="color:var(--owing);font-weight:700">⚠ عدّة أسماء</span>`:""}
          </div>
          <div style="font-size:10px;color:var(--paper-4);margin-top:2px">
            🕐 ${tAr(g.at||"—")} · ${esc(g.by)}${g.note?" · 📝 "+esc(g.note):""}
          </div>
        </div>
        <div style="text-align:left;white-space:nowrap">
          <div style="font-size:14px;font-weight:800;color:var(--settled)">${fIQD(g.amount)}</div>
          <div style="font-size:10px;color:var(--paper-3);margin-top:2px">
            <span id="${id}c">▾</span> التفاصيل
          </div>
        </div>
      </div>
      <div id="${id}" style="display:none;background:var(--ink-200)">${kids}</div>
    </div>`;
  }).join("");

  el.innerHTML=`
    <div style="background:var(--ink-100);border:1px solid var(--rule);border-radius:var(--r-lg);
         padding:12px 14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--paper-3)">عدد الدفعات: <strong style="color:var(--paper)">${AR(groups.length)}</strong>${
          groups.length!==list.length?` <span style="color:var(--paper-4)">(${_nRec(list.length)})</span>`:""}</span>
        <span style="font-size:19px;font-weight:800;color:var(--settled)">${fIQD(total)}</span>
      </div>
      ${chips?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">${chips}</div>`:""}
    </div>
    ${topWho.length?`<div style="background:var(--ink-100);border:1px solid var(--rule);border-radius:var(--r-lg);
      padding:10px 12px;margin-bottom:10px">
      <div style="font-size:11px;color:var(--paper-3);font-weight:700;margin-bottom:7px">👥 حسب المستلم</div>
      ${topWho.map(w=>`<div style="display:flex;justify-content:space-between;padding:4px 0;
        border-bottom:1px solid var(--rule);font-size:11px">
        <span style="color:var(--paper-2)">${esc(w.name)} <span style="color:var(--paper-4)">(${AR(w.n)})</span></span>
        <strong style="color:var(--paper)">${fIQD(w.amt)}</strong></div>`).join("")}
    </div>`:""}
    ${groups.length?`<div style="background:var(--ink-100);border:1px solid var(--rule);
      border-radius:var(--r-lg);overflow:hidden">${rows}
      ${groups.length>400?`<div style="padding:8px;text-align:center;font-size:10px;color:var(--paper-3)">…و ${AR(groups.length-400)} دفعة أخرى</div>`:""}
      </div>`
     :`<div class="empty-state"><b>لا توجد دفعات</b>غيّر المدة أو القسم أو امسح البحث.</div>`}`;
}

/* ── طباعة سجل الدفعات ── */
function buildPayLogHTML(){
  const {list,from,to,q}=_payLogFiltered();
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  const total=list.reduce((a,x)=>a+x.amount,0);
  const range=(from||to)?`${tAr(from||"البداية")} ← ${tAr(to||"اليوم")}`:"كل الفترات";
  const bySrc={};
  list.forEach(x=>{bySrc[x.src]=(bySrc[x.src]||0)+x.amount;});
  const srcRows=Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>
    `<tr><td>${(_PAYSRC[k]||{label:k}).label}</td><td>${fIQD(v)}</td></tr>`).join("");
  const groups=_payGroups(list);
  const byWho={};
  groups.forEach(g=>{const k=nameKey(g.who)||g.who;(byWho[k]=byWho[k]||{name:g.who,amt:0,n:0});byWho[k].amt+=g.amount;byWho[k].n++;});
  const whoRows=Object.values(byWho).sort((a,b)=>b.amt-a.amt).map(w=>
    `<tr><td>${esc(w.name)}</td><td>${AR(w.n)}</td><td>${fIQD(w.amt)}</td></tr>`).join("");
  /* الدفعات الجامعة: المبلغ الواحد وما وُزّع عليه — v17.63 */
  const bulk=groups.filter(g=>g.items.length>1);
  const bulkRows=bulk.map((g,i)=>`<tr>
    <td>${AR(i+1)}</td><td>${tAr(g.at||"—")}</td>
    <td>${esc(g.names.size>1?AR(g.names.size)+" أشخاص":g.who)}</td>
    <td>${(_PAYSRC[g.src]||{label:g.src}).label}</td>
    <td>${AR(g.items.length)}</td><td>${fIQD(g.amount)}</td></tr>
    ${g.items.map(x=>`<tr><td></td><td colspan="2" style="padding-right:14px">↳ ${x.rdk?tAr(x.rdk)+" — ":""}${esc(x.ref||"—")}${
      g.names.size>1?" — "+esc(x.who):""}</td><td colspan="2"></td><td>${fIQD(x.amount)}</td></tr>`).join("")}`).join("");
  const rows=list.map((x,i)=>`<tr>
    <td>${AR(i+1)}</td><td>${tAr(x.at||"—")}</td>
    <td>${(_PAYSRC[x.src]||{label:x.src}).label}</td>
    <td>${esc(x.who)}</td><td>${esc(x.ref||"—")}</td>
    <td>${fIQD(x.amount)}</td><td>${esc(x.by)}</td></tr>`).join("");
  return`${COHEAD}
  <div class="prh" style="background:#2B5334">
    <div class="prhtl">سجل الدفعات</div>
    <div class="prhmt">${range}<br/>${tAr(toDay())} — ${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
  </div>
  <div class="psec">ملخص${_payLogSrc!=="all"?` — ${(_PAYSRC[_payLogSrc]||{}).label}`:""}${q?` · بحث: ${esc(q)}`:""}</div>
  <div class="prr"><span class="prk">عدد الدفعات</span><span class="prv">${AR(groups.length)}</span></div>
  ${groups.length!==list.length?`<div class="prr"><span class="prk">عدد الوصولات المسدَّدة</span><span class="prv">${AR(list.length)}</span></div>`:""}
  <div class="prtot" style="background:#2B5334"><span class="pk">إجمالي المدفوع</span><span class="pv">${fIQD(total)}</span></div>
  ${srcRows?`<div class="col-wh-title">حسب القسم</div>
    <table class="coltbl"><thead><tr><th>القسم</th><th>المبلغ</th></tr></thead><tbody>${srcRows}</tbody></table>`:""}
  ${whoRows?`<div class="col-wh-title">حسب المستلم</div>
    <table class="coltbl"><thead><tr><th>المستلم</th><th>دفعات</th><th>المبلغ</th></tr></thead><tbody>${whoRows}</tbody></table>`:""}
  ${bulkRows?`<div class="col-wh-title">الدفعات الجامعة — المبلغ الواحد وما وُزّع عليه</div>
    <table class="coltbl"><thead><tr>
      <th>#</th><th>التاريخ والوقت</th><th>المستلم</th><th>القسم</th><th>وصولات</th><th>المبلغ</th>
    </tr></thead><tbody>${bulkRows}</tbody></table>`:""}
  ${rows?`<div class="col-wh-title">تفاصيل الدفعات</div>
    <table class="coltbl"><thead><tr>
      <th>#</th><th>التاريخ والوقت</th><th>القسم</th><th>المستلم</th><th>البيان</th><th>المبلغ</th><th>بواسطة</th>
    </tr></thead><tbody>${rows}
    <tr class="ctot"><td colspan="5">الإجمالي</td><td>${fIQD(total)}</td><td>—</td></tr>
    </tbody></table>`:`<div style="padding:14px;text-align:center;font-size:11px">لا توجد دفعات</div>`}
  ${COFTR}`;
}
function openPayLogPrint(){
  const {list}=_payLogFiltered();
  const nOps=_payGroups(list).length;
  if(!list.length){showToast("⚠ لا توجد دفعات لطباعتها");return;}
  _printHTML=buildPayLogHTML();_isCollScreen=true;
  document.getElementById("pactTitle").textContent="💵 سجل الدفعات";
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🖨️ "+AR(nOps)+" دفعة"+(nOps!==list.length?" · "+_nRec(list.length):""));
}

