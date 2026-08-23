/* ════════════════════════════════════════════
   FIREBASE INIT & REALTIME SYNC
════════════════════════════════════════════ */
function initFirebase(){
  // إذا لم تُحمَّل Firebase بعد، حاول تحميلها ديناميكياً
  if(typeof firebase==="undefined"){
    _loadFirebaseDynamic();
    return;
  }
  _doInitFirebase();
}

function _loadFirebaseDynamic(){
  const urls=[
    ["https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js","https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js","https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"],
    ["https://cdn.jsdelivr.net/npm/firebase@9.23.0/firebase-app-compat.js","https://cdn.jsdelivr.net/npm/firebase@9.23.0/firebase-database-compat.js","https://cdn.jsdelivr.net/npm/firebase@9.23.0/firebase-auth-compat.js"],
  ];
  let tried=0;
  function tryLoad(pair){
    const s1=document.createElement("script");
    s1.src=pair[0];
    s1.onerror=function(){
      tried++;
      if(tried<urls.length) tryLoad(urls[tried]);
      else{ showToast("⚠ تعذّر تحميل Firebase — تعمل بالكاش المحلي"); _loadLocalCache(); }
    };
    s1.onload=function(){
      const s2=document.createElement("script");
      s2.src=pair[1];
      s2.onerror=function(){ showToast("⚠ خطأ في تحميل قاعدة البيانات"); _loadLocalCache(); };
      s2.onload=function(){
        /* v17.50 — مكتبة المصادقة: قواعد الأمان تشترط هوية.
           فشلها لا يوقف التطبيق — يعمل ويُنبّه. */
        const s3=document.createElement("script");
        s3.src=pair[2];
        const go=function(){ setTimeout(function(){ if(typeof firebase!=="undefined") _doInitFirebase(); else _loadLocalCache(); },300); };
        s3.onerror=go; s3.onload=go;
        document.head.appendChild(s3);
      };
      document.head.appendChild(s2);
    };
    document.head.appendChild(s1);
  }
  showToast("🔄 جاري تحميل Firebase...",2000);
  tryLoad(urls[tried]);
}

function _loadLocalCache(){
  try{const c=localStorage.getItem("wShamsCache");if(c)S.recs=JSON.parse(c).sort(_byDkDesc);}catch(e){}
  try{const cs=localStorage.getItem("wShamsSellCache");if(cs)SELL_RECS=JSON.parse(cs).sort(_byDkDesc);}catch(e){}
  loadDamCache();loadSrfCache();loadWrkCache();loadMnlCache();loadSalCache();loadEmpTxnCache();loadArbCache();
  _loadAuditCache();_loadClosures();
  document.getElementById("syncDot").style.background="var(--owing)";
  if(S.cu){renderRecs();renderStats();renderWH();}
}

/* ════════════════════════════════════════════
   مراقب الاتصال الفعلي بفايربيس
   ─────────────────────────────────────────
   هذا هو المصدر الوحيد لتلوين نقطة الاتصال (syncDot):
   أخضر = متصل بالسيرفر فعلياً | أحمر = غير متصل
   منفصل تماماً عن "جاري الحفظ" (شريط التقدم العلوي)
   حتى لا يظهر النظام "غير متصل" أثناء حفظ وصل فقط
════════════════════════════════════════════ */
function _initConnMonitor(){
  try{
    db.ref(".info/connected").on("value",snap=>{
      const on=snap.val()===true;
      const dot=document.getElementById("syncDot");
      if(dot)dot.style.background=on?"var(--settled)":"var(--owing)";
      // v17: لحظة عودة الاتصال، أرسل كل ما هو معلّق في طابور الكتابة
      if(on&&_writeQueue.length){setTimeout(_flushQueue,400);}
    });
  }catch(e){console.warn("conn monitor error:",e);}
}

/* ══════════════════════════════════════════════════════════════
   المصادقة — v17.50
   ──────────────────────────────────────────────────────────────
   قواعد فايربيس المفتوحة (.read/.write = true) تعني أن كل من
   يملك رابط التطبيق يستطيع قراءة الحسابات كلها ومحوها. ورموز
   الدخول الأربعة مكتوبة في هذا الملف نفسه، فهي تمنع الفضولي
   لا من يعرف.
   الخطوة الأولى الصحيحة: أن يكون لكل جلسة هوية، فتشترط القواعد
   على الخادم auth != null. الدخول المجهول يكفي لإغلاق الباب
   أمام المسح العشوائي لقواعد فايربيس المكشوفة — وهو أشيع خطر
   فعلي على تطبيق كهذا.
   ⚠️ هذه أول طبقة لا آخرها. الطبقة التالية (حساب بريد وكلمة سر
      لكل مستخدم) موصوفة في firebase-rules.md — بها وحدها تستطيع
      سحب صلاحية شخص بعينه.
══════════════════════════════════════════════════════════════ */
let _authReady=false;
function _fbSignIn(app){
  return new Promise(resolve=>{
    if(typeof firebase==="undefined"||!firebase.auth){ resolve(false); return; }
    let done=false;
    const finish=v=>{ if(!done){ done=true; _authReady=v; resolve(v);} };
    try{
      const auth=firebase.auth(app);
      auth.onAuthStateChanged(u=>{ if(u)finish(true); });
      auth.signInAnonymously().catch(err=>{
        console.warn("anon auth failed:",err&&err.code);
        // الدخول المجهول غير مُفعَّل في المشروع — التطبيق يعمل، لكن القواعد المشدّدة سترفضه
        if(err&&String(err.code||"").indexOf("operation-not-allowed")>=0)
          showToast("⚠ فعّل «Anonymous» في Firebase ← Authentication",4000);
        finish(false);
      });
      setTimeout(()=>finish(false),4000);      // لا ننتظر إلى الأبد
    }catch(e){ finish(false); }
  });
}

