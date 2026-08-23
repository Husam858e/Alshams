/* ══════════════════════════════════════════════════════
   الانتقال المباشر إلى سجل — v17.4
   يُستخدم من نتائج فحص سلامة البيانات: اضغط الملاحظة
   ← تنفتح قائمة السجلات المعنيّة ← اضغط سجلاً ← ينقلك
   إلى تبويبه ويُبرزه على الشاشة لتصلحه فوراً.
══════════════════════════════════════════════════════ */

/* لكل نوع بيانات: تبويبه، ودالة رسمه، وحقل بحثه إن وُجد */
/* ══════════════════════════════════════════════════════
   جدول الانتقال إلى السجل — v17.43
   ──────────────────────────────────────────────────────
   ⚠️ كانت كل معرّفات البحث هنا خاطئة بلا استثناء:
   srch · sellSrch · damSrch · srfSrch · wrkSrch · arbSrch
   ولا واحد منها موجود في الصفحة. الصحيح هو ما تقرأه
   دوال العرض نفسها: fSearch · sfSearch · dfSearch ·
   srfSearch · wfSearch · arbSearch.
   وبما أن التصفير محميّ بـ if(q) كان الخطأ صامتاً: من
   ينقر نتيجة في البحث الشامل بينما مربّع بحث القسم أو
   فلتر تاريخه مضبوط على شيء آخر، ينتقل فلا يجد سجله
   ويظنّه محذوفاً.
   أضفنا كذلك فلتر التاريخ (date) لأنه أكثر ما يُخفي
   السجل المطلوب فعلياً — وهذا هو قصد الدالة المُعلن.
   ⚠️ المرجع هو دوال render لكل قسم — إن تغيّر معرّف هناك
   يجب أن يتغيّر هنا، وإلا عاد العطل صامتاً كما كان.
══════════════════════════════════════════════════════ */
const _NAV={
  buy :{tab:"recs",      render:()=>renderRecs(),      search:"fSearch",   date:"fDt"},
  sell:{tab:"sell-recs", render:()=>renderSellRecs(),  search:"sfSearch",  date:"sfDt"},
  dam :{tab:"dam-recs",  render:()=>renderDamRecs(),   search:"dfSearch",  date:"dfDt"},
  srf :{tab:"srf-recs",  render:()=>renderSrfRecs(),   search:"srfSearch", date:"srfDt"},
  wrk :{tab:"wrk-recs",  render:()=>renderWrkRecs(),   search:"wfSearch",  date:"wfDt"},
  mnl :{tab:"naql-new",  render:()=>renderMnlRecs(),   search:null,        date:null},
  arb :{tab:"arb-recs",  render:()=>renderArbRecs(),   search:"arbSearch", date:"arbDt"},
  emp :{tab:"sal-emps",  render:()=>renderEmpList(),   search:null,        date:null},
  sal :{tab:"sal-recs",  render:()=>renderSalRecs(),   search:null,        date:null},
  adv :{tab:"sal-emps",  render:()=>renderEmpList(),   search:null,        date:null},
  etx :{tab:"sal-emps",  render:()=>renderEmpList(),   search:null,        date:null},
};

/* يُبرز البطاقة ويُمرّر الشاشة إليها */
function _spotlight(id,tries){
  tries=tries||0;
  const el=document.querySelector(`[data-rid="${CSS.escape(String(id))}"]`);
  if(!el){
    if(tries<12)return setTimeout(()=>_spotlight(id,tries+1),160);
    showToast("⚠ السجل غير ظاهر — قد يكون مُستبعَداً بفلتر الصفحة");
    return;
  }
  document.querySelectorAll(".rec-flash").forEach(x=>x.classList.remove("rec-flash"));
  el.classList.add("rec-flash");
  el.scrollIntoView({behavior:"smooth",block:"center"});
  setTimeout(()=>el.classList.remove("rec-flash"),2600);
}

