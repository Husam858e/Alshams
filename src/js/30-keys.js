/* ════════════════════════════════════════════
   Enter للتنقل بين الحقول وتنفيذ العملية — للحاسوب
   ─────────────────────────────────────────
   عند الضغط على Enter داخل أي حقل إدخال أو قائمة:
   - إن وُجد حقل تالٍ ضمن نفس النموذج/المودال: ينتقل إليه
   - إن كان آخر حقل: يُنفَّذ زر العملية الرئيسي لذلك النموذج/المودال تلقائياً
════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════
   Shift + Enter — إكمال الوصل مباشرة
   ──────────────────────────────────────────────────────
   Enter وحده ينتقل بين الحقول حقلاً حقلاً.
   Shift+Enter يقفز إلى آخر خطوة فوراً: ينفّذ زر الإجراء
   الأساسي للسياق الحالي (حفظ / تأكيد)، ولو لم يكن هناك
   نموذج مفتوح ينقل أول وصل ناقص إلى مرحلته التالية.
══════════════════════════════════════════════════════ */
function _primaryActionBtn(box){
  if(!box)return null;
  let b=box.querySelector(".bfw");
  if(!b&&box.id==="mPartialPay")b=box.querySelector(".btn.bgn");
  if(!b)b=box.querySelector(".mbtns button:not(.bgh)");
  if(!b)b=box.querySelector("button.btn:not(.bgh):not(.bsm)");
  return b;
}
/* v17.18 — تحرير لوحة المفاتيح من أي منتقٍ أصلي (تقويم/قائمة).
   مجرّد blur() لا يكفي دائماً: بعض المتصفحات تُبقي المنتقي مفتوحاً
   ويظل يبتلع المفاتيح. نُغلقه أولاً ثم نُحرّر التركيز. */
function _releaseFocus(){
  _closeDatePicker();   // v17.24 — أغلق تقويم النظام إن كان مفتوحاً
  const a=document.activeElement;
  if(!a||a===document.body)return;
  // أغلق منتقي التاريخ/الوقت إن كان مفتوحاً
  if(a.tagName==="INPUT"&&/^(date|time|datetime-local|month|week)$/.test(a.type||"")){
    try{if(typeof a.hidePicker==="function")a.hidePicker();}catch(e){}
  }
  if(typeof a.blur==="function"){try{a.blur();}catch(e){}}
  // الأمان: أعد التركيز إلى الصفحة نفسها
  try{
    if(document.activeElement&&document.activeElement!==document.body){
      document.body.focus&&document.body.focus();
    }
  }catch(e){}
}
function shiftEnterAdvance(){
  _releaseFocus();   // v17.13 — يُغلق أي تقويم/قائمة أصلية تحتجز المفاتيح
  // ١) أي مودال مفتوح؟ نفّذ إجراءه الأساسي
  const open=[...document.querySelectorAll(".mo.active")].pop();
  if(open){
    const box=open.querySelector(".mob")||open;
    const b=_primaryActionBtn(box);
    if(b&&!b.disabled){b.click();return true;}
  }
  // ٢) نموذج مفتوح في التبويب النشط؟ احفظ فوراً
  const tc=document.querySelector(".tc.active");
  if(tc){
    const b=tc.querySelector(".bfw");
    if(b&&!b.disabled&&b.offsetParent!==null){b.click();return true;}
  }
  // ٣) لا نموذج — انقل أول وصل ناقص إلى مرحلته التالية
  const confirmed=(S.recs||[]).find(r=>r.status==="confirmed");
  if(confirmed){
    openWeigh(confirmed.id);_pushShortcut("eWI");
    setTimeout(()=>{const f=document.getElementById("eWI");if(f){f.focus();try{f.select();}catch(x){}}},90);
    showToast("⚖️ الوزن الفارغ: "+esc(confirmed.driver||"—"));
    return true;
  }
  const waiting=(S.recs||[]).find(r=>r.status==="waiting");
  if(waiting){
    openConf(waiting.id);_pushShortcut("cPrc");
    setTimeout(()=>{const f=document.getElementById("cPrc");if(f){f.focus();try{f.select();}catch(x){}}},90);
    showToast("🏭 تأكيد المخزن: "+esc(waiting.driver||"—"));
    return true;
  }
  showToast("✅ لا توجد وصولات ناقصة");
  return false;
}
document.addEventListener("keydown", function(e){
  if(e.key!=="Enter"||!e.shiftKey||e.ctrlKey||e.altKey||e.metaKey) return;
  const t=e.target;
  if(t&&t.tagName&&t.tagName.toLowerCase()==="textarea") return;  // Shift+Enter = سطر جديد
  if(!S.cu) return;
  e.preventDefault();
  e.stopPropagation();
  _closeDatePicker();   // v17.24 — حرّر لوحة المفاتيح من التقويم
  shiftEnterAdvance();
}, true);   // v17.13 — طور الالتقاط: يسبق أي حقل قد يبتلع المفتاح

