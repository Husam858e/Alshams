/* ══════════════════════════════════════════════════════
   حارس الإغلاق — v17.43
   ──────────────────────────────────────────────────────
   الطابور يحفظ العمليات المعلّقة في localStorage، فهي
   تنجو من إغلاق التطبيق وتُرسَل عند فتحه لاحقاً — لكن
   لا شيء كان ينبّه المستخدم إلى أنها لم تصل بعد. من
   يكتب وصلاً على شبكة ضعيفة ثم يُغلق التطبيق يظنّ أنه
   حُفظ على السيرفر، ولا يكتشف العكس إلا حين يفتح جهاز
   آخر فلا يجده.
   التنبيه هنا لا يمنع الإغلاق — يُعلم فقط. ويصمت تماماً
   حين لا يوجد شيء معلّق كي لا يزعج في الحالة الطبيعية.
══════════════════════════════════════════════════════ */
window.addEventListener("beforeunload",function(e){
  if(!_writeQueue.length)return;
  _flushQueue();                       // محاولة أخيرة قبل الخروج
  e.preventDefault();
  e.returnValue="";                    // المتصفحات الحديثة تتجاهل النص وتعرض رسالتها
  return "";
});
/* حين يعود التطبيق للواجهة (بعد أن كان في الخلفية) أعد المحاولة */
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible"&&_writeQueue.length)_flushQueue();
});

/* ── ٦) الكتابة الموحّدة لفايربيس: طابور + كاش محلي + مؤشر حفظ ── */
function _fbWrite(node,id,data,onLocal){
  syncBar(true);
  const safe=data===null?null:_stripUndefined(_sanitizeStrings(data));
  /* ══════════════════════════════════════════════════════
     مفتاح الشهر mk — v17.50
     ──────────────────────────────────────────────────────
     قواعد فايربيس لا تستطيع اقتطاع جزء من نصّ، فلا يمكنها
     أن تقرأ الشهر من "2026-08-21". نُخزّن الشهر حقلاً مستقلاً
     فتستطيع القاعدة أن تسأل: هل هذا الشهر مغلق؟ — وبذلك
     يصير قفل الفترات محروساً على الخادم لا في الواجهة وحدها.
     حقل مشتقّ يُكتب تلقائياً، ولا يُدخله أحد.
  ══════════════════════════════════════════════════════ */
  if(safe&&typeof safe==="object"&&typeof safe.dk==="string"&&safe.dk.length>=7){
    safe.mk=safe.dk.slice(0,7);
  }
  /* v17.50 — التقاط الحالة السابقة قبل onLocal: هي مَن يُحدّث
     المصفوفة المحلية، فبعدها تصير "القديمة" هي الجديدة. */
  let _before=null;
  if(node!==_AUDIT_NODE&&node!=="closures"){
    try{
      const _d=_auditDs(node);
      const _cur=_d?(_d.get()||[]).find(x=>x&&x.id===id):null;
      _before=_cur?JSON.parse(JSON.stringify(_cur)):null;
    }catch(e){}
  }
  /* v17.50 — حارس الفترات المغلقة: يُرفض قبل أي تغيير محلي */
  try{
    const _m=_blockedByClosure(node,_before,safe);
    if(_m){
      syncBar(false);
      showToast("🔒 "+_closureLabel(_m)+" مغلق — لا يمكن التعديل. افتحه من الأدوات أولاً.");
      return;
    }
  }catch(e){}
  if(typeof onLocal==="function"){try{onLocal(safe);}catch(e){}}
  try{_auditCapture(node,id,_before,safe);}catch(e){}
  _enqueueWrite(node,id,safe);
  if(!db){syncBar(false);return;}
  try{
    const ref=db.ref(node).child(id);
    const p=safe===null?ref.remove():ref.set(safe);
    p.then(()=>{_dequeueWrite(node,id);syncBar(false);_fbLastErr=null;})
     .catch(err=>{
       syncBar(false);
       console.warn("fb write failed:",node,id,err);
       _fbReportWriteError(err,node);
     });
  }catch(err){
    syncBar(false);
    console.error("fb write sync error:",err);
    showToast("⚠ خطأ في البيانات — محفوظ محلياً");
  }
}


