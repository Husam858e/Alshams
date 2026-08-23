/* ══════════════════════════════════════════════════════════════
   النسخ الاحتياطي التلقائي — v17.50
   ──────────────────────────────────────────────────────────────
   كانت النسخة الاحتياطية تعتمد على أن يتذكّر أحدهم الضغط على
   زرّ. ومن لا يتذكّر لا يكتشف ذلك إلا يوم يحتاجها.
   الآن طبقتان:
   ① لقطة تلقائية على الجهاز مرة كل يوم (تُحفظ آخر ٧).
     لا تحتاج ضغطة ولا إنترنت، وتُغطّي أشيع حالة فعلاً:
     خطأ بشري أو استعادة خاطئة قبل قليل.
   ② تذكير ظاهر إن مضى أسبوع بلا نسخة ملف حقيقية.
     اللقطة على الجهاز لا تُغني عن الملف: لو ضاع الهاتف
     ضاعت معه. لذلك نُلحّ على الملف ولا نكتفي باللقطة.
══════════════════════════════════════════════════════════════ */
const _SNAP_K="wShamsSnapshots";
const _SNAP_MAX=7;
const _BK_REMIND_DAYS=7;

function _snapshots(){
  try{return JSON.parse(localStorage.getItem(_SNAP_K)||"[]")||[];}catch(e){return[];}
}
function _snapshotPayload(){
  const data={},counts={};
  (_DATASETS||[]).filter(d=>!d.virtual).forEach(d=>{
    const arr=d.get()||[]; data[d.k]=arr; counts[d.k]=arr.length;
  });
  return {at:nowStr(),dk:toDay(),by:(S.cu&&S.cu.name)||"—",
          total:Object.values(counts).reduce((a,b)=>a+b,0),counts,data};
}
/* لقطة يومية — تُؤخذ مرة واحدة في اليوم وبعد أن تصل البيانات */
function autoSnapshot(force){
  try{
    const snaps=_snapshots();
    if(!force&&snaps.length&&snaps[0].dk===toDay())return false;   // لهذا اليوم لقطة
    const pay=_snapshotPayload();
    /* الفراغ يُرفض دائماً — حتى مع force. لقطةٌ بلا سجلات لا تنفع
       في استعادة، وقد تدفع لقطةً صالحة خارج قائمة السبع. */
    if(pay.total===0)return false;
    // لا تستبدل لقطة ممتلئة بأخرى شبه فارغة (قد تكون البيانات لم تصل بعد)
    if(!force&&snaps.length&&pay.total < Math.round((snaps[0].total||0)*0.5))return false;
    const next=[pay,...snaps].slice(0,_SNAP_MAX);
    localStorage.setItem(_SNAP_K,JSON.stringify(next));
    return true;
  }catch(e){
    // امتلاء التخزين: احذف أقدم لقطة وحاول مرة
    try{
      const snaps=_snapshots(); snaps.pop();
      localStorage.setItem(_SNAP_K,JSON.stringify(snaps));
    }catch(x){}
    return false;
  }
}
/* كم يوماً مضى على آخر نسخة ملف؟ */
function _daysSinceBackup(){
  let last=null; try{last=localStorage.getItem("wShamsLastBackup");}catch(e){}
  if(!last)return Infinity;
  const d=_D(String(last).slice(0,10));
  if(isNaN(d))return Infinity;
  return Math.floor((_D(toDay())-d)/864e5);
}
/* شريط التذكير أعلى الأدوات */
function renderBackupNudge(){
  const el=document.getElementById("bkNudge");
  if(!el)return;
  const days=_daysSinceBackup();
  const snaps=_snapshots();
  const snapLine=snaps.length
    ? `آخر لقطة تلقائية: <strong>${tAr(snaps[0].dk)}</strong> (${AR(snaps[0].total)} سجل) · محفوظة ${AR(snaps.length)} لقطات`
    : `لا توجد لقطات تلقائية بعد`;
  if(days>=_BK_REMIND_DAYS){
    el.innerHTML=`<div style="background:var(--owing-wash);border:1px solid var(--owing);
        border-radius:10px;padding:10px 12px;margin-bottom:10px">
      <div style="font-size:12px;font-weight:700;color:var(--owing);margin-bottom:4px">
        ⚠️ ${days===Infinity?"لم تأخذ أي نسخة احتياطية بملف":"مضى "+AR(days)+" يوماً بلا نسخة احتياطية بملف"}
      </div>
      <div style="font-size:11px;color:var(--paper-2);line-height:1.7">
        اللقطة التلقائية على هذا الجهاز وحده — لو ضاع الجهاز ضاعت معه.
        خذ نسخة ملف واحفظها خارج الهاتف.<br>
        <span style="color:var(--paper-3);font-size:10px">${snapLine}</span>
      </div>
      <button class="btn bsm bgn" style="margin-top:7px" onclick="toolsBackup()">📦 خذ نسخة الآن</button>
    </div>`;
  } else {
    el.innerHTML=`<div style="background:var(--settled-wash);border:1px solid var(--settled-rule);
        border-radius:10px;padding:8px 11px;margin-bottom:10px;font-size:11px;color:var(--paper-2)">
      ✅ آخر نسخة ملف منذ ${AR(days)} يوم · <span style="color:var(--paper-3)">${snapLine}</span>
    </div>`;
  }
}
/* استعادة من لقطة تلقائية */
function renderSnapshots(){
  const el=document.getElementById("snapBox");
  if(!el)return;
  const snaps=_snapshots();
  if(!snaps.length){
    el.innerHTML=`<div style="font-size:11px;color:var(--paper-4);text-align:center;padding:12px">
      لا لقطات بعد — تُؤخذ أول لقطة تلقائياً عند فتح التطبيق ومعه بيانات</div>`;
    return;
  }
  el.innerHTML=snaps.map((sn,i)=>`
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;
        background:var(--ink-100);border:1px solid var(--rule);border-radius:8px;
        padding:7px 9px;margin-bottom:5px;font-size:11px">
      <div style="flex:1;min-width:0">
        <div style="color:var(--paper)">📅 ${tAr(esc(sn.dk))} — <strong>${AR(sn.total)}</strong> سجل</div>
        <div style="color:var(--paper-3);font-size:10px">${tAr(esc(sn.at||""))} · ${esc(sn.by||"—")}</div>
      </div>
      <button class="btn bsm bgh" onclick="restoreSnapshot(${i})">↩️ استعادة</button>
    </div>`).join("")
    +`<div style="font-size:10px;color:var(--paper-3);padding:5px 2px">
        الاستعادة تفتح شاشة الاستعادة المعتادة فتختار «دمج» أو «استبدال» كما تشاء.</div>`;
}
function restoreSnapshot(i){
  const sn=_snapshots()[i];
  if(!sn){showToast("⚠ اللقطة غير موجودة");return;}
  _restorePayload={app:"ميزان الشمس",version:17,createdAt:sn.at,
                   createdBy:(sn.by||"—")+" (لقطة تلقائية)",counts:sn.counts,data:sn.data};
  const rows=(_DATASETS||[]).filter(d=>!d.virtual).map(d=>{
    const inc=Array.isArray(sn.data[d.k])?sn.data[d.k].length:0;
    const cur=(d.get()||[]).length;
    return `<div style="display:flex;justify-content:space-between;padding:5px 9px;
        border-bottom:1px solid var(--rule);font-size:11px">
      <span style="color:var(--paper-2)">${d.icon} ${esc(d.label)}</span>
      <span><strong style="color:var(--wheat-hi)">${AR(inc)}</strong>
        <span style="color:var(--paper-4)">في اللقطة</span>
        · <span style="color:var(--paper-3)">${AR(cur)} حالياً</span></span>
    </div>`;}).join("");
  const box=document.getElementById("toolsRestoreBox");
  if(box){
    box.innerHTML=`
      <div style="background:var(--ink-100);border:1px solid var(--rule);border-radius:10px;
          overflow:hidden;margin-top:8px">
        <div style="background:var(--ink-200);padding:7px 10px;font-size:11px;color:var(--paper-2)">
          📸 لقطة تلقائية · ${tAr(esc(sn.at||""))}</div>${rows}
      </div>
      <div style="display:flex;gap:7px;margin-top:8px">
        <button class="btn bgn" style="flex:1;justify-content:center" onclick="toolsRestore('merge')">🔀 دمج (آمن)</button>
        <button class="btn" style="flex:1;justify-content:center;background:var(--owing-rule);color:var(--owing)"
          onclick="toolsRestore('replace')">♻️ استبدال كامل</button>
      </div>`;
    box.scrollIntoView({block:"center",behavior:"smooth"});
  }
  showToast("📸 جاهزة — اختر طريقة الاستعادة");
}

