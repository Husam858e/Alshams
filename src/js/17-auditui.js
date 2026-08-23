/* ══════════════════════════════════════════════════════════════
   شاشة سجلّ التدقيق — v17.50
   تبحث بالاسم أو رقم العجلة أو المستخدم، وتُصفّي بالنوع والمدة،
   وتعرض لكل قيد ما تغيّر بالضبط: من أي قيمة إلى أي قيمة.
══════════════════════════════════════════════════════════════ */
let _auditFilter={q:"",action:"all",kind:"all",from:"",to:""};

const _AUDIT_ACTION={
  create:{t:"إنشاء",  i:"➕", c:"var(--settled)"},
  edit  :{t:"تعديل",  i:"✏️", c:"var(--pending)"},
  pay   :{t:"دفعة",   i:"💰", c:"var(--wheat)"},
  delete:{t:"حذف",    i:"🗑️", c:"var(--owing)"},
  close :{t:"إغلاق",  i:"🔒", c:"var(--steel)"},
  reopen:{t:"فتح",    i:"🔓", c:"var(--owing)"},
};
const _auditKindLabel=k=>{
  const d=(_DATASETS||[]).find(x=>x.k===k);
  return d?(d.icon+" "+d.label):(k==="closure"?"🔒 إغلاق فترة":k);
};

function _auditSetFilter(){
  _auditFilter.q=(document.getElementById("auditQ")?.value||"").trim();
  _auditFilter.action=document.getElementById("auditAction")?.value||"all";
  _auditFilter.kind=document.getElementById("auditKind")?.value||"all";
  _auditFilter.from=document.getElementById("auditFrom")?.value||"";
  _auditFilter.to=document.getElementById("auditTo")?.value||"";
  renderAuditTab();
}
function _auditClearFilter(){
  ["auditQ","auditFrom","auditTo"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});
  ["auditAction","auditKind"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="all";});
  _auditFilter={q:"",action:"all",kind:"all",from:"",to:""};
  renderAuditTab();
}

function _auditFiltered(){
  const F=_auditFilter;
  return (AUDIT||[]).filter(e=>{
    if(!e)return false;
    if(F.action!=="all"&&e.action!==F.action)return false;
    if(F.kind!=="all"&&e.kind!==F.kind)return false;
    const d=String(e.at||"").slice(0,10);
    if(F.from&&d<F.from)return false;
    if(F.to&&d>F.to)return false;
    if(F.q){
      const hay=[e.subject,e.by,e.recId,_auditKindLabel(e.kind)].join(" ");
      if(!smartMatch(hay,F.q))return false;
    }
    return true;
  });
}

/* سطر التغيير الواحد: الحقل — من ← إلى */
function _auditChangeHTML(c){
  const nm=esc(_auditFieldName(c.f));
  if(c.money){
    const diff=(c.to||0)-(c.from||0);
    const sign=diff>0?"+":"";
    return `<div style="font-size:10px;color:var(--paper-2)">
      💵 ${nm}: <strong style="color:${diff>0?"var(--settled)":"var(--owing)"}">${sign}${fIQD(Math.abs(diff))}</strong>
      <span style="color:var(--paper-4)">(${fIQD(c.from||0)} ← ${fIQD(c.to||0)})</span></div>`;
  }
  if(c.obj)return `<div style="font-size:10px;color:var(--paper-3)">🧩 ${nm}: تغيّرت التفاصيل</div>`;
  /* v17.50 — الأرقام تُعرض بالعربية وبفواصل الآلاف كبقية التطبيق،
     فيُقرأ «٣٬٢١٠٬٠٠٠ ← ٣٬٠٠٠٬٠٠٠» لا «3210000 ← 3000000». */
  const fv=v=>{
    if(v===null||v===undefined||v==="")return "—";
    if(typeof v==="boolean")return v?"نعم":"لا";
    if(typeof v==="number"&&isFinite(v))
      return AR(Math.abs(v)>=1000?Math.round(v).toLocaleString("en"):String(v));
    return escAr(v);
  };
  return `<div style="font-size:10px;color:var(--paper-2)">
    ${nm}: <span style="color:var(--owing);text-decoration:line-through">${fv(c.from)}</span>
    <span style="color:var(--paper-4)">←</span>
    <span style="color:var(--settled);font-weight:700">${fv(c.to)}</span></div>`;
}