function _doInitFirebase(){
  try{
    const app=firebase.initializeApp(FB_CONFIG);
    db=firebase.database(app);
    _fbSignIn(app).then(ok=>{
      const dot=document.getElementById("syncDot");
      if(dot&&!ok)dot.title="متصل بلا هوية — فعّل الدخول المجهول لتطبيق قواعد الأمان";
    });
    _initConnMonitor();
    dbRef=db.ref("records");
    dbRefSell=db.ref("sell_records");
    dbRefDam=db.ref("dam_records");
    dbRefSrf=db.ref("srf_records");
    dbRefWrk=db.ref("wrk_records");
    dbRefMnl=db.ref("mnl_records");
    dbRefEmp=db.ref("emp_list");
    dbRefSal=db.ref("sal_records");
    dbRefAdv=db.ref("adv_records");
    // v17: كانت هذه المستمعات لا تُفرِّغ المصفوفة عند حذف آخر سجل → تبقى بيانات وهمية على الشاشة.
    dbRefEmp.on("value",snap=>{const v=snap.val();EMP_LIST=v?Object.values(v):[];try{localStorage.setItem("wShamsEmp",JSON.stringify(EMP_LIST));}catch(x){}if(_tabActive("sal-emps"))_scheduleRender(renderEmpList);});
    dbRefSal.on("value",snap=>{const v=snap.val();SAL_RECS=v?Object.values(v).sort((a,b)=>(b.dk||"").localeCompare(a.dk||"")):[];try{localStorage.setItem("wShamsSal",JSON.stringify(SAL_RECS));}catch(x){}if(_tabActive("sal-recs"))_scheduleRender(renderSalRecs);});
    dbRefAdv.on("value",snap=>{const v=snap.val();ADV_RECS=v?Object.values(v):[];try{localStorage.setItem("wShamsAdv",JSON.stringify(ADV_RECS));}catch(x){}if(_tabActive("sal-emps"))_scheduleRender(renderAdvSummary);});
    /* v17.50 — سجلّ التدقيق: نجلب الأحدث فقط كي لا يثقل الجهاز مع الزمن */
    dbRefAudit=db.ref(_AUDIT_NODE);
    dbRefAudit.limitToLast(1500).on("value",snap=>{
      const v=snap.val();
      AUDIT=v?Object.values(v).sort((a,b)=>String(b.at||"").localeCompare(String(a.at||""))):[];
      try{localStorage.setItem(_AUDIT_CACHE_K,JSON.stringify(AUDIT.slice(0,400)));}catch(e){}
      if(_tabActive("audit"))_scheduleRender(renderAuditTab);
    });
    dbRefClosures=db.ref("closures");
    dbRefClosures.on("value",snap=>{
      const v=snap.val();
      CLOSURES=v?Object.values(v):[];
      try{localStorage.setItem("wShamsClosures",JSON.stringify(CLOSURES));}catch(e){}
      if(_tabActive("audit"))_scheduleRender(renderAuditTab);
    });
    dbRefEmpTxn=db.ref("emp_txns");
    dbRefEmpTxn.on("value",snap=>{const v=snap.val();EMP_TXNS=v?Object.values(v).sort((a,b)=>(b.dk||"").localeCompare(a.dk||"")):[];try{localStorage.setItem("wShamsEmpTxn",JSON.stringify(EMP_TXNS));}catch(x){}if(_tabActive("sal-emps"))_scheduleRender(renderEmpList);});
    dbRefWrk.on("value",snap=>{
      const v=snap.val();
      WRK_RECS=v?Object.values(v).sort(_byDkDesc):[];
      try{localStorage.setItem("wShamsWrkCache",JSON.stringify(WRK_RECS));}catch(e){}
      if(_tabActive("wrk-recs"))_scheduleRender(renderWrkRecs);
    });
    dbRefArb=db.ref("arb_records");
    dbRefArb.on("value",snap=>{
      const v=snap.val();
      ARB_RECS=v?Object.values(v).sort(_byDkDesc):[];
      try{localStorage.setItem("wShamsArbCache",JSON.stringify(ARB_RECS));}catch(e){}
      if(_tabActive("arb-recs"))_scheduleRender(renderArbRecs);
    });
    dbRefMnl=db.ref("mnl_records");
    dbRefMnl.on("value",snap=>{
      const v=snap.val();
      MNL_RECS=v?Object.values(v).sort(_byDkDesc):[];
      try{localStorage.setItem("wShamsMnlCache",JSON.stringify(MNL_RECS));}catch(e){}
      if(_tabActive("naql-new"))_scheduleRender(renderMnlRecs);
      if(_tabActive("naql-coll"))_scheduleRender(renderNaqlColl);
      if(_tabActive("naql-recs"))_scheduleRender(renderNaqlRecs);
    });
    dbRefSrf.on("value",snap=>{
      const v=snap.val();
      SRF_RECS=v?Object.values(v).sort(_byDkDesc):[];
      try{localStorage.setItem("wShamsSrfCache",JSON.stringify(SRF_RECS));}catch(e){}
      if(_tabActive("srf-recs"))_scheduleRender(renderSrfRecs);
    });
    dbRefDam.on("value",snap=>{
      const v=snap.val();
      DAM_RECS=v?Object.values(v).sort(_byDkDesc):[];
      try{localStorage.setItem("wShamsDamCache",JSON.stringify(DAM_RECS));}catch(e){}
      if(_tabActive("dam-recs"))_scheduleRender(renderDamRecs);
    });
    // استماع لوصلات البيع
    dbRefSell.on("value",snap2=>{
      const v2=snap2.val();
      SELL_RECS=v2?Object.values(v2).sort(_byDkDesc):[];
      try{localStorage.setItem("wShamsSellCache",JSON.stringify(SELL_RECS));}catch(e){}
      if(S.cu){_scheduleRender(renderSellRecs);_scheduleRender(renderSellStats);}
    });
    // استماع فوري لأي تغيير من أي جهاز
    dbRef.on("value",snapshot=>{
      const val=snapshot.val();
      if(val){
        S.recs=Object.values(val).sort(_byDkDesc);
      } else {
        S.recs=[];
      }
      // حفظ محلي احتياطي
      try{localStorage.setItem("wShamsCache",JSON.stringify(S.recs));}catch(e){}
      syncBar(false);
      if(S.cu){
        _scheduleRender(renderRecsKeep);_scheduleRender(renderStats);
        _scheduleRender(renderWH);_scheduleRender(refreshHistIfOpen);
        if(_tabActive("naql-coll"))_scheduleRender(renderNaqlColl);
        if(_tabActive("naql-recs"))_scheduleRender(renderNaqlRecs);
      }
    },err=>{
      console.warn("Firebase read error:",err);
      document.getElementById("syncDot").style.background="var(--owing)";
      showToast("⚠ خطأ في الاتصال بالسيرفر");
      // تحميل من الكاش المحلي
      try{const c=localStorage.getItem("wShamsCache");if(c)S.recs=JSON.parse(c).sort(_byDkDesc);}catch(e){}
    });
    showToast("☁️ جاري الاتصال بـ Firebase...",1500);
  }catch(e){
    console.error("Firebase init error:",e);
    showToast("⚠ تحقق من اتصال الإنترنت");
    document.getElementById("syncDot").style.background="var(--owing)";
    try{const c=localStorage.getItem("wShamsCache");if(c)S.recs=JSON.parse(c).sort(_byDkDesc);}catch(e2){}
  }
} // end _doInitFirebase

