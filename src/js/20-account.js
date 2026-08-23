/* ══════════════════════════════════════════════════════════════
   ربط الجهاز بحساب المستخدم — v17.60
   ──────────────────────────────────────────────────────────────
   الدخول المجهول أوقف الغريب الذي يمسح الإنترنت، لكنه لا يفرّق
   بين شخص وآخر: كل من يملك الرابط يحصل على هوية، ولا تستطيع
   سحبها ممّن ترك العمل.

   الحلّ: لكل مستخدم حساب في فايربيس. والمهمّ في التنفيذ:
   ⚠️ كلمة السر لا تُكتب في هذا الملف ولا تُحفظ في التخزين
      المحلي إطلاقاً. تُدخل مرة واحدة على كل جهاز، وفايربيس
      يحتفظ بالجلسة بنفسه (LOCAL persistence). وضعُها في الملف
      كان سيجعلها معلومة لكل من فتحه — أي لا شيء.

   رمز الـ PIN يبقى كما هو لسرعة الساحة: هو يفتح الواجهة.
   والحساب هو ما يفتح قاعدة البيانات. الاثنان طبقتان مختلفتان.

   الانتقال بلا تعطيل: ما دام الدخول المجهول مُفعَّلاً في
   فايربيس يعمل الجميع كما كانوا؛ ومن ربط جهازه صارت هويته
   هي المستعملة. فإذا ربط الجميع أجهزتهم، أطفئ Anonymous من
   لوحة فايربيس فيصير الحساب إلزامياً — بلا يوم توقّف واحد.
══════════════════════════════════════════════════════════════ */

/* بريد الحساب لكل مستخدم — يُشتقّ من معرّفه ما لم يُذكر صراحةً.
   v17.64: صار قابلاً للكتابة في البوابة أيضاً، فالحساب الذي تنشئه
   في فايربيس قد يكون بريدك الحقيقي (mail@gmail.com) لا المشتقّ.
   البريد المستعمل يُحفظ على الجهاز للتيسير — وهو ليس سرّاً.
   ⚠️ كلمة السر لا تُحفظ إطلاقاً، لا هنا ولا في أي مكان. */
const AUTH_DOMAIN_LOCAL="alshams.app";
const _AUTH_EMAIL_K="wShamsAuthEmail";
const _userEmail=u=>(u&&u.email)||("user"+((u&&u.id)||0)+"@"+AUTH_DOMAIN_LOCAL);
function _lastEmail(){ try{return localStorage.getItem(_AUTH_EMAIL_K)||"";}catch(e){return "";} }
function _rememberEmail(e){ try{ e?localStorage.setItem(_AUTH_EMAIL_K,e):localStorage.removeItem(_AUTH_EMAIL_K); }catch(x){} }
/* البريد المقترح: آخر ما نجح على هذا الجهاز، وإلا المشتقّ من المستخدم */
const _suggestEmail=()=>_lastEmail()||(S.cu?_userEmail(S.cu):"");

function _authUser(){
  try{return (typeof firebase!=="undefined"&&firebase.auth)?firebase.auth().currentUser:null;}
  catch(e){return null;}
}
const _authIsAnon=()=>{const u=_authUser();return !!u&&u.isAnonymous;};
const _authIsNamed=()=>{const u=_authUser();return !!u&&!u.isAnonymous;};
function _authLabel(){
  const u=_authUser();
  if(!u)return "بلا هوية";
  return u.isAnonymous?"مجهول":(u.email||u.uid);
}

/* ربط هذا الجهاز بحساب — يعمل من صندوق الأدوات ومن البوابة معاً.
   scope: "box" (الأدوات) أو "gate" (بوابة الدخول الإلزامية) */
