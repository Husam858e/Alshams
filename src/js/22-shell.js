/* ══════════════════════════════════════════════════════
   إصلاح الفراغ الأسود بين القائمة والمحتوى
   ─────────────────────────────────────────
   ٢٨ من أقسام التبويبات كانت موضوعة خارج حاوية #AS
   مباشرةً تحت <body>. وبما أن #AS ارتفاعها الأدنى شاشة
   كاملة (min-height:100vh)، كان كل قسم يقع بعدها يبدأ
   بعد شاشة فارغة كاملة — وهذا سبب المسافة السوداء.
   نُعيدها إلى مكانها الصحيح داخل #AS عند الإقلاع.
══════════════════════════════════════════════════════ */
/* يبقي شريط التبويبات ملتصقاً أسفل الترويسة مهما تغيّر ارتفاعها */

/* ══════════════════════════════════════════════════════
   ملء الشاشة — v17.11
   ──────────────────────────────────────────────────────
   F11 على الحاسوب، وزر ⛶ في الترويسة للهاتف حيث لا لوحة
   مفاتيح. نستخدم Fullscreen API مع بادئات المتصفحات، ونعيد
   قياس ارتفاع الترويسة بعد التبديل لأن شريط المتصفح يختفي.
   iOS Safari لا يدعم ملء الشاشة لغير الفيديو — نُنبّه بلطف.
══════════════════════════════════════════════════════ */
function _fsElement(){
  return document.fullscreenElement||document.webkitFullscreenElement||
         document.mozFullScreenElement||document.msFullscreenElement||null;
}
function _fsSupported(){
  const e=document.documentElement;
  return !!(e.requestFullscreen||e.webkitRequestFullscreen||
            e.mozRequestFullScreen||e.msRequestFullscreen);
}
function toggleFullscreen(){
  if(!_fsSupported()){
    showToast("⚠ متصفحك لا يدعم ملء الشاشة — أضف التطبيق للشاشة الرئيسية بدلاً منه");
    return;
  }
  const el=document.documentElement;
  if(_fsElement()){
    const exit=document.exitFullscreen||document.webkitExitFullscreen||
               document.mozCancelFullScreen||document.msExitFullscreen;
    try{
      const r=exit.call(document);
      if(r&&r.catch)r.catch(()=>{});
    }catch(e){}
  } else {
    const req=el.requestFullscreen||el.webkitRequestFullscreen||
              el.mozRequestFullScreen||el.msRequestFullscreen;
    try{
      const r=req.call(el,{navigationUI:"hide"});
      if(r&&r.catch)r.catch(()=>{
        showToast("⚠ تعذّر ملء الشاشة — قد يمنعه المتصفح");
      });
    }catch(e){
      try{req.call(el);}catch(x){showToast("⚠ تعذّر ملء الشاشة");}
    }
  }
}
function _updFsBtn(){
  const b=document.getElementById("fsBtn");
  if(!b)return;
  const on=!!_fsElement();
  b.textContent=on?"✕":"⛶";
  b.title=on?"خروج من ملء الشاشة (F11)":"ملء الشاشة (F11)";
  b.style.borderColor=on?"var(--wheat)":"var(--rule)";
  b.style.color=on?"var(--wheat)":"var(--paper-2)";
}
["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"]
  .forEach(ev=>document.addEventListener(ev,function(){
    _updFsBtn();
    // شريط المتصفح اختفى/عاد — أعد قياس ارتفاع الترويسة ليبقى
    // شريط التبويبات ملتصقاً بها بدقة
    setTimeout(_syncHeaderH,60);
    setTimeout(_syncHeaderH,320);
  }));

/* F11 — يعمل أثناء الكتابة أيضاً، فهو تبديل عرض لا إدخال نص */
document.addEventListener("keydown",function(e){
  if(e.key!=="F11"||e.ctrlKey||e.altKey||e.metaKey||e.shiftKey)return;
  e.preventDefault();
  toggleFullscreen();
},true);

