/* ══════════════════════════════════════════════════════
   v17 PRO MAX — الطبقة الأساسية المشتركة
══════════════════════════════════════════════════════ */

/* ── ١) تهريب HTML: يمنع أي اسم/ملاحظة فيها < > & " ' من كسر الواجهة أو الوصل ── */
const _ESC_MAP={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
function esc(v){
  if(v==null)return"";
  return String(v).replace(/[&<>"']/g,c=>_ESC_MAP[c]);
}
/* تهريب + تحويل الأرقام للعربية (للتواريخ والنصوص المعروضة) */
function escAr(v){return tAr(esc(v));}

/* ══════════════════════════════════════════════════════
   صفّ وصل بقيمة تحوي وسماً موثوقاً — v17.46
   ──────────────────────────────────────────────────────
   مُساعد row() داخل بُناة الوصولات يُهرِّب قيمته، وهذا هو
   الصحيح: القيم هناك بياناتٌ يكتبها المستخدم.
   لكن أيقونة المادة استثناء — هي وسم <img> من ثابت MAT
   في التطبيق نفسه لا من إدخال أحد. فلمّا صار row() يُهرِّب،
   طُبع الوسم حرفياً في الوصل بدل الصورة:
   «نوع الحمولة: <img src="data:image/png;base64,…»
   هنا نمرّر الوسم كما هو، ويبقى النصّ المرافق مُهرَّباً.
   ⚠️ لا تستعمل هذه الدالة إلا مع وسمٍ يبنيه التطبيق.
      أي نصّ آتٍ من المستخدم يمرّ عبر esc() أولاً.
══════════════════════════════════════════════════════ */
function prRowRaw(k,html){
  return `<div class="prr"><span class="prk">${k}</span><span class="prv">${html}</span></div>`;
}

/* ── ٢) تنقية النصوص قبل الحفظ في فايربيس (حماية للبيانات الجديدة) ── */
function _sanitizeStrings(obj){
  if(typeof obj==="string")return obj.replace(/[<>]/g,"");
  if(obj===null||typeof obj!=="object")return obj;
  if(Array.isArray(obj))return obj.map(_sanitizeStrings);
  const out={};
  for(const k in obj){
    if(Object.prototype.hasOwnProperty.call(obj,k))out[k]=_sanitizeStrings(obj[k]);
  }
  return out;
}

/* ── ٣) تواريخ آمنة من فروقات المنطقة الزمنية ──
   new Date("2026-07-27") يُفسَّر UTC وقد يُرجع اليوم السابق في بعض الأجهزة.
   _D() يبني التاريخ محلياً، و _ds() يُخرجه YYYY-MM-DD محلياً. */
function _D(v){
  if(v instanceof Date)return new Date(v.getFullYear(),v.getMonth(),v.getDate());
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||""));
  if(m)return new Date(+m[1],+m[2]-1,+m[3]);
  const d=new Date(v);
  return isNaN(d)?new Date(NaN):new Date(d.getFullYear(),d.getMonth(),d.getDate());
}
function _ds(d){
  if(!(d instanceof Date)||isNaN(d))return"";
  const p=x=>String(x).padStart(2,"0");
  return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
/* بداية أسبوع (الاثنين) لأي تاريخ */
function _weekStart(v){const d=_D(v);d.setDate(d.getDate()-((d.getDay()+6)%7));return d;}
function _addDays(v,n){const d=_D(v);d.setDate(d.getDate()+n);return d;}

/* ── ٤) جدولة إعادة الرسم: تجميع دفعات فايربيس المتلاحقة في رسمة واحدة ── */
const _renderQ=new Set();
let _renderTimer=null;
function _scheduleRender(fn){
  if(typeof fn!=="function")return;
  _renderQ.add(fn);
  if(_renderTimer)return;
  _renderTimer=setTimeout(()=>{
    _renderTimer=null;
    const jobs=[..._renderQ];_renderQ.clear();
    jobs.forEach(j=>{try{j();}catch(e){console.warn("render error:",e);}});
  },90);
}
/* هل التبويب المعروض حالياً هو المطلوب؟ (تجنّب رسم تبويبات مخفية) */
function _tabActive(id){return !!document.getElementById("tc-"+id)?.classList.contains("active");}

/* ── ٥) طابور الكتابة دون اتصال ──
   إذا انقطع الإنترنت أو أُغلق التطبيق قبل وصول الحفظ، تبقى العملية
   محفوظة محلياً وتُرسَل تلقائياً عند عودة الاتصال. */
const _QK="wShamsWriteQueue";
let _writeQueue=[];
function _loadQueue(){
  try{_writeQueue=JSON.parse(localStorage.getItem(_QK)||"[]");}catch(e){_writeQueue=[];}
  _updQueueBadge();
}
function _persistQueue(){
  try{localStorage.setItem(_QK,JSON.stringify(_writeQueue.slice(-500)));}catch(e){}
  _updQueueBadge();
}
function _enqueueWrite(node,id,data){
  _writeQueue=_writeQueue.filter(w=>!(w.node===node&&w.id===id));
  _writeQueue.push({node,id,data,op:data===null?"del":"set",at:Date.now()});
  _persistQueue();
}
function _dequeueWrite(node,id){
  const n=_writeQueue.length;
  _writeQueue=_writeQueue.filter(w=>!(w.node===node&&w.id===id));
  if(_writeQueue.length!==n)_persistQueue();
}
function _updQueueBadge(){
  const b=document.getElementById("queueBadge");
  if(!b)return;
  const n=_writeQueue.length;
  b.style.display=n?"inline-block":"none";
  b.textContent="⏱ "+AR(n);
  b.title=n+" عملية بانتظار المزامنة";
}
function _flushQueue(){
  if(!db||!_writeQueue.length)return;
  const batch=[..._writeQueue];
  batch.forEach(w=>{
    try{
      const ref=db.ref(w.node).child(w.id);
      const p=w.op==="del"?ref.remove():ref.set(w.data);
      p.then(()=>_dequeueWrite(w.node,w.id)).catch(()=>{});
    }catch(e){}
  });
}
window.addEventListener("online",()=>{_flushQueue();});