// Firebase يرفض تخزين قيم undefined (يرمي خطأ متزامن قبل وصول الطلب للسيرفر،
// وهذا يمنع استدعاء catch() ويُبقي مؤشر الاتصال عالقاً على لون "جاري الحفظ").
// هذه الدالة تستبدل أي undefined بـ null بشكل متكرر لضمان عدم تكرار هذه المشكلة.
function _stripUndefined(obj){
  if(obj===undefined)return null;
  if(obj===null||typeof obj!=="object")return obj;
  if(Array.isArray(obj))return obj.map(_stripUndefined);
  const out={};
  for(const k in obj){
    if(Object.prototype.hasOwnProperty.call(obj,k)){
      const v=obj[k];
      out[k]=v===undefined?null:_stripUndefined(v);
    }
  }
  return out;
}

function saveRec(r){
  // v17: كانت لا تحدّث الكاش المحلي إلا عند الفشل — الآن دائماً، مع طابور دون اتصال
  _fbWrite("records",r.id,r,safe=>{
    const idx=S.recs.findIndex(x=>x.id===r.id);
    if(idx>=0)S.recs[idx]=safe; else S.recs.unshift(safe);
    S.recs.sort(_byDkDesc);   // v17.39 — تعديل التاريخ ينقل الوصل ليومه فوراً
    try{localStorage.setItem("wShamsCache",JSON.stringify(S.recs));}catch(e){}
  });
}
function delBuyRec(id){
  _toTrash("buy",S.recs.find(x=>x.id===id));
  _fbWrite("records",id,null,()=>{
    S.recs=S.recs.filter(x=>x.id!==id);
    try{localStorage.setItem("wShamsCache",JSON.stringify(S.recs));}catch(e){}
  });
}

