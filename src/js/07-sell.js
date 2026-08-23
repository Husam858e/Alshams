/* ════ حفظ وصل بيع ════ */
function saveSellRec(r){
  _fbWrite("sell_records",r.id,r,safe=>{
    const idx=SELL_RECS.findIndex(x=>x.id===r.id);
    if(idx>=0)SELL_RECS[idx]=safe; else SELL_RECS.unshift(safe);
    SELL_RECS.sort(_byDkDesc);   // v17.39 — تعديل التاريخ ينقل الوصل ليومه فوراً
    try{localStorage.setItem("wShamsSellCache",JSON.stringify(SELL_RECS));}catch(e){}
  });
}
function delSellRec(id){
  _toTrash("sell",SELL_RECS.find(r=>r.id===id));
  _fbWrite("sell_records",id,null,()=>{
    SELL_RECS=SELL_RECS.filter(r=>r.id!==id);
    try{localStorage.setItem("wShamsSellCache",JSON.stringify(SELL_RECS));}catch(e){}
  });
}

/* ════ فورم وصل البيع ════ */
function sSM(m){
  _sellMat=m;
  ["jet","gravel","mixed","straw"].forEach(k=>document.getElementById("sm"+k)?.classList.toggle("active",k===m));
}
function submitSellRec(){
  const drv=(document.getElementById("sDrv")?.value||"").trim();
  const plt=(document.getElementById("sPlt")?.value||"").trim();
  const dph=(document.getElementById("sDph")?.value||"").trim();
  const rcv=(document.getElementById("sRcv")?.value||"").trim();
  const dst=document.getElementById("sDst")?.value||PROVS[0];
  const emp=numIn("sEmp")||0;
  const note=(document.getElementById("sNote")?.value||"").trim();
  if(!drv){showToast("⚠ أدخل اسم الفلاح");return;}
  if(!plt){showToast("⚠ أدخل رقم العجلة");return;}
  if(!emp||emp<=0){showToast("⚠ أدخل الوزن الفارغ");return;}
  // أجور الوصل
  const wOn=document.getElementById("sWaslOn")?.checked||false;
  const wPrice=wOn?(numIn("sWaslPrice")||0):0;
  // أجور النقل
  const nOn=document.getElementById("sNaqlOn")?.checked||false;
  const nKabs=nOn?(parseFloat(document.getElementById("sNaqlKabs")?.value)||0):0;
  const nUP=nOn?(numIn("sNaqlUP")||0):0;
  const nTransporter=nOn?(document.getElementById("sNaqlTransporter")?.value.trim()||""):"";
  const naqlFee=nOn?nKabs*nUP:0;
  const r={
    id:genId(),seq:Date.now(),
    driver:drv,plate:plt,driverPhone:dph,receiver:rcv,dest:dst,note,
    mat:_sellMat,
    ppkg:null,gross:null,empty:emp,net:null,
    wFee:null,waslFee:wOn?wPrice:0,naqlFee,final:null,
    wOn,wPrice,nOn,nKabs,nUP,transporter:nTransporter,naqlFee,
    status:"waiting",
    paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    loadAt:nowStr(),loadBy:S.cu.name,
    confAt:null,confBy:null,
    weighAt:null,weighBy:null,
    dk:toDay(),
  };
  saveSellRec(r);
  clrSellForm();
  document.querySelectorAll(".tbb").forEach(b=>b.classList.remove("active"));
  document.querySelectorAll(".tc").forEach(c=>c.classList.remove("active"));
  const sellRecsBtn=document.getElementById("sellRecsTabBtn");
  if(sellRecsBtn)sellRecsBtn.classList.add("active");
  document.getElementById("tc-sell-recs")?.classList.add("active");
  renderSellRecs();
  showToast("✅ تم حفظ وصل البيع — "+r.plate);
}
function clrSellForm(){
  ["sDrv","sPlt","sDph","sRcv","sEmp","sWaslPrice","sNaqlKabs","sNaqlUP","sNaqlTransporter","sNote"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  const wOn=document.getElementById("sWaslOn");if(wOn)wOn.checked=false;
  const nOn=document.getElementById("sNaqlOn");if(nOn)nOn.checked=false;
  toggleSellWasl();toggleSellNaql();
  _sellMat="jet";
  ["jet","gravel","mixed","straw"].forEach(k=>document.getElementById("sm"+k)?.classList.toggle("active",k==="jet"));
}
function toggleSellWasl(){
  const on=document.getElementById("sWaslOn")?.checked;
  const sec=document.getElementById("sWaslSec");
  if(sec)sec.style.display=on?"block":"none";
}
function toggleSellNaql(){
  const on=document.getElementById("sNaqlOn")?.checked;
  const sec=document.getElementById("sNaqlSec");
  if(sec)sec.style.display=on?"block":"none";
}

/* ════ تأكيد البيع (مرحلة ٢: سعر الكغم فقط) ════ */
let _sellConfId=null;
function openSellConf(id){
  const r=SELL_RECS.find(x=>x.id===id);if(!r)return;
  _sellConfId=id;
  document.getElementById("scT1").innerHTML=`<strong>${esc(r.plate)}</strong> (${esc(r.driver)})`;
  document.getElementById("scT2").innerHTML=`الوجهة: <strong>${esc(r.dest)}</strong> | وزن فارغ: <strong>${fKG(r.empty)}</strong>${r.wOn?` | وصل: <strong style="color:var(--steel)">${fIQD(r.wPrice)}</strong>`:""}${r.nOn?` | نقل: <strong style="color:var(--steel)">${fIQD(r.naqlFee)}</strong>`:""}`;
  document.getElementById("scPrc").value="";
  document.getElementById("scCalc").textContent="";
  document.getElementById("mSellConf").classList.add("active");
}
function confSellRec(){
  const id=_sellConfId;
  const p=numIn("scPrc");
  if(!p||p<=0){document.getElementById("scCalc").textContent="⚠ أدخل سعراً";document.getElementById("scCalc").style.color="var(--owing)";return;}
  const r=SELL_RECS.find(x=>x.id===id);if(!r)return;
  const upd={...r,status:"confirmed",ppkg:p,confAt:nowStr(),confBy:S.cu.name};
  saveSellRec(upd);closeM();showToast("✅ تم تأكيد السعر — "+fIQD(p)+"/كغم");
}

/* ════ وزن كلي البيع (مرحلة ٣) ════ */
let _sellWeighId=null;
function openSellWeigh(id){
  const r=SELL_RECS.find(x=>x.id===id);if(!r)return;
  _sellWeighId=id;
  let extra="";
  if(r.wOn)extra+=` | وصل: <strong style="color:var(--steel)">${fIQD(r.wPrice)}</strong>`;
  if(r.nOn)extra+=` | نقل: <strong style="color:var(--steel)">${fIQD(r.naqlFee)}</strong>${r.transporter?` (${esc(r.transporter)})`:""}`;
  document.getElementById("swT").innerHTML=`<strong>${esc(r.plate)}</strong> (${esc(r.driver)})<br>وزن فارغ: <strong>${fKG(r.empty)}</strong> | سعر: <strong>${fIQD(r.ppkg)}</strong>/كغم${extra}`;
  document.getElementById("swGrs").value="";
  document.getElementById("swCalc").textContent="";
  document.getElementById("mSellWeigh").classList.add("active");
}
function prevSW(){
  const r=SELL_RECS.find(x=>x.id===_sellWeighId);if(!r)return;
  const gv=numIn("swGrs");
  const el=document.getElementById("swCalc");
  if(!gv||gv<=0){el.textContent="";return;}
  if(gv<=r.empty){el.textContent="⚠ الوزن الكلي أصغر من الفارغ!";el.style.color="var(--owing)";return;}
  const net=gv-r.empty;
  const wFee=net*r.ppkg;
  const waslFee=r.wOn?r.wPrice:0;
  const naqlFee=r.nOn?r.naqlFee:0;
  const final=wFee+waslFee+naqlFee;
  let t=`الصافي: ${fKG(net)} | أجور الوزن: ${fIQD(wFee)}`;
  if(r.wOn)t+=` + وصل: ${fIQD(waslFee)}`;
  if(r.nOn)t+=` + نقل: ${fIQD(naqlFee)}`;
  t+=` = ${fIQD(final)}`;
  el.textContent=t;el.style.color="var(--wheat-hi)";
}
function confSellWeigh(){
  const id=_sellWeighId;
  const gv=numIn("swGrs");
  const r=SELL_RECS.find(x=>x.id===id);if(!r)return;
  if(!gv||gv<=r.empty){showToast("⚠ الوزن الكلي غير صحيح");return;}
  const net=gv-r.empty;
  const wFee=net*r.ppkg;
  const waslFee=r.wOn?r.wPrice:0;
  const naqlFee=r.nOn?r.naqlFee:0;
  const final=wFee+waslFee+naqlFee;
  const upd={...r,gross:gv,net,wFee,waslFee,naqlFee,final,status:"weighed",weighAt:nowStr(),weighBy:S.cu.name};
  const dup=_findDuplicateRec(SELL_RECS,r.driver,gv,r.empty,r.ppkg,r.id);
  const doSave=()=>{saveSellRec(upd);closeM();showToast("✅ تم إغلاق وصل البيع — "+fIQD(final));};
  if(dup){showDupWarning(dup,doSave);return;}
  doSave();
}

/* ════ تعديل وصل البيع ════ */
let _seOrigDk=null;
function openSellEdit(id){
  const r=SELL_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("seId").value=id;
  _seOrigDk=r.dk||toDay();
  document.getElementById("seDk").value=_seOrigDk;
  document.getElementById("seDv").value=r.driver||"";
  document.getElementById("sePl").value=r.plate||"";
  document.getElementById("seDph2").value=r.driverPhone||"";
  document.getElementById("seRcv2").value=r.receiver||"";
  document.getElementById("seDst").value=r.dest||PROVS[0];
  document.getElementById("seMt").value=r.mat||"jet";
  _fillMatIcons("se");
  _updateMatBtnActive("se",r.mat||"jet");
  setNumIn("sePrc",r.ppkg||"");
  setNumIn("seEm",r.empty||"");
  setNumIn("seGr",r.gross||"");
  // وصل
  document.getElementById("seWaslOn").checked=r.wOn||false;
  setNumIn("seWasl",r.wPrice||"");
  document.getElementById("seWaslSec").style.display=r.wOn?"block":"none";
  // نقل
  document.getElementById("seNaqlOn").checked=r.nOn||false;
  document.getElementById("seNaqlKabs").value=r.nKabs||"";
  setNumIn("seNaqlUP",r.nUP||"");
  document.getElementById("seNaqlTransporter").value=r.transporter||"";
  document.getElementById("seNaqlSec").style.display=r.nOn?"block":"none";
  document.getElementById("sePaid").value=r.paid?"paid":"unpaid";
  document.getElementById("seNote").value=r.note||"";
  document.getElementById("mSellEdit").classList.add("active");
}
function saveSellEdit(){
  const id=document.getElementById("seId").value;
  const r=SELL_RECS.find(x=>x.id===id);if(!r)return;
  const p=numIn("sePrc")||r.ppkg;
  const g=numIn("seGr")||r.gross;
  const _eRaw=numIn("seEm");
  const e=isNaN(_eRaw)?r.empty:_eRaw;
  // v17.48 — نفس حارس الشراء: لا وصل يناقض نفسه
  if(!_guardWeights(g,e,r.status==="weighed"))return;
  const wOn=document.getElementById("seWaslOn").checked;
  const wPrice=wOn?(numIn("seWasl")||0):0;
  const nOn=document.getElementById("seNaqlOn").checked;
  const nKabs=nOn?(parseFloat(document.getElementById("seNaqlKabs").value)||0):0;
  const nUP=nOn?(numIn("seNaqlUP")||0):0;
  const nTransporter=nOn?(document.getElementById("seNaqlTransporter").value.trim()||r.transporter||""):"";
  const naqlFee=nOn?nKabs*nUP:0;
  const paidVal=document.getElementById("sePaid").value==="paid";
  const seDkNow=document.getElementById("seDk").value;
  const dkVal=seDkNow||_seOrigDk||toDay();
  let upd={
    ...r,
    driver:document.getElementById("seDv").value.trim()||r.driver,
    plate:document.getElementById("sePl").value.trim()||r.plate,
    driverPhone:document.getElementById("seDph2").value.trim(),
    receiver:document.getElementById("seRcv2").value.trim(),
    dest:document.getElementById("seDst").value,
    mat:document.getElementById("seMt").value,
    dk:dkVal,
    note:(document.getElementById("seNote")?.value||"").trim(),
    ppkg:p,empty:e,wOn,wPrice,nOn,nKabs,nUP,transporter:nTransporter,naqlFee,
    paid:paidVal,
    paidAt:paidVal?(r.paidAt||nowStr()):null,
    paidBy:paidVal?(r.paidBy||S.cu.name):null,
    edited:true,editAt:nowStr(),editBy:S.cu.name,
  };
  if(p&&g&&e&&g>e){
    const net=g-e;const wFee=net*p;const waslFee=wOn?wPrice:0;const final=wFee+waslFee+naqlFee;
    upd={...upd,gross:g,net,wFee,waslFee,naqlFee,final};
  }
  if(!_guardOverpay(r,getRecTotal(upd)))return;      // v17.48
  saveSellRec(upd);closeM();showToast("✏️ تم تعديل وصل البيع — "+upd.plate);
}
function toggleSeWasl(){const on=document.getElementById("seWaslOn").checked;document.getElementById("seWaslSec").style.display=on?"block":"none";}
function toggleSeNaql(){const on=document.getElementById("seNaqlOn").checked;document.getElementById("seNaqlSec").style.display=on?"block":"none";}

/* ════ دفع وصل البيع ════ */
function toggleSellPaid(id){openPartialPay(id,'sell');}

/* ════ حذف وصل البيع ════ */
let _sellDelId=null;
function openSellDel(id){
  _sellDelId=id;
  const r=SELL_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("sellDelTxt").innerHTML=
    `هل تريد حذف وصل بيع <strong>${esc(r.plate)}</strong> — <strong>${esc(r.driver)}</strong>؟`;
  document.getElementById("mSellDel").classList.add("active");
}
function confirmSellDel(){
  if(!_sellDelId)return;
  delSellRec(_sellDelId);
  _sellDelId=null;closeM();renderSellRecs();renderSellStats();showToast("🗑️ تم الحذف");
}

/* ════ طباعة وصل البيع ════ */
function openSellPrint(id){
  const r=SELL_RECS.find(x=>x.id===id);if(!r)return;
  _printHTML=buildSellReceipt(r);
  _currentRecId=id;_isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent=`💰 ${esc(r.plate)} — ${tAr(r.dk||toDay())}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildSellReceipt(r){
  const isW=r.status!=="weighed";
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const matInfo=MAT[r.mat]||{label:r.mat||"—",icon:"📦"};
  let b=sec("معلومات وصل البيع");
  b+=row("📅 التاريخ",tAr(r.dk));
  b+=row("الحالة",{waiting:"🟠 انتظار تأكيد",confirmed:"🟡 انتظار وزن كلي",weighed:"✅ مكتمل"}[r.status]||r.status);
  if(r.paid)b+=row("حالة الدفع","✅ مدفوع كامل");
  else if((r.paidTotal||0)>0)b+=row("حالة الدفع","💰 جزئي — مدفوع: "+fIQD(r.paidTotal)+" | متبقي: "+fIQD(getRemaining(r)));
  if(!r.paid&&!(r.paidTotal>0)&&r.status==="weighed")b+=row("حالة الدفع","⏳ غير مدفوع");
  b+=row("الوجهة","📍 "+r.dest);
  if(r.edited)b+=row("ملاحظة","✏️ تم تعديله");
  if(r.note)b+=row("📝 ملاحظة",r.note);
  b+=sec("بيانات الفلاح");
  b+=row("الفلاح / رقم العجلة",r.driver+" — "+r.plate);
  if(r.driverPhone)b+=row("رقم الفلاح",r.driverPhone);
  if(r.receiver)b+=row("اسم المستلم",r.receiver);
  b+=prRowRaw("نوع الحمولة",matInfo.icon+" "+esc(matInfo.label));
  b+=sec("مراحل الوزن");
  b+=row("① الوزن الفارغ",fKG(r.empty));
  b+=row("② الوزن الكلي",isW?"— في الانتظار —":fKG(r.gross));
  b+=row("③ الوزن الصافي",isW?"— في الانتظار —":fKG(r.net));
  b+=sec("الأجور والمبالغ — البيع");
  b+=row("سعر الكغم",r.ppkg?fIQD(r.ppkg):"— لم يُحدد بعد —");
  if(!isW){
    b+=row("أجور الوزن (يُجمع)",fIQD(r.wFee));
    if(r.wOn&&r.waslFee)b+=row("أجور الوصل (تُجمع)","+ "+fIQD(r.waslFee));
    if(r.nOn&&r.naqlFee){
      if(r.transporter)b+=row("الناقل",r.transporter);
      b+=row(`أجور النقل ${AR(r.nKabs)} كبسة × ${fIQD(r.nUP)}`,"+ "+fIQD(r.naqlFee));
    }
  }else{
    if(r.wOn)b+=row("سعر الوصل (يُجمع)",fIQD(r.wPrice));
    if(r.nOn){
      if(r.transporter)b+=row("الناقل",r.transporter);
      b+=row(`أجور النقل (${AR(r.nKabs)} × ${fIQD(r.nUP)})`,fIQD(r.naqlFee));
    }
  }
  /* تم حذف قسم التوقيتات حسب طلب المستخدم */
  const paidBanner=r.paid&&!isW?`<div style="background:#EAF2EB;border:1.5px solid #3F7A4C;border-radius:5px;padding:5px 12px;margin:5px 0;text-align:center;color:#3F7A4C;font-weight:900;font-size:11px;">✅ تم استلام الدفع</div>`:"";
  const paySectionSell=!isW?buildPaymentsSection(r):"";
  const tot=!isW?`${paidBanner}${paySectionSell}<div class="prtot"><span class="pk">المبلغ النهائي (بيع)</span><span class="pv">${fIQD(r.final)}</span></div>`:"";
  const wb2=isW?`<div class="prwb">⏳ ${r.status==="waiting"?"بانتظار تأكيد السعر":"بانتظار الوزن الكلي"}</div>`:"";
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  return`${COHEAD}
    <div class="prh" style="background:#5A431C">
      <div class="prhtl">وصل بيع عجلة</div>
      <div class="prhmt">${tAr(toDay())}<br/>${tAr(p2(d.getHours())+":"+p2(d.getMinutes()))}</div>
    </div>
    ${wb2}<div class="prb">${b}</div>${tot}${COFTR}`;
}

/* ════ عرض سجلات البيع ════ */
const SELL_SL={waiting:"🟠 انتظار تأكيد",confirmed:"🟡 انتظار وزن كلي",weighed:"✅ مكتمل"};
const SELL_SB={waiting:"bw",confirmed:"bc",weighed:"bd"};
const SELL_ST=["① وزن فارغ","② تأكيد السعر","③ وزن كلي"];
const SELL_SI={waiting:0,confirmed:1,weighed:2};

function renderSellRecs(){
  if(!S.cu)return;
  const srch=(document.getElementById("sfSearch")?.value||"").trim().toLowerCase();
  const mf=document.getElementById("sfM")?.value||"all";
  const sf=document.getElementById("sfS")?.value||"all";
  const df=document.getElementById("sfDt")?.value||"";
  const pf=document.getElementById("sfPaid")?.value||"all";
  const dst=document.getElementById("sfDst")?.value||"all";
  let f=SELL_RECS.filter(r=>{
    if(mf!=="all"&&r.mat!==mf)return false;
    if(sf!=="all"&&r.status!==sf)return false;
    if(df&&r.dk!==df)return false;
    if(pf==="paid"&&!r.paid)return false;
    if(pf==="unpaid"&&r.paid)return false;
    if(dst!=="all"&&r.dest!==dst)return false;
    if(srch){
      if(!smartMatch(r.driver,srch)&&
         !smartMatch(r.plate,srch)&&
         !smartMatch(r.receiver,srch))return false;
    }
    return true;
  });
  const dn=f.filter(r=>r.final!=null);
  const tF=dn.reduce((s,r)=>s+r.final,0);
  const tN=dn.reduce((s,r)=>s+(r.net||0),0);
  const _tP=f.filter(r=>r.final!=null).reduce((a,r)=>a+getPaidTotal(r),0);
  const _tFin=f.filter(r=>r.final!=null).reduce((a,r)=>a+(r.final||0),0);
  const _tR=Math.max(0,_tFin-_tP);
  document.getElementById("sellFSm").innerHTML=
    `<span>الوصولات: <strong>${AR(f.length)}</strong></span>
     <span>الصافي: <strong>${fKG(tN)}</strong></span>
     <span>المجموع: <strong>${fIQD(tF)}</strong></span>
     <span style="color:var(--settled)">المدفوع: <strong>${fIQD(_tP)}</strong></span>
     <span style="color:${_tR>0?"var(--owing)":"var(--settled)"}">المتبقي: <strong>${fIQD(_tR)}</strong></span>`;
  const list=document.getElementById("sellRL");
  if(!f.length){list.innerHTML=`<div style="text-align:center;color:var(--ink-300);padding:35px;font-size:14px">📭 لا توجد سجلات بيع</div>`;return;}
  list.innerHTML=f.map(r=>{
    const si=SELL_SI[r.status]??0;
    const matInfo=MAT[r.mat]||{label:r.mat,icon:"📦"};
    const stH=`<div class="stl">${SELL_ST.map((s,i)=>`<div class="sts ${i<si?"done":i===si?"cur":""}">${s}</div>`).join("")}</div>`;
    let wR="";
    if(r.net!=null){
      wR=`<div class="rw">
        <div class="rwi"><span class="rwk">الفارغ</span><span class="rwv">${fKG(r.empty)}</span></div><span class="rws" style="color:var(--owing)">−</span>
        <div class="rwi"><span class="rwk">الكلي</span><span class="rwv">${fKG(r.gross)}</span></div><span class="rws">=</span>
        <div class="rwi"><span class="rwk">الصافي</span><span class="rwv" style="color:var(--wheat)">${fKG(r.net)}</span></div><span class="rws">×</span>
        <div class="rwi"><span class="rwk">كغم</span><span class="rwv">${fIQD(r.ppkg)}</span></div><span class="rws">=</span>
        <div class="rwi"><span class="rwk">أجور</span><span class="rwv" style="color:var(--settled)">${fIQD(r.wFee)}</span></div>
        ${r.wOn?`<span class="rws" style="color:var(--settled)">+</span><div class="rwi"><span class="rwk">وصل</span><span class="rwv" style="color:var(--steel)">${fIQD(r.waslFee)}</span></div>`:""}
        ${r.nOn?`<span class="rws" style="color:var(--steel)">+</span><div class="rwi"><span class="rwk">نقل</span><span class="rwv" style="color:var(--steel)">${fIQD(r.naqlFee)}</span></div>`:""}
        <span class="rws">=</span>
        <div class="rwi fa"><span class="rwk">النهائي</span><span class="rwv" style="color:var(--wheat-hi);font-size:12px">${fIQD(r.final)}</span></div>
      </div>`;
    }else{
      wR=`<div class="rw">
        <div class="rwi"><span class="rwk">الفارغ</span><span class="rwv">${fKG(r.empty)}</span></div>
        <span class="rws" style="color:var(--wheat)">⟶</span>
        <div class="rwi"><span class="rwk" style="color:var(--wheat)">${r.status==="waiting"?"انتظار تأكيد السعر":"انتظار الوزن الكلي"}</span>
          <span class="rwv" style="color:var(--wheat);animation:blink 2s ease infinite;font-size:11px">⏳</span>
        </div>
      </div>`;
    }
    const ac=[];
    if(r.status==="waiting")ac.push(`<button class="btn bor bsm" onclick="openSellConf('${r.id}')">💰 تأكيد السعر</button>`);
    if(r.status==="confirmed")ac.push(`<button class="btn bgn bsm" onclick="openSellWeigh('${r.id}')">⚖️ وزن كلي</button>`);
    if(r.status==="weighed"){
      ac.push(payBtnHTML(r,"sell"));
    }
    ac.push(`<button class="btn bgh bsm" onclick="openSellEdit('${r.id}')">✏️ تعديل</button>`);
    ac.push(`<button class="btn bg bsm" onclick="openSellPrint('${r.id}')">🖨️ وصل</button>`);
    ac.push(`<button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openSellDel('${r.id}')">🗑️</button>`);
    return `<div data-rid="${r.id}" class="rc ${r.status==="weighed"?"done":""} ${r.status==="waiting"?"waiting":""}">
      <div class="rt">
        <div class="rtl">
          <span class="rpl">🚛 ${esc(r.plate)}</span>
          <span class="rdr">${esc(r.driver)}</span>
          <span class="badge" style="background:var(--ink-200);color:var(--paper-2)">📅 ${tAr(r.dk)}</span>
          <span class="badge" style="background:var(--pending-rule);color:var(--wheat)">${matInfo.icon} ${matInfo.label}</span>
          <span class="badge" style="background:var(--ink-300);color:var(--steel)">📍 ${esc(r.dest)}</span>
          ${r.receiver?`<span class="badge" style="background:var(--settled-wash);color:var(--settled)">👤 ${esc(r.receiver)}</span>`:""}
          ${r.edited?`<span class="badge" style="background:rgba(234,179,8,.15);color:var(--wheat)">✏️ تم تعديله</span>`:""}
          ${r.nOn&&r.transporter?`<span class="badge" style="background:rgba(249,115,22,.15);color:var(--wheat)">🚚 ${esc(r.transporter)}</span>`:""}
          ${r.paid?`<span class="badge" style="background:rgba(16,185,129,.15);color:var(--settled)">✅ مدفوع</span>`:r.paidTotal>0?`<span class="badge" style="background:rgba(251,191,36,.12);color:var(--wheat-hi)">💰 جزئي</span>`:""}
        </div>
        <span class="badge ${SELL_SB[r.status]||""}">${SELL_SL[r.status]||r.status}</span>
      </div>
      ${stH}${wR}
      ${r.status==="weighed"?payBarMiniHTML(r):""}
      ${r.note?`<div style="font-size:12px;color:var(--paper-2);padding:3px 0">📝 ${esc(r.note)}</div>`:""}
      <div class="rmt">
        <span>📅 ${tAr(r.loadAt)}</span><span>👤 ${esc(r.loadBy)}</span>
        ${r.driverPhone?`<span>📞 ${esc(r.driverPhone)}</span>`:""}
        ${r.confAt?`<span>💰 ${tAr(r.confAt)} — ${esc(r.confBy)}</span>`:""}
        ${r.weighAt?`<span>⚖️ ${tAr(r.weighAt)} — ${esc(r.weighBy)}</span>`:""}
        ${r.editAt?`<span style="color:var(--wheat)">✏️ ${tAr(r.editAt)} — ${esc(r.editBy)}</span>`:""}
        ${r.paidAt?`<span style="color:var(--settled)">💰 ${tAr(r.paidAt)} — ${esc(r.paidBy)}</span>`:""}
      </div>
      <div class="rac">${ac.join("")}</div>
    </div>`;
  }).join("");
}
function clrSF(){
  ["sfM","sfS","sfPaid","sfDst"].forEach(id=>document.getElementById(id)&&(document.getElementById(id).value="all"));
  document.getElementById("sfDt")&&(document.getElementById("sfDt").value="");
  document.getElementById("sfSearch")&&(document.getElementById("sfSearch").value="");
  renderSellRecs();
}