function renderAuditTab(){
  const box=document.getElementById("auditRes");
  if(!box)return;
  _renderClosuresBox();
  const rows=_auditFiltered();
  const head=`<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;
      background:var(--ink-200);border-radius:9px;padding:8px 11px;font-size:11px;margin-bottom:8px">
    <span style="color:var(--paper-2)">القيود المعروضة: <strong style="color:var(--wheat-hi)">${AR(rows.length)}</strong></span>
    <span style="color:var(--paper-2)">المحفوظة على الجهاز: <strong style="color:var(--paper)">${AR((AUDIT||[]).length)}</strong></span>
  </div>`;
  if(!rows.length){
    box.innerHTML=head+`<div style="text-align:center;color:var(--paper-4);padding:24px;font-size:12px">
      ${(AUDIT||[]).length?"لا قيود تطابق البحث":"📜 لم يُسجَّل أي تغيير بعد — سيظهر هنا كل إنشاء وتعديل وحذف ودفعة"}</div>`;
    return;
  }
  box.innerHTML=head+rows.slice(0,300).map(e=>{
    const A=_AUDIT_ACTION[e.action]||{t:e.action,i:"•",c:"var(--paper-3)"};
    const ch=(e.changes||[]).slice(0,8).map(_auditChangeHTML).join("");
    const more=(e.changes||[]).length>8?`<div style="font-size:10px;color:var(--paper-4)">…و${AR(e.changes.length-8)} تغييراً آخر</div>`:"";
    return `<div style="background:var(--ink-100);border:1px solid var(--rule);border-right:3px solid ${A.c};
        border-radius:9px;padding:8px 10px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:4px">
        <span style="font-size:12px;font-weight:700;color:${A.c}">${A.i} ${esc(A.t)}</span>
        <span style="font-size:10px;color:var(--paper-3)">${tAr(esc(e.at||""))}</span>
      </div>
      <div style="font-size:11px;color:var(--paper);margin-bottom:3px">
        ${esc(_auditKindLabel(e.kind))} — <strong>${esc(e.subject||e.recId||"")}</strong>
      </div>
      <div style="font-size:10px;color:var(--paper-3);margin-bottom:4px">👤 ${esc(e.by||"—")}${e.dk?" · 📅 "+tAr(esc(e.dk)):""}</div>
      ${ch}${more}
    </div>`;}).join("")
    +(rows.length>300?`<div style="text-align:center;font-size:10px;color:var(--paper-3);padding:6px">…و${AR(rows.length-300)} قيداً آخر — ضيّق البحث لرؤيتها</div>`:"");
}

/* صندوق الفترات المغلقة */
function _renderClosuresBox(){
  const el=document.getElementById("closuresBox");
  if(!el)return;
  const list=(CLOSURES||[]).filter(c=>c&&c.open!==true)
    .sort((a,b)=>String(b.month||"").localeCompare(String(a.month||"")));
  el.innerHTML=list.length?list.map(c=>`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;
        background:var(--steel-wash);border:1px solid var(--steel-rule);border-radius:8px;
        padding:7px 9px;margin-bottom:5px;font-size:11px">
      <div style="flex:1;min-width:0">
        <div style="color:var(--steel);font-weight:700">🔒 ${esc(_closureLabel(c.month))}</div>
        <div style="color:var(--paper-3);font-size:10px">
          ${tAr(esc(c.closedAt||""))} · ${esc(c.closedBy||"—")}
          ${c.totals?` · ${AR(c.totals.count)} سجل · ${fIQD(c.totals.amount)}`:""}</div>
      </div>
      <button class="btn bsm" style="background:var(--owing-rule);color:var(--owing)"
        onclick="reopenMonth('${esc(c.month)}')">🔓 فتح</button>
    </div>`).join("")
    :`<div style="font-size:11px;color:var(--paper-4);padding:10px;text-align:center">لا توجد فترات مغلقة</div>`;
}

