/* ════════════════════════════════════════════
   TABS
════════════════════════════════════════════ */
function sT(id,btn){
  document.querySelectorAll(".tbb").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tc").forEach(c=>c.classList.remove("active"));
  btn.classList.add("active");
  document.getElementById("tc-"+id).classList.add("active");
  if(id==="recs")renderRecs();
  if(id==="buy-cust"){renderCustTab('buy');}
  if(id==="buy-bulkpay"){renderBulkPayPreview("buy");}
  if(id==="sell-bulkpay"){renderBulkPayPreview("sell");}
  if(id==="srf-bulkpay"){renderBulkPayPreview("srf");}
  if(id==="wrk-bulkpay"){renderBulkPayPreview("wrk");}
  if(id==="st")renderStats();
  if(id==="wh")renderWH();
  if(id==="rpt")renderRpt();
  if(id==="coll"){showCollTab(_curCollTab||1);}
  if(id==="sell-recs"){renderSellRecs();}
  if(id==="sell-st"){renderSellStats();}
  if(id==="sell-coll"){renderSellCollTab();}
  if(id==="dam-recs"){renderDamRecs();}
  if(id==="dam-coll"){renderDamCollTab();}
  if(id==="sell-cust"){renderCustTab('sell');}
  if(id==="dam-cust"){renderCustTab('dam');}
  if(id==="srf-cust"){renderCustTab('srf');}
  if(id==="wrk-cust"){renderCustTab('wrk');}
  if(id==="srf-recs"){renderSrfRecs();}
  if(id==="srf-coll"){renderSrfCollTab();}
  if(id==="wrk-recs"){renderWrkRecs();}
  if(id==="wrk-coll"){renderWrkCollTab();}
  if(id==="sal-emps"){renderEmpList();renderAdvSummary();}
  if(id==="sal-recs"){updateEmpSelect();renderSalRecs();}
  if(id==="sal-coll"){renderSalCollTab();buildSalHistoryLists();}
  if(id==="naql-coll"){loadMnlCache();renderNaqlColl();renderNaqlBulkPayPreview();}
  if(id==="naql-new"){loadMnlCache();renderMnlRecs();}
  if(id==="naql-recs"){loadMnlCache();renderNaqlRecs();}
  if(id==="naql-cust"){loadMnlCache();renderCustTab('naql');}
  if(id==="arb-recs"){renderArbRecs();}
  if(id==="arb-coll"){renderArbCollTab();}
  if(id==="arb-cust"){renderCustTab('arb');}
  if(id==="jami-arb"){renderArbJami();}
  if(id==="jami-buy"){renderJami('buy');}
  if(id==="jami-sell"){renderJami('sell');}
  if(id==="jami-dam"){renderJami('dam');}
  if(id==="paylog"){
    // أول فتح: اجعل المدة شهراً
    const f=document.getElementById("payLogFrom");
    if(f&&!f.value&&!document.getElementById("payLogTo").value)payLogSetRange("month");
    else renderPayLog();
  }
  if(id==="tools"){renderToolsTab();}
  if(id==="perf"){if(!_perfRange.from&&!_perfRange.to)perfSetRange("month");else renderPerfTab();}
  if(id==="cash"){_cashOpenTab();}
  if(id==="audit"){renderAuditTab();}
}