/* ════ إحصائيات البيع ════ */
function renderSellStats(){
  if(!S.cu)return;
  const recs=SELL_RECS,dn=recs.filter(r=>r.final!=null);
  const el=document.getElementById("sellSG");
  if(!el)return;
  const st=[
    {l:"إجمالي وصلات البيع",v:AR(recs.length),i:"📋",c:"var(--steel)"},
    {l:"انتظار تأكيد",v:AR(recs.filter(r=>r.status==="waiting").length),i:"⏳",c:"var(--wheat)"},
    {l:"انتظار وزن كلي",v:AR(recs.filter(r=>r.status==="confirmed").length),i:"⚖️",c:"var(--wheat)"},
    {l:"مكتملة",v:AR(dn.length),i:"✅",c:"var(--settled)"},
    {l:"الوزن الصافي الكلي",v:fKG(dn.reduce((s,r)=>s+(r.net||0),0)),i:"⚖️",c:"var(--wheat)"},
    {l:"إجمالي مبالغ البيع",v:fIQD(dn.reduce((s,r)=>s+r.final,0)),i:"💰",c:"var(--settled)"},
  ];
  el.innerHTML=st.map(s=>`
    <div class="sc" style="border-top-color:${s.c}">
      <span class="si">${s.i}</span><span class="sv">${s.v}</span><span class="sl">${s.l}</span>
    </div>`).join("");
}