/* تاريخ سجلّ بعينه — يُفتح من بطاقة الوصل */
function openRecHistory(recId,label){
  const rows=(AUDIT||[]).filter(e=>e&&e.recId===recId);
  const el=document.getElementById("mPartialPay");
  if(!el)return;
  el.innerHTML=`
    <div class="mhd"></div>
    <div class="mtit" style="color:var(--steel)">📜 تاريخ السجل</div>
    <p class="mtxt" style="margin-bottom:8px">${esc(label||recId)}</p>
    <div style="max-height:60vh;overflow-y:auto">
      ${rows.length?rows.map(e=>{
        const A=_AUDIT_ACTION[e.action]||{t:e.action,i:"•",c:"var(--paper-3)"};
        return `<div style="background:var(--ink-100);border:1px solid var(--rule);
            border-right:3px solid ${A.c};border-radius:8px;padding:7px 9px;margin-bottom:5px">
          <div style="display:flex;justify-content:space-between;font-size:11px">
            <strong style="color:${A.c}">${A.i} ${esc(A.t)}</strong>
            <span style="color:var(--paper-3);font-size:10px">${tAr(esc(e.at||""))}</span>
          </div>
          <div style="font-size:10px;color:var(--paper-3);margin:2px 0 3px">👤 ${esc(e.by||"—")}</div>
          ${(e.changes||[]).map(_auditChangeHTML).join("")}
        </div>`;}).join("")
      :`<div style="text-align:center;color:var(--paper-4);padding:20px;font-size:12px">
          لا تاريخ لهذا السجل — أُنشئ قبل تفعيل سجلّ التدقيق</div>`}
    </div>
    <div class="mbtns" style="margin-top:12px">
      <button class="btn bgh" style="width:100%;justify-content:center" onclick="closeM()">إغلاق</button>
    </div>`;
  document.getElementById("mPartialPay-ov").classList.add("on");
}

/* طباعة سجلّ التدقيق */
function openAuditPrint(){
  const rows=_auditFiltered().slice(0,500);
  if(!rows.length){showToast("⚠ لا قيود للطباعة");return;}
  const body=rows.map(e=>{
    const A=_AUDIT_ACTION[e.action]||{t:e.action};
    const ch=(e.changes||[]).map(c=>{
      const nm=esc(_auditFieldName(c.f));
      if(c.money)return nm+": "+fIQD(c.from||0)+" ← "+fIQD(c.to||0);
      if(c.obj)return nm+": تغيّرت التفاصيل";
      return nm+": "+esc(String(c.from??"—"))+" ← "+esc(String(c.to??"—"));
    }).join("<br>");
    return `<tr><td>${tAr(esc(e.at||""))}</td><td>${esc(e.by||"—")}</td>
      <td>${esc(A.t)}</td><td>${esc(_auditKindLabel(e.kind))}</td>
      <td>${esc(e.subject||"")}</td><td style="text-align:right">${ch}</td></tr>`;}).join("");
  _printHTML=`${COHEAD}
    <div class="prh"><div class="prhtl">📜 سجلّ التدقيق</div>
      <div class="prhmt">${AR(rows.length)} قيد<br>${tAr(nowStr())}</div></div>
    <table class="coltbl"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th>
      <th>القسم</th><th>السجل</th><th>التغيير</th></tr></thead><tbody>${body}</tbody></table>
    ${COFTR}`;
  _isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent="📜 سجلّ التدقيق";
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}