/* v17.18 — Escape مخرج طوارئ: يُحرّر لوحة المفاتيح من أي حقل
   أو منتقٍ محتجِز، فتعود الاختصارات للعمل فوراً بلا نقر بالفأرة. */
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape"||!S.cu)return;
  const a=document.activeElement;
  if(a&&a!==document.body&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName||"")){
    _releaseFocus();
  }
},true);

/* ══════════════════════════════════════════════════════
   تبديل الوضع: تلقائي (يتبع الهاتف) ← فاتح ← داكن
   الفاتح هو الأنسب للعمل تحت الشمس، والداكن لليل.
══════════════════════════════════════════════════════ */
const _THEMES=["auto","light","dark"];
const _THEME_ICON={auto:"◐",light:"☀",dark:"☾"};
const _THEME_NAME={auto:"تلقائي",light:"نهاري",dark:"ليلي"};
function _getTheme(){
  try{return localStorage.getItem("wShamsTheme")||"auto";}catch(e){return "auto";}
}
function _applyTheme(t){
  const r=document.documentElement;
  if(t==="auto")r.removeAttribute("data-theme");
  else r.setAttribute("data-theme",t);
  try{localStorage.setItem("wShamsTheme",t);}catch(e){}
  const b=document.getElementById("themeBtn");
  if(b){b.textContent=_THEME_ICON[t];b.title="المظهر: "+_THEME_NAME[t];}
  // لون شريط المتصفح يتبع الخلفية
  const m=document.querySelector('meta[name="theme-color"]');
  if(m){
    const bg=getComputedStyle(document.body).backgroundColor;
    if(bg)m.setAttribute("content",bg);
  }
  _syncHeaderH();
}
function cycleTheme(){
  const cur=_getTheme();
  const next=_THEMES[(_THEMES.indexOf(cur)+1)%_THEMES.length];
  _applyTheme(next);
  showToast(_THEME_ICON[next]+" المظهر: "+_THEME_NAME[next]);
}
/* يُطبَّق فوراً قبل الرسم لتفادي وميض الوضع الخاطئ */
(function(){try{
  const t=localStorage.getItem("wShamsTheme")||"auto";
  if(t!=="auto")document.documentElement.setAttribute("data-theme",t);
}catch(e){}})();

function _syncHeaderH(){
  const tb=document.querySelector(".tb");
  if(!tb)return;
  const h=Math.round(tb.getBoundingClientRect().height);
  if(h>0)document.documentElement.style.setProperty("--tb-h",h+"px");
}
window.addEventListener("resize",_syncHeaderH);
window.addEventListener("orientationchange",()=>setTimeout(_syncHeaderH,250));
/* الترويسة مخفية قبل الدخول — نراقب حجمها ونحدّث فور ظهورها */
function _watchHeader(){
  const tb=document.querySelector(".tb");
  if(!tb)return;
  if(typeof ResizeObserver==="function"){
    try{new ResizeObserver(_syncHeaderH).observe(tb);return;}catch(e){}
  }
  [0,120,400,1000].forEach(t=>setTimeout(_syncHeaderH,t));
}

function _reparentTabs(){
  const AS=document.getElementById("AS");
  if(!AS)return 0;
  let moved=0;
  document.querySelectorAll(".tc").forEach(t=>{
    if(!AS.contains(t)){AS.appendChild(t);moved++;}
  });
  return moved;
}

