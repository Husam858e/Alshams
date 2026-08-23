/* ══════════════════════════════════════════════════════
   قسم مخزن أربيل — أوزان فقط بدون أسعار
══════════════════════════════════════════════════════ */
let ARB_RECS=[];
let dbRefArb=null;

function loadArbCache(){
  try{const c=localStorage.getItem("wShamsArbCache");if(c)ARB_RECS=JSON.parse(c).sort(_byDkDesc);}catch(e){}
}
function saveArbRec(r){
  _fbWrite("arb_records",r.id,r,safe=>{
    const idx=ARB_RECS.findIndex(x=>x.id===r.id);
    if(idx>=0)ARB_RECS[idx]=safe; else ARB_RECS.unshift(safe);
    ARB_RECS.sort(_byDkDesc);   // v17.39 — تعديل التاريخ ينقل الوصل ليومه فوراً
    try{localStorage.setItem("wShamsArbCache",JSON.stringify(ARB_RECS));}catch(e){}
  });
  if(_tabActive("arb-recs"))_scheduleRender(renderArbRecs);
}
function delArbRec(id){
  _toTrash("arb",ARB_RECS.find(r=>r.id===id));
  _fbWrite("arb_records",id,null,()=>{
    ARB_RECS=ARB_RECS.filter(r=>r.id!==id);
    try{localStorage.setItem("wShamsArbCache",JSON.stringify(ARB_RECS));}catch(e){}
  });
}