document.addEventListener("keydown", function(e){
  if(e.key!=="Enter"||e.shiftKey) return;
  const el=e.target;
  if(!el||!el.tagName) return;
  const tag=el.tagName.toLowerCase();
  if(tag!=="input"&&tag!=="select") return;
  if(tag==="input"){
    const t=(el.type||"text").toLowerCase();
    if(["checkbox","radio","button","submit","file","color","range","hidden"].includes(t)) return;
  }

  // ── حالة خاصة: نموذج "وصل جديد" — ترتيب صريح: كبس → نقل → وصل → اسم الفلاح ──
  const tcNew = document.getElementById("tc-new");
  if(tcNew && tcNew.contains(el)){
    e.preventDefault();
    const seq = [];
    if(S.kOn){ seq.push("kC","kP"); }
    if(S.nOn){
      document.querySelectorAll(".naql-row-name, .naql-row-kabs, .naql-row-price").forEach(f=>seq.push(f));
    }
    if(S.wOn){ seq.push("wP"); }
    seq.push("fDrv","fPlt","fGrs","fNote");

    const resolved = seq.map(x=> typeof x==="string" ? document.getElementById(x) : x).filter(f=>f);
    const idx = resolved.indexOf(el);
    const next = idx>=0 && idx<resolved.length-1 ? resolved[idx+1] : null;
    if(next){
      _focusReveal(next);          // v17.36 — كان focus() وحده يُظهر نصف الحقل
    } else {
      // آخر حقل بالنموذج -> نفّذ الحفظ
      const btn = tcNew.querySelector(".bfw");
      if(btn) btn.click();
    }
    return;
  }

  // ── السلوك العام لبقية النماذج/المودالات ──
  const container=el.closest(".mob, .cd, #mPartialPay");
  if(!container) return;
  const fields=Array.from(container.querySelectorAll("input, select")).filter(f=>{
    if(f.disabled) return false;
    if(f.type==="hidden") return false;
    if(f.type==="checkbox"||f.type==="radio") return false;
    if(f.offsetParent===null) return false;
    return true;
  });
  const idx=fields.indexOf(el);
  if(idx===-1) return;
  e.preventDefault();
  if(idx<fields.length-1){
    _focusReveal(fields[idx+1], tag==="input");   // v17.36
    return;
  }
  let btn=container.querySelector(".bfw");
  if(!btn&&container.id==="mPartialPay")btn=container.querySelector(".btn.bgn");
  if(!btn)btn=container.querySelector(".mbtns button:not(.bgh)");
  if(btn)btn.click();
});