function appInit(){
  if(window._appInited) return;
  window._appInited = true;
  _reparentTabs();   // يجب أن يسبق أي رسم
  _watchAutofill();   // يمنع شريط الإكمال التلقائي فوق لوحة المفاتيح
  _applyTheme(_getTheme());
  _updFsBtn();
  _watchHeader();
  // تعيين تاريخ اليوم في حقول التقارير
  const rdEl=document.getElementById("rDt");
  if(rdEl) rdEl.value=toDay();
  const jdEl=document.getElementById("jamiDt_buy");
  if(jdEl) jdEl.value=toDay();
  const jdEl2=document.getElementById("jamiDt_sell");
  if(jdEl2) jdEl2.value=toDay();
  const jdEl3=document.getElementById("jamiDt_dam");
  if(jdEl3) jdEl3.value=toDay();
  const now=new Date();
  const mp=String(now.getFullYear())+"-"+String(now.getMonth()+1).padStart(2,"0");
  const hdp=document.getElementById("histDayPicker");
  if(hdp) hdp.value=toDay();
  const hwp=document.getElementById("histWeekPicker");
  if(hwp) hwp.value=toDay();
  const hmp=document.getElementById("histMonthPicker");
  if(hmp) hmp.value=mp;
  // تحميل الكاش المحلي أولاً دائماً
  try{const c=localStorage.getItem("wShamsCache");if(c)S.recs=JSON.parse(c).sort(_byDkDesc);}catch(e){}
  try{const cs=localStorage.getItem("wShamsSellCache");if(cs)SELL_RECS=JSON.parse(cs).sort(_byDkDesc);}catch(e){}
  loadDamCache();
  loadSrfCache();
  loadWrkCache();
  loadMnlCache();
  loadSalCache();
  loadEmpTxnCache();
  loadArbCache();
  document.querySelectorAll(".mo").forEach(function(m){
    m.addEventListener("click",function(e){if(e.target===this)closeM();});
  });
  _loadQueue();
  _loadTrash();
  _loadAuditCache();
  _loadClosures();
  _loadCashbox();
  /* v17.50 — لقطة يومية بعد أن تستقرّ البيانات (فايربيس أو الكاش) */
  setTimeout(function(){try{autoSnapshot();}catch(e){}},6000);
  if(typeof _flushQueue==="function") _flushQueue();
  // بدء Firebase — مع تأخير إضافي إذا لم تُحمَّل بعد
  if(typeof firebase!=="undefined"){
    initFirebase();
  } else {
    // انتظر تحميل Firebase (حتى 8 ثوان للملفات المحلية)
    let attempts=0;
    const checkFB=setInterval(function(){
      attempts++;
      if(typeof firebase!=="undefined"){
        clearInterval(checkFB);
        initFirebase();
      } else if(attempts>=16){
        clearInterval(checkFB);
        // Firebase لم تُحمَّل — جرّب التحميل الديناميكي
        initFirebase(); // سيستدعي _loadFirebaseDynamic تلقائياً
      }
    },500);
  }
}
// محاولة أولى: DOMContentLoaded
document.addEventListener("DOMContentLoaded", function(){
  setTimeout(function(){ if(!window._appInited) appInit(); }, 150);
});
window.onload = function(){
  setTimeout(function(){ if(!window._appInited) appInit(); }, 300);
};
// محاولة ثالثة بعد ثانيتين (للـ WebView البطيء وملفات content://)
setTimeout(function(){ if(!window._appInited) appInit(); }, 2000);

