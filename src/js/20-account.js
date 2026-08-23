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

/* بريد الحساب لكل مستخدم — يُشتقّ من معرّفه ما لم يُذكر صراحةً */
const AUTH_DOMAIN_LOCAL="alshams.app";
const _userEmail=u=>(u&&u.email)||("user"+((u&&u.id)||0)+"@"+AUTH_DOMAIN_LOCAL);

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

/* ربط هذا الجهاز بحساب المستخدم الحالي */
async function linkDeviceAccount(){
  const pw=(document.getElementById("authPw")?.value||"");
  const box=document.getElementById("authRes");
  const say=(ok,m)=>{ if(box)box.innerHTML=
    `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;font-size:11px;line-height:1.7;
        background:${ok?"var(--settled-wash)":"var(--owing-wash)"};
        border:1px solid ${ok?"var(--settled)":"var(--owing)"};
        color:${ok?"var(--settled)":"var(--owing)"}">${ok?"✅ ":"⚠️ "}${esc(m)}</div>`; };
  if(!S.cu){say(false,"سجّل الدخول أولاً");return;}
  if(!pw){say(false,"أدخل كلمة سر حسابك");return;}
  if(typeof firebase==="undefined"||!firebase.auth){say(false,"مكتبة المصادقة لم تُحمَّل — تحقّق من الإنترنت");return;}
  const email=_userEmail(S.cu);
  try{
    const auth=firebase.auth();
    try{await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(e){}
    const cur=auth.currentUser;
    /* الجلسة المجهولة تُترك ثم يُسجَّل الدخول بالحساب الحقيقي */
    if(cur&&cur.isAnonymous){try{await auth.signOut();}catch(e){}}
    await auth.signInWithEmailAndPassword(email,pw);
    const el=document.getElementById("authPw"); if(el)el.value="";
    _authReady=true;
    say(true,"رُبط هذا الجهاز بحساب "+email+" — لن تُطلب كلمة السر مرة أخرى على هذا الجهاز.");
    _auditWrite({id:genId()+"-"+Date.now().toString(36),at:nowStr(),
      by:(S.cu&&S.cu.name)||"—",kind:"auth",node:"auth",recId:email,
      subject:"ربط جهاز",action:"create",dk:toDay(),
      changes:[{f:"name",from:"مجهول",to:email}]});
    if(_writeQueue.length)setTimeout(_flushQueue,600);
    renderAuthBox();
  }catch(e){
    const c=String(e&&e.code||e&&e.message||e);
    let m="تعذّر الربط: "+c;
    if(/user-not-found/i.test(c))m="لا يوجد حساب بهذا البريد ("+email+"). أنشئه من Firebase ← Authentication ← Users.";
    else if(/wrong-password|invalid-credential/i.test(c))m="كلمة السر غير صحيحة.";
    else if(/too-many-requests/i.test(c))m="محاولات كثيرة — انتظر قليلاً.";
    else if(/operation-not-allowed/i.test(c))m="فعّل Email/Password في Firebase ← Authentication ← Sign-in method.";
    else if(/network/i.test(c))m="لا اتصال بالإنترنت.";
    say(false,m);
  }
}

/* فكّ الربط — يعود الجهاز مجهولاً إن كان مسموحاً */
async function unlinkDeviceAccount(){
  if(!confirm("فكّ ربط هذا الجهاز؟\n\nستُطلب كلمة السر مرة أخرى عند الربط.\nإن كان الدخول المجهول مُطفأً في فايربيس فسيتوقّف الحفظ حتى تربطه من جديد."))return;
  try{
    await firebase.auth().signOut();
    try{await firebase.auth().signInAnonymously();}catch(e){}
  }catch(e){}
  showToast("🔓 فُكّ ربط الجهاز");
  renderAuthBox();
}

function renderAuthBox(){
  const box=document.getElementById("authBox");
  if(!box)return;
  const named=_authIsNamed(), anon=_authIsAnon();
  const email=S.cu?_userEmail(S.cu):"—";
  box.innerHTML=`
    <div style="background:${named?"var(--settled-wash)":"var(--ink-200)"};
        border:1px solid ${named?"var(--settled)":"var(--rule)"};border-radius:9px;
        padding:9px 11px;margin-bottom:9px;font-size:11px;line-height:1.8">
      <div style="font-weight:700;color:${named?"var(--settled)":"var(--paper-2)"}">
        ${named?"🔐 هذا الجهاز مربوط بحسابك":(anon?"👤 هوية مجهولة (مشتركة)":"⚠️ بلا هوية")}
      </div>
      <div style="color:var(--paper-3);font-size:10px">الهوية الحالية: ${esc(_authLabel())}</div>
      ${named?"":`<div style="color:var(--paper-2);margin-top:4px">
        اربط الجهاز بحسابك لتصير الصلاحية باسمك — فتُسحب وحدك متى لزم،
        بلا تغيير على أحد غيرك.</div>`}
    </div>
    ${named?`<button class="btn bsm" style="background:var(--owing-rule);color:var(--owing)"
        onclick="unlinkDeviceAccount()">🔓 فكّ الربط</button>`
    :`<div style="font-size:11px;color:var(--paper-3);margin-bottom:6px">
        بريد حسابك: <strong style="color:var(--paper-2)">${esc(email)}</strong></div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:flex-end">
        <div style="flex:1;min-width:150px">
          <label class="fl">كلمة سر الحساب</label>
          <input class="fi" id="authPw" type="password" placeholder="تُدخل مرة واحدة على هذا الجهاز"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
            data-form-type="other" data-lpignore="true" data-1p-ignore="true">
        </div>
        <button class="btn bgn" onclick="linkDeviceAccount()">🔗 ربط</button>
      </div>
      <div style="font-size:10px;color:var(--paper-4);margin-top:5px;line-height:1.6">
        كلمة السر لا تُحفظ في التطبيق ولا في الجهاز — فايربيس يحفظ الجلسة وحدها.</div>`}
    <div id="authRes"></div>`;
}