/* ══════════════════════════════════════════════════════════════
   سجلّ التدقيق — v17.50
   ──────────────────────────────────────────────────────────────
   الفكرة المركزية: الوصل لم يعد حقلاً يُكتب فوقه وينسى ماضيه.
   كل كتابة تمرّ من _fbWrite — إنشاءً أو تعديلاً أو حذفاً — تترك
   قيداً في audit_log يحمل: ما تغيّر، من ماذا إلى ماذا، من فعله،
   ومتى. القيد يُضاف ولا يُعدَّل ولا يُحذف أبداً، ولا يوجد في
   التطبيق أي مسار لمحوه (وقواعد فايربيس تمنعه على الخادم أيضاً).

   لماذا هنا بالذات؟ لأن _fbWrite هي المعبر الوحيد لكل البيانات
   في التطبيق. أي قسم يُضاف مستقبلاً يدخل السجلّ تلقائياً بلا
   سطر واحد إضافي — ولو وضعناه في كل دالة حفظ لنُسي واحدة.

   ⚠️ نلتقط الحالة السابقة قبل استدعاء onLocal، لأن onLocal
      يُحدّث المصفوفة المحلية فوراً فتضيع القيمة القديمة.
══════════════════════════════════════════════════════════════ */
const _AUDIT_NODE="audit_log";
const _AUDIT_CACHE_K="wShamsAudit";
const _AUDIT_CACHE_MAX=1500;         // الكاش المحلي فقط — فايربيس يحتفظ بالكل
let AUDIT=[];

/* حقول لا معنى لتسجيلها: إمّا مشتقّة أو تصف التعديل نفسه */
const _AUDIT_SKIP=new Set(["mk","edited","editAt","editBy","seq","paidTotal",
  "naqlPaidTotal","createdAt","createdBy","_entryId"]);

/* أسماء عربية للحقول — ليقرأ السجلّ من لا يعرف الكود */
const _AUDIT_FIELD={
  driver:"الفلاح",plate:"رقم العجلة",wh:"الموقع",mat:"نوع الحمولة",
  dk:"التاريخ",note:"الملاحظة",gross:"الوزن الكلي",empty:"الوزن الفارغ",
  net:"الوزن الصافي",ppkg:"سعر الكغم",final:"المبلغ النهائي",
  price:"المبلغ",amount:"المبلغ",finalNet:"صافي الراتب",status:"الحالة",
  paid:"حالة الدفع",paidAt:"وقت السداد",paidBy:"سدَّده",
  kOn:"الكبس",kC:"عدد الكبسات",kUP:"سعر الكبسة",kType:"نوع الكبس",
  kabsFee:"أجور الكبس",nOn:"النقل",transporter:"الناقل",nC:"كبسات النقل",
  nUP:"سعر كبسة النقل",naqlFee:"أجور النقل",nDeduct:"خصم النقل",
  wOn:"وصل",wPrice:"سعر الوصل",waslFee:"أجور الوصل",wFee:"أجور الوزن",
  receiver:"المستلم",dest:"الوجهة",driverPhone:"هاتف الفلاح",
  damin:"الضامن",madmun:"المضمون",recv:"المستفيد",purp:"السبب",
  provider:"مقدّم الخدمة",service:"الخدمة",farmer:"الفلاح",
  empName:"العامل",name:"الاسم",role:"الوظيفة",salary:"الراتب",
  month:"الشهر",kabs:"الكبسات",pricePerK:"سعر الكبسة",
  payments:"الدفعات",naqlPayments:"دفعات النقل",naqlList:"الناقلون",
  naqlPaid:"سداد النقل",subRecs:"الوصولات الفرعية",trans:"أجور النقل",
};
const _auditFieldName=f=>_AUDIT_FIELD[f]||f;

/* مجموعة البيانات من اسم عقدة فايربيس */
function _auditDs(node){
  try{return (_DATASETS||[]).find(d=>d.node===node)||null;}catch(e){return null;}
}
/* وصف بشري مختصر للسجل — ليُعرف عمّا يتحدّث القيد */
function _auditSubject(node,rec){
  if(!rec)return "";
  const d=_auditDs(node);
  const f=(d&&d.fields)||["driver","plate"];
  const parts=f.map(x=>rec[x]).filter(v=>v!=null&&v!=="").slice(0,3);
  return parts.join(" · ")||rec.id||"";
}
/* مجموع مصفوفة دفعات */
const _auditPaySum=a=>Array.isArray(a)?a.reduce((s,p)=>s+(p&&p.amount||0),0):0;