/* ════════════════════════════════════════════
   LOGIN
════════════════════════════════════════════ */
function sU(id){
  S.su=USERS.find(u=>u.id===id);S.pin="";
  document.querySelectorAll(".ubtn").forEach(b=>b.classList.remove("active"));
  const ubtn=document.getElementById("u"+id);
  if(ubtn)ubtn.classList.add("active");
  const pinSec=document.getElementById("pinSec");
  if(pinSec)pinSec.style.display="block";
  const pinLbl=document.getElementById("pinLbl");
  if(pinLbl)pinLbl.textContent="رمز الدخول لـ "+(S.su?S.su.name:"");
  const pErr=document.getElementById("pErr");
  if(pErr)pErr.style.display="none";
  const lBtn=document.getElementById("lBtn");
  if(lBtn)lBtn.disabled=true;
  updDots();
}
function np(n){if(S.pin.length>=4)return;S.pin+=n;updDots();if(S.pin.length===4)document.getElementById("lBtn").disabled=false;}
function nd(){S.pin=S.pin.slice(0,-1);document.getElementById("lBtn").disabled=true;updDots();}
/* ══════════════════════════════════════════════════════
   إدخال رمز الدخول من لوحة المفاتيح — v17.12
   ──────────────────────────────────────────────────────
   يقبل الأرقام اللاتينية (0-9) والعربية الشرقية (٠-٩) من
   الصف العلوي أو لوحة الأرقام الجانبية.
   Backspace يمسح رقماً · Esc يمسح الكل · Enter يدخل.
   ويدخل تلقائياً عند اكتمال الأرقام الأربعة.
   لا يعمل بعد تسجيل الدخول فلا يتعارض مع اختصارات التطبيق.
══════════════════════════════════════════════════════ */
function _loginVisible(){
  const ls=document.getElementById("LS");
  if(!ls)return false;
  if(S.cu)return false;
  return getComputedStyle(ls).display!=="none";
}
function _pinDigit(key){
  if(/^[0-9]$/.test(key))return key;
  const i="٠١٢٣٤٥٦٧٨٩".indexOf(key);
  return i>=0?String(i):null;
}
function clrPin(){
  S.pin="";
  const b=document.getElementById("lBtn");if(b)b.disabled=true;
  const er=document.getElementById("pErr");if(er)er.style.display="none";
  updDots();
}
document.addEventListener("keydown",function(e){
  if(!_loginVisible())return;
  if(e.ctrlKey||e.altKey||e.metaKey)return;
  const t=e.target;
  if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||""))return;

  const d=_pinDigit(e.key);
  if(d!==null){
    e.preventDefault();
    if(!S.su){showToast("👤 اختر المستخدم أولاً");return;}
    np(Number(d));
    // دخول تلقائي عند اكتمال الأربعة — التدفّق الطبيعي للوحة المفاتيح
    if(S.pin.length===4)setTimeout(()=>{if(S.pin.length===4&&!S.cu)doLogin();},160);
    return;
  }
  if(e.key==="Backspace"){e.preventDefault();if(S.su)nd();return;}
  if(e.key==="Delete"||e.key==="Escape"){e.preventDefault();clrPin();return;}
  if(e.key==="Enter"){
    e.preventDefault();
    if(!S.su){showToast("👤 اختر المستخدم أولاً");return;}
    if(S.pin.length===4)doLogin(); else showToast("⚠ أدخل الرمز كاملاً");
    return;
  }
});

function updDots(){for(let i=0;i<4;i++)document.getElementById("d"+i)?.classList.toggle("filled",i<S.pin.length);}

/* ══════════════════════════════════════════════════════
   مهلة بعد المحاولات الخاطئة — v17.43
   ──────────────────────────────────────────────────────
   الرمز أربعة أرقام فقط: ١٠٠٠٠ احتمال. ومحاولة فورية بلا
   حدّ تعني أن من يمسك الجهاز دقيقتين يجرّبها كلها.
   بعد ٥ محاولات خاطئة تُفرض مهلة تتضاعف (١٥ث · ٣٠ث ·
   ٦٠ث … بحدّ أقصى ٥ دقائق) — تكفي لإفشال التجريب الأعمى
   ولا تُعطّل من أخطأ رمزه مرّتين.
   المهلة في localStorage فلا يتجاوزها إغلاق التطبيق.
   ⚠️ هذه طبقة ردع لا حماية كاملة: الرموز في كود الصفحة،
   ومن يفتح أدوات المطوّر يراها. الحماية الحقيقية تكون
   بقواعد فايربيس على الخادم.
══════════════════════════════════════════════════════ */
const _LOCKK="wShamsLoginLock";
function _lockState(){
  try{return JSON.parse(localStorage.getItem(_LOCKK)||"{}")||{};}catch(e){return{};}
}
function _lockSave(st){try{localStorage.setItem(_LOCKK,JSON.stringify(st));}catch(e){}}
/* الثواني المتبقية من المهلة، أو ٠ إن لم تكن هناك مهلة */
function _lockLeft(){
  const st=_lockState();
  if(!st.until)return 0;
  return Math.max(0,Math.ceil((st.until-Date.now())/1000));
}
function _lockNoteFail(){
  const st=_lockState();
  st.fails=(st.fails||0)+1;
  if(st.fails>=5){
    // ١٥ث ثم تتضاعف مع كل محاولة خاطئة لاحقة — بحدّ أقصى ٥ دقائق
    const step=Math.min(300,15*Math.pow(2,st.fails-5));
    st.until=Date.now()+step*1000;
  }
  _lockSave(st);
  return st;
}
function _lockClear(){try{localStorage.removeItem(_LOCKK);}catch(e){}}