/* ════ محصلة البيع — نظام كامل مثل الشراء ════ */

// بناء قسم وجهة واحدة في محصلة البيع
function buildSellDestSec(dRecs, dest){
  if(!dRecs.length) return "";
  const dNet=dRecs.reduce((s,r)=>s+(r.net||0),0);
  const dFin=dRecs.reduce((s,r)=>s+(r.final||0),0);
  const paidCount=dRecs.filter(r=>r.paid).length;
  const paidAmount=dRecs.reduce((s,r)=>s+getPaidTotal(r),0);
  const remaining=dFin-paidAmount;
  const avgTon=dNet>0?Math.round(dFin/(dNet/1000)):0;
  const rows=dRecs.map((r,i)=>`<tr>
    <td style="width:20px;text-align:center">${AR(i+1)}</td>
    <td style="width:65px">${tAr(r.dk)}</td>
    <td style="width:50px">${esc(r.plate)}</td>
    <td style="width:55px">${esc(r.driver)}</td>
    <td style="width:45px">${MAT[r.mat]?.label||r.mat}</td>
    <td style="width:50px">${esc(r.receiver||"—")}</td>
    <td style="width:55px;text-align:center;font-weight:700">${fKG(r.net)}</td>
    <td style="width:55px;text-align:center;color:#3E4D5A">${r.ppkg?fIQD(r.ppkg):"—"}</td>
    <td style="width:65px;text-align:center;font-weight:700;color:#8A6218">${fIQD(r.final)}</td>
    <td style="width:65px;text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C;font-weight:700">✅ مكتمل</span>':getPaidTotal(r)>0?`<span style="color:#8A6218;font-weight:700">💰 \${fIQD(getPaidTotal(r))}</span>`:'<span style="color:#943A31">⏳</span>'}</td>
  </tr>`).join("");
  return`
    <div>
    <div class="col-wh-title" style="background:#5A431C">📍 وجهة ${esc(dest)} — ${AR(dRecs.length)} وصل | مدفوع: ${AR(paidCount)} | غير مدفوع: ${AR(dRecs.length-paidCount)}</div>
    </div>
    <div style="padding:0 6px 5px">
      <table class="coltbl" style="width:100%;table-layout:auto;font-size:9px">
        <thead><tr>
          <th style="width:20px">#</th><th style="width:65px">التاريخ</th><th style="width:50px">اللوحة</th>
          <th style="width:55px">الفلاح</th><th style="width:45px">المادة</th>
          <th style="width:50px">المستلم</th>
          <th style="width:55px">الصافي</th><th style="width:55px">سعر الكغم</th><th style="width:65px">المبلغ</th><th style="width:65px">المدفوع</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot">
          <td colspan="6" style="font-weight:700;padding:5px 4px">مجموع ${esc(dest)}</td>
          <td style="text-align:center">${fKG(dNet)}</td>
          <td></td>
          <td style="text-align:center;font-weight:700">${fIQD(dFin)}</td>
          <td style="text-align:center;font-size:8px">${AR(paidCount)}/${AR(dRecs.length)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div class="col-wh-sum">
      ${[["المجموع",fIQD(dFin),"#B37D14"],["المدفوعات",fIQD(paidAmount),"#4E8A5A"],["الباقي",fIQD(remaining),"#A8453A"],["الصافي",fKG(dNet),"#6B6151"],["سعر الطن",fIQD(avgTon),"#4A5A68"]].map(([k,v,c])=>`<div><span class="ck">${k}</span><span class="cv" style="color:${c}">${v}</span></div>`).join("")}
    </div>`;
}