/* ══════════════════════════════════════════════════════════════
   الإبلاغ عن سبب فشل الكتابة — v17.57
   ──────────────────────────────────────────────────────────────
   كانت كل حالات الفشل تُعرض برسالة واحدة: «محفوظ محلياً وسيُرسل
   عند عودة الاتصال». وهذا صحيح لانقطاع الشبكة، وخاطئ تماماً
   لرفض الصلاحيات: هناك لا ينفع الانتظار — الطابور يتضخّم بلا
   نهاية والمستخدم يظنّ أن الإنترنت ضعيف.
   قِسناه فعلاً: بعد تطبيق قواعد الأمان بقيت النقطة خضراء
   (لأن ‎.info/connected لا يحتاج صلاحية) والطابور لا يفرغ،
   بلا أي أثر يدلّ على السبب.
   الآن نُميّز الرفض عن الانقطاع، ونقول ما العمل بالضبط.
══════════════════════════════════════════════════════════════ */
let _fbLastErr=null;
function _fbReportWriteError(err,node){
  const code=String((err&&(err.code||err.message))||"").toUpperCase();
  _fbLastErr={code,node,at:nowStr()};
  if(code.indexOf("PERMISSION_DENIED")>=0||code.indexOf("PERMISSION-DENIED")>=0){
    const d=document.getElementById("syncDot");
    if(d){d.style.background="var(--owing)";d.title="مرفوض: صلاحيات فايربيس";}
    /* v17.64 — حين يشترط المشروع حسابات مختارة ولا حساب على هذا
       الجهاز، نعرف السبب بالضبط فنقوله ونحلّه في مكانه.
       ⚠️ الشرط ضيّق عمداً: الهوية المجهولة **هوية صحيحة**، ورفضها
       مشكلة قواعد لا مشكلة ربط — وإرسال صاحبها إلى بوابة الحساب
       يُضلّله عن السبب الحقيقي. */
    if(_anonOff&&!_authIsNamed()){
      showToast("🔐 هذا الجهاز غير مربوط بحساب — الحفظ متوقّف",5000);
      try{_authGateOpen();}catch(e){}
      return;
    }
    showToast("🚫 رفض السيرفر الحفظ (صلاحيات) — افتح الأدوات ← فحص الاتصال والصلاحيات",6000);
    return;
  }
  showToast("⚠ تعذّر الحفظ الآن — محفوظ محلياً وسيُرسل عند عودة الاتصال");
}