/* يقارن نسختين ويُخرج ما تغيّر فعلاً */
function _auditDiff(before,after){
  const out=[];
  const keys=new Set([...Object.keys(before||{}),...Object.keys(after||{})]);
  keys.forEach(k=>{
    if(_AUDIT_SKIP.has(k)||k==="id")return;
    const a=before?before[k]:undefined, b=after?after[k]:undefined;
    // الدفعات: نلخّصها بالمجموع والعدد بدل إغراق السجلّ بالمصفوفة كاملة
    if(k==="payments"||k==="naqlPayments"){
      const sa=_auditPaySum(a), sb=_auditPaySum(b);
      const na=Array.isArray(a)?a.length:0, nb=Array.isArray(b)?b.length:0;
      if(sa!==sb||na!==nb)out.push({f:k,from:sa,to:sb,n:nb-na,money:true});
      return;
    }
    if(typeof a==="object"||typeof b==="object"){
      const sa=JSON.stringify(a===undefined?null:a), sb=JSON.stringify(b===undefined?null:b);
      if(sa!==sb)out.push({f:k,from:"—",to:"—",obj:true});
      return;
    }
    if((a===undefined?null:a)!==(b===undefined?null:b))
      out.push({f:k,from:a===undefined?null:a,to:b===undefined?null:b});
  });
  return out;
}

/* يكتب قيد تدقيق — يمرّ بنفس الطابور فينجو من انقطاع الإنترنت */
function _auditWrite(entry){
  try{
    AUDIT.unshift(entry);
    if(AUDIT.length>_AUDIT_CACHE_MAX)AUDIT.length=_AUDIT_CACHE_MAX;
    try{localStorage.setItem(_AUDIT_CACHE_K,JSON.stringify(AUDIT.slice(0,400)));}catch(e){}
    _fbWrite(_AUDIT_NODE,entry.id,entry);
    if(_tabActive("audit"))_scheduleRender(renderAuditTab);
  }catch(e){console.warn("audit write failed",e);}
}

/* النداء الذي يعترض كل كتابة */
function _auditCapture(node,id,before,after){
  if(node===_AUDIT_NODE||node==="closures")return;   // لا تدقيق على التدقيق
  const d=_auditDs(node);
  if(!d)return;                                       // عقدة غير معروفة — لا نخمّن
  let action, changes=[];
  if(before==null&&after!=null){action="create";}
  else if(before!=null&&after==null){action="delete";}
  else if(before!=null&&after!=null){
    changes=_auditDiff(before,after);
    if(!changes.length)return;                        // لا شيء تغيّر فعلاً
    const onlyMoney=changes.every(c=>c.f==="payments"||c.f==="naqlPayments");
    action=onlyMoney?"pay":"edit";
  } else return;
  _auditWrite({
    id:genId()+"-"+Date.now().toString(36),
    at:nowStr(),
    by:(S.cu&&S.cu.name)||"—",
    uid:(_authUser()&&_authUser().uid)||null,
    kind:d.k, node, recId:id,
    subject:_auditSubject(node,after||before),
    action, changes,
    dk:(after&&after.dk)||(before&&before.dk)||"",
  });
}

/* تحميل الكاش المحلي عند الإقلاع */
function _loadAuditCache(){
  try{const c=localStorage.getItem(_AUDIT_CACHE_K);if(c)AUDIT=JSON.parse(c)||[];}catch(e){AUDIT=[];}
}


/* ══════════════════════════════════════════════════════════════
   إغلاق الفترات المحاسبية — v17.50
   ──────────────────────────────────────────────────────────────
   المشكلة: أي وصل من أي شهر مضى كان قابلاً للتعديل في أي وقت.
   فالمجاميع التي طُبعت وسُلِّمت وبُنيت عليها تسوية قد تتغيّر بعد
   شهور بلا أن يشعر أحد — والرقم الذي في يد الفلاح لم يعد هو
   الرقم الذي في النظام.
   الحل: يُغلق الشهر بعد مراجعته، فتُرفض أي كتابة تخصّ تاريخاً
   داخله. الفتح ممكن — الأخطاء تُصحَّح — لكنه فعل واعٍ يُسجَّل
   في سجلّ التدقيق باسم من فتحه ومتى ولماذا.

   ⚠️ الحارس في _fbWrite: يفحص تاريخ السجل قبل وبعد التعديل معاً،
      فلا يُنقل وصل من شهر مفتوح إلى شهر مغلق ولا العكس.
══════════════════════════════════════════════════════════════ */
let CLOSURES=[];
function _loadClosures(){
  try{CLOSURES=JSON.parse(localStorage.getItem("wShamsClosures")||"[]")||[];}
  catch(e){CLOSURES=[];}
}
const _monthOf=dk=>String(dk||"").slice(0,7);
function isMonthClosed(m){
  if(!m)return false;
  return CLOSURES.some(c=>c&&c.month===m&&c.open!==true);
}
function _closureOf(m){return CLOSURES.find(c=>c&&c.month===m&&c.open!==true)||null;}