function doLogin(){
  if(!S.su)return;
  const left=_lockLeft();
  if(left>0){
    const er=document.getElementById("pErr");
    if(er){er.style.display="block";er.textContent=`⛔ محاولات خاطئة كثيرة — انتظر ${AR(left)} ثانية`;}
    S.pin="";const lb=document.getElementById("lBtn");if(lb)lb.disabled=true;updDots();
    showToast(`⛔ انتظر ${AR(left)} ثانية قبل المحاولة مجدداً`);
    return;
  }
  if(String(S.su.pin)===String(S.pin)){
    _lockClear();
    S.cu=S.su;
    // إخفاء شاشة الدخول
    const ls=document.getElementById("LS");
    if(ls){ls.style.display="none";ls.style.visibility="hidden";}
    // إظهار التطبيق
    const as=document.getElementById("AS");
    if(as){as.classList.add("active");as.style.display="flex";}
    // تحديث اسم المستخدم
    const tu=document.getElementById("TU");
    if(tu)tu.textContent="👤 "+S.cu.name;
    // إظهار زر AI
    const aiBtn=document.getElementById("aiBtn");
    if(aiBtn)aiBtn.style.display="flex";
    // تحميل الكاش المحلي إن لم يكن Firebase اتصل بعد
    try{if(!S.recs.length){const c=localStorage.getItem("wShamsCache");if(c)S.recs=JSON.parse(c).sort(_byDkDesc);}}catch(e){}
    // عرض البيانات
    try{renderRecs();}catch(e){}
    try{renderStats();}catch(e){}
    try{renderWH();}catch(e){}
    try{renderRpt();}catch(e){}
    try{renderWhCollGrid();}catch(e){}
    // إعادة محاولة Firebase إن لم يكن متصلاً
    if(!db){
      setTimeout(function(){
        try{initFirebase();}catch(e){}
      }, 500);
    }
    // v17.64 — البوابة تنتظر انتهاء شاشة الرمز كي لا تغطّي لوحة الأرقام
    setTimeout(function(){try{_authGateMaybe();}catch(e){}},900);
  }else{
    const st=_lockNoteFail();
    const er=document.getElementById("pErr");
    if(er){
      er.style.display="block";
      const wait=_lockLeft();
      er.textContent=wait>0
        ? `⛔ محاولات خاطئة كثيرة — انتظر ${AR(wait)} ثانية`
        : (st.fails>=3?`❌ رمز خاطئ — بقيت ${AR(5-st.fails)} محاولة قبل المهلة`:"❌ رمز خاطئ");
    }
    S.pin="";
    const lb=document.getElementById("lBtn");if(lb)lb.disabled=true;
    updDots();
  }
}
function doLogout(){
  S.cu=null;S.su=null;S.pin="";
  document.querySelectorAll(".ubtn").forEach(b=>b.classList.remove("active"));
  const pinSec=document.getElementById("pinSec");if(pinSec)pinSec.style.display="none";
  const pErr=document.getElementById("pErr");if(pErr)pErr.style.display="none";
  const lBtn=document.getElementById("lBtn");if(lBtn)lBtn.disabled=true;
  const as=document.getElementById("AS");if(as){as.classList.remove("active");as.style.display="none";}
  const ls=document.getElementById("LS");if(ls){ls.style.display="table";ls.style.visibility="visible";}
  const aiBtn=document.getElementById("aiBtn");if(aiBtn)aiBtn.style.display="none";
  try{closeAI();}catch(e){}
  try{updDots();}catch(e){}
  try{clrForm();}catch(e){}
}