/* ════════════════════════════════════════════
   FORM
════════════════════════════════════════════ */
function sM(m){
  S.mat=m;
  ["jet","gravel","mixed","straw"].forEach(k=>document.getElementById("m"+k)?.classList.toggle("active",k===m));
}
function tKabs(){S.kOn=!S.kOn;document.getElementById("kTog").classList.toggle("on",S.kOn);document.getElementById("kLbl").textContent=S.kOn?"كبس ✓ (يُطرح)":"بدون كبس";document.getElementById("kF").style.display=S.kOn?"block":"none";if(!S.kOn){document.getElementById("kC").value="";document.getElementById("kP").value="";}upPrev();}
function tNaql(){
  S.nOn=!S.nOn;
  document.getElementById("nTog").classList.toggle("on",S.nOn);
  document.getElementById("nLbl").textContent=S.nOn?(S.nDeduct!==false?"نقل ✓ (يُطرح)":"نقل ✓ (لحساب الناقل فقط)"):"بدون أجور نقل";
  document.getElementById("nF").style.display=S.nOn?"block":"none";
  if(!S.nOn){
    S.naqlRows=[];S.naqlCount=1;
    const disp=document.getElementById("naqlCountDisp");if(disp)disp.textContent=AR(1);
  } else if(!S.naqlCount){
    S.naqlCount=1;
  }
  renderNaqlRows();
  upPrev();
}
function sNaqlDeduct(v){
  S.nDeduct=v;
  document.getElementById("ndYes")?.classList.toggle("active",v);
  document.getElementById("ndNo")?.classList.toggle("active",!v);
  document.getElementById("nLbl").textContent=S.nOn?(v?"نقل ✓ (يُطرح)":"نقل ✓ (لحساب الناقل فقط)"):"بدون أجور نقل";
  upPrev();
}
/* ── دعم تعدد الناقلين بوصل الشراء الجديد ── */
function _captureNaqlRows(){
  const names=[...document.querySelectorAll('.naql-row-name')].map(el=>el.value.trim());
  const kabs=[...document.querySelectorAll('.naql-row-kabs')].map(el=>parseFloat(el.value)||0);
  const prices=[...document.querySelectorAll('.naql-row-price')].map(el=>numIn(el)||0);
  return names.map((name,i)=>({transporter:name,nC:kabs[i]||0,nUP:prices[i]||0}));
}
function changeNaqlCount(delta){
  S.naqlRows=_captureNaqlRows();
  S.naqlCount=Math.max(1,Math.min(10,(S.naqlCount||1)+delta));
  document.getElementById("naqlCountDisp").textContent=AR(S.naqlCount);
  renderNaqlRows();
  upPrev();
}
function renderNaqlRows(){
  const cont=document.getElementById("naqlRowsContainer");
  if(!cont)return;
  const n=S.naqlCount||1;
  const rows=S.naqlRows||[];
  let html="";
  for(let i=0;i<n;i++){
    const row=rows[i]||{};
    html+=`<div style="background:var(--ink-050);border-radius:9px;padding:9px;margin-bottom:7px;border:1px solid var(--rule)">
      ${n>1?`<div style="font-size:11px;color:var(--wheat);font-weight:700;margin-bottom:6px">🚚 الناقل ${AR(i+1)}</div>`:""}
      <div class="fg">
        <div class="fi-g"><label class="fl">اسم الناقل</label><input class="fi naql-row-name" type="text" placeholder="اسم الناقل" value="${esc((row.transporter||'').replace(/"/g,'&quot;'))}" oninput="upPrev()" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true"></div>
        <div class="fi-g"><label class="fl">عدد الكبسات</label><input class="fi naql-row-kabs" type="number" min="0" placeholder="0" value="${row.nC||''}" oninput="upPrev()" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true" inputmode="numeric"></div>
        <div class="fi-g"><label class="fl">سعر الكبسة (د.ع)</label><input style="text-align:right" class="fi naql-row-price" type="text" inputmode="decimal" dir="ltr" value="${row.nUP||''}" oninput="fmtPayInput(this);upPrev()" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true" inputmode="numeric"></div>
      </div>
    </div>`;
  }
  cont.innerHTML=html;
}
function getNaqlRowsData(){
  const rows=_captureNaqlRows();
  return rows.filter(x=>x.nC>0&&x.nUP>0).map(x=>({transporter:x.transporter,nC:x.nC,nUP:x.nUP,naqlFee:x.nC*x.nUP}));
}
function tWasl(){S.wOn=!S.wOn;document.getElementById("wTog").classList.toggle("on",S.wOn);document.getElementById("wLbl").textContent=S.wOn?"وصل ✓ (يُطرح)":"بدون سعر وصل";document.getElementById("wF").style.display=S.wOn?"block":"none";if(!S.wOn)document.getElementById("wP").value="";upPrev();}
function sKT(t){S.kType=t;document.getElementById("ks").classList.toggle("active",t==="سيم");document.getElementById("kk").classList.toggle("active",t==="خيط");}