/* الانتقال: يفتح التبويب، يمسح ما قد يُخفي السجل، ثم يُبرزه */
function gotoRecord(kind,id){
  /* v17.35 — نتائج «أجور النقل» مشتقّة من أربعة مصادر ولا تبويب لها.
     نردّها إلى سجلها الأصلي: الشراء يحمل معرّفاً مركّباً (وصل::ناقل)
     فنأخذ معرّف الوصل نفسه، وإلا ما كان النقر يعمل أصلاً. */
  if(kind==="naql"){
    const e=_allNaqlFees().find(x=>String(x.id)===String(id));
    if(!e){showToast("⚠ لم يُعثر على سجل النقل");return;}
    return gotoRecord(e._kind,e._recId);
  }
  const nav=_NAV[kind];
  if(!nav){showToast("⚠ نوع غير معروف");return;}
  closeM&&closeM();
  const btn=[...document.querySelectorAll(".tbb")].find(b=>
    (b.getAttribute("onclick")||"").includes("'"+nav.tab+"'"));
  if(btn)btn.click(); else sT(nav.tab,null);

  setTimeout(()=>{
    // صفّر الفلاتر التي قد تُخفي السجل المطلوب
    if(kind==="buy"){
      /* ══════════════════════════════════════════════════════
         معرّفات فلاتر الشراء — v17.43
         ──────────────────────────────────────────────────────
         كانت الأسماء هنا الستة كلها خاطئة: fMat/fSt/fWh/fPay/
         fDate/srch — والحقيقية fM/fS/fW/fPaid/fDt/fSearch.
         وبما أن كل سطر محميّ بـ if(e) كان الخطأ صامتاً تماماً:
         لا يُصفَّر أي فلتر. فمن ينقر نتيجة في البحث الشامل
         بينما فلتر «المخزن» أو «التاريخ» مضبوط، ينتقل إلى
         تبويب الشراء فلا يجد الوصل — الفلتر القديم يُخفيه —
         ويبدو أن السجل مفقود.
         ⚠️ المرجع هو getFilt() — أي تغيير هناك يُتبع هنا.
      ══════════════════════════════════════════════════════ */
      ["fM","fS","fW","fPaid"].forEach(x=>{const e=document.getElementById(x);if(e)e.value="all";});
      const d=document.getElementById("fDt");if(d)d.value="";
      const q=document.getElementById("fSearch");if(q)q.value="";
      _recPage=0;
      try{renderRecs();}catch(e){}
      // السجل قد يقع في صفحة لاحقة — انتقل إليها
      const idx=(_recFiltered||[]).findIndex(x=>x.id===id);
      if(idx>=0){_recPage=Math.floor(idx/_recPageSize);_renderRecPage(true);}
    } else {
      if(nav.search){const q=document.getElementById(nav.search);if(q)q.value="";}
      if(nav.date){const dt=document.getElementById(nav.date);if(dt)dt.value="";}
      try{nav.render();}catch(e){}
    }
    _spotlight(id);
  },260);
}


