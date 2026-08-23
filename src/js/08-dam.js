/* ══════════════════════════════════════════════════════
   قسم الضمانات
══════════════════════════════════════════════════════ */
let DAM_RECS=[];
let dbRefDam=null;

function loadDamCache(){
  try{const c=localStorage.getItem("wShamsDamCache");if(c)DAM_RECS=JSON.parse(c).sort(_byDkDesc);}catch(e){}
}
function saveDamRec(r){
  _fbWrite("dam_records",r.id,r,safe=>{
    const idx=DAM_RECS.findIndex(x=>x.id===r.id);
    if(idx>=0)DAM_RECS[idx]=safe; else DAM_RECS.unshift(safe);
    DAM_RECS.sort(_byDkDesc);   // v17.39 — تعديل التاريخ ينقل الوصل ليومه فوراً
    try{localStorage.setItem("wShamsDamCache",JSON.stringify(DAM_RECS));}catch(e){}
  });
  if(_tabActive("dam-recs"))_scheduleRender(renderDamRecs);
}
function delDamRec(id){
  _toTrash("dam",DAM_RECS.find(r=>r.id===id));
  _fbWrite("dam_records",id,null,()=>{
    DAM_RECS=DAM_RECS.filter(r=>r.id!==id);
    try{localStorage.setItem("wShamsDamCache",JSON.stringify(DAM_RECS));}catch(e){}
  });
}