/* ══ فحص الاتصال والصلاحيات — يُجيب: أين تحديداً يقف الحفظ؟ ══ */
async function toolsConnCheck(){
  const box=document.getElementById("connCheckRes");
  if(!box)return;
  box.innerHTML=`<div style="font-size:12px;color:var(--paper-3);padding:10px">⏳ جارٍ الفحص…</div>`;
  const rows=[];
  const add=(ok,t,d)=>rows.push({ok,t,d:d||""});

  add(typeof firebase!=="undefined","تحميل مكتبة فايربيس",
      typeof firebase==="undefined"?"لم تُحمَّل — تحقّق من الإنترنت أو حاصرات الإعلانات":"");
  add(!!db,"إنشاء الاتصال بقاعدة البيانات");

  if(typeof firebase!=="undefined"&&firebase.auth){
    let u=null; try{u=firebase.auth().currentUser;}catch(e){}
    /* v17.64 — النصيحة تتبع وضع المشروع: من أطفأ الدخول المجهول
       عمداً لا يُقال له «فعّله»، بل «اربط هذا الجهاز بحساب». */
    add(!!u,"تسجيل الدخول (هوية الجلسة)",
        u?((u.isAnonymous?"مجهول · ":"🔐 "+(u.email||"حساب")+" · ")+String(u.uid).slice(0,10)+"…")
         :(_anonOff
            ? "لا توجد هوية — هذا الجهاز غير مربوط بحساب. الأدوات ← 🔐 ربط الجهاز بحسابك"
            : "لا توجد هوية — فعّل Authentication ← Sign-in method ← Anonymous ← Enable،"
              +" أو اربط الجهاز بحساب من الأدوات"));
  } else add(false,"مكتبة المصادقة","لم تُحمَّل — القواعد التي تشترط auth ستَرفض كل شيء");

  if(db){
    // قراءة
    try{
      await db.ref(".info/serverTimeOffset").once("value");
      await db.ref("records").limitToFirst(1).once("value");
      add(true,"قراءة البيانات");
    }catch(e){
      add(false,"قراءة البيانات",String(e&&e.code||e&&e.message||e).slice(0,90));
    }
    // كتابة تجريبية في عقدة مستقلة ثم حذفها
    try{
      const t="__conncheck__";
      await db.ref(t).child("probe").set({at:nowStr(),by:(S.cu&&S.cu.name)||"—"});
      await db.ref(t).child("probe").remove();
      add(true,"الكتابة والحذف");
    }catch(e){
      const c=String(e&&e.code||e&&e.message||e);
      add(false,"الكتابة والحذف",
        /PERMISSION/i.test(c)
          ? "رفض صلاحيات — القواعد تمنع الكتابة. راجع firebase-rules.json"
          : c.slice(0,90));
    }
  }
  add(_writeQueue.length===0,"طابور المزامنة",
      _writeQueue.length?AR(_writeQueue.length)+" عملية معلّقة لم تصل السيرفر":"فارغ");
  if(_fbLastErr)add(false,"آخر خطأ حفظ",_fbLastErr.code.slice(0,80)+" · "+_fbLastErr.node);

  const bad=rows.filter(r=>!r.ok).length;
  box.innerHTML=`
    <div style="background:${bad?"var(--owing-wash)":"var(--settled-wash)"};
        border:1px solid ${bad?"var(--owing)":"var(--settled)"};border-radius:9px;
        padding:9px 11px;margin-bottom:8px;font-size:12px;font-weight:700;
        color:${bad?"var(--owing)":"var(--settled)"}">
      ${bad?"✗ "+AR(bad)+" مشكلة — التفصيل أدناه":"✓ كل شيء سليم — الحفظ يصل السيرفر"}
    </div>
    ${rows.map(r=>`<div style="display:flex;gap:7px;align-items:flex-start;padding:5px 2px;
        border-bottom:1px solid var(--rule);font-size:11px">
      <span style="color:${r.ok?"var(--settled)":"var(--owing)"};font-weight:800">${r.ok?"✓":"✗"}</span>
      <div style="flex:1;min-width:0"><div style="color:var(--paper)">${esc(r.t)}</div>
        ${r.d?`<div style="color:var(--paper-3);font-size:10px;line-height:1.6">${esc(r.d)}</div>`:""}</div>
    </div>`).join("")}
    ${_writeQueue.length?`<button class="btn bsm bgn" style="margin-top:8px"
       onclick="_flushQueue();showToast('📡 جاري إعادة الإرسال…');setTimeout(toolsConnCheck,1500)">
       📡 إعادة إرسال الطابور</button>`:""}`;
}