/* طباعة نتائج البحث الشامل */
function buildToolsSearchHTML(){
  const R=_toolsSearchData();
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  const range=(R.from||R.to)?`${tAr(R.from||"البداية")} ← ${tAr(R.to||"اليوم")}`:"كل الفترات";
  const secRows=R.groups.map(g=>
    `<tr><td>${g.d.label}</td><td>${AR(g.hits.length)}</td><td>${fIQD(g.amt)}</td>
     <td>${fIQD(g.paid)}</td><td>${g.rem>0?fIQD(g.rem):"—"}</td></tr>`).join("");
  const detail=R.groups.map(g=>{
    const rows=g.hits.map((r,i)=>{
      const amt=g.d.amount(r), paid=g.d.paid?g.d.paid(r):getPaidTotal(r), rem=Math.max(0,amt-paid);
      const label=g.d.rowLabel?g.d.rowLabel(r):(g.d.fields||[]).map(f=>r[f]).filter(Boolean).slice(0,3).join(" · ");
      return`<tr><td>${AR(i+1)}</td><td>${tAr(r.dk||"—")}</td><td>${esc(label)}</td>
        <td>${r.net!=null?fKG(r.net):"—"}</td><td>${amt?fIQD(amt):"—"}</td>
        <td>${paid?fIQD(paid):"—"}</td><td>${rem>0?fIQD(rem):"—"}</td></tr>`;}).join("");
    return`<div class="col-wh-title">${g.d.label} — ${AR(g.hits.length)} نتيجة</div>
      <table class="coltbl"><thead><tr>
        <th>#</th><th>التاريخ</th><th>البيان</th><th>الصافي</th><th>المبلغ</th><th>مدفوع</th><th>متبقي</th>
      </tr></thead><tbody>${rows}
      <tr class="ctot"><td colspan="4">المجموع</td><td>${fIQD(g.amt)}</td><td>${fIQD(g.paid)}</td><td>${g.rem>0?fIQD(g.rem):"—"}</td></tr>
      </tbody></table>`;}).join("");
  return`${COHEAD}
  <div class="prh" style="background:#3E4D5A">
    <div class="prhtl">نتائج البحث الشامل</div>
    <div class="prhmt">${range}<br/>${tAr(toDay())} — ${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
  </div>
  <div class="psec">بحث: ${esc(R.q)}</div>
  <div class="prr"><span class="prk">عدد النتائج</span><span class="prv">${AR(R.totalHits)}</span></div>
  <div class="prr"><span class="prk">المدفوع</span><span class="prv">${fIQD(R.totalPaid)}</span></div>
  <div class="prr"><span class="prk">المتبقي</span><span class="prv">${fIQD(R.totalRem)}</span></div>
  <div class="prtot" style="background:#3E4D5A"><span class="pk">إجمالي المبالغ</span><span class="pv">${fIQD(R.totalAmt)}</span></div>
  ${secRows?`<div class="col-wh-title">حسب القسم</div>
    <table class="coltbl"><thead><tr>
      <th>القسم</th><th>نتائج</th><th>المبلغ</th><th>مدفوع</th><th>متبقي</th>
    </tr></thead><tbody>${secRows}</tbody></table>`:""}
  ${detail}
  ${COFTR}`;
}
function openToolsSearchPrint(){
  const R=_toolsSearchData();
  if(!R.q){showToast("⚠ اكتب نص البحث أولاً");return;}
  if(!R.totalHits){showToast("⚠ لا نتائج لطباعتها");return;}
  _printHTML=buildToolsSearchHTML();_isCollScreen=true;
  document.getElementById("pactTitle").textContent="🔎 بحث: "+R.q;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("🖨️ "+AR(R.totalHits)+" نتيجة");
}