async function linkDeviceAccount(scope){
  const S_=scope==="gate"?"gate":"auth";
  const pw=(document.getElementById(S_+"Pw")?.value||"");
  const typed=(document.getElementById(S_+"Email")?.value||"").trim();
  const box=document.getElementById(S_+"Res");
  const say=(ok,m)=>{ if(box)box.innerHTML=
    `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.7;
        background:${ok?"var(--settled-wash)":"var(--owing-wash)"};
        border:1px solid ${ok?"var(--settled)":"var(--owing)"};
        color:${ok?"var(--settled)":"var(--owing)"}">${ok?"✅ ":"⚠️ "}${esc(m)}</div>`; };
  if(!S.cu){say(false,"سجّل الدخول أولاً");return;}
  const email=typed||_suggestEmail();
  if(!email){say(false,"أدخل بريد الحساب");return;}
  if(!pw){say(false,"أدخل كلمة سر حسابك");return;}
  if(typeof firebase==="undefined"||!firebase.auth){say(false,"مكتبة المصادقة لم تُحمَّل — تحقّق من الإنترنت");return;}
  try{
    const auth=firebase.auth();
    try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(e){}
    const cur=auth.currentUser;
    /* الجلسة المجهولة تُترك ثم يُسجَّل الدخول بالحساب الحقيقي */
    if(cur&&cur.isAnonymous){try{await auth.signOut();}catch(e){}}
    await auth.signInWithEmailAndPassword(email,pw);
    const el=document.getElementById(S_+"Pw"); if(el)el.value="";   // لا تبقى في الصفحة
    _authReady=true;
    _rememberEmail(email);
    say(true,"رُبط هذا الجهاز بحساب "+email+" — لن تُطلب كلمة السر مرة أخرى على هذا الجهاز.");
    _auditWrite({id:genId()+"-"+Date.now().toString(36),at:nowStr(),
      by:(S.cu&&S.cu.name)||"—",kind:"auth",node:"auth",recId:email,
      subject:"ربط جهاز",action:"create",dk:toDay(),
      changes:[{f:"name",from:"مجهول",to:email}]});
    if(_writeQueue.length)setTimeout(_flushQueue,600);
    renderAuthBox();
    if(scope==="gate")setTimeout(_authGateClose,1200);
    showToast("🔐 رُبط الجهاز — عاد الحفظ يعمل");
  }catch(e){
    const c=String(e&&e.code||e&&e.message||e);
    let m="تعذّر الربط: "+c;
    if(/user-not-found/i.test(c))m="لا يوجد حساب بهذا البريد ("+email+"). أنشئه من Firebase ← Authentication ← Users ← Add user.";
    else if(/wrong-password|invalid-credential|invalid-login/i.test(c))m="البريد أو كلمة السر غير صحيحة.";
    else if(/invalid-email/i.test(c))m="صيغة البريد غير صحيحة.";
    else if(/too-many-requests/i.test(c))m="محاولات كثيرة — انتظر قليلاً.";
    else if(/operation-not-allowed/i.test(c))m="فعّل Email/Password في Firebase ← Authentication ← Sign-in method.";
    else if(/network/i.test(c))m="لا اتصال بالإنترنت.";
    say(false,m);
  }
}

/* فكّ الربط — لا يعود مجهولاً إن كان المجهول مُطفأً، بل يطلب حساباً */
async function unlinkDeviceAccount(){
  if(!confirm(_anonOff
    ? "فكّ ربط هذا الجهاز؟\n\nالدخول المجهول مُطفأ في مشروعك، فسيتوقّف الحفظ فوراً حتى تربطه بحساب من جديد."
    : "فكّ ربط هذا الجهاز؟\n\nستُطلب كلمة السر مرة أخرى عند الربط."))return;
  try{
    await firebase.auth().signOut();
    if(!_anonOff){ try{await firebase.auth().signInAnonymously();}catch(e){} }
  }catch(e){}
  _authReady=false;
  showToast("🔓 فُكّ ربط الجهاز");
  renderAuthBox();
  if(_anonOff)_authGateOpen();
}

/* ══════════════════════════════════════════════════════════════
   بوابة الدخول بالحساب — v17.64
   ──────────────────────────────────────────────────────────────
   حين يكون المجهول مُطفأً ولا جلسة على الجهاز، كان التطبيق يفتح
   كأن كل شيء سليم ثم تُرفض كل كتابة بصمت ويتضخّم الطابور. الآن
   تظهر بوابة تقول ما ينقص وتحلّه في مكانه.

   لا تُغلق البوابة على شاشة الرمز — تنتظر الدخول أولاً كي لا
   تغطّي لوحة الأرقام. ويمكن تأجيلها للاطّلاع على البيانات
   المحفوظة محلياً: التطبيق يعمل دون إنترنت بحكم تصميمه،
   والمنع من القراءة عقوبة بلا فائدة.
══════════════════════════════════════════════════════════════ */
let _gatePending=false;
function _authGateOpen(){
  if(!S.cu){ _gatePending=true; return; }      // لا نغطّي شاشة الرمز
  const el=document.getElementById("mAuthGate");
  if(!el)return;
  renderAuthGate();
  el.classList.add("active");
}
function _authGateClose(){
  _gatePending=false;
  const el=document.getElementById("mAuthGate");
  if(el)el.classList.remove("active");
}
/* يُنادى بعد نجاح رمز الدخول */
function _authGateMaybe(){
  if(_gatePending){ _gatePending=false; _authGateOpen(); return; }
  if(_anonOff&&!_authIsNamed())_authGateOpen();
}

