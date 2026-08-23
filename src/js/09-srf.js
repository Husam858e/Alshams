/* ══════════════════════════════════════════════════════
   قسم الصرفيات
══════════════════════════════════════════════════════ */
let SRF_RECS=[];
let dbRefSrf=null;

function loadSrfCache(){
  try{const c=localStorage.getItem("wShamsSrfCache");if(c)SRF_RECS=JSON.parse(c).sort(_byDkDesc);}catch(e){}
}
function saveSrfRec(r){
  _fbWrite("srf_records",r.id,r,safe=>{
    const idx=SRF_RECS.findIndex(x=>x.id===r.id);
    if(idx>=0)SRF_RECS[idx]=safe; else SRF_RECS.unshift(safe);
    SRF_RECS.sort(_byDkDesc);   // v17.39 — تعديل التاريخ ينقل الوصل ليومه فوراً
    try{localStorage.setItem("wShamsSrfCache",JSON.stringify(SRF_RECS));}catch(e){}
  });
  if(_tabActive("srf-recs"))_scheduleRender(renderSrfRecs);
}
function delSrfRec(id){
  _toTrash("srf",SRF_RECS.find(r=>r.id===id));
  _fbWrite("srf_records",id,null,()=>{
    SRF_RECS=SRF_RECS.filter(r=>r.id!==id);
    try{localStorage.setItem("wShamsSrfCache",JSON.stringify(SRF_RECS));}catch(e){}
  });
}