/* ─────────────────────────────────────────
   ٥) فحص سلامة البيانات
───────────────────────────────────────── */
function toolsHealthCheck(){
  const box=document.getElementById("toolsHealthRes");
  if(!box)return;
  const issues=[];
  /* recs = [{kind,id,label}] — السجلات المعنيّة بالملاحظة، لتصبح قابلة للنقر */
  const push=(sev,title,detail,recs)=>issues.push({sev,title,detail,recs:recs||[]});
  const today=toDay();
  /* وصف مختصر لسجل ما لعرضه في قائمة الملاحظة */
  const brief=(d,r)=>{
    const who=d.who?d.who(r):null;
    const bits=[tAr(r.dk||"بلا تاريخ"),who||""].filter(Boolean);
    const extra=(d.fields||[]).map(f=>r[f]).filter(Boolean).filter(v=>v!==who).slice(0,2);
    return bits.concat(extra).join(" · ");
  };
  const mk=(d,arr)=>arr.map(r=>({kind:d.k,id:r.id,label:brief(d,r)}));

  _REAL_DATASETS().forEach(d=>{
    const arr=d.get();
    // تواريخ ناقصة أو غير صالحة
    const badDate=arr.filter(r=>!r.dk||!/^\d{4}-\d{2}-\d{2}$/.test(r.dk));
    if(badDate.length)push("warn",`${d.icon} ${d.label}: تاريخ ناقص أو غير صالح`,`${AR(badDate.length)} سجل — لن تظهر في المحصلات والتقارير`,mk(d,badDate));
    // تواريخ مستقبلية
    const future=arr.filter(r=>r.dk&&r.dk>today);
    if(future.length)push("warn",`${d.icon} ${d.label}: تاريخ في المستقبل`,`${AR(future.length)} سجل بتاريخ بعد اليوم`,mk(d,future));
    // معرّفات مكررة
    const seen={},dup=[];
    arr.forEach(r=>{if(!r||!r.id)return;if(seen[r.id])dup.push(r.id);seen[r.id]=1;});
    if(dup.length)push("bad",`${d.icon} ${d.label}: معرّفات مكررة`,`${AR(dup.length)} معرّف مكرر — قد يسبب فقدان بيانات`,mk(d,arr.filter(r=>dup.includes(r.id))));
    // دفع زائد
    const over=arr.filter(r=>{
      const amt=d.amount(r);if(!amt)return false;
      const paid=(r.payments||[]).reduce((s,p)=>s+(p.amount||0),0);
      return paid>amt+1;
    });
    if(over.length)push("bad",`${d.icon} ${d.label}: دفع زائد عن المستحق`,`${AR(over.length)} سجل مدفوعاته أكبر من مبلغه`,mk(d,over));
  });

  // وزن سالب في الشراء / البيع / أربيل
  [["buy",S.recs],["sell",SELL_RECS],["arb",ARB_RECS]].forEach(([k,arr])=>{
    const d=_DS(k);
    const neg=(arr||[]).filter(r=>r.gross!=null&&r.empty!=null&&(r.gross-r.empty)<=0);
    if(neg.length)push("bad",`${d.icon} ${d.label}: وزن صافي سالب أو صفر`,`${AR(neg.length)} وصل — الوزن الفارغ ≥ الوزن الكلي`,mk(d,neg));
  });

  // وصولات شراء عالقة أكثر من ٧ أيام
  const stuck=(S.recs||[]).filter(r=>r.status!=="weighed"&&r.dk&&((_D(today)-_D(r.dk))/86400000)>7);
  if(stuck.length)push("warn","🛒 وصولات شراء عالقة",`${AR(stuck.length)} وصل لم يكتمل منذ أكثر من ٧ أيام`,mk(_DS("buy"),stuck));

  // أسماء متشابهة (أخطاء إملائية) عبر كل الأقسام
  const nameMap={};
  _UNIQ_DATASETS().forEach(d=>d.get().forEach(r=>{
    const raw=d.who?d.who(r):null;
    if(!raw||String(raw).trim().length<3)return;
    const key=nameKey(String(raw));
    if(!key)return;
    (nameMap[key]=nameMap[key]||new Set()).add(String(raw).trim());
  }));
  const variantKeys=Object.keys(nameMap).filter(k=>nameMap[k].size>1);
  if(variantKeys.length){
    const sample=variantKeys.slice(0,4).map(k=>[...nameMap[k]].join(" / ")).join(" — ");
    // اجمع كل سجل يستعمل صيغة من الصيغ المتعددة، ليصير قابلاً للنقر والتصحيح
    const vSet=new Set(variantKeys);
    const vRecs=[];
    _UNIQ_DATASETS().forEach(d=>d.get().forEach(r=>{
      const raw=d.who?d.who(r):null;
      if(!raw)return;
      const key=normArabic(String(raw));
      if(!vSet.has(key))return;
      vRecs.push({kind:d.k,id:r.id,label:`${String(raw).trim()} — ${tAr(r.dk||"بلا تاريخ")} · ${d.label}`});
    }));
    vRecs.sort((x,y)=>x.label.localeCompare(y.label,"ar"));
    push("info","👥 أسماء مكتوبة بصيغ مختلفة",
      `${AR(variantKeys.length)} اسم يُكتب بأكثر من صيغة — يُجمَّع صحيحاً لكن يُستحسن توحيد الكتابة. أمثلة: ${esc(sample)}`,
      vRecs);
  }

  /* أسماء متقاربة لا يجمعها النظام — قد تكون نفس الشخص بخطأ إملائي.
     هذه هي التي تُشتّت الذمم فعلاً وتحتاج مراجعتك. */
  const keys=Object.keys(nameMap).filter(k=>k.length>=4);
  const near=[];
  for(let i=0;i<keys.length;i++){
    for(let j=i+1;j<keys.length;j++){
      const a=keys[i],b=keys[j];
      const contained=(a.length!==b.length)&&(a.startsWith(b)||b.startsWith(a));
      if(contained||_editDist(a,b,2)<=(Math.min(a.length,b.length)>=6?2:1)){
        near.push([a,b]);
        if(near.length>=40)break;
      }
    }
    if(near.length>=40)break;
  }
  if(near.length){
    const disp=p=>[...nameMap[p]][0];
    const sample=near.slice(0,4).map(([a,b])=>`${disp(a)} ≈ ${disp(b)}`).join(" — ");
    const nRecs=[];
    const flat=new Set(near.flat());
    _UNIQ_DATASETS().forEach(d=>d.get().forEach(r=>{
      const raw=d.who?d.who(r):null;
      if(!raw)return;
      if(!flat.has(nameKey(String(raw))))return;
      nRecs.push({kind:d.k,id:r.id,label:`${String(raw).trim()} — ${tAr(r.dk||"بلا تاريخ")} · ${d.label}`});
    }));
    nRecs.sort((x,y)=>x.label.localeCompare(y.label,"ar"));
    push("warn","👥 أسماء متقاربة — قد تكون نفس الشخص",
      `${AR(near.length)} زوج اسم متشابه لكن لا يُجمَّع معاً — سيظهر رصيدان منفصلان. أمثلة: ${esc(sample)}`,
      nRecs);
  }

  // وصولات شراء متطابقة في نفس اليوم (احتمال ازدواج)
  const sig={},dups=[];
  (S.recs||[]).forEach(r=>{
    if(r.status!=="weighed")return;
    const k=[r.dk,nameKey(r.driver||""),r.gross,r.empty,r.ppkg].join("|");
    if(sig[k])dups.push(r);else sig[k]=1;
  });
  if(dups.length)push("warn","🛒 وصولات شراء متطابقة",`${AR(dups.length)} وصل بنفس (التاريخ + الفلاح + الأوزان + السعر) — تحقق من الازدواج`,mk(_DS("buy"),dups));

  // طابور غير مُرسَل
  if(_writeQueue.length)push("warn","📡 عمليات بانتظار المزامنة",`${AR(_writeQueue.length)} عملية محفوظة محلياً لم تصل السيرفر بعد`);

  // آخر نسخة احتياطية
  let lastBk=null;try{lastBk=localStorage.getItem("wShamsLastBackup");}catch(e){}
  if(!lastBk)push("warn","📦 لا توجد نسخة احتياطية","لم تأخذ أي نسخة احتياطية من هذا الجهاز — يُنصح بأخذ واحدة الآن");
  else{
    const days=Math.floor((_D(today)-_D(lastBk.slice(0,10)))/86400000);
    if(days>7)push("warn","📦 نسخة احتياطية قديمة",`آخر نسخة منذ ${AR(days)} يوم — يُنصح بتحديثها`);
  }

  window._healthIssues=issues;
  const COL={bad:["var(--owing)","var(--owing-wash)","❌"],warn:["var(--wheat)","var(--wheat-wash)","⚠️"],info:["var(--steel)","var(--steel-wash)","ℹ️"]};
  if(!issues.length){
    box.innerHTML=`<div style="background:var(--settled-wash);border:1px solid var(--settled);border-radius:10px;padding:18px;text-align:center;color:var(--settled);font-weight:700">✅ كل البيانات سليمة — لا توجد ملاحظات</div>`;
    showToast("✅ الفحص تم — لا مشاكل");
    return;
  }
  const bad=issues.filter(i=>i.sev==="bad").length;
  const warn=issues.filter(i=>i.sev==="warn").length;
  box.innerHTML=`
    <div style="background:var(--ink-200);border-radius:10px;padding:9px 11px;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap;font-size:12px">
      <span style="color:var(--owing)">❌ حرجة: <strong>${AR(bad)}</strong></span>
      <span style="color:var(--wheat)">⚠️ تنبيهات: <strong>${AR(warn)}</strong></span>
      <span style="color:var(--steel)">ℹ️ ملاحظات: <strong>${AR(issues.length-bad-warn)}</strong></span>
    </div>`+
    issues.map((i,ix)=>{
      const [c,bg,ic]=COL[i.sev];
      const n=(i.recs||[]).length;
      return`<div style="background:${bg};border:1px solid ${c};border-radius:9px;padding:9px 11px;margin-bottom:6px">
        <div ${n?`onclick="toggleHealthIssue(${ix})" style="cursor:pointer"`:""}>
          <div style="color:${c};font-weight:700;font-size:12px;display:flex;justify-content:space-between;gap:8px;align-items:center">
            <span>${ic} ${i.title}</span>
            ${n?`<span id="hchev${ix}" style="font-size:13px;opacity:.75">▾</span>`:""}
          </div>
          <div style="color:var(--paper-2);font-size:11px;margin-top:3px;line-height:1.6">${i.detail}</div>
          ${n?`<div style="color:${c};font-size:10px;margin-top:5px;font-weight:600">👆 اضغط لعرض الـ${AR(n)} سجل والانتقال إليها</div>`:""}
        </div>
        <div id="hlist${ix}" style="display:none;margin-top:8px;border-top:1px solid ${c};padding-top:7px"></div>
      </div>`;}).join("");
  showToast(`🩺 الفحص تم — ${AR(issues.length)} ملاحظة`);
}