function renderAuthGate(){
  const b=document.getElementById("mAuthGateBody");
  if(!b)return;
  const email=_suggestEmail();
  b.innerHTML=`
    <div class="mtit" style="color:var(--owing)">🔐 هذا الجهاز يحتاج حساباً</div>
    <div style="font-size:11px;color:var(--paper-2);line-height:1.9;margin-bottom:10px">
      قاعدة البيانات في مشروعك مفتوحة <strong>للحسابات التي تختارها وحدها</strong>
      — والدخول المجهول مُطفأ، وهذا هو الإعداد الصحيح.
      <br>اربط هذا الجهاز مرة واحدة، ولن تُطلب كلمة السر مجدداً عليه.
    </div>
    <div style="background:var(--owing-wash);border:1px solid var(--owing);border-radius:9px;
         padding:8px 10px;margin-bottom:10px;font-size:11px;color:var(--owing);line-height:1.7">
      ⚠️ حتى تربطه: القراءة تعمل من الكاش المحلي، و<strong>كل حفظ جديد يبقى في الطابور</strong>
      ولا يصل السيرفر.
    </div>
    <div class="fi-g" style="margin-bottom:8px">
      <label class="fl">بريد الحساب</label>
      <input class="fi" id="gateEmail" type="email" value="${esc(email)}"
        placeholder="mail@example.com" dir="ltr"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div class="fi-g" style="margin-bottom:10px">
      <label class="fl">كلمة سر الحساب</label>
      <input class="fi" id="gatePw" type="password" placeholder="تُدخل مرة واحدة على هذا الجهاز"
        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
        data-form-type="other" data-lpignore="true" data-1p-ignore="true"
        onkeydown="if(event.key==='Enter')linkDeviceAccount('gate')">
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn bgn" style="flex:1;min-width:130px" onclick="linkDeviceAccount('gate')">🔗 ربط الجهاز</button>
      <button class="btn" style="background:var(--ink-200);color:var(--paper-3)" onclick="_authGateClose()">لاحقاً</button>
    </div>
    <div style="font-size:10px;color:var(--paper-4);margin-top:8px;line-height:1.7">
      كلمة السر لا تُكتب في ملف التطبيق ولا تُحفظ في الجهاز — فايربيس يحفظ الجلسة وحدها.
      <br>الحساب يُنشأ من: Firebase ← Authentication ← Users ← Add user.
    </div>
    <div id="gateRes"></div>`;
}

function renderAuthBox(){
  const box=document.getElementById("authBox");
  if(!box)return;
  const named=_authIsNamed(), anon=_authIsAnon();
  const email=_suggestEmail()||"—";
  box.innerHTML=`
    <div style="background:${named?"var(--settled-wash)":(_anonOff?"var(--owing-wash)":"var(--ink-200)")};
        border:1px solid ${named?"var(--settled)":(_anonOff?"var(--owing)":"var(--rule)")};border-radius:9px;
        padding:9px 11px;margin-bottom:9px;font-size:11px;line-height:1.8">
      <div style="font-weight:700;color:${named?"var(--settled)":(_anonOff?"var(--owing)":"var(--paper-2)")}">
        ${named?"🔐 هذا الجهاز مربوط بحسابك":(anon?"👤 هوية مجهولة (مشتركة)":"⚠️ بلا هوية — الحفظ متوقّف")}
      </div>
      <div style="color:var(--paper-3);font-size:10px">الهوية الحالية: ${esc(_authLabel())}</div>
      <div style="color:var(--paper-3);font-size:10px">
        وضع المشروع: ${_anonOff
          ? "<strong style=\"color:var(--settled)\">الحسابات المختارة فقط</strong> (الدخول المجهول مُطفأ)"
          : "الدخول المجهول مسموح — كل من يملك الرابط يحصل على هوية"}
      </div>
      ${named?"":`<div style="color:var(--paper-2);margin-top:4px">
        اربط الجهاز بحسابك لتصير الصلاحية باسمك — فتُسحب وحدك متى لزم،
        بلا تغيير على أحد غيرك.</div>`}
    </div>
    ${named?`<button class="btn bsm" style="background:var(--owing-rule);color:var(--owing)"
        onclick="unlinkDeviceAccount()">🔓 فكّ الربط</button>`
    :`<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:160px">
          <label class="fl">بريد الحساب</label>
          <input class="fi" id="authEmail" type="email" value="${esc(email==="—"?"":email)}"
            placeholder="mail@example.com" dir="ltr"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            data-form-type="other" data-lpignore="true" data-1p-ignore="true">
        </div>
        <div style="flex:1;min-width:150px">
          <label class="fl">كلمة سر الحساب</label>
          <input class="fi" id="authPw" type="password" placeholder="تُدخل مرة واحدة على هذا الجهاز"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            data-form-type="other" data-lpignore="true" data-1p-ignore="true"
            onkeydown="if(event.key==='Enter')linkDeviceAccount('box')">
        </div>
        <button class="btn bgn" onclick="linkDeviceAccount('box')">🔗 ربط</button>
      </div>
      <div style="font-size:10px;color:var(--paper-4);margin-top:5px;line-height:1.6">
        كلمة السر لا تُحفظ في التطبيق ولا في الجهاز — فايربيس يحفظ الجلسة وحدها.
        <br>ليس لك حساب بعد؟ أنشئه من Firebase ← Authentication ← Users ← Add user
        بالبريد <strong style="color:var(--paper-2)">${esc(email)}</strong>.</div>`}
    <div id="authRes"></div>`;
}