/* ── فورم وزن جديد ── */
function arbCalcPreview(){
  const g=numIn("arbGross")||0;
  const e=numIn("arbEmpty")||0;
  const el=document.getElementById("arbCalcPreview");
  if(!el)return;
  el.textContent=(g>0&&e>0&&g>e)?`الوزن الصافي: ${fKG(g-e)}`:(g>0&&e>0&&g<=e?"⚠ الوزن الفارغ يجب أن يكون أصغر من الكلي":"");
}
function submitArbRec(){
  const farmer=(document.getElementById("arbFarmer")?.value||"").trim();
  const gross=numIn("arbGross")||0;
  const empty=numIn("arbEmpty")||0;
  const note=(document.getElementById("arbNote")?.value||"").trim();
  if(!farmer){showToast("⚠ أدخل اسم الفلاح");return;}
  if(!gross||gross<=0){showToast("⚠ أدخل الوزن الكلي");return;}
  if(!empty||empty<=0){showToast("⚠ أدخل الوزن الفارغ");return;}
  if(empty>=gross){showToast("⚠ الوزن الفارغ يجب أن يكون أصغر من الكلي");return;}
  const net=gross-empty;
  const r={id:genId(),seq:Date.now(),farmer,gross,empty,net,note,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:S.cu.name,dk:toDay()};
  saveArbRec(r);
  clrArbForm();
  document.querySelectorAll(".tbb").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tc").forEach(c=>c.classList.remove("active"));
  const btn=document.getElementById("arbRecsTabBtn");
  if(btn)btn.classList.add("active");
  document.getElementById("tc-arb-recs")?.classList.add("active");
  renderArbRecs();
  showToast("✅ تم حفظ وزن أربيل — "+farmer+" | "+fKG(net));
}
function clrArbForm(){
  ["arbFarmer","arbGross","arbEmpty","arbNote"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  const el=document.getElementById("arbCalcPreview");if(el)el.textContent="";
}

/* ── عرض السجل ── */
function renderArbRecs(){
  if(!S.cu)return;
  const srch=(document.getElementById("arbSearch")?.value||"").toLowerCase();
  const df=document.getElementById("arbDt")?.value||"";
  let f=ARB_RECS.filter(r=>{
    if(df&&r.dk!==df)return false;
    if(srch&&!smartMatch(r.farmer,srch))return false;
    return true;
  });
  const tGross=f.reduce((s,r)=>s+(r.gross||0),0);
  const tEmpty=f.reduce((s,r)=>s+(r.empty||0),0);
  const tNet=f.reduce((s,r)=>s+(r.net||0),0);
  document.getElementById("arbFSm").innerHTML=
    `<span>الوصولات: <strong>${AR(f.length)}</strong></span>
     <span>الوزن الكلي: <strong>${fKG(tGross)}</strong></span>
     <span>الوزن الفارغ: <strong>${fKG(tEmpty)}</strong></span>
     <span>الصافي: <strong style="color:var(--steel)">${fKG(tNet)}</strong></span>`;
  const list=document.getElementById("arbRL");
  if(!f.length){list.innerHTML=`<div class="empty-state"><b>لا توجد أوزان في مخزن أربيل</b>سجّل أول وزن من نموذج «مخزن أربيل».</div>`;return;}
  list.innerHTML=f.map(r=>`
    <div class="rc" style="border-right:4px solid var(--steel)" data-rid="${r.id}">
      <div class="rt">
        <div class="rtl">
          <span class="rpl" style="color:var(--steel)">👤 ${esc(r.farmer)}</span>
          <span class="badge" style="background:var(--ink-200);color:var(--paper-2)">📅 ${tAr(r.dk)}</span>
          ${r.edited?`<span class="badge" style="background:rgba(234,179,8,.15);color:var(--wheat)">✏️ معدّل</span>`:""}
        </div>
      </div>
      <div class="rw">
        <div class="rwi"><span class="rwk">الكلي</span><span class="rwv">${fKG(r.gross)}</span></div><span class="rws">−</span>
        <div class="rwi"><span class="rwk">الفارغ</span><span class="rwv">${fKG(r.empty)}</span></div><span class="rws">=</span>
        <div class="rwi fa"><span class="rwk">الصافي</span><span class="rwv" style="color:var(--steel);font-size:12px">${fKG(r.net)}</span></div>
      </div>
      ${r.note?`<div style="font-size:12px;color:var(--paper-2);padding:3px 0">📝 ${esc(r.note)}</div>`:""}
      <div class="rmt">
        <span>📅 ${tAr(r.createdAt)}</span><span>👤 ${esc(r.createdBy)}</span>
        ${r.editAt?`<span style="color:var(--wheat)">✏️ ${tAr(r.editAt)} — ${esc(r.editBy)}</span>`:""}
      </div>
      <div class="rac">
        <button class="btn bgh bsm" onclick="openArbEdit('${r.id}')">✏️ تعديل</button>
        <button class="btn bg bsm" onclick="openArbPrint('${r.id}')">🖨️ وصل</button>
        <button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openArbDel('${r.id}')">🗑️</button>
      </div>
    </div>`).join("");
}
function clrArbF(){
  ["arbSearch","arbDt"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  renderArbRecs();
}

/* ── تعديل ── */
let _areOrigDk=null;
function openArbEdit(id){
  const r=ARB_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("areId").value=id;
  _areOrigDk=r.dk||toDay();
  document.getElementById("areDk").value=_areOrigDk;
  document.getElementById("areFarmer").value=r.farmer||"";
  setNumIn("areGross",r.gross||"");
  setNumIn("areEmpty",r.empty||"");
  document.getElementById("areNote").value=r.note||"";
  document.getElementById("mArbEdit").classList.add("active");
}
function saveArbEdit(){
  const id=document.getElementById("areId").value;
  const r=ARB_RECS.find(x=>x.id===id);if(!r)return;
  const farmer=document.getElementById("areFarmer").value.trim();
  const gross=numIn("areGross")||r.gross;
  const empty=numIn("areEmpty")||r.empty;
  const note=document.getElementById("areNote").value.trim();
  const areDkNow=document.getElementById("areDk").value;
  const dkVal=areDkNow||_areOrigDk||toDay();
  if(!farmer||!gross||!empty){showToast("⚠ أكمل البيانات");return;}
  if(empty>=gross){showToast("⚠ الوزن الفارغ يجب أن يكون أصغر من الكلي");return;}
  const net=gross-empty;
  saveArbRec({...r,farmer,gross,empty,net,note,dk:dkVal,edited:true,editAt:nowStr(),editBy:S.cu.name});
  closeM();showToast("✏️ تم تعديل السجل");
}

/* ── حذف ── */
let _arbDelId=null;
function openArbDel(id){
  _arbDelId=id;
  const r=ARB_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("arbDelTxt").innerHTML=`حذف سجل: <strong>${esc(r.farmer)}</strong> — الصافي: <strong style="color:var(--steel)">${fKG(r.net)}</strong>`;
  document.getElementById("mArbDel").classList.add("active");
}
function confirmArbDel(){
  if(!_arbDelId)return;
  delArbRec(_arbDelId);_arbDelId=null;closeM();renderArbRecs();showToast("🗑️ تم الحذف");
}

/* ── طباعة ── */
function openArbPrint(id){
  const r=ARB_RECS.find(x=>x.id===id);if(!r)return;
  _printHTML=buildArbReceipt(r);_isCollScreen=false;
  document.getElementById("pactTitle").textContent=`🏬 ${esc(r.farmer)} — مخزن أربيل`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildArbReceipt(r){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  let b=sec("بيانات الوزن — مخزن أربيل");
  b+=row("📅 التاريخ",tAr(r.dk));
  b+=row("الفلاح",r.farmer);
  if(r.note)b+=row("📝 ملاحظة",r.note);
  b+=sec("مراحل الوزن");
  b+=row("① الوزن الكلي",fKG(r.gross));
  b+=row("② الوزن الفارغ",fKG(r.empty));
  b+=row("③ الوزن الصافي",fKG(r.net));
  b+=sec("التوقيتات");
  b+=row("تاريخ التسجيل",tAr(r.createdAt)+" | "+r.createdBy);
  if(r.editAt)b+=row("آخر تعديل",tAr(r.editAt)+" | "+r.editBy);
  const tot=`<div class="prtot"><span class="pk">الوزن الصافي</span><span class="pv">${fKG(r.net)}</span></div>`;
  return`${COHEAD}
    <div class="prh" style="background:#3E4D5A">
      <div class="prhtl">وصل وزن — مخزن أربيل</div>
      <div class="prhmt">${tAr(r.dk||toDay())}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${tot}${COFTR}`;
}

/* ── محصلة مخزن أربيل ── */
let _curArbCollTab=1;
function renderArbCollTab(){showArbCollTab(_curArbCollTab||1);}
function showArbCollTab(n){
  _curArbCollTab=n;
  [1,2].forEach(i=>{
    const el=document.getElementById("arct"+i);if(el)el.style.display=i===n?"block":"none";
    const btn=document.getElementById("arctb"+i);
    if(btn){btn.style.background=i===n?"var(--steel)":"transparent";btn.style.color=i===n?"#fff":"var(--paper-3)";}
  });
  if(n===2)buildArbHistoryLists();
}
function getArbCollData(period,baseDate){
  const base=baseDate||toDay();const bd=_D(base);
  return ARB_RECS.filter(r=>{
    if(!r.dk)return false;
    if(period==="daily")return r.dk===base;
    if(period==="weekly"){const rd=_D(r.dk);const dow=bd.getDay();const sow=_D(bd);sow.setDate(bd.getDate()-((dow+6)%7));const eow=_D(sow);eow.setDate(sow.getDate()+6);return rd>=sow&&rd<=eow;}
    if(period==="monthly")return r.dk.slice(0,7)===base.slice(0,7);
    return false;
  });
}
function buildArbCollHTML(data,period,dateLabel){
  const PL={daily:"اليومية",weekly:"الأسبوعية",monthly:"الشهرية",range:"بنطاق مخصص"};
  const tGross=data.reduce((s,r)=>s+(r.gross||0),0);
  const tEmpty=data.reduce((s,r)=>s+(r.empty||0),0);
  const tNet=data.reduce((s,r)=>s+(r.net||0),0);
  const rows=data.map((r,i)=>`<tr>
    <td style="width:20px;text-align:center">${AR(i+1)}</td>
    <td style="width:65px">${tAr(r.dk)}</td>
    <td style="width:110px;font-weight:700">${esc(r.farmer)}</td>
    <td style="width:70px;text-align:center">${fKG(r.gross)}</td>
    <td style="width:70px;text-align:center">${fKG(r.empty)}</td>
    <td style="width:70px;text-align:center;font-weight:700;color:#3E4D5A">${fKG(r.net)}</td>
    <td style="width:90px">${esc(r.note||"—")}</td>
  </tr>`).join("");
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#3E4D5A;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#8A9AA8">محصلة مخزن أربيل ${PL[period]||period}</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${dateLabel||tAr(toDay())} | ${AR(data.length)} وصل</div>
    </div>
    ${!data.length?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد سجلات في هذه الفترة</div>`:`
    <div style="padding:0 6px 5px">
      <table class="coltbl" style="width:100%;table-layout:auto;font-size:9px">
        <thead><tr><th>#</th><th>التاريخ</th><th>الفلاح</th><th>الكلي</th><th>الفارغ</th><th>الصافي</th><th>ملاحظة</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot">
          <td colspan="3" style="padding:5px 4px;font-weight:700">المجموع</td>
          <td style="text-align:center;font-weight:700">${fKG(tGross)}</td>
          <td style="text-align:center;font-weight:700">${fKG(tEmpty)}</td>
          <td style="text-align:center;font-weight:700;color:#3E4D5A">${fKG(tNet)}</td>
          <td></td>
        </tr></tfoot>
      </table>
    </div>
    <div style="background:#1A1714;padding:12px 14px;margin-top:4px;page-break-before:always">
      <div style="display:flex;gap:0;flex-wrap:wrap">
        ${[["عدد الوصولات",AR(data.length),"#8A9AA8"],["الوزن الكلي",fKG(tGross),"#6B6151"],["الوزن الفارغ",fKG(tEmpty),"#6B6151"],["الوزن الصافي",fKG(tNet),"#4A5A68"]].map(([k,v,c])=>`<div style="flex:1;min-width:90px;text-align:center;border-left:1px solid #2E2822;padding:8px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
      </div>
    </div>`}
    ${COFTR}
  </div>`;
}
function openArbColl(period){
  const base=toDay();const data=getArbCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildArbCollHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="arb";
  document.getElementById("pactTitle").textContent=`🏬 محصلة أربيل ${PL[period]}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🏬 "+AR(data.length)+" وصل");
}
function openArbHistColl(period){
  const base=_getArbHistBase(period);const data=getArbCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildArbCollHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="arb";
  document.getElementById("pactTitle").textContent=`🏬 محصلة أربيل ${PL[period]} — ${tAr(base)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🏬 "+AR(data.length)+" وصل");
}
function _getArbHistBase(period){
  if(period==="daily"){const v=document.getElementById("arbHistDay")?.value;return v||toDay();}
  if(period==="weekly"){const v=document.getElementById("arbHistWeek")?.value;return v||toDay();}
  if(period==="monthly"){const v=document.getElementById("arbHistMonth")?.value;return v?v+"-01":toDay();}
  return toDay();
}
function quickOpenArbDay(d){document.getElementById("arbHistDay").value=d;openArbHistColl("daily");}
function quickOpenArbWeek(d){document.getElementById("arbHistWeek").value=d;openArbHistColl("weekly");}
function quickOpenArbMonth(ym){document.getElementById("arbHistMonth").value=ym;openArbHistColl("monthly");}
function setArbHistPeriod(p){
  ["daily","weekly","monthly"].forEach(x=>{
    const panel=document.getElementById("ahp"+x.charAt(0).toUpperCase()+x.slice(1));
    if(panel)panel.style.display=x===p?"block":"none";
  });
  const map={daily:1,weekly:2,monthly:3};
  [1,2,3].forEach(i=>{const btn=document.getElementById("ahpb"+i);if(!btn)return;btn.style.background=i===map[p]?"var(--steel)":"transparent";btn.style.color=i===map[p]?"#fff":"var(--paper-3)";});
}
function buildArbHistoryLists(){
  const days=[...new Set(ARB_RECS.map(r=>r.dk).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  const dayEl=document.getElementById("arbHistDayList");
  if(dayEl)dayEl.innerHTML=!days.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    days.map(d=>{const cnt=ARB_RECS.filter(r=>r.dk===d).length;
      return`<button onclick="quickOpenArbDay('${d}')" style="padding:6px 10px;border-radius:8px;border:1px solid #0369a144;background:var(--steel-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px"><span style="font-size:10px;color:var(--steel);font-weight:700">${tAr(d)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(cnt)} وصل</span></button>`;}).join("");
  const weekMap={};
  ARB_RECS.forEach(r=>{if(!r.dk)return;const bd=_D(r.dk);const dow=bd.getDay();const mon=_D(bd);mon.setDate(bd.getDate()-((dow+6)%7));const key=_ds(mon);weekMap[key]=(weekMap[key]||0)+1;});
  const weeks=Object.keys(weekMap).sort((a,b)=>b.localeCompare(a));
  const weekEl=document.getElementById("arbHistWeekList");
  if(weekEl)weekEl.innerHTML=!weeks.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    weeks.map(w=>{const endD=_D(w);endD.setDate(endD.getDate()+6);const endS=_ds(endD);
      return`<button onclick="quickOpenArbWeek('${w}')" style="padding:6px 10px;border-radius:8px;border:1px solid #0369a144;background:var(--steel-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:110px"><span style="font-size:10px;color:var(--steel);font-weight:700">${tAr(w)} ← ${tAr(endS)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(weekMap[w])} وصل</span></button>`;}).join("");
  const monthMap={};
  ARB_RECS.forEach(r=>{if(!r.dk)return;const key=r.dk.slice(0,7);monthMap[key]=(monthMap[key]||0)+1;});
  const months=Object.keys(monthMap).sort((a,b)=>b.localeCompare(a));
  const monthEl=document.getElementById("arbHistMonthList");
  const mNames=["","يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  if(monthEl)monthEl.innerHTML=!months.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
    months.map(m=>{const [yr,mn]=m.split("-");
      return`<button onclick="quickOpenArbMonth('${m}')" style="padding:8px 12px;border-radius:8px;border:1px solid #0369a144;background:var(--steel-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:90px"><span style="font-size:11px;color:var(--steel);font-weight:700">${mNames[+mn]||mn} ${tAr(yr)}</span><span style="font-size:9px;color:var(--paper-3)">${AR(monthMap[m])} وصل</span></button>`;}).join("");
}

/* ── نطاق تاريخ مخصص لمحصلة أربيل ── */
function openArbRange(){
  const{from,to}=getDRP("arb");
  if(!from&&!to){showToast("⚠ اختر تاريخ البداية أو النهاية");return;}
  const recs=filterByRange(ARB_RECS,from,to);
  const label=(from?tAr(from):"البداية")+" → "+(to?tAr(to):"النهاية");
  const html=buildArbCollHTML(recs,"range",label);
  _printHTML=html;_isCollScreen=false;
  document.getElementById("pactTitle").textContent=`🏬 محصلة أربيل نطاق — ${label}`;
  document.getElementById("PC").innerHTML=html;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  const r=document.getElementById("drp_result_arb");
  if(r)r.textContent=`✅ ${AR(recs.length)} وصل في هذه الفترة`;
}
function shareArbRange(){
  const{from,to}=getDRP("arb");
  if(!from&&!to){showToast("⚠ اختر تاريخاً");return;}
  const recs=filterByRange(ARB_RECS,from,to);
  const label=(from?tAr(from):"البداية")+" → "+(to?tAr(to):"النهاية");
  const html=buildArbCollHTML(recs,"range",label);
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,`محصلة_أربيل_نطاق_${from||"البداية"}_${to||"النهاية"}.html`);
  const r=document.getElementById("drp_result_arb");
  if(r)r.textContent=`✅ ${AR(recs.length)} وصل في هذه الفترة`;
}

/* ── سجل جامع — مخزن أربيل (أوزان فقط بدون أسعار) ── */
function _arbJamiAggregate(entries){
  const map={};
  entries.forEach(e=>{
    const key=nameKey(e.name)||"_بدون_اسم_";
    if(!map[key])map[key]={variants:{},count:0,gross:0,empty:0,net:0};
    const m=map[key];
    m.variants[e.name]=(m.variants[e.name]||0)+1;
    m.count++;m.gross+=e.gross;m.empty+=e.empty;m.net+=e.net;
  });
  const result=Object.values(map).map(m=>{
    let bestName="",bestCount=-1;
    Object.entries(m.variants).forEach(([nm,c])=>{if(c>bestCount){bestCount=c;bestName=nm;}});
    return{name:bestName||"(بدون اسم)",count:m.count,gross:m.gross,empty:m.empty,net:m.net};
  });
  result.sort((a,b)=>b.net-a.net);
  return result;
}
function getArbJamiData(period,baseDate){
  const base=baseDate||toDay();
  const entries=ARB_RECS.filter(r=>_jamiInPeriod(r.dk,period,base)).map(r=>({name:_jamiCleanName(r.farmer)||"(بدون اسم)",gross:r.gross||0,empty:r.empty||0,net:r.net||0}));
  return _arbJamiAggregate(entries);
}
function getArbJamiDataRange(from,to){
  const entries=ARB_RECS.filter(r=>_jamiInRange(r.dk,from,to)).map(r=>({name:_jamiCleanName(r.farmer)||"(بدون اسم)",gross:r.gross||0,empty:r.empty||0,net:r.net||0}));
  return _arbJamiAggregate(entries);
}
function _getArbJamiFiltered(){
  const base=document.getElementById("jamiDt_arb")?.value||toDay();
  const srch=(document.getElementById("jamiSearch_arb")?.value||"").trim();
  let data=getArbJamiData(_jamiPeriod.arb||"daily",base);
  if(srch)data=data.filter(x=>smartMatch(x.name,srch));
  return{data,base};
}
function sArbJamiPeriod(p,btn){
  _jamiPeriod.arb=p;
  document.querySelectorAll("#tc-jami-arb .ptb").forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  renderArbJami();
}
function renderArbJami(){
  if(!S.cu)return;
  const{data}=_getArbJamiFiltered();
  const fEl=document.getElementById("jamiFSm_arb");
  const tEl=document.getElementById("jamiTable_arb");
  if(!tEl)return;
  if(!data.length){
    tEl.innerHTML=`<div style="text-align:center;color:var(--paper-3);padding:28px;font-size:13px">📭 لا توجد بيانات لهذه الفترة</div>`;
    if(fEl)fEl.innerHTML="";
    return;
  }
  const tCount=data.reduce((s,x)=>s+x.count,0);
  const tGross=data.reduce((s,x)=>s+x.gross,0);
  const tEmpty=data.reduce((s,x)=>s+x.empty,0);
  const tNet=data.reduce((s,x)=>s+x.net,0);
  if(fEl)fEl.innerHTML=
    `<span>عدد الأشخاص: <strong>${AR(data.length)}</strong></span>
     <span>إجمالي الوصولات: <strong>${AR(tCount)}</strong></span>
     <span>الوزن الصافي: <strong style="color:var(--steel)">${fKG(tNet)}</strong></span>`;
  const rows=data.map((x,i)=>`<tr>
    <td>${AR(i+1)}</td>
    <td style="font-weight:700">${esc(x.name)}</td>
    <td>${AR(x.count)}</td>
    <td>${fKG(x.gross)}</td>
    <td>${fKG(x.empty)}</td>
    <td style="font-weight:900;color:var(--steel)">${fKG(x.net)}</td>
  </tr>`).join("");
  tEl.innerHTML=`<table class="rtbl"><thead><tr>
    <th>#</th><th>اسم الفلاح</th><th>عدد الوصولات</th><th>الوزن الكلي</th><th>الوزن الفارغ</th><th>الوزن الصافي</th>
  </tr></thead><tbody>${rows}</tbody>
  <tfoot><tr class="tot">
    <td colspan="2">الإجمالي (${AR(data.length)} شخص)</td>
    <td>${AR(tCount)}</td><td>${fKG(tGross)}</td><td>${fKG(tEmpty)}</td><td>${fKG(tNet)}</td>
  </tr></tfoot></table>`;
}
function buildArbJamiHTML(data,period,dateLabel){
  const PL={daily:"اليومي",weekly:"الأسبوعي",monthly:"الشهري",range:"بنطاق مخصص"};
  const col="#3E4D5A";
  const tCount=data.reduce((s,x)=>s+x.count,0);
  const tGross=data.reduce((s,x)=>s+x.gross,0);
  const tEmpty=data.reduce((s,x)=>s+x.empty,0);
  const tNet=data.reduce((s,x)=>s+x.net,0);
  const rows=data.map((x,i)=>`<tr>
    <td style="width:20px;text-align:center">${AR(i+1)}</td>
    <td style="width:110px;font-weight:700">${esc(x.name)}</td>
    <td style="width:55px;text-align:center">${AR(x.count)}</td>
    <td style="width:65px;text-align:center">${fKG(x.gross)}</td>
    <td style="width:65px;text-align:center">${fKG(x.empty)}</td>
    <td style="width:70px;text-align:center;font-weight:700;color:#3E4D5A">${fKG(x.net)}</td>
  </tr>`).join("");
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#2E2822;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:${col}">📒 سجل جامع مخزن أربيل ${PL[period]||period} — محصلة الفلاحين</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${dateLabel} | ${AR(data.length)} شخص</div>
    </div>
    ${!data.length?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد بيانات في هذه الفترة</div>`:`
    <div style="padding:0 6px 5px">
      <table class="coltbl" style="width:100%;table-layout:auto;font-size:9px">
        <thead><tr>
          <th style="width:20px">#</th><th style="width:110px">اسم الفلاح</th><th style="width:55px">الوصولات</th>
          <th style="width:65px">الكلي</th><th style="width:65px">الفارغ</th><th style="width:70px">الصافي</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot">
          <td colspan="2" style="font-weight:700;padding:5px 4px">المجموع</td>
          <td style="text-align:center">${AR(tCount)}</td>
          <td style="text-align:center">${fKG(tGross)}</td>
          <td style="text-align:center">${fKG(tEmpty)}</td>
          <td style="text-align:center;font-weight:700">${fKG(tNet)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div style="background:#1A1714;padding:12px 14px;margin-top:4px">
      <div style="display:flex;gap:0;flex-wrap:wrap">
        ${[["عدد الأشخاص",AR(data.length),col],["إجمالي الوصولات",AR(tCount),"#B37D14"],["الوزن الكلي",fKG(tGross),"#6B6151"],["الوزن الفارغ",fKG(tEmpty),"#6B6151"],["الوزن الصافي",fKG(tNet),"#4A5A68"]].map(([k,v,c])=>`<div style="flex:1;min-width:85px;text-align:center;border-left:1px solid #2E2822;padding:8px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
      </div>
    </div>`}
    ${COFTR}
  </div>`;
}
function openArbJamiPrint(){
  const{data,base}=_getArbJamiFiltered();
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const period=_jamiPeriod.arb||"daily";
  _printHTML=buildArbJamiHTML(data,period,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="jami-arb";
  document.getElementById("pactTitle").textContent=`📒 سجل جامع أربيل ${PL[period]} — ${tAr(base)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("📒 "+AR(data.length)+" شخص");
}
function doShareArbJami(){
  const{data,base}=_getArbJamiFiltered();
  const period=_jamiPeriod.arb||"daily";
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const html=buildArbJamiHTML(data,period,tAr(base));
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,`سجل_جامع_أربيل_${PL[period]}_${base}.html`);
}
function openArbJamiRange(){
  const{from,to}=getDRP("jami_arb");
  if(!from&&!to){showToast("⚠ اختر تاريخ البداية أو النهاية");return;}
  const srch=(document.getElementById("jamiSearch_arb")?.value||"").trim();
  let data=getArbJamiDataRange(from,to);
  if(srch)data=data.filter(x=>smartMatch(x.name,srch));
  const label=(from?tAr(from):"البداية")+" → "+(to?tAr(to):"النهاية");
  const html=buildArbJamiHTML(data,"range",label);
  _printHTML=html;_isCollScreen=true;_currentCollPeriod="range";_currentCollWH="jami-arb";
  document.getElementById("pactTitle").textContent=`📒 سجل جامع أربيل — ${label}`;
  document.getElementById("PC").innerHTML=html;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  const r=document.getElementById("drp_result_jami_arb");
  if(r)r.textContent=`✅ ${AR(data.length)} شخص في هذه الفترة`;
}