/* ─────────────────────────────────────────
   ٦) سلة المحذوفات
───────────────────────────────────────── */

/* يفتح/يغلق قائمة السجلات المعنيّة بملاحظة الفحص */
function toggleHealthIssue(ix){
  const box=document.getElementById("hlist"+ix);
  const chev=document.getElementById("hchev"+ix);
  if(!box)return;
  const open=box.style.display!=="none";
  if(open){box.style.display="none";if(chev)chev.textContent="▾";return;}
  const iss=(window._healthIssues||[])[ix];
  if(!iss||!iss.recs.length)return;
  box.innerHTML=iss.recs.slice(0,60).map(x=>
    `<div onclick="gotoRecord('${x.kind}','${String(x.id).replace(/'/g,"\\'")}')"
       style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 8px;margin-bottom:4px;
              background:var(--ink-200);border:1px solid var(--rule);border-radius:7px;cursor:pointer;font-size:11px">
      <span style="color:var(--paper);flex:1;min-width:0">${esc(x.label||x.id)}</span>
      <span style="color:var(--wheat);font-weight:700;white-space:nowrap">انتقل ←</span>
    </div>`).join("")
    +(iss.recs.length>60?`<div style="font-size:10px;color:var(--paper-3);padding:4px">…و ${AR(iss.recs.length-60)} سجل آخر</div>`:"");
  box.style.display="block";
  if(chev)chev.textContent="▴";
}