function submitSrfRec(){
  const recv=(document.getElementById("srRecv")?.value||"").trim();
  const purp=(document.getElementById("srPurp")?.value||"").trim();
  const amount=numIn("srAmount")||0;
  const note=(document.getElementById("srNote")?.value||"").trim();
  if(!recv){showToast("⚠ أدخل اسم المستفيد");return;}
  if(!purp){showToast("⚠ أدخل السبب");return;}
  if(!amount||amount<=0){showToast("⚠ أدخل المبلغ");return;}
  const r={id:genId(),seq:Date.now(),recv,purp,amount,note,
    payments:[],paidTotal:0,paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:S.cu.name,dk:toDay()};
  saveSrfRec(r);
  clrSrfForm();
  document.querySelectorAll(".tbb").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tc").forEach(c=>c.classList.remove("active"));
  const btn=document.getElementById("srfRecsTabBtn");
  if(btn)btn.classList.add("active");
  document.getElementById("tc-srf-recs")?.classList.add("active");
  renderSrfRecs();
  showToast("✅ تم حفظ الصرفية — "+fIQD(amount));
}
function clrSrfForm(){
  ["srRecv","srPurp","srAmount","srNote"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";})
}

function renderSrfRecs(){
  if(!S.cu)return;
  const srch=(document.getElementById("srfSearch")?.value||"").toLowerCase();
  const df=document.getElementById("srfDt")?.value||"";
  const pf=document.getElementById("srfPaid")?.value||"all";
  let f=SRF_RECS.filter(r=>{
    if(df&&r.dk!==df)return false;
    if(pf==="paid"&&!r.paid)return false;
    if(pf==="unpaid"&&(r.paid||getPaidTotal(r)>0))return false;
    if(pf==="partial"&&!(getPaidTotal(r)>0&&!r.paid))return false;
    if(srch&&!smartMatch(r.recv,srch)&&!smartMatch(r.purp,srch))return false;
    return true;
  });
  const tF=f.reduce((s,r)=>s+(r.amount||0),0);
  const paidAmt=f.reduce((s,r)=>s+getPaidTotal(r),0);
  document.getElementById("srfFSm").innerHTML=
    `<span>الصرفيات: <strong>${AR(f.length)}</strong></span>
     <span>المجموع: <strong style="color:var(--wheat)">${fIQD(tF)}</strong></span>
     <span>المدفوع: <strong style="color:var(--settled)">${fIQD(paidAmt)}</strong></span>
     <span>الباقي: <strong style="color:var(--owing)">${fIQD(tF-paidAmt)}</strong></span>`;
  const list=document.getElementById("srfRL");
  if(!f.length){list.innerHTML=`<div style="text-align:center;color:var(--ink-300);padding:35px;font-size:14px">📭 لا توجد صرفيات</div>`;return;}
  list.innerHTML=f.map(r=>`
    <div class="srf-card" data-rid="${r.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
        <div>
          <div style="font-weight:700;font-size:15px;color:var(--wheat)">🧾 ${esc(r.purp)}</div>
          <div style="font-size:12px;color:var(--paper-2);margin-top:3px">
            👤 المستفيد: <strong style="color:var(--paper)">${esc(r.recv)}</strong>
          </div>
          ${r.note?`<div style="font-size:11px;color:var(--paper-3);margin-top:3px">📝 ${esc(r.note)}</div>`:""}
        </div>
        <div style="text-align:left">
          <div style="font-size:20px;font-weight:700;color:var(--wheat)">${fIQD(r.amount)}</div>
          <div style="font-size:10px;color:var(--paper-2)">📅 ${tAr(r.dk)}</div>
          ${r.paid?`<div style="font-size:10px;color:var(--settled);font-weight:700">✅ مدفوع</div>`:getPaidTotal(r)>0?`<div style="font-size:10px;color:var(--wheat-hi);font-weight:700">💰 جزئي</div>`:""}
        </div>
      </div>
      ${payBarMiniHTML(r)}
      <div style="display:flex;gap:4px;flex-wrap:wrap;font-size:11px;color:var(--paper-4);margin-bottom:8px">
        <span>📅 ${tAr(r.createdAt)}</span><span>👤 ${esc(r.createdBy)}</span>
        ${r.editAt?`<span style="color:var(--wheat)">✏️ ${tAr(r.editAt)} — ${esc(r.editBy)}</span>`:""}
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${payBtnHTML(r,'srf')}
        <button class="btn bgh bsm" onclick="openSrfEdit('${r.id}')">✏️ تعديل</button>
        <button class="btn bg bsm" onclick="openSrfPrint('${r.id}')">🖨️ وصل</button>
        <button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openSrfDel('${r.id}')">🗑️</button>
      </div>
    </div>`).join("");
}
function clrSrfF(){
  ["srfSearch","srfDt"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  const p=document.getElementById("srfPaid");if(p)p.value="all";
  renderSrfRecs();
}

let _sreOrigDk=null;
function openSrfEdit(id){
  const r=SRF_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("sreId").value=id;
  _sreOrigDk=r.dk||toDay();
  document.getElementById("sreDk").value=_sreOrigDk;
  document.getElementById("sreRecv").value=r.recv||"";
  document.getElementById("srePurp").value=r.purp||"";
  setNumIn("sreAmount",r.amount||"");
  document.getElementById("sreNote").value=r.note||"";
  document.getElementById("mSrfEdit").classList.add("active");
}
function saveSrfEdit(){
  const id=document.getElementById("sreId").value;
  const r=SRF_RECS.find(x=>x.id===id);if(!r)return;
  const recv=document.getElementById("sreRecv").value.trim();
  const purp=document.getElementById("srePurp").value.trim();
  const amount=numIn("sreAmount")||r.amount;
  const note=document.getElementById("sreNote").value.trim();
  const sreDkNow=document.getElementById("sreDk").value;
  const dkVal=sreDkNow||_sreOrigDk||toDay();
  if(!recv||!purp||!amount){showToast("⚠ أكمل البيانات");return;}
  saveSrfRec({...r,recv,purp,amount,note,dk:dkVal,edited:true,editAt:nowStr(),editBy:S.cu.name});
  closeM();showToast("✏️ تم تعديل الصرفية");
}
let _srfDelId=null;
function openSrfDel(id){
  _srfDelId=id;
  const r=SRF_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("srfDelTxt").innerHTML=
    `حذف صرفية: <strong>${esc(r.purp)}</strong><br><strong style="color:var(--wheat)">${fIQD(r.amount)}</strong>`;
  document.getElementById("mSrfDel").classList.add("active");
}
function confirmSrfDel(){
  if(!_srfDelId)return;
  delSrfRec(_srfDelId);_srfDelId=null;closeM();renderSrfRecs();showToast("🗑️ تم الحذف");
}
function openSrfPrint(id){
  const r=SRF_RECS.find(x=>x.id===id);if(!r)return;
  _printHTML=buildSrfReceipt(r);
  _currentRecId=id;_isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent=`🧾 ${esc(r.purp)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildSrfReceipt(r){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  let b=sec("بيانات الصرفية");
  b+=row("📅 التاريخ",tAr(r.dk));
  b+=row("المستفيد",r.recv);
  b+=row("السبب",r.purp);
  if(r.note)b+=row("ملاحظة",r.note);
  b+=sec("حالة الدفع");
  b+=row("الحالة",r.paid?"✅ مدفوع كامل":(getPaidTotal(r)>0?"💰 جزئي — مدفوع: "+fIQD(getPaidTotal(r))+" | متبقي: "+fIQD(getRemaining(r)):"⏳ غير مدفوع"));
  if(r.paidAt)b+=row("تاريخ اكتمال الدفع",tAr(r.paidAt)+" | "+r.paidBy);
  if(r.editAt)b+=row("آخر تعديل",tAr(r.editAt)+" | "+r.editBy);
  const paidBanner=r.paid?`<div style="background:#EAF2EB;border:1.5px solid #3F7A4C;border-radius:5px;padding:5px 12px;margin:5px 0;text-align:center;color:#3F7A4C;font-weight:900;font-size:11px;">✅ تم الدفع كاملاً — ${r.paidBy||""} | ${tAr(r.paidAt||"")}</div>`:"";
  const paySection=buildPaymentsSection(r);
  const tot=`${paidBanner}${paySection}<div class="prtot"><span class="pk">مبلغ الصرفية</span><span class="pv" style="color:#A8701C">${fIQD(r.amount)}</span></div>`;
  return`${COHEAD}
    <div class="prh" style="background:#5A431C">
      <div class="prhtl">وصل صرفية</div>
      <div class="prhmt">${tAr(r.dk||toDay())}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${tot}${COFTR}`;
}

/* ── محصلة الصرفيات ── */
let _curSrfCollTab=1;
function renderSrfCollTab(){showSrfCollTab(_curSrfCollTab||1);}
function showSrfCollTab(n){
  _curSrfCollTab=n;
  [1,2].forEach(i=>{
    const el=document.getElementById("srct"+i);if(el)el.style.display=i===n?"block":"none";
    const btn=document.getElementById("srctb"+i);
    if(btn){btn.style.background=i===n?"var(--pending-rule)":"transparent";btn.style.color=i===n?"#fff":"var(--paper-3)";}
  });
  if(n===2)buildSrfHistoryLists();
}
function getSrfCollData(period,baseDate){
  const base=baseDate||toDay();const bd=_D(base);
  return SRF_RECS.filter(r=>{
    if(!r.dk)return false;
    if(period==="daily")return r.dk===base;
    if(period==="weekly"){const rd=_D(r.dk);const dow=bd.getDay();const sow=_D(bd);sow.setDate(bd.getDate()-((dow+6)%7));const eow=_D(sow);eow.setDate(sow.getDate()+6);return rd>=sow&&rd<=eow;}
    if(period==="monthly")return r.dk.slice(0,7)===base.slice(0,7);
    return false;
  });
}
function buildSrfCollHTML(data,period,dateLabel){
  const PL={daily:"اليومية",weekly:"الأسبوعية",monthly:"الشهرية"};
  const tF=data.reduce((s,r)=>s+(r.amount||0),0);
  const paidAmt=data.reduce((s,r)=>s+getPaidTotal(r),0);
  const rows=data.map((r,i)=>`<tr>
    <td style="width:20px;text-align:center">${AR(i+1)}</td>
    <td style="width:65px">${tAr(r.dk)}</td>
    <td style="width:80px;font-weight:700">${esc(r.recv)}</td>
    <td style="width:90px">${esc(r.purp)}</td>
    <td style="width:60px">${esc(r.note||"—")}</td>
    <td style="width:75px;text-align:center;font-weight:700;color:#A8701C">${fIQD(r.amount)}</td>
    <td style="width:65px;text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C;font-weight:700">✅ مكتمل</span>':getPaidTotal(r)>0?'<span style="color:#8A6218;font-weight:700">💰 '+fIQD(getPaidTotal(r))+'</span>':'<span style="color:#943A31">⏳</span>'}</td>
  </tr>`).join("");
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#5A431C;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#C99A56">محصلة الصرفيات ${PL[period]||period}</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${dateLabel||tAr(toDay())} | ${AR(data.length)} صرفية</div>
    </div>
    ${!data.length?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد صرفيات في هذه الفترة</div>`:`
    <div style="padding:0 6px 5px">
      <table class="coltbl" style="width:100%;table-layout:auto;font-size:9px">
        <thead><tr><th>#</th><th>التاريخ</th><th>المستفيد</th><th>السبب</th><th>ملاحظة</th><th>المبلغ</th><th>المدفوع</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot">
          <td colspan="5" style="padding:5px 4px;font-weight:700">المجموع الكلي</td>
          <td style="text-align:center;font-weight:700;color:#A8701C">${fIQD(tF)}</td>
          <td style="text-align:center;font-size:8px">${fIQD(paidAmt)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div style="background:#1A1714;padding:12px 14px;margin-top:4px;page-break-before:always">
      <div style="display:flex;gap:0;flex-wrap:wrap">
        ${[["عدد الصرفيات",AR(data.length),"#C99A56"],["المجموع",fIQD(tF),"#A8701C"],["المدفوع",fIQD(paidAmt),"#4E8A5A"],["الباقي",fIQD(tF-paidAmt),"#A8453A"]].map(([k,v,c])=>`<div style="flex:1;min-width:90px;text-align:center;border-left:1px solid #2E2822;padding:8px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
      </div>
    </div>`}
    ${COFTR}
  </div>`;
}
function openSrfColl(period){
  const base=toDay();const data=getSrfCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildSrfCollHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="srf";
  document.getElementById("pactTitle").textContent=`محصلة الصرفيات ${PL[period]}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🧾 "+AR(data.length)+" صرفية — "+fIQD(data.reduce((s,r)=>s+(r.amount||0),0)));
}
function openSrfHistColl(period){
  const base=_getSrfHistBase(period);const data=getSrfCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildSrfCollHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="srf";
  document.getElementById("pactTitle").textContent=`محصلة الصرفيات ${PL[period]} — ${tAr(base)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🧾 "+AR(data.length)+" صرفية");
}
function _getSrfHistBase(period){
  if(period==="daily"){const v=document.getElementById("srfHistDay")?.value;return v||toDay();}
  if(period==="weekly"){const v=document.getElementById("srfHistWeek")?.value;return v||toDay();}
  if(period==="monthly"){const v=document.getElementById("srfHistMonth")?.value;return v?v+"-01":toDay();}
  return toDay();
}
function quickOpenSrfDay(d){document.getElementById("srfHistDay").value=d;openSrfHistColl("daily");}
function quickOpenSrfWeek(d){document.getElementById("srfHistWeek").value=d;openSrfHistColl("weekly");}
function quickOpenSrfMonth(ym){document.getElementById("srfHistMonth").value=ym;openSrfHistColl("monthly");}
function setSrfHistPeriod(p){
  ["daily","weekly","monthly"].forEach(x=>{
    const panel=document.getElementById("shfp"+x.charAt(0).toUpperCase()+x.slice(1));
    if(panel)panel.style.display=x===p?"block":"none";
  });
  const map={daily:1,weekly:2,monthly:3};
  [1,2,3].forEach(i=>{const btn=document.getElementById("shfpb"+i);if(!btn)return;btn.style.background=i===map[p]?"var(--pending-rule)":"transparent";btn.style.color=i===map[p]?"#fff":"var(--paper-3)";});
}
function buildSrfHistoryLists(){
  const days=[...new Set(SRF_RECS.map(r=>r.dk).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const dayEl=document.getElementById("srfHistDayList");
  if(dayEl)dayEl.innerHTML=!days.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    days.map(d=>{const cnt=SRF_RECS.filter(r=>r.dk===d).length;
      return`<button onclick="quickOpenSrfDay('${d}')" style="padding:6px 10px;border-radius:8px;border:1px solid var(--wheat-wash);background:var(--wheat-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px"><span style="font-size:10px;color:var(--wheat-hi);font-weight:700">${tAr(d)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(cnt)} صرفية</span></button>`;}).join("");
  const weekMap={};
  SRF_RECS.forEach(r=>{if(!r.dk)return;const bd=_D(r.dk);const dow=bd.getDay();const mon=_D(bd);mon.setDate(bd.getDate()-((dow+6)%7));const key=_ds(mon);weekMap[key]=(weekMap[key]||0)+1;});
  const weeks=Object.keys(weekMap).sort((a,b)=>b.localeCompare(a));
  const weekEl=document.getElementById("srfHistWeekList");
  if(weekEl)weekEl.innerHTML=!weeks.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    weeks.map(w=>{const endD=_D(w);endD.setDate(endD.getDate()+6);const endS=_ds(endD);
      return`<button onclick="quickOpenSrfWeek('${w}')" style="padding:6px 10px;border-radius:8px;border:1px solid var(--wheat-wash);background:var(--wheat-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:110px"><span style="font-size:10px;color:var(--wheat);font-weight:700">${tAr(w)} ← ${tAr(endS)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(weekMap[w])} صرفية</span></button>`;}).join("");
  const monthMap={};
  SRF_RECS.forEach(r=>{if(!r.dk)return;const key=r.dk.slice(0,7);monthMap[key]=(monthMap[key]||0)+1;});
  const months=Object.keys(monthMap).sort((a,b)=>b.localeCompare(a));
  const monthEl=document.getElementById("srfHistMonthList");
  const mNames=["","يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  if(monthEl)monthEl.innerHTML=!months.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    months.map(m=>{const [yr,mn]=m.split("-");
      return`<button onclick="quickOpenSrfMonth('${m}')" style="padding:8px 12px;border-radius:8px;border:1px solid var(--wheat-wash);background:var(--wheat-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:90px"><span style="font-size:11px;color:var(--wheat);font-weight:700">${mNames[+mn]||mn} ${tAr(yr)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(monthMap[m])} صرفية</span></button>`;}).join("");
}

/* ════════════════════════════════════════════
   DOM READY
════════════════════════════════════════════ */