function submitDamRec(){
  const damin=(document.getElementById("daDamin")?.value||"").trim();
  const madmun=(document.getElementById("daMadmun")?.value||"").trim();
  const price=numIn("daPrice")||0;
  const note=(document.getElementById("daNote")?.value||"").trim();
  if(!damin){showToast("⚠ أدخل اسم الضامن");return;}
  if(!madmun){showToast("⚠ أدخل اسم المضمون");return;}
  if(!price||price<=0){showToast("⚠ أدخل المبلغ");return;}
  const r={id:genId(),seq:Date.now(),damin,madmun,price,note,
    paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:S.cu.name,dk:toDay()};
  saveDamRec(r);
  clrDamForm();
  document.querySelectorAll(".tbb").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tc").forEach(c=>c.classList.remove("active"));
  const btn=document.getElementById("damRecsTabBtn");
  if(btn)btn.classList.add("active");
  document.getElementById("tc-dam-recs")?.classList.add("active");
  renderDamRecs();
  showToast("✅ تم حفظ الضمانة — "+damin+" ← "+madmun);
}
function clrDamForm(){
  ["daDamin","daMadmun","daPrice","daNote"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
}

function renderDamRecs(){
  if(!S.cu)return;
  const srch=(document.getElementById("dfSearch")?.value||"").toLowerCase();
  const pf=document.getElementById("dfPaid")?.value||"all";
  const df=document.getElementById("dfDt")?.value||"";
  let f=DAM_RECS.filter(r=>{
    if(pf==="paid"&&!r.paid)return false;
    if(pf==="unpaid"&&r.paid)return false;
    if(df&&r.dk!==df)return false;
    if(srch&&!smartMatch(r.damin,srch)&&!smartMatch(r.madmun,srch))return false;
    return true;
  });
  const tF=f.reduce((s,r)=>s+(r.price||0),0);
  const tSubs=f.reduce((s,r)=>{const sb=r.subRecs?Object.values(r.subRecs):[];return s+sb.reduce((ss,x)=>ss+(x.amount||0),0);},0);
  const paidAmt=f.reduce((s,r)=>s+getPaidTotal(r),0);
  document.getElementById("damFSm").innerHTML=
    `<span>الضمانات: <strong>${AR(f.length)}</strong></span>
     <span>مجموع الضمانات: <strong>${fIQD(tF)}</strong></span>
     ${tSubs>0?`<span>مجموع الوصولات: <strong style="color:var(--wheat-hi)">${fIQD(tSubs)}</strong></span>`:""}
     <span>مدفوع: <strong style="color:var(--settled)">${fIQD(paidAmt)}</strong></span>
     <span>الباقي: <strong style="color:var(--owing)">${fIQD(tF-paidAmt)}</strong></span>`;
  const list=document.getElementById("damRL");
  if(!f.length){list.innerHTML=`<div style="text-align:center;color:var(--ink-300);padding:35px;font-size:14px">📭 لا توجد ضمانات</div>`;return;}
  list.innerHTML=f.map(r=>{
    const subs=r.subRecs?Object.values(r.subRecs):[];
    const hasSubs=subs.length>0;
    const subTotal=hasSubs?subs.reduce((s,x)=>s+(x.amount||0),0):0;
    const _damNet=subTotal-(r.price||0);
    const parentPrice=r.price||0;
    // الضمانة الأصلية تُدفع منفصلة — دفعاتها في r.payments
    const parentPaid=getPaidTotal(r);
    const parentRem=Math.max(0,parentPrice-parentPaid);
    const parentFullyPaid=parentPaid>=parentPrice;
    // badge الحالة — إذا لا توجد وصولات فرعية: حسب الضمانة فقط
    // إذا توجد وصولات: حسب الضمانة الأصلية
    const allPaid=parentFullyPaid;
    const totalPaid=parentPaid; // للـ badge

    const subCards=hasSubs?subs.map(sub=>{
      const hasWeigh=sub.gross!=null&&sub.gross>0;
      return`<div class="dam-sub-card" data-rid="${sub.id}">
        <div class="dam-sub-hd">
          <span class="dam-sub-desc">🚛 ${esc(sub.driver||sub.desc)}</span>
          <span class="dam-sub-amt" style="color:var(--wheat-hi);font-size:15px;font-weight:800">${fIQD(sub.amount)}</span>
        </div>
        <div style="font-size:10px;color:var(--paper-2);margin-bottom:4px">📅 ${tAr(sub.dk)}</div>
        ${hasWeigh?`<div class="rw" style="margin:5px 0">
          <div class="rwi"><span class="rwk">الكلي</span><span class="rwv">${fKG(sub.gross)}</span></div>
          <span class="rws">−</span>
          <div class="rwi"><span class="rwk">الفارغ</span><span class="rwv">${fKG(sub.empty||0)}</span></div>
          <span class="rws">=</span>
          <div class="rwi"><span class="rwk">الصافي</span><span class="rwv" style="color:var(--wheat)">${fKG(sub.net||0)}</span></div>
          <span class="rws">×</span>
          <div class="rwi"><span class="rwk">كغم</span><span class="rwv">${fIQD(sub.ppkg||0)}</span></div>
        </div>
        ${(sub.wasl||0)>0||(sub.press||0)>0||(sub.trans||0)>0?`<div style="display:flex;gap:8px;font-size:10px;color:var(--paper-3);margin-bottom:4px;flex-wrap:wrap">
          ${(sub.wasl||0)>0?`<span>📄 وصل: <strong style="color:var(--steel)">${fIQD(sub.wasl)}</strong></span>`:""}
          ${(sub.press||0)>0?`<span>✂️ كبس: <strong style="color:var(--owing)">${AR(sub.pressCount||0)} × ${fIQD(sub.pressPpcs||0)} = ${fIQD(sub.press)}</strong></span>`:""}
          ${(sub.trans||0)>0?`<span>🚚 نقل: <strong style="color:var(--owing)">${AR(sub.transCount||0)} × ${fIQD(sub.transPpcs||0)} = ${fIQD(sub.trans)}</strong>${sub.transporter?` <span style="color:var(--wheat)">(${esc(sub.transporter)})</span>`:""}</span>`:""}
        </div>`:""}
        <div style="font-size:12px;color:var(--steel);font-weight:700;margin-bottom:4px">💰 النهائي: ${fIQD(sub.amount)}</div>`:""}
        ${sub.note?`<div class="dam-sub-meta">📝 ${esc(sub.note)}</div>`:""}
        <div class="dam-sub-meta">📅 ${tAr(sub.createdAt)} | 👤 ${esc(sub.createdBy)}</div>
        <div class="dam-sub-actions">
          <button class="btn bsm" style="background:rgba(99,102,241,.12);color:var(--steel);border:1px solid rgba(99,102,241,.3)" onclick="openDamSubPrint('${r.id}','${sub.id}')">🖨️ وصل</button>
          <button class="btn bsm" style="background:rgba(234,179,8,.12);color:var(--wheat-hi);border:1px solid rgba(234,179,8,.3)" onclick="openDamSubEdit('${r.id}','${sub.id}')">✏️ تعديل</button>
          <button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openDelDamSub('${r.id}','${sub.id}')">🗑️</button>
        </div>
      </div>`;
    }).join(""):"";

    return`<div class="dam-parent" data-rid="${r.id}">
      <div class="dam-parent-hd">
        <div class="dam-parent-names">
          <span class="rpl" style="color:var(--steel)">🤝 ${esc(r.damin)}</span>
          <span class="rdr" style="color:var(--steel)">← ${esc(r.madmun)}</span>
          <span class="badge" style="background:var(--ink-200);color:var(--paper-2)">📅 ${tAr(r.dk)}</span>
          ${r.edited?`<span class="badge" style="background:rgba(234,179,8,.15);color:var(--wheat)">✏️ معدّل</span>`:""}
          ${allPaid
            ?`<span class="badge" style="background:rgba(16,185,129,.15);color:var(--settled)">✅ مدفوع</span>`
            :totalPaid>0
              ?`<span class="badge" style="background:rgba(251,191,36,.12);color:var(--wheat-hi)">💰 جزئي</span>`
              :`<span class="badge" style="background:rgba(239,68,68,.12);color:var(--owing)">⏳ غير مدفوع</span>`
          }
        </div>
        <div style="text-align:left">
          <div style="font-size:17px;font-weight:700;color:var(--steel)">${fIQD(r.price||0)}</div>
          ${hasSubs?`<div style="font-size:10px;color:var(--paper-3);margin-top:2px">سعر الضمانة</div>`:""}
        </div>
      </div>
      ${r.note?`<div style="font-size:12px;color:var(--paper-2);padding:2px 0 4px">📝 ${esc(r.note)}</div>`:""}
      <div style="font-size:11px;color:var(--paper-4);margin-bottom:6px">
        <span>📅 ${tAr(r.createdAt)}</span> <span>👤 ${esc(r.createdBy)}</span>
        ${r.editAt?` <span style="color:var(--wheat)">✏️ ${tAr(r.editAt)}</span>`:""}
      </div>

      ${hasSubs?`
      <!-- مجموع الوصولات -->
      <div style="background:var(--steel-wash);border-radius:8px;padding:7px 10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:5px">
        <span style="font-size:11px;color:var(--steel);font-weight:700">📋 مجموع الوصولات (${AR(subs.length)})</span>
        <span style="font-size:16px;font-weight:800;color:var(--wheat-hi)">${fIQD(subTotal)}</span>
      </div>
      <!-- الصافي بعد طرح الضمانة — للعرض فقط -->
      <div style="background:var(--steel-wash);border:1px solid var(--steel-rule);border-radius:8px;padding:8px 10px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:5px">
          <div>
            <span style="font-size:11px;color:var(--steel);font-weight:700">📊 الصافي الكلي (للمعلومية)</span>
            <div style="font-size:10px;color:var(--paper-3);margin-top:2px">${_damNet>0?fIQD(subTotal)+' وصولات − '+fIQD(parentPrice)+' ضمانة':fIQD(subTotal)+' مجموع الوصولات'}</div>
          </div>
          <span style="font-size:15px;font-weight:800;color:var(--wheat)">${fIQD(Math.max(0,_damNet))}</span>
        </div>
      </div>
      <!-- دفع الضمانة الأصلية منفصلة -->
      <div style="background:var(--steel-wash);border:1px dashed var(--steel);border-radius:8px;padding:8px 10px;margin-bottom:8px">
        <div style="font-size:11px;color:var(--steel);font-weight:700;margin-bottom:5px">🤝 دفع الضمانة الأصلية — ${fIQD(parentPrice)}</div>
        ${payBarMiniHTML(r)}
        <div style="margin-top:5px">${payBtnHTML(r,'dam')}</div>
      </div>
      <!-- الوصولات الفرعية -->
      <div class="dam-sub-list">${subCards}</div>`
      :`<!-- لا وصولات — عرض الدفع المباشر -->
      ${payBarMiniHTML(r)}`}

      <!-- شريط الإجراءات -->
      <div class="dam-total-bar" style="margin-top:8px">
        <div style="display:flex;flex-direction:column;gap:2px">
          ${hasSubs?`
            <span style="color:var(--paper-2);font-size:10px">مجموع الوصولات: <strong style="color:var(--wheat-hi)">${fIQD(subTotal)}</strong></span>
            <span style="color:var(--paper-2);font-size:10px">الضمانة (تُطرح في الكشف): <strong style="color:var(--owing)">− ${fIQD(parentPrice)}</strong></span>
            <span style="color:var(--paper-2);font-size:10px">الصافي: <strong style="color:var(--wheat)">${fIQD(Math.max(0,_damNet))}</strong></span>
          `:`<span style="color:var(--paper-2);font-size:10px">سعر الضمانة: <strong style="color:var(--steel)">${fIQD(parentPrice)}</strong></span>`}
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${!hasSubs?payBtnHTML(r,'dam'):""}
          <button class="btn bsm" style="background:rgba(91,33,182,.15);color:var(--steel);border:1px solid rgba(91,33,182,.4)" onclick="openAddDamSub('${r.id}')">➕ وصل</button>
          <button class="btn bgh bsm" onclick="openDamEdit('${r.id}')">✏️</button>
          ${hasSubs?`<button class="btn bsm" style="background:rgba(99,102,241,.12);color:var(--steel);border:1px solid rgba(99,102,241,.3)" onclick="openDamAllSubPrint('${r.id}')">🖨️ الكل</button>`:
          `<button class="btn bg bsm" onclick="openDamPrint('${r.id}')">🖨️ وصل</button>`}
          <button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openDamDel('${r.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join("");
}
function clrDF(){
  ["dfSearch","dfDt"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.getElementById("dfPaid")&&(document.getElementById("dfPaid").value="all");
  renderDamRecs();
}
function toggleDamPaid(id){openPartialPay(id,'dam');}
let _deOrigDk=null;
function openDamEdit(id){
  const r=DAM_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("deId").value=id;
  _deOrigDk=r.dk||toDay();
  document.getElementById("deDk").value=_deOrigDk;
  document.getElementById("deDamin").value=r.damin||"";
  document.getElementById("deMadmun").value=r.madmun||"";
  setNumIn("dePrice",r.price||"");
  document.getElementById("deNote").value=r.note||"";
  document.getElementById("dePaid").value=r.paid?"paid":"unpaid";
  document.getElementById("mDamEdit").classList.add("active");
}
function saveDamEdit(){
  const id=document.getElementById("deId").value;
  const r=DAM_RECS.find(x=>x.id===id);if(!r)return;
  const damin=document.getElementById("deDamin").value.trim();
  const madmun=document.getElementById("deMadmun").value.trim();
  const price=numIn("dePrice")||r.price;
  const note=document.getElementById("deNote").value.trim();
  const paidVal=document.getElementById("dePaid").value==="paid";
  const deDkNow=document.getElementById("deDk").value;
  const dkVal=deDkNow||_deOrigDk||toDay();
  if(!damin||!madmun||!price){showToast("⚠ أكمل البيانات");return;}
  saveDamRec({...r,damin,madmun,price,note,dk:dkVal,
    paid:paidVal,
    paidAt:paidVal?(r.paidAt||nowStr()):null,
    paidBy:paidVal?(r.paidBy||S.cu.name):null,
    edited:true,editAt:nowStr(),editBy:S.cu.name});
  closeM();showToast("✏️ تم تعديل الضمانة");
}
let _damDelId=null;
function openDamDel(id){
  _damDelId=id;
  const r=DAM_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("damDelTxt").innerHTML=
    `حذف ضمانة: <strong>${esc(r.damin)}</strong> ← <strong>${esc(r.madmun)}</strong><br><strong style="color:var(--steel)">${fIQD(r.price)}</strong>`;
  document.getElementById("mDamDel").classList.add("active");
}
function confirmDamDel(){
  if(!_damDelId)return;
  delDamRec(_damDelId);_damDelId=null;closeM();renderDamRecs();showToast("🗑️ تم الحذف");
}
function openDamPrint(id){
  const r=DAM_RECS.find(x=>x.id===id);if(!r)return;
  _printHTML=buildDamReceipt(r);
  _currentRecId=id;_isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent=`🤝 ${esc(r.damin)} ← ${esc(r.madmun)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildDamReceipt(r){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  let b=sec("بيانات الضمانة");
  b+=row("📅 التاريخ",tAr(r.dk));
  b+=row("الضامن",r.damin);
  b+=row("المضمون",r.madmun);
  b+=row("المبلغ",fIQD(r.price));
  if(r.note)b+=row("ملاحظة",r.note);
  b+=sec("حالة الدفع");
  b+=row("الحالة",r.paid?"✅ مدفوع كامل":(r.paidTotal||0)>0?"💰 جزئي — متبقي: "+fIQD(getRemaining(r)):"⏳ غير مدفوع");
  if(r.paidAt)b+=row("تاريخ الدفع",tAr(r.paidAt)+" | "+r.paidBy);
  b+=sec("التوقيتات");
  b+=row("تاريخ الضمانة",tAr(r.createdAt)+" | "+r.createdBy);
  if(r.editAt)b+=row("آخر تعديل",tAr(r.editAt)+" | "+r.editBy);
  const paidBannerDam=r.paid?`<div style="background:#EAF2EB;border:1.5px solid #3F7A4C;border-radius:5px;padding:5px 12px;margin:5px 0;text-align:center;color:#3F7A4C;font-weight:900;font-size:11px;">✅ تم استلام الدفع — ${r.paidBy||""} | ${tAr(r.paidAt||"")}</div>`:"";
  const paySectionDam=buildPaymentsSection(r);
  const tot=`${paidBannerDam}${paySectionDam}<div class="prtot"><span class="pk">مبلغ الضمانة</span><span class="pv">${fIQD(r.price)}</span></div>`;
  return`${COHEAD}
    <div class="prh" style="background:#3E4D5A">
      <div class="prhtl">وصل ضمانة</div>
      <div class="prhmt">${tAr(r.dk||toDay())}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${tot}${COFTR}`;
}
/* ── محصلة الضمانات ── */
let _curDamCollTab=1;
function renderDamCollTab(){showDamCollTab(_curDamCollTab||1);}
function showDamCollTab(n){
  _curDamCollTab=n;
  [1,2].forEach(i=>{
    const el=document.getElementById("dct"+i);if(el)el.style.display=i===n?"block":"none";
    const btn=document.getElementById("dctb"+i);
    if(btn){btn.style.background=i===n?"var(--steel-rule)":"transparent";btn.style.color=i===n?"#fff":"var(--paper-3)";}
  });
  if(n===2)buildDamHistoryLists();
}
function getDamCollData(period,baseDate){
  const base=baseDate||toDay();const bd=_D(base);
  return DAM_RECS.filter(r=>{
    if(!r.dk)return false;
    if(period==="daily")return r.dk===base;
    if(period==="weekly"){const rd=_D(r.dk);const dow=bd.getDay();const sow=_D(bd);sow.setDate(bd.getDate()-((dow+6)%7));const eow=_D(sow);eow.setDate(sow.getDate()+6);return rd>=sow&&rd<=eow;}
    if(period==="monthly")return r.dk.slice(0,7)===base.slice(0,7);
    return false;
  });
}
function buildDamCollHTML(data,period,dateLabel){
  const PL={daily:"اليومية",weekly:"الأسبوعية",monthly:"الشهرية"};
  const tF=data.reduce((s,r)=>s+getRecTotal(r),0);
  const paidAmt=data.reduce((s,r)=>s+getPaidTotal(r),0);
  const rows=data.map((r,i)=>{
    const tot=getRecTotal(r);
    const paid=getPaidTotal(r);
    const subs=r.subRecs?Object.values(r.subRecs):[];
    const subTotal=subs.reduce((ss,x)=>ss+(x.amount||0),0);
    return`<tr>
    <td style="width:20px;text-align:center">${AR(i+1)}</td>
    <td style="width:65px">${tAr(r.dk)}</td>
    <td style="width:70px;font-weight:700">${esc(r.damin)}</td>
    <td style="width:70px">${esc(r.madmun)}</td>
    <td style="width:65px">${esc(r.note||"—")}</td>
    <td style="width:75px;text-align:center;font-weight:700;color:#4A5A68">${fIQD(tot)}${subTotal>0?`<br/><span style="font-size:8px;color:#6B6151">${fIQD(subTotal)}−${fIQD(r.price||0)}</span>`:''}</td>
    <td style="width:65px;text-align:center;font-size:8px">${paid>=tot?'<span style="color:#3F7A4C;font-weight:700">✅ مكتمل</span>':paid>0?`<span style="color:#8A6218;font-weight:700">💰 ${fIQD(paid)}</span>`:'<span style="color:#943A31">⏳</span>'}</td>
  </tr>`;}).join("");
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#3E4D5A;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#8A9AA8">محصلة الضمانات ${PL[period]||period}</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${dateLabel||tAr(toDay())} | ${AR(data.length)} ضمانة</div>
    </div>
    ${!data.length?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد ضمانات في هذه الفترة</div>`:`
    <div style="padding:0 6px 5px">
      <table class="coltbl" style="width:100%;table-layout:auto;font-size:9px">
        <thead><tr><th>#</th><th>التاريخ</th><th>الضامن</th><th>المضمون</th><th>ملاحظة</th><th>المبلغ</th><th>المدفوع</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot">
          <td colspan="5" style="padding:5px 4px;font-weight:700">المجموع</td>
          <td style="text-align:center;font-weight:700">${fIQD(tF)}</td>
          <td style="text-align:center">${AR(data.filter(r=>r.paid).length)}/${AR(data.length)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div style="background:#1A1714;padding:12px 14px;margin-top:4px;page-break-before:always">
      <div style="display:flex;gap:0;flex-wrap:wrap">
        ${[["عدد الضمانات",AR(data.length),"#8A9AA8"],["المجموع",fIQD(tF),"#B37D14"],["المدفوع",fIQD(paidAmt),"#4E8A5A"],["الباقي",fIQD(tF-paidAmt),"#A8453A"]].map(([k,v,c])=>`<div style="flex:1;min-width:90px;text-align:center;border-left:1px solid #2E2822;padding:8px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
      </div>
    </div>`}
    ${COFTR}
  </div>`;
}
function openDamColl(period){
  const base=toDay();const data=getDamCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildDamCollHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="dam";
  document.getElementById("pactTitle").textContent=`محصلة الضمانات ${PL[period]}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🤝 "+AR(data.length)+" ضمانة");
}
function openDamHistColl(period){
  const base=_getDamHistBase(period);const data=getDamCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildDamCollHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="dam";
  document.getElementById("pactTitle").textContent=`محصلة الضمانات ${PL[period]} — ${tAr(base)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🤝 "+AR(data.length)+" ضمانة");
}
function _getDamHistBase(period){
  if(period==="daily"){const v=document.getElementById("damHistDay")?.value;return v||toDay();}
  if(period==="weekly"){const v=document.getElementById("damHistWeek")?.value;return v||toDay();}
  if(period==="monthly"){const v=document.getElementById("damHistMonth")?.value;return v?v+"-01":toDay();}
  return toDay();
}
function quickOpenDamDay(d){document.getElementById("damHistDay").value=d;openDamHistColl("daily");}
function quickOpenDamWeek(d){document.getElementById("damHistWeek").value=d;openDamHistColl("weekly");}
function quickOpenDamMonth(ym){document.getElementById("damHistMonth").value=ym;openDamHistColl("monthly");}

/* ══════════════════════════════════════════════════
   وصولات الضمانات الفرعية (Sub-Records)
══════════════════════════════════════════════════ */

/* ── حساب مجموع الوصولات الفرعية ── */
function getDamSubTotal(r){
  if(!r.subRecs||!Object.keys(r.subRecs).length) return r.price||0;
  return Object.values(r.subRecs).reduce((s,x)=>s+(x.amount||0),0);
}

/* ── فتح مودال إضافة وصل فرعي ── */
let _damSubParentId=null;
let _damSubEditId=null; // null = وضع إضافة، id = وضع تعديل

function openAddDamSub(parentId){
  _damSubParentId=parentId;
  _damSubEditId=null;
  const r=DAM_RECS.find(x=>x.id===parentId);if(!r)return;
  document.getElementById("mDamSubTitle").textContent="➕ إضافة وصل للضمانة";
  document.getElementById("mDamSubSaveBtn").textContent="💾 حفظ الوصل";
  document.getElementById("mDamSubSaveBtn").onclick=saveDamSub;
  document.getElementById("mDamSubParent").textContent=r.damin+" ← "+r.madmun;
  ["mDamSubDriver","mDamSubGross","mDamSubEmpty","mDamSubPpkg","mDamSubWasl",
   "mDamSubPressCount","mDamSubPressPpcs","mDamSubTransCount","mDamSubTransPpcs",
   "mDamSubTransporter","mDamSubNote"].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value="";
  });
  document.getElementById("mDamSubDk").value=toDay();
  _calcDamSubFinal();
  document.getElementById("mDamSub").classList.add("active");
}

let _damSubOrigDk=null;
function openDamSubEdit(parentId,subId){
  const dam=DAM_RECS.find(x=>x.id===parentId);if(!dam)return;
  const sub=dam.subRecs?.[subId];if(!sub)return;
  _damSubParentId=parentId;
  _damSubEditId=subId;
  document.getElementById("mDamSubTitle").textContent="✏️ تعديل وصل الضمانة";
  document.getElementById("mDamSubSaveBtn").textContent="💾 حفظ التعديل";
  document.getElementById("mDamSubSaveBtn").onclick=saveDamSubEdit;
  document.getElementById("mDamSubParent").textContent=dam.damin+" ← "+dam.madmun;
  // تحميل البيانات الحالية
  document.getElementById("mDamSubDriver").value=sub.driver||sub.desc||"";
  _damSubOrigDk=sub.dk||toDay();
  document.getElementById("mDamSubDk").value=_damSubOrigDk;
  setNumIn("mDamSubGross",sub.gross||"");
  setNumIn("mDamSubEmpty",sub.empty||"");
  setNumIn("mDamSubPpkg",sub.ppkg||"");
  setNumIn("mDamSubWasl",sub.wasl||"");
  document.getElementById("mDamSubPressCount").value=sub.pressCount||"";
  setNumIn("mDamSubPressPpcs",sub.pressPpcs||"");
  document.getElementById("mDamSubTransporter").value=sub.transporter||"";
  document.getElementById("mDamSubTransCount").value=sub.transCount||"";
  setNumIn("mDamSubTransPpcs",sub.transPpcs||"");
  document.getElementById("mDamSubNote").value=sub.note||"";
  _calcDamSubFinal();
  document.getElementById("mDamSub").classList.add("active");
}

function saveDamSubEdit(){
  if(!_damSubParentId||!_damSubEditId)return;
  const dam=DAM_RECS.find(x=>x.id===_damSubParentId);if(!dam)return;
  const oldSub=dam.subRecs?.[_damSubEditId];if(!oldSub)return;
  const driver=(document.getElementById("mDamSubDriver")?.value||"").trim();
  const note  =(document.getElementById("mDamSubNote")?.value||"").trim();
  const transporter=(document.getElementById("mDamSubTransporter")?.value||"").trim();
  const {gross,empty,net,ppkg,wasl,pressCount,pressPpcs,transCount,transPpcs,press,trans,weightFee,final}=_calcDamSubFinal();
  if(!driver){showToast("⚠ أدخل اسم الفلاح");return;}
  if(!gross||gross<=0){showToast("⚠ أدخل الوزن الكلي");return;}
  if(!ppkg||ppkg<=0){showToast("⚠ أدخل سعر الكيلو");return;}
  if(final<=0){showToast("⚠ السعر النهائي يجب أن يكون أكبر من صفر");return;}
  const dkValSubNow=document.getElementById("mDamSubDk")?.value;
  const dkVal=dkValSubNow||_damSubOrigDk||toDay();
  // الاحتفاظ ببيانات الدفع القديمة
  const updSub={
    ...oldSub,
    desc:driver,driver,gross,empty,net,ppkg,
    wasl,
    pressCount,pressPpcs,press,
    transCount,transPpcs,trans,transporter,
    weightFee,amount:final,note,dk:dkVal,
    editAt:nowStr(),editBy:S.cu.name,edited:true,
  };
  const subRecs={...(dam.subRecs||{}),[_damSubEditId]:updSub};
  const subTotal=Object.values(subRecs).reduce((s,x)=>s+(x.amount||0),0);
  // تحديث الذاكرة فوراً
  const di=DAM_RECS.findIndex(x=>x.id===_damSubParentId);
  if(di>=0)DAM_RECS[di]={...dam,subRecs,subTotal};
  saveDamRec({...dam,subRecs,subTotal});
  closeM();
  renderDamRecs();
  renderNaqlRecs();
  renderNaqlColl();
  showToast("✏️ تم تعديل الوصل — "+driver);
}

function _calcDamSubFinal(){
  const gross=numIn("mDamSubGross")||0;
  const empty=numIn("mDamSubEmpty")||0;
  const ppkg =numIn("mDamSubPpkg")||0;
  const wasl =numIn("mDamSubWasl")||0;
  const pressCount=parseFloat(document.getElementById("mDamSubPressCount")?.value)||0;
  const pressPpcs =numIn("mDamSubPressPpcs")||0;
  const transCount=parseFloat(document.getElementById("mDamSubTransCount")?.value)||0;
  const transPpcs =numIn("mDamSubTransPpcs")||0;
  const net=Math.max(0,gross-empty);
  const weightFee=net*ppkg;
  const press=pressCount*pressPpcs;
  const trans=transCount*transPpcs;
  const final=Math.max(0,weightFee-wasl-press-trans);
  const el=document.getElementById("mDamSubFinalDisp");
  if(el){
    el.innerHTML=net>0
      ?`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          <span style="font-size:11px;color:var(--paper-2)">الصافي: <strong style="color:var(--wheat-hi)">${fKG(net)}</strong></span>
          <span style="font-size:11px;color:var(--paper-2)">أجور الوزن: <strong style="color:var(--steel)">${fIQD(weightFee)}</strong></span>
          ${wasl>0?`<span style="font-size:11px;color:var(--paper-2)">وصل: <strong style="color:var(--steel)">− ${fIQD(wasl)}</strong></span>`:""}
          ${press>0?`<span style="font-size:11px;color:var(--paper-2)">كبس: <strong style="color:var(--owing)">− ${fIQD(press)}</strong></span>`:""}
          ${trans>0?`<span style="font-size:11px;color:var(--paper-2)">نقل: <strong style="color:var(--owing)">− ${fIQD(trans)}</strong></span>`:""}
          <span style="font-size:13px;color:var(--steel);font-weight:700;width:100%">السعر النهائي: ${fIQD(final)}</span>
        </div>`
      :'';
  }
  return{gross,empty,net,ppkg,wasl,pressCount,pressPpcs,transCount,transPpcs,press,trans,weightFee,final};
}

function saveDamSub(){
  if(!_damSubParentId)return;
  const driver=(document.getElementById("mDamSubDriver")?.value||"").trim();
  const note  =(document.getElementById("mDamSubNote")?.value||"").trim();
  const transporter=(document.getElementById("mDamSubTransporter")?.value||"").trim();
  const {gross,empty,net,ppkg,wasl,pressCount,pressPpcs,transCount,transPpcs,press,trans,weightFee,final}=_calcDamSubFinal();
  if(!driver){showToast("⚠ أدخل اسم الفلاح");return;}
  if(!gross||gross<=0){showToast("⚠ أدخل الوزن الكلي");return;}
  if(!ppkg||ppkg<=0){showToast("⚠ أدخل سعر الكيلو");return;}
  if(final<=0){showToast("⚠ السعر النهائي يجب أن يكون أكبر من صفر");return;}
  const r=DAM_RECS.find(x=>x.id===_damSubParentId);if(!r)return;
  const subId=genId();
  const dkVal=document.getElementById("mDamSubDk")?.value||toDay();
  const sub={
    id:subId,
    desc:driver,
    driver,gross,empty,net,ppkg,
    wasl,
    pressCount,pressPpcs,press,
    transCount,transPpcs,trans,transporter,
    weightFee,
    amount:final,
    note,
    paid:false,paidAt:null,paidBy:null,payments:[],paidTotal:0,
    createdAt:nowStr(),createdBy:S.cu.name,dk:dkVal
  };
  const subRecs={...(r.subRecs||{}),[subId]:sub};
  const subTotal=Object.values(subRecs).reduce((s,x)=>s+(x.amount||0),0);
  saveDamRec({...r,subRecs,subTotal});  // price يبقى كما هو
  closeM();renderDamRecs();
  showToast("✅ تم إضافة الوصل — "+driver+" | "+fIQD(final));
}

/* ── حذف وصل فرعي ── */
let _damSubDelParent=null,_damSubDelId=null;
function openDelDamSub(parentId,subId){
  _damSubDelParent=parentId;_damSubDelId=subId;
  const r=DAM_RECS.find(x=>x.id===parentId);if(!r)return;
  const sub=r.subRecs?.[subId];if(!sub)return;
  document.getElementById("mDamSubDelTxt").innerHTML=
    `حذف الوصل: <strong>${esc(sub.desc)}</strong><br><strong style="color:var(--steel)">${fIQD(sub.amount)}</strong>`;
  document.getElementById("mDamSubDel").classList.add("active");
}
function confirmDelDamSub(){
  if(!_damSubDelParent||!_damSubDelId)return;
  const r=DAM_RECS.find(x=>x.id===_damSubDelParent);if(!r)return;
  const subRecs={...(r.subRecs||{})};
  delete subRecs[_damSubDelId];
  const subTotal=Object.values(subRecs).reduce((s,x)=>s+(x.amount||0),0);
  saveDamRec({...r,subRecs,subTotal});  // price يبقى كما هو
  _damSubDelParent=null;_damSubDelId=null;
  closeM();renderDamRecs();showToast("🗑️ تم حذف الوصل");
}

/* ── دفع جزئي للوصل الفرعي ── */
let _ppSubParent=null,_ppSubId=null;
function openSubPay(parentId,subId){
  _ppSubParent=parentId;_ppSubId=subId;
  const r=DAM_RECS.find(x=>x.id===parentId);if(!r)return;
  const sub=r.subRecs?.[subId];if(!sub)return;
  const tot=sub.amount||0;
  const payments=sub.payments||[];
  const paidSoFar=payments.reduce((s,p)=>s+(p.amount||0),0);
  const remaining=Math.max(0,tot-paidSoFar);
  const pct=tot>0?Math.min(100,Math.round(paidSoFar/tot*100)):0;
  const histHTML=payments.length?`
    <div class="pay-hist">
      ${payments.map((p,i)=>`
        <div class="pay-hist-row">
          <span style="color:var(--paper-2)">💳 ${tAr(p.at)} — ${esc(p.by)}${p.note?`<br><span style="color:var(--wheat);font-size:9px">📝 ${esc(p.note)}</span>`:""}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--settled);font-weight:700">${fIQD(p.amount)}</span>
            <button onclick="removeSubPayment('${parentId}','${subId}',${i})" style="background:rgba(239,68,68,.15);color:var(--owing);border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>
          </div>
        </div>`).join("")}
    </div>`:'<div style="font-size:11px;color:var(--paper-4);margin-top:4px">لا توجد دفعات مسجّلة</div>';
  const el=document.getElementById("mPartialPay");
  el.innerHTML=`
    <div class="mhd"></div>
    <div class="mtit" style="color:var(--steel)">💰 دفع — ${esc(sub.desc)}</div>
    <p class="mtxt" style="margin-bottom:8px">${esc(r.damin)} ← ${esc(r.madmun)}</p>
    <div class="pay-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">
        <span style="color:var(--paper-2)">المبلغ: <strong style="color:var(--wheat-hi)">${fIQD(tot)}</strong></span>
        <span style="color:var(--wheat-hi);font-weight:700">${pct}% مدفوع</span>
      </div>
      <div class="pay-bar-track"><div class="pay-bar-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px">
        <span style="color:var(--settled);font-weight:700">✅ مدفوع: ${fIQD(paidSoFar)}</span>
        <span style="${remaining>0?"color:var(--owing)":"color:var(--settled)"};font-weight:700">${remaining>0?"⏳ متبقي: "+fIQD(remaining):"✅ مسدّد كامل"}</span>
      </div>
      ${histHTML}
    </div>
    ${remaining>0?`
    <div class="fi-g" style="margin-top:12px">
      <label class="fl">مبلغ الدفعة (د.ع) — الحد الأقصى: ${fIQD(remaining)}</label>
      <input class="fi" id="ppSubAmount" type="text" inputmode="numeric" autocomplete="off" placeholder="0" dir="ltr" style="text-align:right" oninput="fmtPayInput(this,${remaining})" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div class="fi-g" style="margin-top:8px">
      <label class="fl">ملاحظة (اختياري)</label>
      <input class="fi" id="ppSubNote" type="text" placeholder="أي تفاصيل عن الدفعة" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn bgn" style="flex:1;justify-content:center" onclick="addSubPayment()">+ تسجيل دفعة</button>
      <button class="btn" style="flex:1;justify-content:center;background:var(--settled-wash);color:var(--settled);border:1px solid var(--settled-wash)" onclick="subPayFull()">✅ دفع الكل (${fIQD(remaining)})</button>
    </div>`:`
    <div style="background:var(--settled-wash);border:1px solid var(--settled);border-radius:8px;padding:10px;text-align:center;color:var(--settled);font-weight:700;margin-top:10px;font-size:13px">
      ✅ تم سداد المبلغ كاملاً
    </div>`}
    <div class="mbtns" style="margin-top:12px">
      <button class="btn bgh" style="width:100%;justify-content:center" onclick="closeM()">إغلاق</button>
    </div>`;
  document.getElementById("mPartialPay-ov").classList.add("on");
}
function addSubPayment(){
  const amount=payAmt("ppSubAmount");
  const note=(document.getElementById("ppSubNote")?.value||"").trim();
  if(!amount||amount<=0){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  applySubPayment(amount,note);
}
function subPayFull(){
  const r=DAM_RECS.find(x=>x.id===_ppSubParent);if(!r)return;
  const sub=r.subRecs?.[_ppSubId];if(!sub)return;
  const tot=sub.amount||0;
  const paid=(sub.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
  const rem=tot-paid;
  if(rem<=0){showToast("✅ مدفوع بالكامل");return;}
  const note=(document.getElementById("ppSubNote")?.value||"").trim();
  applySubPayment(rem,note);
}
function applySubPayment(amount,note){
  const r=DAM_RECS.find(x=>x.id===_ppSubParent);if(!r)return;
  const sub=r.subRecs?.[_ppSubId];if(!sub)return;
  const payments=[...(sub.payments||[]),{amount,at:nowStr(),by:S.cu.name,note:(note||"").trim()||null}];
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const fullyPaid=paidTotal>=(sub.amount||0);
  const updSub={...sub,payments,paidTotal,paid:fullyPaid,
    paidAt:fullyPaid?(sub.paidAt||nowStr()):null,
    paidBy:fullyPaid?(sub.paidBy||S.cu.name):null};
  const subRecs={...(r.subRecs||{}),[_ppSubId]:updSub};
  // تحديث حالة الأب
  const allPaid=Object.values(subRecs).every(x=>x.paid);
  const totalPaidAmt=Object.values(subRecs).reduce((s,x)=>{
    const p=x.payments||[];return s+p.reduce((ss,pp)=>ss+(pp.amount||0),0);
  },0);
  saveDamRec({...r,subRecs,
    paid:allPaid,
    paidAt:allPaid?(r.paidAt||nowStr()):null,
    paidBy:allPaid?(r.paidBy||S.cu.name):null,
    paidTotal:totalPaidAmt});
  showToast("✅ تم تسجيل "+fIQD(amount));
  openSubPay(_ppSubParent,_ppSubId);
}
function removeSubPayment(parentId,subId,idx){
  _ppSubParent=parentId;_ppSubId=subId;
  const r=DAM_RECS.find(x=>x.id===parentId);if(!r)return;
  const sub=r.subRecs?.[subId];if(!sub)return;
  const payments=(sub.payments||[]).filter((_,i)=>i!==idx);
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const fullyPaid=paidTotal>=(sub.amount||0);
  const updSub={...sub,payments,paidTotal,paid:fullyPaid,
    paidAt:fullyPaid?(sub.paidAt||nowStr()):null,
    paidBy:fullyPaid?(sub.paidBy||S.cu.name):null};
  const subRecs={...(r.subRecs||{}),[subId]:updSub};
  const allPaid=Object.values(subRecs).every(x=>x.paid);
  const totalPaidAmt=Object.values(subRecs).reduce((s,x)=>{
    const p=x.payments||[];return s+p.reduce((ss,pp)=>ss+(pp.amount||0),0);
  },0);
  saveDamRec({...r,subRecs,paid:allPaid,
    paidAt:allPaid?(r.paidAt||nowStr()):null,
    paidBy:allPaid?(r.paidBy||S.cu.name):null,
    paidTotal:totalPaidAmt});
  showToast("↩️ تم إلغاء الدفعة");
  openSubPay(parentId,subId);
}

/* ── طباعة وصل فرعي منفرد ── */
function openDamSubPrint(parentId,subId){
  const r=DAM_RECS.find(x=>x.id===parentId);if(!r)return;
  const sub=r.subRecs?.[subId];if(!sub)return;
  _printHTML=buildDamSubReceipt(r,sub);
  _currentRecId=parentId;_isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent=`🤝 ${esc(r.damin)} ← ${esc(r.madmun)} | ${esc(sub.desc)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildDamSubReceipt(r,sub){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  let b=sec("بيانات الضمانة");
  b+=row("الضامن",r.damin);
  b+=row("المضمون",r.madmun);
  b+=sec("بيانات الوصل");
  b+=row("📅 التاريخ",tAr(sub.dk));
  b+=row("الفلاح",sub.driver||sub.desc);
  if(sub.gross!=null&&sub.gross>0){
    b+=sec("تفاصيل الوزن");
    b+=row("الوزن الكلي",fKG(sub.gross));
    b+=row("الوزن الفارغ",fKG(sub.empty||0));
    b+=row("الوزن الصافي",fKG(sub.net||0));
    b+=row("سعر الكيلو",fIQD(sub.ppkg||0));
    b+=row("أجور الوزن",fIQD(sub.weightFee||0));
    if((sub.wasl||0)>0) b+=row("سعر الوصل (مطروح)","− "+fIQD(sub.wasl));
    if((sub.press||0)>0) b+=row("أجور الكبس",`${AR(sub.pressCount||0)} كبسة × ${fIQD(sub.pressPpcs||0)} = ${fIQD(sub.press)} (تُطرح)`);
    if((sub.trans||0)>0) b+=row("أجور النقل",`${AR(sub.transCount||0)} كبسة × ${fIQD(sub.transPpcs||0)} = ${fIQD(sub.trans)} (تُطرح)`);
    if(sub.transporter) b+=row("الناقل",sub.transporter);
  }
  if(sub.note)b+=row("ملاحظة",sub.note);
  b+=sec("حالة الدفع");
  const subPaid=(sub.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
  const subRem=Math.max(0,(sub.amount||0)-subPaid);
  b+=row("الحالة",sub.paid?"✅ مدفوع كامل":subPaid>0?"💰 جزئي — متبقي: "+fIQD(subRem):"⏳ غير مدفوع");
  b+=sec("التوقيتات");
  b+=row("تاريخ الوصل",tAr(sub.createdAt)+" | "+sub.createdBy);
  const paySection=buildPaymentsSection(sub);
  const tot=`${paySection}<div class="prtot"><span class="pk">السعر النهائي</span><span class="pv">${fIQD(sub.amount)}</span></div>`;
  return`${COHEAD}
    <div class="prh" style="background:#3E4D5A">
      <div class="prhtl">وصل ضمانة — ${esc(sub.driver||sub.desc)}</div>
      <div class="prhmt">${tAr(sub.dk||toDay())}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${tot}${COFTR}`;
}

/* ── طباعة كل الوصولات الفرعية (كشف كامل) ── */
function openDamAllSubPrint(parentId){
  const r=DAM_RECS.find(x=>x.id===parentId);if(!r)return;
  _printHTML=buildDamAllSubsReceipt(r);
  _currentRecId=parentId;_isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent=`🤝 كشف كامل: ${esc(r.damin)} ← ${esc(r.madmun)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildDamAllSubsReceipt(r){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  const subs=r.subRecs?Object.values(r.subRecs):[];
  const subsTotal=subs.reduce((s,x)=>s+(x.amount||0),0);
  const totalAmt=subsTotal; // مجموع الوصولات الفرعية فقط
  const grandTotal=Math.max(0,subsTotal-(r.price||0)); // الصافي = مجموع الوصولات − سعر الضمانة
  const totalNet=subs.reduce((s,x)=>s+(x.net||0),0);
  const totalWasl=subs.reduce((s,x)=>s+(x.wasl||0),0);
  const totalPress=subs.reduce((s,x)=>s+(x.press||0),0);
  const totalTrans=subs.reduce((s,x)=>s+(x.trans||0),0);
  const subsPaidTotal=subs.reduce((s,x)=>{const p=x.payments||[];return s+p.reduce((ss,pp)=>ss+(pp.amount||0),0);},0);
  const parentPaidTotal=getPaidTotal(r);
  const totalPaid=subsPaidTotal+parentPaidTotal;

  let b=sec("بيانات الضمانة");
  b+=row("الضامن",r.damin);
  b+=row("المضمون",r.madmun);
  b+=row("سعر الضمانة الأصلي",fIQD(r.price||0));
  if(r.note)b+=row("ملاحظة",r.note);
  b+=row("تاريخ الضمانة",tAr(r.createdAt)+" | "+r.createdBy);

  if(subs.length){
    b+=sec(`الوصولات الفرعية — ${AR(subs.length)} وصل`);
    // جدول مفصّل
    b+=`<table class="coltbl" style="width:100%;font-size:8.5px;margin-bottom:6px">
      <thead><tr>
        <th>#</th>
        <th>الفلاح</th>
        <th>الكلي</th>
        <th>الفارغ</th>
        <th>الصافي</th>
        <th>سعر/كغم</th>
        <th style="color:#4A5A68">وصل</th>
        <th>كبس</th>
        <th>نقل</th>
        <th>النهائي</th>
        <th>الدفع</th>
      </tr></thead>
      <tbody>`;
    subs.forEach((sub,i)=>{
      const subPaid=(sub.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
      const subRem=Math.max(0,(sub.amount||0)-subPaid);
      const hasWeigh=sub.gross!=null&&sub.gross>0;
      b+=`<tr>
        <td style="text-align:center">${AR(i+1)}</td>
        <td>${esc(sub.driver||sub.desc)}</td>
        <td style="text-align:center">${hasWeigh?fKG(sub.gross):"—"}</td>
        <td style="text-align:center">${hasWeigh?fKG(sub.empty||0):"—"}</td>
        <td style="text-align:center;font-weight:700;color:#8A6218">${hasWeigh?fKG(sub.net||0):"—"}</td>
        <td style="text-align:center">${hasWeigh?fIQD(sub.ppkg||0):"—"}</td>
        <td style="text-align:center;color:#4A5A68">${(sub.wasl||0)>0?fIQD(sub.wasl):"—"}</td>
        <td style="text-align:center;color:#943A31">${(sub.press||0)>0?`${AR(sub.pressCount||0)}×${fIQD(sub.pressPpcs||0)}`:"—"}</td>
        <td style="text-align:center;color:#943A31">${(sub.trans||0)>0?`${AR(sub.transCount||0)}×${fIQD(sub.transPpcs||0)}`:"—"}</td>
        <td style="text-align:center;font-weight:700;color:#3E4D5A">${fIQD(sub.amount)}</td>
        <td style="text-align:center;font-size:8px">${sub.paid?'<span style="color:#3F7A4C">✅</span>':subPaid>0?`<span style="color:#8A6218">💰${fIQD(subPaid)}</span>`:'<span style="color:#943A31">⏳</span>'}</td>
      </tr>`;
      if(sub.note){
        b+=`<tr><td colspan="10" style="color:#6B6151;font-size:8px;padding:2px 6px">📝 ${esc(sub.note)}</td></tr>`;
      }
    });
    // صف المجاميع
    b+=`</tbody>
      <tfoot><tr class="ctot">
        <td colspan="4" style="font-weight:700;padding:5px 4px">المجاميع</td>
        <td style="text-align:center;font-weight:700;color:#8A6218">${fKG(totalNet)}</td>
        <td></td>
        <td style="text-align:center;font-weight:700;color:#4A5A68">${totalWasl>0?fIQD(totalWasl):"—"}</td>
        <td style="text-align:center;font-weight:700;color:#943A31">${fIQD(totalPress)}</td>
        <td style="text-align:center;font-weight:700;color:#943A31">${fIQD(totalTrans)}</td>
        <td style="text-align:center;font-weight:700;color:#3E4D5A">${fIQD(totalAmt)}</td>
        <td></td>
      </tr></tfoot>
    </table>`;
  }

  const summaryBar=`
    <div style="background:#1A1714;padding:10px 14px;margin-top:4px">
      <div style="display:flex;gap:0;flex-wrap:wrap">
        ${[
          ["الوصولات",AR(subs.length),"#8A9AA8"],
          ["الوزن الصافي",fKG(totalNet),"#B37D14"],
          ["أجور الوصل",totalWasl>0?fIQD(totalWasl):"—","#4A5A68"],
          ["أجور الكبس",fIQD(totalPress),"#A8453A"],
          ["أجور النقل",fIQD(totalTrans),"#A8453A"],
          ["مجموع الوصولات",fIQD(subsTotal),"#5E6E7C"],
          ["مدفوع (وصولات)",fIQD(subsPaidTotal),"#4E8A5A"],
          ["باقي (وصولات)",fIQD(Math.max(0,subsTotal-subsPaidTotal)),"#A8453A"]
        ].map(([k,v,c])=>`<div style="flex:1;min-width:75px;text-align:center;border-left:1px solid #2E2822;padding:7px 4px">
          <div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:3px">${k}</div>
          <div style="font-size:11px;font-weight:700;color:${c}">${v}</div>
        </div>`).join("")}
      </div>
      <!-- المعادلة: وصولات − ضمانة = الصافي -->
      <div style="border-top:1px solid #3E4D5A;margin-top:8px;padding-top:8px">
        <div style="font-size:10px;color:#5E6E7C;font-weight:700;margin-bottom:6px">💎 المعادلة النهائية</div>
        <div style="display:flex;gap:0;flex-wrap:wrap">
          ${[
            ["مجموع الوصولات",fIQD(subsTotal),"#B37D14"],
            ["سعر الضمانة (يُطرح)","− "+fIQD(r.price||0),"#A8453A"],
            ["الصافي للدفع",fIQD(grandTotal),"#B37D14"]
          ].map(([k,v,c])=>`<div style="flex:1;text-align:center;border-left:1px solid #2E2822;padding:6px 4px">
            <div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:3px">${k}</div>
            <div style="font-size:13px;font-weight:700;color:${c}">${v}</div>
          </div>`).join("")}
        </div>
      </div>
      <!-- الإجمالي الكلي -->
      <div style="border-top:1px solid #2E2822;margin-top:8px;padding-top:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
        <div>
          <div style="font-size:10px;color:#6B6151;margin-bottom:2px">الصافي للدفع (وصولات − ضمانة)</div>
          <div style="font-size:15px;font-weight:700;color:#B37D14">${fIQD(grandTotal)}</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:10px;color:#4E8A5A;font-weight:700">✅ مدفوع: ${fIQD(totalPaid)}</div>
          <div style="font-size:10px;color:#A8453A;font-weight:700">⏳ باقي: ${fIQD(Math.max(0,grandTotal-totalPaid))}</div>
        </div>
      </div>
    </div>`;

  return`${COHEAD}
    <div class="prh" style="background:#3E4D5A">
      <div class="prhtl">كشف ضمانة كامل</div>
      <div class="prhmt">${tAr(r.dk||toDay())}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${summaryBar}${COFTR}`;
}
function setDamHistPeriod(p){
  ["daily","weekly","monthly"].forEach(x=>{
    const panel=document.getElementById("dhp"+x.charAt(0).toUpperCase()+x.slice(1));
    if(panel)panel.style.display=x===p?"block":"none";
  });
  const map={daily:1,weekly:2,monthly:3};
  [1,2,3].forEach(i=>{const btn=document.getElementById("dhpb"+i);if(!btn)return;btn.style.background=i===map[p]?"var(--steel-rule)":"transparent";btn.style.color=i===map[p]?"#fff":"var(--paper-3)";});
}
function buildDamHistoryLists(){
  const days=[...new Set(DAM_RECS.map(r=>r.dk).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const dayEl=document.getElementById("damHistDayList");
  if(dayEl)dayEl.innerHTML=!days.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    days.map(d=>{const cnt=DAM_RECS.filter(r=>r.dk===d).length;
      return`<button onclick="quickOpenDamDay('${d}')" style="padding:6px 10px;border-radius:8px;border:1px solid var(--steel-wash);background:var(--steel-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px"><span style="font-size:10px;color:var(--steel);font-weight:700">${tAr(d)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(cnt)} ضمانة</span></button>`;}).join("");
  const weekMap={};
  DAM_RECS.forEach(r=>{if(!r.dk)return;const bd=_D(r.dk);const dow=bd.getDay();const mon=_D(bd);mon.setDate(bd.getDate()-((dow+6)%7));const key=_ds(mon);weekMap[key]=(weekMap[key]||0)+1;});
  const weeks=Object.keys(weekMap).sort((a,b)=>b.localeCompare(a));
  const weekEl=document.getElementById("damHistWeekList");
  if(weekEl)weekEl.innerHTML=!weeks.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    weeks.map(w=>{const endD=_D(w);endD.setDate(endD.getDate()+6);const endS=_ds(endD);
      return`<button onclick="quickOpenDamWeek('${w}')" style="padding:6px 10px;border-radius:8px;border:1px solid var(--steel-wash);background:var(--steel-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:110px"><span style="font-size:10px;color:var(--steel);font-weight:700">${tAr(w)} ← ${tAr(endS)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(weekMap[w])} ضمانة</span></button>`;}).join("");
  const monthMap={};
  DAM_RECS.forEach(r=>{if(!r.dk)return;const key=r.dk.slice(0,7);monthMap[key]=(monthMap[key]||0)+1;});
  const months=Object.keys(monthMap).sort((a,b)=>b.localeCompare(a));
  const monthEl=document.getElementById("damHistMonthList");
  const mNames=["","يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  if(monthEl)monthEl.innerHTML=!months.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    months.map(m=>{const [yr,mn]=m.split("-");
      return`<button onclick="quickOpenDamMonth('${m}')" style="padding:8px 12px;border-radius:8px;border:1px solid var(--steel-wash);background:var(--steel-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:90px"><span style="font-size:11px;color:var(--steel);font-weight:700">${mNames[+mn]||mn} ${tAr(yr)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(monthMap[m])} ضمانة</span></button>`;}).join("");
}