/* هل تخصّ هذه الكتابة فترة مغلقة؟ يُفحص الطرفان: القديم والجديد */
function _blockedByClosure(node,before,after){
  if(node===_AUDIT_NODE||node==="closures")return null;
  if(!_auditDs(node))return null;
  const months=new Set();
  if(before&&before.dk)months.add(_monthOf(before.dk));
  if(after&&after.dk)months.add(_monthOf(after.dk));
  for(const m of months){ if(isMonthClosed(m))return m; }
  return null;
}

function _closureLabel(m){
  if(!m)return "";
  const [y,mo]=m.split("-");
  return (_AR_MONTHS[(+mo)-1]||mo)+" "+AR(y);
}

/* إغلاق شهر — مع لقطة بمجاميعه وقت الإغلاق للمقارنة لاحقاً */
function closeMonth(){
  const m=(document.getElementById("closeMonthPick")?.value||"").trim();
  if(!m){showToast("⚠ اختر الشهر");return;}
  if(isMonthClosed(m)){showToast("⚠ هذا الشهر مغلق أصلاً");return;}
  const snap=_closureTotals(m);
  if(!confirm(
`إغلاق ${_closureLabel(m)}

بعد الإغلاق تُرفض أي إضافة أو تعديل أو حذف لأي سجل تاريخه في هذا الشهر.
الفتح ممكن لاحقاً، ويُسجَّل باسمك في سجلّ التدقيق.

السجلات: ${snap.count}
المبالغ: ${Math.round(snap.amount).toLocaleString("en")} د.ع

هل تريد المتابعة؟`))return;
  const rec={id:m,month:m,open:false,closedAt:nowStr(),
             closedBy:(S.cu&&S.cu.name)||"—",totals:snap};
  CLOSURES=CLOSURES.filter(c=>c&&c.month!==m).concat([rec]);
  try{localStorage.setItem("wShamsClosures",JSON.stringify(CLOSURES));}catch(e){}
  _fbWrite("closures",m,rec);
  _auditWrite({id:genId()+"-"+Date.now().toString(36),at:nowStr(),
    by:(S.cu&&S.cu.name)||"—",kind:"closure",node:"closures",recId:m,
    subject:_closureLabel(m),action:"close",dk:m+"-01",
    changes:[{f:"month",from:"مفتوح",to:"مغلق"},
             {f:"amount",from:0,to:snap.amount,money:true}]});
  showToast("🔒 أُغلق "+_closureLabel(m));
  renderAuditTab();
}

function reopenMonth(m){
  const c=_closureOf(m); if(!c)return;
  const why=prompt("سبب فتح "+_closureLabel(m)+" — يُسجَّل في سجلّ التدقيق:","");
  if(why===null)return;
  if(!String(why).trim()){showToast("⚠ اكتب السبب");return;}
  CLOSURES=CLOSURES.filter(x=>x&&x.month!==m);
  try{localStorage.setItem("wShamsClosures",JSON.stringify(CLOSURES));}catch(e){}
  _fbWrite("closures",m,null);
  _auditWrite({id:genId()+"-"+Date.now().toString(36),at:nowStr(),
    by:(S.cu&&S.cu.name)||"—",kind:"closure",node:"closures",recId:m,
    subject:_closureLabel(m),action:"reopen",dk:m+"-01",
    changes:[{f:"month",from:"مغلق",to:"مفتوح"},{f:"note",from:"—",to:String(why).trim()}]});
  showToast("🔓 فُتح "+_closureLabel(m));
  renderAuditTab();
}

/* مجاميع الشهر لحظة الإغلاق — مرجعٌ يُقارَن به لاحقاً */
function _closureTotals(m){
  let count=0,amount=0;
  (_DATASETS||[]).filter(d=>!d.virtual).forEach(d=>{
    (d.get()||[]).forEach(r=>{
      if(!r||_monthOf(r.dk)!==m)return;
      count++; amount+=(d.amount?d.amount(r):0)||0;
    });
  });
  return {count,amount:Math.round(amount)};
}

/* ── ٧) سلة المحذوفات: أي حذف يُنسخ هنا قبل إزالته ── */
const _TRASHK="wShamsTrash";
let TRASH=[];
function _loadTrash(){try{TRASH=JSON.parse(localStorage.getItem(_TRASHK)||"[]");}catch(e){TRASH=[];}}
function _toTrash(kind,rec){
  if(!rec)return;
  try{
    TRASH.unshift({kind,rec,delAt:nowStr(),delBy:S.cu?.name||"—"});
    TRASH=TRASH.slice(0,300);
    localStorage.setItem(_TRASHK,JSON.stringify(TRASH));
  }catch(e){}
}