function upPrev(){
  const g=numIn("fGrs");
  const wp=document.getElementById("WP");
  if(g>0){
    wp.style.display="block";
    const kC=parseFloat(document.getElementById("kC").value)||0;
    const kP=numIn("kP")||0;
    const naqlList=S.nOn?getNaqlRowsData():[];
    const naqlTotal=naqlList.reduce((s,x)=>s+x.naqlFee,0);
    const wP=numIn("wP")||0;
    let lines=[];
    lines.push(`الوزن الكلي: <strong>${fKG(g)}</strong>`);
    if(S.kOn&&kC>0&&kP>0) lines.push(`كبس محجوز: <strong style="color:var(--steel)">${fIQD(kC*kP)}</strong> (${AR(kC)} كبسة × ${fIQD(kP)})`);
    if(S.nOn&&naqlList.length){
      const naqlDetail=naqlList.length>1?naqlList.map(x=>`${esc(x.transporter||"بدون اسم")}: ${fIQD(x.naqlFee)}`).join(" + "):`${AR(naqlList[0].nC)} × ${fIQD(naqlList[0].nUP)}`;
      lines.push(`نقل محجوز (${AR(naqlList.length)} ${naqlList.length>1?"ناقلين":"ناقل"}): <strong style="color:var(--wheat)">${fIQD(naqlTotal)}</strong> (${naqlDetail})${S.nDeduct!==false?' — <span style="color:var(--owing)">يُطرح من الوصل</span>':' — <span style="color:var(--steel)">لحساب الناقل فقط (لا يُطرح)</span>'}`);
    }
    if(S.wOn&&wP>0) lines.push(`سعر الوصل: <strong style="color:var(--steel)">− ${fIQD(wP)}</strong> (يُطرح)`);
    wp.innerHTML=lines.join("<br/>");
  } else wp.style.display="none";
}

function sErr(id,m){document.getElementById("e"+id).textContent=m;document.getElementById("f"+id)?.classList.add("err");}
function clrE(){["Drv","Plt","Grs"].forEach(id=>{document.getElementById("e"+id).textContent="";document.getElementById("f"+id)?.classList.remove("err");});}

function submitRec(){
  clrE();let ok=true;
  const drv=document.getElementById("fDrv").value.trim();
  const plt=document.getElementById("fPlt").value.trim();
  const grs=numIn("fGrs");
  const wh=document.getElementById("fWH").value;
  const note=(document.getElementById("fNote")?.value||"").trim();
  if(!drv){sErr("Drv","⚠ مطلوب");ok=false;}
  if(!plt){sErr("Plt","⚠ مطلوب");ok=false;}
  if(!grs||grs<=0){sErr("Grs","⚠ أدخل وزناً");ok=false;}
  if(!ok)return;
  const kC=S.kOn?(parseFloat(document.getElementById("kC").value)||0):0;
  const kP=S.kOn?(numIn("kP")||0):0;
  const naqlRowsData=S.nOn?getNaqlRowsData():[];
  const naqlList=naqlRowsData.map(x=>({id:genId(),transporter:x.transporter,nC:x.nC,nUP:x.nUP,naqlFee:x.naqlFee,naqlPayments:[],naqlPaidTotal:0,naqlPaid:false,naqlPaidAt:null}));
  const wP=S.wOn?(numIn("wP")||0):0;
  const r={
    id:genId(),seq:Date.now(), // نستخدم timestamp كـ seq للاتساق بين الأجهزة
    driver:drv,plate:plt,mat:S.mat,wh,note,
    ppkg:null,gross:grs,empty:null,net:null,
    wFee:null,kabsFee:null,naqlFee:null,waslFee:null,final:null,
    kOn:S.kOn&&kC>0,kC,kUP:kP,kType:S.kOn?S.kType:"",
    nOn:S.nOn&&naqlList.length>0,naqlList,nDeduct:S.nDeduct!==false,
    transporter:naqlList.length===1?(naqlList[0].transporter||""):naqlList.map(x=>x.transporter).filter(Boolean).join("، "),
    nC:naqlList.length===1?naqlList[0].nC:null,
    nUP:naqlList.length===1?naqlList[0].nUP:null,
    wOn:S.wOn&&wP>0,wPrice:wP,
    status:"waiting",
    paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    loadAt:nowStr(),loadBy:S.cu.name,
    confAt:null,confBy:null,
    weighAt:null,weighBy:null,
    dk:toDay(),
  };
  saveRec(r);
  clrForm();
  document.querySelectorAll(".tbb").forEach((b,i)=>b.classList.toggle("active",i===1));
  document.querySelectorAll(".tc").forEach((c,i)=>c.classList.toggle("active",i===1));
  showToast("✅ تم حفظ الوصل — "+r.plate);
}