/* ════════════════════════════════════════════
   اختصارات لوحة المفاتيح
   ─────────────────────────────────────────
   s: فتح تبويب الشراء
   k: فتح تبويب الشراء + تفعيل أجور الكبس + تركيز فوري
   t: فتح تبويب الشراء + تفعيل أجور النقل + تركيز فوري
   r: فتح تبويب السجلات
   m: فتح مودال تأكيد المخزن/السعر لأول وصل بانتظار ذلك + تركيز فوري
   e: فتح مودال الوزن الفارغ لأول وصل بانتظار ذلك + تركيز فوري
   d: فتح خانة تعديل تاريخ الوصل (آخر وصل)
   ★ كل اختصار يعمل بالتبديل: الضغطة الثانية تُلغي ما فعلته الأولى
     (k/t/c تُطفئ القسم · m/e/d تُغلق المودال · s/r تُعيدك للتبويب السابق)
   Shift+Enter: إكمال الوصل مباشرة — يقفز لآخر خطوة (حفظ/تأكيد)
   F11: ملء الشاشة (أو زر ⛶ في الترويسة)
════════════════════════════════════════════ */
const _ARABIC_KEY_EQUIV={ s:"س", k:"ن", t:"ف", r:"ق", m:"ة", e:"ث", c:"ؤ", d:"ي" };
function _matchShortcut(key,letter){
  if(key===letter) return true;
  if(_ARABIC_KEY_EQUIV[letter] && key===_ARABIC_KEY_EQUIV[letter]) return true;
  return false;
}
/* ── اختصار d/ي: تعديل تاريخ الوصل ──
   إن كان مودال التعديل مفتوحاً نُركّز حقل التاريخ مباشرة،
   وإلا نفتح تعديل أنسب وصل: الوصل الوحيد المعروض إن كانت
   نتيجة الفلترة واحدة، وإلا آخر وصل بالتاريخ ثم بالتسلسل. */
function _pickDateTargetRec(){
  if(Array.isArray(_recFiltered)&&_recFiltered.length===1)return _recFiltered[0];
  const list=(Array.isArray(_recFiltered)&&_recFiltered.length)?_recFiltered:(S.recs||[]);
  if(!list.length)return null;
  return list.slice().sort((a,b)=>
    (b.dk||"").localeCompare(a.dk||"")||((b.seq||0)-(a.seq||0)))[0];
}
function focusRecDate(){
  const modal=document.getElementById("mEdit");
  const fld=document.getElementById("eDk");
  if(modal&&modal.classList.contains("active")&&fld){
    _openDatePicker(fld);
    return true;
  }
  const rec=_pickDateTargetRec();
  if(!rec){showToast("⚠ لا توجد وصولات لتعديل تاريخها");return false;}
  openEdit(rec.id);
  _pushShortcut("eDk");
  // v17.18 — مهلة ٩٠م.ث الثابتة كانت تنتهي أحياناً قبل رسم المودال
  // على الأجهزة الأبطأ، فيفشل التركيز ويبدو أن D "يفتح التعديل فقط".
  // الآن نحاول تكراراً حتى يصير الحقل قابلاً للتركيز فعلاً.
  _focusWhenReady("eDk",0,true);   // true = افتح تقويم النظام
  showToast("📅 تاريخ وصل: "+esc(rec.driver||"—")+" — "+tAr(rec.dk||""));
  return true;
}
/* يحاول التركيز على حقل حتى يصير جاهزاً، ثم يُمرّر إليه ويُبرزه.
   v17.23 — حقل التاريخ يأتي بعد خمسة حقول داخل مودال التعديل،
   فيقع خارج المنطقة المرئية. التركيز وحده لا يُظهره: لا بدّ من
   تمرير حاوية المودال إليه وإبرازه بصرياً ليراه المستخدم. */
function _focusWhenReady(id,tries,openPicker){
  tries=tries||0;
  const f=document.getElementById(id);
  if(f&&f.offsetParent!==null&&!f.disabled){
    _focusReveal(f);               // v17.36
    if(document.activeElement===f){
      setTimeout(()=>{
        _revealField(f);
        if(openPicker)_openDatePicker(f);
      },140);
      return true;
    }
  }
  if(tries<12)setTimeout(()=>_focusWhenReady(id,tries+1,openPicker),60);
  return false;
}

/* v17.24 — يفتح تقويم النظام على حقل التاريخ.
   showPicker() تتطلب "تفاعل مستخدم" — والضغط على D يُعدّ تفاعلاً،
   فتعمل. نُسجّل أن التقويم مفتوح كي يُغلق قبل أي اختصار لاحق،
   وهذا ما يمنع احتجازه للوحة المفاتيح. */