function buildSellCollHTML(data, period, destLabel, dateLabel){
  const PL={daily:"اليومية",weekly:"الأسبوعية",monthly:"الشهرية"};
  const dl=dateLabel||tAr(toDay());
  const tNet=data.reduce((s,r)=>s+(r.net||0),0);
  const tFin=data.reduce((s,r)=>s+(r.final||0),0);
  const paidTotal=data.filter(r=>r.paid).length;
  const paidAmount=data.reduce((s,r)=>s+getPaidTotal(r),0);
  const remaining=tFin-paidAmount;
  // تجميع حسب الوجهة
  const dests=[...new Set(data.map(r=>r.dest).filter(Boolean))];
  const secs=dests.map(d=>buildSellDestSec(data.filter(r=>r.dest===d),d)).join("");
  const grand=`<div class="grand" style="background:#1A1714;padding:12px 14px;margin-top:4px;page-break-before:always">
    <div style="color:#6B6151;font-size:11px;font-weight:700;margin-bottom:9px;text-align:center">📊 الإجمالي الشامل — ${destLabel||"جميع الوجهات"}</div>
    <div style="display:flex;gap:0;flex-wrap:wrap">
      ${[["الوزن الصافي الكلي",fKG(tNet),"#B37D14"],["المجموع الكلي",fIQD(tFin),"#B37D14"],["المدفوعات",fIQD(paidAmount),"#4E8A5A"],["الباقي",fIQD(remaining),"#A8453A"],["معدل سعر الطن",fIQD(tNet>0?Math.round(tFin/(tNet/1000)):0),"#4A5A68"]].map(([k,v,c])=>`<div style="flex:1;min-width:110px;text-align:center;border-left:1px solid #2E2822;padding:8px 5px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
    </div>
    <div style="margin-top:8px;text-align:center;font-size:10px;color:#6B6151">
      ${AR(data.length)} وصل مكتمل | مدفوع: ${AR(paidTotal)} | غير مدفوع: ${AR(data.length-paidTotal)}
    </div>
  </div>`;
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#5A431C;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#A8701C">محصلة البيع ${PL[period]||period} — ${destLabel||"جميع الوجهات"}</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${dl} | ${AR(data.length)} وصل مكتمل</div>
    </div>
    ${data.length===0?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد وصلات بيع مكتملة في هذه الفترة</div>`:`${secs}${grand}`}
    ${COFTR}
  </div>`;
}

function getSellCollData(period, baseDate){
  const base=baseDate||toDay();
  const bd=_D(base);
  return SELL_RECS.filter(r=>{
    if(!r.dk||r.status!=="weighed")return false;
    if(period==="daily")return r.dk===base;
    if(period==="weekly"){
      const rd=_D(r.dk);
      const dow=bd.getDay();
      const sow=_D(bd);sow.setDate(bd.getDate()-((dow+6)%7));
      const eow=_D(sow);eow.setDate(sow.getDate()+6);
      return rd>=sow&&rd<=eow;
    }
    if(period==="monthly")return r.dk.slice(0,7)===base.slice(0,7);
    return false;
  });
}

// فتح محصلة البيع (اليوم الحالي)
function openSellColl(period){
  const base=toDay();
  const data=getSellCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildSellCollHTML(data,period,"جميع الوجهات",tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="sell";
  document.getElementById("pactTitle").textContent=`محصلة البيع ${PL[period]||period}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("💰 "+AR(data.length)+" وصل بيع");
}