function renderTrash(){
  const box=document.getElementById("toolsTrashRes");
  if(!box)return;
  if(!TRASH.length){
    box.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:22px;font-size:12px">🗑️ السلة فارغة</div>`;
    return;
  }
  box.innerHTML=`<div style="font-size:11px;color:var(--paper-3);margin-bottom:6px">آخر ${AR(TRASH.length)} عملية حذف (محفوظة على هذا الجهاز فقط)</div>`+
    TRASH.slice(0,60).map((t,i)=>{
      const d=_DS(t.kind)||{icon:"📄",label:t.kind,fields:[],amount:()=>0};
      const r=t.rec||{};
      const label=(d.fields||[]).map(f=>r[f]).filter(Boolean).slice(0,3).join(" · ")||r.id||"—";
      const amt=d.amount?d.amount(r):0;
      return`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 9px;border-bottom:1px solid var(--ink-200);font-size:11px">
        <div style="flex:1;min-width:0">
          <div style="color:var(--paper-2)">${d.icon} ${esc(label)}</div>
          <div style="color:var(--paper-3);font-size:10px">📅 ${tAr(r.dk||"—")} · حُذف ${tAr(esc(t.delAt||""))} بواسطة ${esc(t.delBy||"—")}${amt?" · "+fIQD(amt):""}</div>
        </div>
        <button class="btn bsm bgn" onclick="restoreFromTrash(${i})">↩️ استرجاع</button>
      </div>`;}).join("")+
    `<div style="display:flex;gap:7px;margin-top:9px">
      <button class="btn" style="flex:1;justify-content:center;background:var(--owing-rule);color:var(--owing)" onclick="clearTrash()">🗑️ إفراغ السلة</button>
    </div>`;
}
function restoreFromTrash(i){
  const t=TRASH[i];
  if(!t||!t.rec){showToast("⚠ السجل غير موجود");return;}
  const d=_DS(t.kind);
  if(!d){showToast("⚠ نوع غير معروف: "+t.kind);return;}
  d.save(t.rec);
  TRASH.splice(i,1);
  try{localStorage.setItem(_TRASHK,JSON.stringify(TRASH));}catch(e){}
  showToast("↩️ تم استرجاع السجل إلى "+d.label);
  renderTrash();renderToolsStatus();
}
function clearTrash(){
  if(!confirm("إفراغ سلة المحذوفات نهائياً؟"))return;
  TRASH=[];
  try{localStorage.removeItem(_TRASHK);}catch(e){}
  renderTrash();
  showToast("🗑️ تم إفراغ السلة");
}

