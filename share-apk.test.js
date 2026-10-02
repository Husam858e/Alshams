/* المشاركة من داخل تطبيق APK.
   العطل الواقع: في التطبيق المُحوَّل كان زرّ «مشاركة» يُنزّل الوصل
   بدل فتح قائمة المشاركة — لأن مسار الـPDF لم يكن يسأل جسر التطبيق
   إطلاقاً، بينما مسارا Excel والنصّ يسألانه.

   يحاكي ثلاث بيئات: متصفح حديث · WebView بجسر · WebView بلا شيء. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(700);

  const r = await p.evaluate(async ()=>{
    const o={}; const nap=()=>new Promise(r=>setTimeout(r,80));
    db=null;

    /* بيئة مُركَّبة: نراقب ما استُعمل فعلاً */
    const log=[];
    const reset=()=>{
      log.length=0;
      delete window.JSBridge; delete window.Android;
      delete navigator.share; delete navigator.canShare;
      document.querySelectorAll("iframe[src^='intent:']").forEach(f=>f.remove());
    };
    /* نعترض التنزيل بدل تنفيذه */
    const realCreate=document.createElement.bind(document);
    document.createElement=(t)=>{
      const el=realCreate(t);
      if(t==="a"){ el.click=()=>log.push("download:"+el.download); }
      return el;
    };
    const blob=()=>new Blob(["pdf-bytes"],{type:"application/pdf"});

    /* ══ ① متصفح حديث: Web Share بملف ══ */
    reset();
    navigator.canShare=()=>true;
    navigator.share=async(d)=>{log.push(d.files?"share:files:"+d.files[0].name:"share:text");};
    await shareBlobSmart(blob(),"وصل.pdf","application/pdf","وصل");
    o.browserFiles = log.join("|")==="share:files:وصل.pdf";

    /* ══ ② WebView بجسر يشارك ملفات ══ */
    reset();
    window.JSBridge={ shareFile:(a1,a2,a3)=>log.push("bridge:shareFile:"+a1+":"+(a3||"")),
                      shareText:(t)=>log.push("bridge:shareText") };
    await shareBlobSmart(blob(),"وصل.pdf","application/pdf","وصل");
    o.bridgeUsed = log.join("|")==="bridge:shareFile:وصل.pdf:application/pdf";
    o.bridgeNoDownload = log.indexOf("download:وصل.pdf")<0;

    /* ══ ③ جسر باسمٍ آخر (sharePDF) ══ */
    reset();
    window.Android={ sharePDF:(a1,a2,a3)=>log.push("bridge:sharePDF:"+a1) };
    await shareBlobSmart(blob(),"وصل.pdf","application/pdf","وصل");
    o.altName = log.join("|")==="bridge:sharePDF:وصل.pdf";

    /* ══ ④ WebView بلا جسر ولا Web Share: يُحفظ ثم تُفتح القائمة بنصّ ══ */
    reset();
    await shareBlobSmart(blob(),"وصل.pdf","application/pdf","وصل");
    await nap();
    o.savedThenIntent = log.indexOf("download:وصل.pdf")>=0;
    const fr=[...document.querySelectorAll("iframe")].filter(f=>String(f.src).indexOf("intent:")===0);
    o.intentFired = fr.length>0;
    o.intentIsSend = fr.length>0 && String(fr[0].src).indexOf("action=android.intent.action.SEND")>0;
    o.intentHasText = fr.length>0 && String(fr[0].src).indexOf("extra.TEXT=")>0;
    /* ⚠️ الإطار المخفيّ لا يُغيّر عنوان الصفحة */
    o.pageNotNavigated = location.href.indexOf("wheelmanagement")>=0;
    document.querySelectorAll("iframe[src^='intent:']").forEach(f=>f.remove());

    /* ══ ⑤ WebView بـ navigator.share نصّي فقط ══ */
    reset();
    navigator.canShare=()=>false;
    navigator.share=async(d)=>{log.push(d.files?"share:files":"share:text");};
    await shareBlobSmart(blob(),"وصل.pdf","application/pdf","وصل");
    o.textShare = log.indexOf("share:text")>=0 && log.indexOf("download:وصل.pdf")>=0;

    /* ══ ⑥ إلغاء المستخدم ليس فشلاً — لا يُنزَّل بعده ══ */
    reset();
    navigator.canShare=()=>true;
    navigator.share=async()=>{const e=new Error("x");e.name="AbortError";throw e;};
    const ok=await shareBlobSmart(blob(),"وصل.pdf","application/pdf","وصل");
    o.abortIsNotFailure = ok===true && log.indexOf("download:وصل.pdf")<0;

    /* ══ ⑥ب نصّ الوصل لا يُلصق بملفٍ غير وصل ══ */
    reset();
    document.getElementById("PS").classList.remove("active");
    document.getElementById("PC").innerHTML="<div>وصل قديم من شاشة سابقة</div>";
    let sent="";
    navigator.share=async(d)=>{sent=d.text||"";};
    await shareBlobSmart(new Blob(["x"]),"تقرير.xlsx","application/x","تقرير Excel");
    o.noStalePrint = sent.indexOf("وصل قديم")<0 && sent.indexOf("تقرير Excel")>=0;
    /* وبشاشة الطباعة مفتوحة يُلحَق النصّ */
    reset();
    document.getElementById("PS").classList.add("active");
    navigator.share=async(d)=>{sent=d.text||"";};
    await shareBlobSmart(new Blob(["x"]),"وصل.pdf","application/pdf","وصل");
    o.printTextAttached = sent.indexOf("وصل قديم")>=0;
    document.getElementById("PS").classList.remove("active");

    /* ══ ⑦ التشخيص يقرأ البيئة بصدق ══ */
    reset();
    window.JSBridge={ shareFile:()=>{}, printPage:()=>{} };
    const c1=shareCaps();
    o.capsBridge = c1.bridge && c1.bridgeName==="JSBridge"
                 && c1.bridgeFile.indexOf("shareFile")>=0 && !c1.webShare;
    reset();
    const c2=shareCaps();
    o.capsEmpty = !c2.bridge && !c2.webShare && !c2.webShareFiles;

    /* ⑧ اللوحة تُرسم وتقول الطريق المستعمل */
    document.querySelectorAll(".tc").forEach(x=>x.classList.remove("active"));
    document.getElementById("tc-tools").classList.add("active");
    renderShareBox();
    const t=document.getElementById("shareBox").textContent;
    o.boxDrawn = t.indexOf("المسار المستعمل عندك")>=0 && t.length>120;
    o.boxWarns = t.indexOf("مشاركة ملفات")>=0;

    document.createElement=realCreate;
    return o;
  });

  const T=[
    ['المتصفح يُرسل الـPDF نفسه',            r.browserFiles],
    ['جسر التطبيق يُستعمل أولاً',             r.bridgeUsed],
    ['ولا يُنزَّل الملف معه',                  r.bridgeNoDownload],
    ['ويُقبل اسم دالة آخر (sharePDF)',        r.altName],
    ['بلا جسر: يُحفظ الملف',                  r.savedThenIntent],
    ['ثم تُفتح قائمة أندرويد',                r.intentFired&&r.intentIsSend],
    ['ومعها نصّ الوصل',                       r.intentHasText],
    ['ولا تنتقل الصفحة (إطار مخفيّ)',          r.pageNotNavigated],
    ['Web Share النصّي يُستعمل حين لا ملف',    r.textShare],
    ['إلغاء المستخدم ليس فشلاً',               r.abortIsNotFailure],
    ['نصّ وصلٍ قديم لا يُلصق بملف Excel',       r.noStalePrint],
    ['ويُلحَق حين تكون شاشة الطباعة مفتوحة',     r.printTextAttached],
    ['التشخيص يقرأ الجسر ودواله',             r.capsBridge],
    ['ويقول «لا شيء» حين لا شيء',             r.capsEmpty],
    ['لوحة الفحص تُرسم وتقول الطريق',          r.boxDrawn&&r.boxWarns],
    ['بلا أخطاء جافاسكربت',                   errs.length===0],
  ];

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ المشاركة تفتح القائمة لا تُنزّل ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