let _pickerOpen=null;
/* أي تغيير في قيمة الحقل أو فقدان تركيزه يعني أن التقويم أُغلق */
document.addEventListener("change",function(e){
  if(_pickerOpen&&e.target===_pickerOpen)_pickerOpen=null;
},true);
document.addEventListener("blur",function(e){
  if(_pickerOpen&&e.target===_pickerOpen)_pickerOpen=null;
},true);
function _openDatePicker(f){
  if(!f)return false;
  _revealField(f);
  // v17.25 — تقويم الصفحة بدل تقويم النظام: نفس المظهر
  // دون احتجاز لوحة المفاتيح
  return openDatePicker(f);
}
/* يُغلق التقويم ويُحرّر لوحة المفاتيح */
function _closeDatePicker(){
  _pickerOpen=null;
  if(_dpIsOpen())closeDatePicker();
}
/* يُمرّر الحقل إلى وسط الشاشة داخل حاويته ويُبرزه لحظياً */
function _revealField(f,noFlash){
  if(!f)return;
  /* v17.36 — نُمرّر مجموعة الحقل (العنوان + الإدخال) لا الإدخال وحده،
     كي يظهر العنوان فوقه ولا يبقى صندوقاً بلا تسمية. */
  const box=(f.closest&&f.closest(".fi-g"))||f;   // كل الحقول ملفوفة بـ .fi-g
  try{
    box.scrollIntoView({block:"center",inline:"nearest",behavior:"smooth"});
  }catch(e){
    try{box.scrollIntoView(false);}catch(x){}
  }
  if(noFlash)return;
  f.classList.add("field-flash");
  setTimeout(()=>f.classList.remove("field-flash"),1800);
}

/* ══════════════════════════════════════════════════════
   الانتقال بين الحقول — v17.36
   ──────────────────────────────────────────────────────
   المشكلة: focus() وحده يجعل المتصفح يُمرّر أقلّ مسافة
   ممكنة (سلوك block:"nearest")، فيلتصق الحقل بالحافة
   السفلى ويظهر نصفه — وهذا ما يحدث عند النزول من
   «سعر الوصل» إلى «اسم الفلاح».
   الحل: نمنع تمرير المتصفح التلقائي بـ preventScroll
   ثم نُمرّر نحن إلى الوسط، فيظهر الحقل كاملاً مع عنوانه
   ومسافة مريحة من الأعلى والأسفل.
   ملاحظة الهاتف: لوحة المفاتيح تفتح بعد التركيز فتُقصّر
   الشاشة وقد تُخفي الحقل ثانيةً، لذلك نُعيد التمرير مرة
   واحدة بعد استقرارها.
══════════════════════════════════════════════════════ */
function _focusReveal(f,doSelect){
  if(!f)return null;
  try{ f.focus({preventScroll:true}); }
  catch(e){ try{ f.focus(); }catch(x){} }   // متصفح لا يدعم الخيار
  if(doSelect!==false&&typeof f.select==="function"){try{f.select();}catch(e){}}
  _revealField(f);
  setTimeout(()=>{ if(document.activeElement===f)_revealField(f,true); },180);
  return f;
}

// سجل آخر اختصار مُستخدَم — يُستخدم لتحديد الحقل الذي يجب التركيز عليه عند Enter
let _shortcutHistory = [];
function _pushShortcut(id){ _shortcutHistory.push(id); }
/* v17.14 — عند إطفاء قسم نُزيل حقله من سجل الاختصارات،
   وإلا حاول Enter لاحقاً التركيز على حقل مخفي. */