/* ─────────────────────────────────────────
   ٧) حالة النظام
───────────────────────────────────────── */
function renderToolsStatus(){
  const box=document.getElementById("toolsStatus");
  if(!box)return;
  let bytes=0;
  try{for(const k in localStorage){if(Object.prototype.hasOwnProperty.call(localStorage,k))bytes+=(localStorage[k]||"").length*2;}}catch(e){}
  const kb=Math.round(bytes/1024);
  let lastBk="—";try{lastBk=localStorage.getItem("wShamsLastBackup")||"—";}catch(e){}
  const total=_REAL_DATASETS().reduce((s,d)=>s+d.get().length,0);
  const cards=_REAL_DATASETS().filter(d=>d.get().length).map(d=>
    `<div style="background:var(--ink-100);border:1px solid var(--rule);border-radius:9px;padding:7px 9px;text-align:center;min-width:88px;flex:1">
      <div style="font-size:16px">${d.icon}</div>
      <div style="font-size:15px;font-weight:800;color:var(--wheat-hi)">${AR(d.get().length)}</div>
      <div style="font-size:10px;color:var(--paper-3)">${d.label}</div>
    </div>`).join("");
  box.innerHTML=`
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:9px">${cards||'<div style="color:var(--paper-4);font-size:12px">لا توجد بيانات بعد</div>'}</div>
    <div style="background:var(--ink-200);border-radius:10px;padding:9px 11px;font-size:11px;color:var(--paper-2);line-height:1.9">
      إجمالي السجلات: <strong style="color:var(--wheat-hi)">${AR(total)}</strong><br>
      مساحة التخزين المحلي: <strong style="color:var(--wheat-hi)">${AR(kb)} كيلوبايت</strong><br>
      آخر نسخة احتياطية: <strong style="color:${lastBk==="—"?"var(--owing)":"var(--settled)"}">${lastBk==="—"?"لا يوجد":tAr(lastBk)}</strong><br>
      بانتظار المزامنة: <strong style="color:${_writeQueue.length?"var(--wheat)":"var(--settled)"}">${AR(_writeQueue.length)}</strong> عملية
      ${_writeQueue.length?` <button class="btn bsm bgn" style="margin-right:6px" onclick="_flushQueue();showToast('📡 جاري الإرسال...');setTimeout(renderToolsStatus,900)">📡 إرسال الآن</button>`:""}
    </div>`;
}