function clrForm(){
  ["fDrv","fPlt","fGrs","kC","kP","wP","fNote"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  S.mat="jet";S.kOn=false;S.nOn=false;S.wOn=false;S.kType="سيم";S.nDeduct=true;S.naqlRows=[];S.naqlCount=1;
  ["jet","gravel","mixed","straw"].forEach(k=>document.getElementById("m"+k)?.classList.toggle("active",k==="jet"));
  ["kTog","nTog","wTog"].forEach(id=>document.getElementById(id).classList.remove("on"));
  document.getElementById("kLbl").textContent="بدون كبس";
  document.getElementById("nLbl").textContent="بدون أجور نقل";
  document.getElementById("wLbl").textContent="بدون سعر وصل";
  ["kF","nF","wF"].forEach(id=>document.getElementById(id).style.display="none");
  document.getElementById("WP").style.display="none";
  document.getElementById("ks").classList.add("active");
  document.getElementById("kk").classList.remove("active");
  document.getElementById("ndYes")?.classList.add("active");
  document.getElementById("ndNo")?.classList.remove("active");
  const disp=document.getElementById("naqlCountDisp");if(disp)disp.textContent=AR(1);
  renderNaqlRows();
  clrE();
  _shortcutHistory = []; // مسح أي اختصار معلّق يشير لحقل أصبح مخفياً بعد إعادة الضبط
}

/* ════════════════════════════════════════════
   RECORDS
════════════════════════════════════════════ */
const SL={waiting:"🟠 انتظار تأكيد",confirmed:"🟡 انتظار وزن فارغ",weighed:"✅ مكتمل"};
const SB={waiting:"bw",confirmed:"bc",weighed:"bd"};
const ST=["① وزن محمل","② تأكيد مخزن","③ وزن فارغ"];
const SI={waiting:0,confirmed:1,weighed:2};

function getFilt(){
  // v17.43 — حراسة موحّدة: عنصر مفقود يعني «بلا فلترة» لا انهيار الشاشة
  const mf=document.getElementById("fM")?.value||"all";
  const sf=document.getElementById("fS")?.value||"all";
  const wf=document.getElementById("fW")?.value||"all";
  const df=document.getElementById("fDt")?.value||"";
  const pf=document.getElementById("fPaid")?.value||"all";
  const sq=(document.getElementById("fSearch")?.value||"").trim().toLowerCase();
  return S.recs.filter(r=>{
    if(mf!=="all"&&r.mat!==mf)return false;
    if(sf!=="all"&&r.status!==sf)return false;
    if(wf!=="all"&&r.wh!==wf)return false;
    if(df&&r.dk!==df)return false;
    if(pf==="paid"&&!r.paid)return false;
    if(pf==="unpaid"&&r.paid)return false;
    if(sq){
      const drv=r.driver||"";
      const plt=r.plate||"";
      if(!smartMatch(drv,sq)&&!smartMatch(plt,sq))return false;
    }
    return true;
  });
}

/* ── Pagination للسجلات ── */
let _recPage=0;
const _recPageSize=20;
let _recFiltered=[];

function renderRecs(keepPage){
  if(!S.cu)return;
  _recFiltered=getFilt();
  // v17: عند التحديث الخلفي من فايربيس نُبقي المستخدم في صفحته بدل إرجاعه للصفحة ١
  const maxPage=Math.max(0,Math.ceil(_recFiltered.length/_recPageSize)-1);
  _recPage=keepPage?Math.min(_recPage,maxPage):0;
  _renderRecStats();
  _renderRecPage(true);
}
/* يُستدعى من مستمع فايربيس — يحافظ على الصفحة الحالية */
function renderRecsKeep(){renderRecs(true);}

function _renderRecStats(){
  const f=_recFiltered;
  const dn=f.filter(r=>r.final!=null);
  const tN=dn.reduce((s,r)=>s+r.net,0);
  const tF=dn.reduce((s,r)=>s+r.final,0);
  // v17.16 — مجموع المدفوع والمتبقي فعلياً (يشمل الدفعات الجزئية)
  const tP=dn.reduce((s,r)=>s+getPaidTotal(r),0);
  const tR=Math.max(0,tF-tP);
  const cW=f.filter(r=>r.status==="waiting").length;
  const cC=f.filter(r=>r.status==="confirmed").length;
  const cPaid=dn.filter(r=>isFullyPaid(r)).length;
  const cUnpaid=dn.length-cPaid;
  document.getElementById("FSm").innerHTML=
    `<span>الوصولات: <strong>${AR(f.length)}</strong></span>
     <span>الصافي: <strong>${fKG(tN)}</strong></span>
     <span>المجموع: <strong>${fIQD(tF)}</strong></span>
     <span style="color:var(--settled)">المدفوع: <strong>${fIQD(tP)}</strong></span>
     <span style="color:${tR>0?"var(--owing)":"var(--settled)"}">المتبقي: <strong>${fIQD(tR)}</strong></span>
     ${cW>0?`<span style="color:var(--wheat)">انتظار تأكيد: <strong>${AR(cW)}</strong></span>`:""}
     ${cC>0?`<span style="color:var(--wheat)">وزن فارغ: <strong>${AR(cC)}</strong></span>`:""}
     ${cPaid>0?`<span style="color:var(--settled)">مدفوع: <strong>${AR(cPaid)}</strong></span>`:""}
     ${cUnpaid>0?`<span style="color:var(--owing)">غير مدفوع: <strong>${AR(cUnpaid)}</strong></span>`:""}`;
}

function _buildRecCard(r){
  const si=SI[r.status]??0;
  const matInfo=MAT[r.mat]||{label:r.mat,icon:"📦"};
  const matBadgeClass=r.mat==="jet"?"bj":r.mat==="gravel"?"bgr":r.mat==="mixed"?"bc":"bd";
  const naqlEntries=r.nOn?getNaqlEntries(r):[];
  const stH=`<div class="stl">${ST.map((s,i)=>`<div class="sts ${i<si?"done":i===si?"cur":""}">${s}</div>`).join("")}</div>`;
  let wR="";
  if(r.net!=null){
    wR=`<div class="rw">
      <div class="rwi"><span class="rwk">الكلي</span><span class="rwv">${fKG(r.gross)}</span></div><span class="rws">−</span>
      <div class="rwi"><span class="rwk">الفارغ</span><span class="rwv">${fKG(r.empty)}</span></div><span class="rws">=</span>
      <div class="rwi"><span class="rwk">الصافي</span><span class="rwv" style="color:var(--wheat)">${fKG(r.net)}</span></div><span class="rws">×</span>
      <div class="rwi"><span class="rwk">كغم</span><span class="rwv">${fIQD(r.ppkg)}</span></div><span class="rws">=</span>
      <div class="rwi"><span class="rwk">أجور</span><span class="rwv" style="color:var(--settled)">${fIQD(r.wFee)}</span></div>
      ${r.kOn?`<span class="rws" style="color:var(--owing)">−</span><div class="rwi"><span class="rwk">كبس</span><span class="rwv" style="color:var(--steel)">${fIQD(r.kabsFee)}</span></div>`:""}
      ${r.nOn?`<span class="rws" style="color:${r.nDeduct!==false?'var(--owing)':'var(--steel)'}">${r.nDeduct!==false?'−':'+'}</span><div class="rwi"><span class="rwk">${r.nDeduct!==false?'نقل':'نقل (للناقل)'}</span><span class="rwv" style="color:var(--wheat)">${fIQD(r.naqlFee)}</span></div>`:""}
      ${r.wOn?`<span class="rws" style="color:var(--owing)">−</span><div class="rwi"><span class="rwk">وصل</span><span class="rwv" style="color:var(--steel)">${fIQD(r.waslFee)}</span></div>`:""}
      <span class="rws">=</span>
      <div class="rwi fa"><span class="rwk">النهائي</span><span class="rwv" style="color:var(--wheat-hi);font-size:12px">${fIQD(r.final)}</span></div>
    </div>`;
  }else{
    wR=`<div class="rw">
      <div class="rwi"><span class="rwk">الكلي</span><span class="rwv">${fKG(r.gross)}</span></div>
      <span class="rws" style="color:var(--wheat)">⟶</span>
      <div class="rwi"><span class="rwk" style="color:var(--wheat)">${r.status==="waiting"?"انتظار تأكيد":"انتظار وزن فارغ"}</span>
        <span class="rwv" style="color:var(--wheat);animation:blink 2s ease infinite;font-size:11px">⏳</span>
      </div>
    </div>`;
  }
  const ac=[];
  if(r.status==="waiting")ac.push(`<button class="btn bor bsm" onclick="openConf('${r.id}')">🏭 تأكيد</button>`);
  if(r.status==="confirmed")ac.push(`<button class="btn bgn bsm" onclick="openWeigh('${r.id}')">⚖️ وزن فارغ</button>`);
  if(r.status==="weighed") ac.push(payBtnHTML(r,"buy"));
  naqlEntries.forEach(en=>{
    if(en.naqlFee>0){
      const compId=_naqlCompositeId(r.id,en._entryId);
      ac.push(naqlPayBtnHTML({...en,id:compId},'buy',null));
    }
  });
  ac.push(`<button class="btn bgh bsm" onclick="openEdit('${r.id}')">✏️ تعديل</button>`);
  ac.push(`<button class="btn bg bsm" onclick="openPrint('${r.id}')">🖨️ وصل</button>`);
  ac.push(`<button class="btn bbl bsm" onclick="openDownloadModal('${r.id}')">⬇️ تنزيل</button>`);
  ac.push(`<button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openDel('${r.id}')">🗑️</button>`);
  return`<div data-rid="${r.id}" class="rc ${r.status==="weighed"?"done":""} ${r.status==="waiting"?"waiting":""}">
    <div class="rt">
      <div class="rtl">
        <span class="rpl">🚛 ${esc(r.plate)}</span>
        <span class="rdr">${esc(r.driver)}</span>
        <span class="badge" style="background:var(--ink-200);color:var(--paper-2)">📅 ${tAr(r.dk)}</span>
        <span class="badge ${matBadgeClass}">${matInfo.icon} ${matInfo.label}</span>
        <span class="badge bp">${whIcon(r.wh)} ${esc(whName(r.wh))}</span>
        ${r.kOn?`<span class="badge bp">🔧 ${AR(r.kC)} ${esc(r.kType||"")}</span>`:""}
        ${naqlEntries.map(en=>en.transporter?`<span class="badge" style="background:rgba(249,115,22,.15);color:var(--wheat)">🚚 ${esc(en.transporter)}${naqlEntries.length>1?" ("+fIQD(en.naqlFee)+(isNaqlFullyPaid(en)?" ✅":getNaqlPaidTotal(en)>0?" 💰":"")+")":""}</span>`:"").join("")}
        ${r.nOn&&r.nDeduct===false?`<span class="badge" style="background:rgba(34,211,238,.15);color:var(--steel)">📒 نقل غير مطروح</span>`:""}
        ${r.edited?`<span class="badge" style="background:rgba(234,179,8,.15);color:var(--wheat)">✏️ تم تعديله</span>`:""}
        ${r.paid?`<span class="badge" style="background:rgba(16,185,129,.15);color:var(--settled)">✅ مدفوع</span>`:r.paidTotal>0?`<span class="badge" style="background:rgba(251,191,36,.12);color:var(--wheat-hi)">💰 جزئي</span>`:""}
      </div>
      <span class="badge ${SB[r.status]||""}">${SL[r.status]||r.status}</span>
    </div>
    ${stH}${wR}
    ${r.status==="weighed"?payBarMiniHTML(r):""}
    ${r.note?`<div style="font-size:12px;color:var(--paper-2);padding:3px 0">📝 ${esc(r.note)}</div>`:""}
    <div class="rmt">
      <span>📅 ${tAr(r.loadAt)}</span><span>👤 ${esc(r.loadBy)}</span>
      ${r.confAt?`<span>🏭 ${tAr(r.confAt)} — ${esc(r.confBy)}</span>`:""}
      ${r.weighAt?`<span>⚖️ ${tAr(r.weighAt)} — ${esc(r.weighBy)}</span>`:""}
      ${r.editAt?`<span style="color:var(--wheat)">✏️ ${tAr(r.editAt)} — ${esc(r.editBy)}</span>`:""}
      ${r.paidAt?`<span style="color:var(--settled)">💰 ${tAr(r.paidAt)} — ${esc(r.paidBy)}</span>`:""}
    </div>
    <div class="rac">${ac.join("")}</div>
  </div>`;
}

function _pagBar(total,shown,hasMore){
  return`<div style="display:flex;align-items:center;justify-content:space-between;background:var(--ink-050);border-radius:10px;padding:8px 12px;flex-wrap:wrap;gap:6px">
    <span style="font-size:11px;color:var(--paper-3)">يعرض <strong style="color:var(--wheat-hi)">${AR(shown)}</strong> من <strong style="color:var(--wheat-hi)">${AR(total)}</strong></span>
    <div style="display:flex;gap:5px;align-items:center">
      ${_recPage>0?`<button class="btn bsm bgh" onclick="_recPagePrev()">◀ السابق</button>`:""}
      <span style="font-size:11px;color:var(--paper-4)">صفحة ${AR(_recPage+1)} / ${AR(Math.ceil(total/_recPageSize))}</span>
      ${hasMore?`<button class="btn bsm" style="background:var(--wheat);color:#000;font-weight:700" onclick="_recPageNext()">التالي ▶</button>`:""}
    </div>
  </div>`;}

function _renderRecPage(reset){
  const list=document.getElementById("RL");
  const f=_recFiltered;
  if(!f.length){
    list.innerHTML=`<div class="empty-state"><b>لا توجد وصولات بعد</b>ابدأ من تبويب «شراء» لتسجيل أول وزن.</div>`;
    return;
  }
  const start=_recPage*_recPageSize;
  const slice=f.slice(start,start+_recPageSize);
  const cards=slice.map(_buildRecCard).join("");
  const total=f.length;
  const shown=Math.min(start+_recPageSize,total);
  const hasMore=shown<total;
  const bar=_pagBar(total,shown,hasMore);
  list.innerHTML=bar+`<div style="margin:6px 0">`+cards+`</div>`+bar;
  if(!reset) list.scrollTop=0;
}

