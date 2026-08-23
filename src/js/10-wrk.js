/* ══════════════════════════════════════════════════════
   قسم أجور العمل
══════════════════════════════════════════════════════ */
let WRK_RECS=[];
let dbRefWrk=null;

function loadWrkCache(){
  try{const c=localStorage.getItem("wShamsWrkCache");if(c)WRK_RECS=JSON.parse(c).sort(_byDkDesc);}catch(e){}
}
function saveWrkRec(r){
  _fbWrite("wrk_records",r.id,r,safe=>{
    const idx=WRK_RECS.findIndex(x=>x.id===r.id);
    if(idx>=0)WRK_RECS[idx]=safe; else WRK_RECS.unshift(safe);
    WRK_RECS.sort(_byDkDesc);   // v17.39 — تعديل التاريخ ينقل الوصل ليومه فوراً
    try{localStorage.setItem("wShamsWrkCache",JSON.stringify(WRK_RECS));}catch(e){}
  });
  if(_tabActive("wrk-recs"))_scheduleRender(renderWrkRecs);
}
function delWrkRec(id){
  _toTrash("wrk",WRK_RECS.find(r=>r.id===id));
  _fbWrite("wrk_records",id,null,()=>{
    WRK_RECS=WRK_RECS.filter(r=>r.id!==id);
    try{localStorage.setItem("wShamsWrkCache",JSON.stringify(WRK_RECS));}catch(e){}
  });
}