// فتح محصلة البيع التاريخية
function openSellHistColl(period){
  const base=_getSellHistBase(period);
  const data=getSellCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const dl=tAr(base);
  _printHTML=buildSellCollHTML(data,period,"جميع الوجهات",dl);
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="sell";
  document.getElementById("pactTitle").textContent=`محصلة البيع ${PL[period]} — ${dl}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("💰 "+AR(data.length)+" وصل — "+dl);
}
function shareHistSellColl(period){
  const base=_getSellHistBase(period);
  const data=getSellCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const dl=tAr(base);
  const html=buildSellCollHTML(data,period,"جميع الوجهات",dl);
  const fname=`محصلة_البيع_${PL[period]}_${base}.html`;
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,fname);
}
function _getSellHistBase(period){
  if(period==="daily"){const v=document.getElementById("sellHistDay")?.value;return v||toDay();}
  if(period==="weekly"){const v=document.getElementById("sellHistWeek")?.value;return v||toDay();}
  if(period==="monthly"){const v=document.getElementById("sellHistMonth")?.value;return v?v+"-01":toDay();}
  return toDay();
}
function quickOpenSellDay(date){document.getElementById("sellHistDay").value=date;openSellHistColl("daily");}
function quickOpenSellWeek(date){document.getElementById("sellHistWeek").value=date;openSellHistColl("weekly");}
function quickOpenSellMonth(ym){document.getElementById("sellHistMonth").value=ym;openSellHistColl("monthly");}

// تبويبات محصلة البيع الداخلية
let _curSellCollTab=1;
function showSellCollTab(n){
  _curSellCollTab=n;
  [1,2].forEach(i=>{
    const el=document.getElementById("sct"+i);
    if(el)el.style.display=i===n?"block":"none";
    const btn=document.getElementById("sctb"+i);
    if(btn){btn.style.background=i===n?"var(--pending-rule)":"transparent";btn.style.color=i===n?"#fff":"var(--paper-3)";}
  });
  if(n===2)buildSellHistoryLists();
}
function buildSellHistoryLists(){
  const done=SELL_RECS.filter(r=>r.status==="weighed"&&r.dk);
  // أيام
  const days=[...new Set(done.map(r=>r.dk))].sort((a,b)=>b.localeCompare(a));
  const dayEl=document.getElementById("sellHistDayList");
  if(dayEl){
    dayEl.innerHTML=!days.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات بعد</span>`:
    days.map(d=>{const dayRecs=done.filter(r=>r.dk===d),cnt=dayRecs.length;
      const st=_custPayState('sell',dayRecs);            // v17.40
      return`<button onclick="quickOpenSellDay('${d}')" title="${_payTitle(st)}"
        style="padding:6px 10px;border-radius:8px;border:1px solid ${st==="settled"?'var(--settled)':'var(--rule)'};background:${st==="settled"?'rgba(78,138,90,.12)':'var(--ink-100)'};color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px">
        <span style="font-size:10px;color:var(--wheat);font-weight:700">${tAr(d)}${_payMark(st)}</span>
        <span style="font-size:9px;color:var(--paper-3)">${AR(cnt)} وصل</span>
      </button>`;}).join("");
  }
  // أسابيع
  const weekMap={};
  done.forEach(r=>{const bd=_D(r.dk);const dow=bd.getDay();const mon=_D(bd);mon.setDate(bd.getDate()-((dow+6)%7));const key=_ds(mon);weekMap[key]=(weekMap[key]||0)+1;});
  const weeks=Object.keys(weekMap).sort((a,b)=>b.localeCompare(a));
  const weekEl=document.getElementById("sellHistWeekList");
  if(weekEl){
    weekEl.innerHTML=!weeks.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات بعد</span>`:
    weeks.map(w=>{const endD=_D(w);endD.setDate(endD.getDate()+6);const endS=_ds(endD);
      return`<button onclick="quickOpenSellWeek('${w}')"
        style="padding:6px 10px;border-radius:8px;border:1px solid var(--rule);background:var(--ink-100);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:110px">
        <span style="font-size:10px;color:var(--wheat);font-weight:700">${tAr(w)} ← ${tAr(endS)}</span>
        <span style="font-size:9px;color:var(--paper-3)">${AR(weekMap[w])} وصل</span>
      </button>`;}).join("");
  }
  // أشهر
  const monthMap={};
  done.forEach(r=>{const key=r.dk.slice(0,7);monthMap[key]=(monthMap[key]||0)+1;});
  const months=Object.keys(monthMap).sort((a,b)=>b.localeCompare(a));
  const monthEl=document.getElementById("sellHistMonthList");
  if(monthEl){
    const mNames=["","يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    monthEl.innerHTML=!months.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات بعد</span>`:
    months.map(m=>{const [yr,mn]=m.split("-");
      return`<button onclick="quickOpenSellMonth('${m}')"
        style="padding:8px 12px;border-radius:8px;border:1px solid var(--rule);background:var(--ink-100);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:90px">
        <span style="font-size:11px;color:var(--settled);font-weight:700">${mNames[+mn]||mn} ${tAr(yr)}</span>
        <span style="font-size:9px;color:var(--paper-3)">${AR(monthMap[m])} وصل</span>
      </button>`;}).join("");
  }
}
// تحديث قوائم البيع عند تحديث البيانات
function refreshSellHistIfOpen(){if(_curSellCollTab===2)buildSellHistoryLists();}
function setSellHistPeriod(p){
  ["daily","weekly","monthly"].forEach(x=>{
    const panel=document.getElementById("shp"+x.charAt(0).toUpperCase()+x.slice(1));
    if(panel)panel.style.display=x===p?"block":"none";
  });
  const map={daily:1,weekly:2,monthly:3};
  [1,2,3].forEach(i=>{
    const btn=document.getElementById("shpb"+i);
    if(!btn)return;
    btn.style.background=i===map[p]?"var(--pending-rule)":"transparent";
    btn.style.color=i===map[p]?"#fff":"var(--paper-3)";
  });
}
function doShareSellColl(period){
  const base=toDay();
  const data=getSellCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const html=buildSellCollHTML(data,period,"جميع الوجهات",tAr(base));
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,`محصلة_البيع_${PL[period]}_${base}.html`);
}