function _dropShortcut(id){
  for(let i=_shortcutHistory.length-1;i>=0;i--)
    if(_shortcutHistory[i]===id)_shortcutHistory.splice(i,1);
}
/* تبديل قسم اختياري في نموذج الوصل (كبس/نقل/وصل) */
function _toggleSection(fn,on,fieldId,label){
  const btn=document.querySelector('.tbb[onclick*="\'new\'"]');
  if(btn)sT('new',btn);
  fn();                                   // tKabs / tNaql / tWasl تبدّل أصلاً
  const nowOn=on();
  if(nowOn){
    _pushShortcut(fieldId);
    showToast("✅ "+label+": مُفعّلة");
  }else{
    _dropShortcut(fieldId);
    showToast("✖ "+label+": ملغاة");
  }
  return nowOn;
}
/* تبديل تبويب: الضغط ثانيةً يعيدك للتبويب السابق */
let _prevTabId=null;
function _toggleTab(id){
  const cur=document.querySelector(".tc.active");
  const curId=cur?cur.id.replace(/^tc-/,""):null;
  if(curId===id&&_prevTabId&&_prevTabId!==id){
    const back=_prevTabId;
    _prevTabId=id;
    const b=document.querySelector('.tbb[onclick*="\''+back+'\'"]');
    if(b){b.click();return false;}
  }
  _prevTabId=curId;
  const b=document.querySelector('.tbb[onclick*="\''+id+'\'"]');
  if(b)sT(id,b);
  return true;
}
/* تبديل مودال: مفتوح ← يُغلق */
function _modalOpen(id){
  const m=document.getElementById(id);
  return !!(m&&m.classList.contains("active"));
}
function _resolveShortcutField(id){
  let f;
  if(id === "__naqlName") f = document.querySelector(".naql-row-name");
  else f = document.getElementById(id);
  // تحقق أن الحقل مرئي فعلاً (غير مخفي عبر display:none في توغل أو والد)
  if(f && f.offsetParent === null) return null;
  return f;
}

/* ── الانتقال بـ Enter لأول حقل مفعّل: كبس ← نقل ← وصل ← اسم الفلاح ── */
/* أول حقل فارغ حسب الأولوية: كبس ← نقل ← وصل ← اسم الفلاح.
   إن كانت كل الحقول ممتلئة نُركّز أوّلها في الترتيب. */
function focusFirstOpenField(){
  const seq = [];
  if (S.kOn) seq.push(document.getElementById('kC'), document.getElementById('kP'));
  if (S.nOn) document.querySelectorAll('.naql-row-name, .naql-row-kabs, .naql-row-price')
               .forEach(f => seq.push(f));
  if (S.wOn) seq.push(document.getElementById('wP'));
  seq.push(document.getElementById('fDrv'),
           document.getElementById('fPlt'),
           document.getElementById('fGrs'));

  const vis = seq.filter(f => f && !f.disabled && f.offsetParent !== null);
  if (!vis.length) return null;
  const target = vis.find(f => !String(f.value || '').trim()) || vis[0];
  _focusReveal(target);            // v17.36
  return target;
}