/* ── فورم جديد ── */
function submitWrkRec(){
  const provider=(document.getElementById("wkProvider")?.value||"").trim();
  const service=(document.getElementById("wkService")?.value||"").trim();
  const amount=numIn("wkAmount")||0;
  const note=(document.getElementById("wkNote")?.value||"").trim();
  if(!provider){showToast("⚠ أدخل اسم مقدم الخدمة");return;}
  if(!service){showToast("⚠ أدخل الخدمة");return;}
  if(!amount||amount<=0){showToast("⚠ أدخل المبلغ");return;}
  const r={id:genId(),seq:Date.now(),provider,service,amount,note,
    payments:[],paidTotal:0,paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:S.cu.name,dk:toDay()};
  saveWrkRec(r);
  ["wkProvider","wkService","wkAmount","wkNote"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.querySelectorAll(".tbb").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tc").forEach(c=>c.classList.remove("active"));
  const btn=document.getElementById("wrkRecsTabBtn");
  if(btn)btn.classList.add("active");
  document.getElementById("tc-wrk-recs")?.classList.add("active");
  renderWrkRecs();
  showToast("✅ تم حفظ أجر العمل — "+fIQD(amount));
}

/* ── عرض السجل ── */
function renderWrkRecs(){
  if(!S.cu)return;
  const srch=(document.getElementById("wfSearch")?.value||"").toLowerCase();
  const pf=document.getElementById("wfPaid")?.value||"all";
  const df=document.getElementById("wfDt")?.value||"";
  let f=WRK_RECS.filter(r=>{
    if(pf==="paid"&&!r.paid)return false;
    if(pf==="unpaid"&&r.paid)return false;
    if(pf==="partial"&&!(getPaidTotal(r)>0&&!r.paid))return false;
    if(df&&r.dk!==df)return false;
    if(srch&&!smartMatch(r.provider,srch)&&!smartMatch(r.service,srch))return false;
    return true;
  });
  const tF=f.reduce((s,r)=>s+(r.amount||0),0);
  const paidAmt=f.reduce((s,r)=>s+getPaidTotal(r),0);
  document.getElementById("wrkFSm").innerHTML=
    `<span>السجلات: <strong>${AR(f.length)}</strong></span>
     <span>المجموع: <strong style="color:var(--steel)">${fIQD(tF)}</strong></span>
     <span>المدفوع: <strong style="color:var(--settled)">${fIQD(paidAmt)}</strong></span>
     <span>الباقي: <strong style="color:var(--owing)">${fIQD(tF-paidAmt)}</strong></span>`;
  const list=document.getElementById("wrkRL");
  if(!f.length){list.innerHTML=`<div class="empty-state"><b>لا توجد أجور أعمال</b>سجّل أول أجر من نموذج «أجر عمل جديد» أعلاه.</div>`;return;}
  list.innerHTML=f.map(r=>`
    <div class="rc" style="border-right:4px solid var(--steel)" data-rid="${r.id}">
      <div class="rt">
        <div class="rtl">
          <span class="rpl" style="color:var(--steel)">🔧 ${esc(r.provider)}</span>
          <span class="rdr" style="color:var(--steel)">${esc(r.service)}</span>
          <span class="badge" style="background:var(--ink-200);color:var(--paper-2)">📅 ${tAr(r.dk)}</span>
          ${r.edited?`<span class="badge" style="background:rgba(234,179,8,.15);color:var(--wheat)">✏️ معدّل</span>`:""}
        </div>
        <span style="font-size:18px;font-weight:700;color:var(--steel)">${fIQD(r.amount)}</span>
      </div>
      ${payBarMiniHTML(r)}
      ${r.note?`<div style="font-size:12px;color:var(--paper-2);padding:3px 0">📝 ${esc(r.note)}</div>`:""}
      <div class="rmt">
        <span>📅 ${tAr(r.createdAt)}</span><span>👤 ${esc(r.createdBy)}</span>
        ${r.paidAt?`<span style="color:var(--settled)">💰 ${tAr(r.paidAt)} — ${esc(r.paidBy)}</span>`:""}
        ${r.editAt?`<span style="color:var(--wheat)">✏️ ${tAr(r.editAt)} — ${esc(r.editBy)}</span>`:""}
      </div>
      <div class="rac">
        ${payBtnHTML(r,'wrk')}
        <button class="btn bgh bsm" onclick="openWrkEdit('${r.id}')">✏️ تعديل</button>
        <button class="btn bg bsm" onclick="openWrkPrint('${r.id}')">🖨️ وصل</button>
        <button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openWrkDel('${r.id}')">🗑️</button>
      </div>
    </div>`).join("");
}
function clrWF(){
  ["wfSearch","wfDt"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.getElementById("wfPaid")&&(document.getElementById("wfPaid").value="all");
  renderWrkRecs();
}

/* ── دفع جزئي — توصيل wrk للنظام ── */
function getPayRecWrk(id){return WRK_RECS.find(x=>x.id===id);}

/* ── تعديل ── */
let _weOrigDk=null;
function openWrkEdit(id){
  const r=WRK_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("weId").value=id;
  _weOrigDk=r.dk||toDay();
  document.getElementById("weDk").value=_weOrigDk;
  document.getElementById("weProvider").value=r.provider||"";
  document.getElementById("weService").value=r.service||"";
  setNumIn("weAmount",r.amount||"");
  document.getElementById("weNote").value=r.note||"";
  document.getElementById("mWrkEdit").classList.add("active");
}
function saveWrkEdit(){
  const id=document.getElementById("weId").value;
  const r=WRK_RECS.find(x=>x.id===id);if(!r)return;
  const provider=document.getElementById("weProvider").value.trim();
  const service=document.getElementById("weService").value.trim();
  const amount=numIn("weAmount")||r.amount;
  const note=document.getElementById("weNote").value.trim();
  const weDkNow=document.getElementById("weDk").value;
  const dkVal=weDkNow||_weOrigDk||toDay();
  if(!provider||!service||!amount){showToast("⚠ أكمل البيانات");return;}
  saveWrkRec({...r,provider,service,amount,note,dk:dkVal,edited:true,editAt:nowStr(),editBy:S.cu.name});
  closeM();showToast("✏️ تم تعديل أجر العمل");
}

/* ── حذف ── */
let _wrkDelId=null;
function openWrkDel(id){
  _wrkDelId=id;
  const r=WRK_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("wrkDelTxt").innerHTML=
    `حذف: <strong>${esc(r.provider)}</strong> — ${esc(r.service)}<br><strong style="color:var(--steel)">${fIQD(r.amount)}</strong>`;
  document.getElementById("mWrkDel").classList.add("active");
}
function confirmWrkDel(){
  if(!_wrkDelId)return;
  delWrkRec(_wrkDelId);_wrkDelId=null;closeM();renderWrkRecs();showToast("🗑️ تم الحذف");
}

/* ── طباعة ── */
function openWrkPrint(id){
  const r=WRK_RECS.find(x=>x.id===id);if(!r)return;
  _printHTML=buildWrkReceipt(r);
  _currentRecId=id;_isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent=`🔧 ${esc(r.provider)} — ${esc(r.service)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildWrkReceipt(r){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  let b=sec("بيانات أجر العمل");
  b+=row("📅 التاريخ",tAr(r.dk));
  b+=row("مقدم الخدمة",r.provider);
  b+=row("الخدمة",r.service);
  if(r.note)b+=row("ملاحظة",r.note);
  b+=sec("حالة الدفع");
  b+=row("الحالة",r.paid?"✅ مدفوع كامل":(getPaidTotal(r)>0?"💰 جزئي — متبقي: "+fIQD(getRemaining(r)):"⏳ غير مدفوع"));
  if(r.paidAt)b+=row("تاريخ اكتمال الدفع",tAr(r.paidAt)+" | "+r.paidBy);
  b+=sec("التوقيتات");
  b+=row("تاريخ التسجيل",tAr(r.createdAt)+" | "+r.createdBy);
  if(r.editAt)b+=row("آخر تعديل",tAr(r.editAt)+" | "+r.editBy);
  const paidBanner=r.paid?`<div style="background:#EAF2EB;border:1.5px solid #3F7A4C;border-radius:5px;padding:5px 12px;margin:5px 0;text-align:center;color:#3F7A4C;font-weight:900;font-size:11px;">✅ تم استلام الدفع كاملاً — ${r.paidBy||""} | ${tAr(r.paidAt||"")}</div>`:"";
  const paySection=buildPaymentsSection(r);
  const tot=`${paidBanner}${paySection}<div class="prtot"><span class="pk">أجر العمل</span><span class="pv" style="color:#4A5A68">${fIQD(r.amount)}</span></div>`;
  return`${COHEAD}
    <div class="prh" style="background:#3E4D5A">
      <div class="prhtl">وصل أجر عمل</div>
      <div class="prhmt">${tAr(r.dk||toDay())}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${tot}${COFTR}`;
}

/* ── محصلة أجور العمل ── */
let _curWrkCollTab=1;
function renderWrkCollTab(){showWrkCollTab(_curWrkCollTab||1);}
function showWrkCollTab(n){
  _curWrkCollTab=n;
  [1,2].forEach(i=>{
    const el=document.getElementById("wct"+i);if(el)el.style.display=i===n?"block":"none";
    const btn=document.getElementById("wctb"+i);
    if(btn){btn.style.background=i===n?"var(--steel-rule)":"transparent";btn.style.color=i===n?"#fff":"var(--paper-3)";}
  });
  if(n===2)buildWrkHistoryLists();
}
function getWrkCollData(period,baseDate){
  const base=baseDate||toDay();const bd=_D(base);
  return WRK_RECS.filter(r=>{
    if(!r.dk)return false;
    if(period==="daily")return r.dk===base;
    if(period==="weekly"){const rd=_D(r.dk);const dow=bd.getDay();const sow=_D(bd);sow.setDate(bd.getDate()-((dow+6)%7));const eow=_D(sow);eow.setDate(sow.getDate()+6);return rd>=sow&&rd<=eow;}
    if(period==="monthly")return r.dk.slice(0,7)===base.slice(0,7);
    return false;
  });
}
function buildWrkCollHTML(data,period,dateLabel){
  const PL={daily:"اليومية",weekly:"الأسبوعية",monthly:"الشهرية"};
  const tF=data.reduce((s,r)=>s+(r.amount||0),0);
  const paidAmt=data.reduce((s,r)=>s+getPaidTotal(r),0);
  const rows=data.map((r,i)=>`<tr>
    <td style="width:20px;text-align:center">${AR(i+1)}</td>
    <td style="width:65px">${tAr(r.dk)}</td>
    <td style="width:75px;font-weight:700">${esc(r.provider)}</td>
    <td style="width:90px">${esc(r.service)}</td>
    <td style="width:55px">${esc(r.note||"—")}</td>
    <td style="width:75px;text-align:center;font-weight:700;color:#4A5A68">${fIQD(r.amount)}</td>
    <td style="width:70px;text-align:center;font-size:9px">${r.paid?'<span style="color:#3F7A4C;font-weight:700">✅ مكتمل</span>':getPaidTotal(r)>0?`<span style="color:#8A6218;font-weight:700">💰 ${fIQD(getPaidTotal(r))}</span>`:'<span style="color:#943A31">⏳</span>'}</td>
  </tr>`).join("");
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#3E4D5A;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#67e8f9">محصلة أجور العمل ${PL[period]||period}</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${dateLabel||tAr(toDay())} | ${AR(data.length)} سجل</div>
    </div>
    ${!data.length?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد سجلات في هذه الفترة</div>`:`
    <div style="padding:0 6px 5px">
      <table class="coltbl" style="width:100%;table-layout:auto;font-size:9px">
        <thead><tr><th>#</th><th>التاريخ</th><th>مقدم الخدمة</th><th>الخدمة</th><th>ملاحظة</th><th>المبلغ</th><th>المدفوع</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot">
          <td colspan="5" style="padding:5px 4px;font-weight:700">المجموع</td>
          <td style="text-align:center;font-weight:700;color:#4A5A68">${fIQD(tF)}</td>
          <td style="text-align:center;font-size:8px">${fIQD(paidAmt)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div style="background:#1A1714;padding:12px 14px;margin-top:4px;page-break-before:always">
      <div style="display:flex;gap:0;flex-wrap:wrap">
        ${[["عدد السجلات",AR(data.length),"#67e8f9"],["المجموع",fIQD(tF),"#4A5A68"],["المدفوع",fIQD(paidAmt),"#4E8A5A"],["الباقي",fIQD(tF-paidAmt),"#A8453A"]].map(([k,v,c])=>`<div style="flex:1;min-width:90px;text-align:center;border-left:1px solid #2E2822;padding:8px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
      </div>
    </div>`}
    ${COFTR}
  </div>`;
}
function openWrkColl(period){
  const base=toDay();const data=getWrkCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildWrkCollHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="wrk";
  document.getElementById("pactTitle").textContent=`🔧 أجور العمل ${PL[period]}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🔧 "+AR(data.length)+" سجل — "+fIQD(data.reduce((s,r)=>s+(r.amount||0),0)));
}
function openWrkHistColl(period){
  const base=_getWrkHistBase(period);const data=getWrkCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildWrkCollHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="wrk";
  document.getElementById("pactTitle").textContent=`🔧 أجور العمل ${PL[period]} — ${tAr(base)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🔧 "+AR(data.length)+" سجل");
}
function _getWrkHistBase(period){
  if(period==="daily"){const v=document.getElementById("wrkHistDay")?.value;return v||toDay();}
  if(period==="weekly"){const v=document.getElementById("wrkHistWeek")?.value;return v||toDay();}
  if(period==="monthly"){const v=document.getElementById("wrkHistMonth")?.value;return v?v+"-01":toDay();}
  return toDay();
}
function quickOpenWrkDay(d){document.getElementById("wrkHistDay").value=d;openWrkHistColl("daily");}
function quickOpenWrkWeek(d){document.getElementById("wrkHistWeek").value=d;openWrkHistColl("weekly");}
function quickOpenWrkMonth(ym){document.getElementById("wrkHistMonth").value=ym;openWrkHistColl("monthly");}
function setWrkHistPeriod(p){
  ["daily","weekly","monthly"].forEach(x=>{
    const panel=document.getElementById("whfp"+x.charAt(0).toUpperCase()+x.slice(1));
    if(panel)panel.style.display=x===p?"block":"none";
  });
  const map={daily:1,weekly:2,monthly:3};
  [1,2,3].forEach(i=>{const btn=document.getElementById("whfpb"+i);if(!btn)return;btn.style.background=i===map[p]?"var(--steel-rule)":"transparent";btn.style.color=i===map[p]?"#fff":"var(--paper-3)";});
}
function buildWrkHistoryLists(){
  const days=[...new Set(WRK_RECS.map(r=>r.dk).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const dayEl=document.getElementById("wrkHistDayList");
  if(dayEl)dayEl.innerHTML=!days.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    days.map(d=>{const dayRecs=WRK_RECS.filter(r=>r.dk===d),cnt=dayRecs.length;
      const st=_custPayState('wrk',dayRecs);             // v17.40
      return`<button onclick="quickOpenWrkDay('${d}')" title="${_payTitle(st)}" style="padding:6px 10px;border-radius:8px;border:1px solid ${st==="settled"?'var(--settled)':'var(--steel-rule)'};background:${st==="settled"?'rgba(78,138,90,.12)':'var(--steel-wash)'};color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px"><span style="font-size:10px;color:var(--steel);font-weight:700">${tAr(d)}${_payMark(st)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(cnt)} سجل</span></button>`;}).join("");
  const weekMap={};
  WRK_RECS.forEach(r=>{if(!r.dk)return;const bd=_D(r.dk);const dow=bd.getDay();const mon=_D(bd);mon.setDate(bd.getDate()-((dow+6)%7));const key=_ds(mon);weekMap[key]=(weekMap[key]||0)+1;});
  const weeks=Object.keys(weekMap).sort((a,b)=>b.localeCompare(a));
  const weekEl=document.getElementById("wrkHistWeekList");
  if(weekEl)weekEl.innerHTML=!weeks.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    weeks.map(w=>{const endD=_D(w);endD.setDate(endD.getDate()+6);const endS=_ds(endD);
      return`<button onclick="quickOpenWrkWeek('${w}')" style="padding:6px 10px;border-radius:8px;border:1px solid var(--steel-rule);background:var(--steel-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:110px"><span style="font-size:10px;color:var(--steel);font-weight:700">${tAr(w)} ← ${tAr(endS)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(weekMap[w])} سجل</span></button>`;}).join("");
  const monthMap={};
  WRK_RECS.forEach(r=>{if(!r.dk)return;const key=r.dk.slice(0,7);monthMap[key]=(monthMap[key]||0)+1;});
  const months=Object.keys(monthMap).sort((a,b)=>b.localeCompare(a));
  const monthEl=document.getElementById("wrkHistMonthList");
  const mNames=["","يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  if(monthEl)monthEl.innerHTML=!months.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    months.map(m=>{const [yr,mn]=m.split("-");
      return`<button onclick="quickOpenWrkMonth('${m}')" style="padding:8px 12px;border-radius:8px;border:1px solid var(--steel-rule);background:var(--steel-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:90px"><span style="font-size:11px;color:var(--steel);font-weight:700">${mNames[+mn]||mn} ${tAr(yr)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(monthMap[m])} سجل</span></button>`;}).join("");
}