document.addEventListener("keydown", function(e){
  // v17.18 — كان الحارس يعتمد e.target وحده. إن ظلّ التركيز داخل
  // حقل تابع لمودال مُغلق (يحدث كثيراً بعد Shift+Enter)، تُعدّ كل
  // ضغطة "كتابة" فتُتجاهل الاختصارات ويبدو أن الكيبورد توقّف.
  // الآن: الحقل المخفي أو التابع لمودال مغلق لا يُعدّ كتابةً،
  // ونُحرّر التركيز منه فوراً ليعود كل شيء لطبيعته.
  // v17.24 — إن كان تقويم النظام مفتوحاً، أغلقه أولاً كي لا يحتجز
  // لوحة المفاتيح. هذا ما جعل الكيبورد "يتوقف" في النسخ السابقة.
  if (_pickerOpen && e.key !== "Tab") {
    const isDigit = /^[0-9]$/.test(e.key);
    if (!isDigit && e.key !== "ArrowUp" && e.key !== "ArrowDown"
        && e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
      _closeDatePicker();
    }
  }
  let el = e.target;
  const tag = (el.tagName || "").toLowerCase();
  let typing = tag === "input" || tag === "select" || tag === "textarea" || el.isContentEditable;
  if (typing) {
    const hidden = el.offsetParent === null || el.disabled;
    const deadModal = el.closest ? el.closest(".mo:not(.active)") : null;
    if (hidden || deadModal) {
      typing = false;
      try { el.blur(); } catch (x) {}
    }
  }

  // v17.19 — الأولوية أولاً، ثم سجل الاختصارات.
  // كانت كتلة "آخر اختصار" تسبق الأولوية: تفعيل الأقسام بالترتيب
  // ن ← ف ← ؤ يجعل آخر عنصر في السجل هو wP، فيقفز Enter إلى
  // سعر الوصل متخطّياً أجور الكبس وأجور النقل.
  // في تبويب "وصل جديد" الترتيب الثابت (كبس ← نقل ← وصل ← الفلاح)
  // هو المرجع الوحيد، والسجل يُمسح كي لا يُشوّشه.
  if (!typing && e.key === "Enter" && S.cu) {
    const tcNew = document.getElementById('tc-new');
    if (tcNew && tcNew.classList.contains('active')) {
      e.preventDefault();
      _shortcutHistory.length = 0;
      focusFirstOpenField();
      return;
    }
  }

  // خارج تبويب "وصل جديد": Enter ينتقل لحقل آخر اختصار مُستخدَم
  if (!typing && e.key === "Enter" && _shortcutHistory.length) {
    const id = _shortcutHistory[_shortcutHistory.length - 1];
    const f = _resolveShortcutField(id);
    if (f) {
      e.preventDefault();
      _focusReveal(f);             // v17.36
      _shortcutHistory.pop();
      return;
    } else {
      _shortcutHistory.pop(); // احذف المرجع غير الصالح (حقل مخفي/محذوف) بدل تركه معلّقاً للأبد
    }
  }

  if (typing) return;
  if (!S.cu) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  const key = e.key.toLowerCase();

  if (_matchShortcut(key,"s")) {
    e.preventDefault();
    _toggleTab('new');
    _dropShortcut("fDrv");   // الأولوية تحدّد الحقل لا السجل
  }
  else if (_matchShortcut(key,"k")) {
    e.preventDefault();
    _toggleSection(tKabs, ()=>S.kOn, "kC", "أجور الكبس");
  }
  else if (_matchShortcut(key,"t")) {
    e.preventDefault();
    _toggleSection(tNaql, ()=>S.nOn, "__naqlName", "أجور النقل");
  }
  else if (_matchShortcut(key,"c")) {
    e.preventDefault();
    _toggleSection(tWasl, ()=>S.wOn, "wP", "سعر الوصل");
  }
  else if (_matchShortcut(key,"r")) {
    e.preventDefault();
    _toggleTab('recs');
  }
  else if (_matchShortcut(key,"m")) {
    e.preventDefault();
    if (_modalOpen("mConf")) { closeM(); _dropShortcut("cPrc"); showToast("✖ أُغلق تأكيد المخزن"); }
    else {
      const rec = S.recs.find(function(r){ return r.status === "waiting"; });
      if (rec) { openConf(rec.id); _pushShortcut("cPrc"); }
      else showToast("⚠ لا توجد وصلات بانتظار تأكيد المخزن");
    }
  }
  else if (_matchShortcut(key,"d")) {
    e.preventDefault();
    if (_modalOpen("mEdit")) { closeM(); _dropShortcut("eDk"); showToast("✖ أُغلق تعديل الوصل"); }
    else focusRecDate();
  }
  else if (_matchShortcut(key,"e")) {
    e.preventDefault();
    if (_modalOpen("mWeigh")) { closeM(); _dropShortcut("eWI"); showToast("✖ أُغلق الوزن الفارغ"); }
    else {
      const rec = S.recs.find(function(r){ return r.status === "confirmed"; });
      if (rec) { openWeigh(rec.id); _pushShortcut("eWI"); }
      else showToast("⚠ لا توجد وصلات بانتظار الوزن الفارغ");
    }
  }
});

