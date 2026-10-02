/* العقد بين الصفحة وتطبيق أندرويد (mobile/android/Bridge.java).
   الجسر الوهمي هنا يطابق توقيعات Java حرفياً: الأسماء وترتيب
   الوسائط. فإن غيّر أحد الطرفين اسماً أو ترتيباً فشل هذا الفحص
   قبل أن يُكتشف على الهاتف. */
const { chromium } = require('playwright-core');
const fs = require('fs');

/* التوقيعات تُقرأ من مصدر Java نفسه — لا تُكتب هنا يدوياً فتنحرف */
const JAVA = fs.readFileSync('/home/user/Alshams/mobile/android/src/com/nasaem/alkhair/Bridge.java','utf8');
const SIGS = {};
for (const m of JAVA.matchAll(/@JavascriptInterface\s+public\s+\w+\s+(\w+)\(([^)]*)\)/g))
  SIGS[m[1]] = m[2].split(',').map(x=>x.trim()).filter(Boolean).map(x=>x.split(/\s+/).pop());

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(700);

  const r = await p.evaluate(async (SIGS)=>{
    const o={sigs:SIGS}; db=null;
    const nap=ms=>new Promise(r=>setTimeout(r,ms||60));
    const calls=[];
    /* جسرٌ بتوقيعات Java: يُسجّل الوسائط بأسمائها كما في المصدر */
    const mk=(throwOn)=>{
      const br={};
      Object.keys(SIGS).forEach(name=>{
        br[name]=function(){
          const args={}; SIGS[name].forEach((a,i)=>args[a]=arguments[i]);
          calls.push({name,args,n:arguments.length});
          if(throwOn&&throwOn.indexOf(name)>=0)
            throw new Error("Java exception was raised during method invocation");
          return name==="appVersion"?"17.76":undefined;
        };
      });
      return br;
    };
    const dl=[];
    const realCreate=document.createElement.bind(document);
    document.createElement=(t)=>{const el=realCreate(t);
      if(t==="a")el.click=()=>dl.push(el.download);return el;};
    const fresh=(throwOn)=>{calls.length=0;dl.length=0;
      delete navigator.share;delete navigator.canShare;
      window.JSBridge=mk(throwOn);};

    /* بايتات ثنائية كاملة المدى، أكبر من شريحة _b64 (٣٢ كيلو) */
    const bytes=new Uint8Array(70000); for(let i=0;i<bytes.length;i++)bytes[i]=(i*31+7)&255;
    const decode=b64=>{const s=atob(b64);const u=new Uint8Array(s.length);
      for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;};
    const same=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);

    /* ① المشاركة: shareFile(name, b64, mime) — ولا تنزيل ولا حفظ */
    fresh();
    await shareBlobSmart(new Blob([bytes],{type:"application/pdf"}),"وصل.pdf","application/pdf","وصل");
    const sh=calls.find(c=>c.name==="shareFile");
    o.shareCalled=!!sh;
    o.shareArgs=sh&&sh.args.name==="وصل.pdf"&&sh.args.mime==="application/pdf"&&sh.n===3;
    o.shareBytes=sh&&same(decode(sh.args.b64),bytes);
    o.shareOnly=calls.length===1&&dl.length===0;

    /* ② جسرٌ يرمي (خطأ Java) ⇒ يُحفظ ويُنتقل للطريق التالي، لا يُدّعى النجاح */
    fresh(["shareFile"]);
    await shareBlobSmart(new Blob([bytes]),"وصل.pdf","application/pdf","وصل");
    o.throwFallsThrough=calls.some(c=>c.name==="saveBase64");

    /* ③ الحفظ: saveBase64(name, b64, mime) لا رابط تنزيل */
    fresh();
    await saveBlobSmart(new Blob([bytes]),"وصل.pdf","application/pdf");
    const sv=calls.find(c=>c.name==="saveBase64");
    o.saveArgs=sv&&sv.args.name==="وصل.pdf"&&sv.args.mime==="application/pdf"&&same(decode(sv.args.b64),bytes);
    o.saveNoAnchor=dl.length===0;

    /* ④ Excel يُحفظ عبر الجسر بنوعه الصحيح */
    fresh();
    _xlSave(bytes.buffer,"تقرير.xlsx");
    const xs=calls.find(c=>c.name==="saveBase64");
    o.xlBridge=xs&&xs.args.mime.indexOf("spreadsheetml")>0&&dl.length===0;

    /* ⑤ الطباعة: printHtml(html, jobName) بالوصل بعد تعديلاته — لا window.print */
    fresh();
    let iframePrinted=false;
    const html=`<!DOCTYPE html><html><body><div class="pc">وصل الاختبار ٤٤</div>
      <div class="grand">مجموع ١</div><div class="grand">مجموع ٢</div></body></html>`;
    _printViaIframe(html,"وصل ٤٤");
    /* نعترض print في الإطار فور إنشائه */
    const fr=document.getElementById("__pdfFrame__");
    if(fr)fr.contentWindow.print=()=>{iframePrinted=true;};
    await nap(1900);              // الطباعة تنتظر ١٫٥ ثانية لاكتمال التخطيط
    const pr=calls.find(c=>c.name==="printHtml");
    o.printBridge=!!pr&&pr.args.jobName==="وصل ٤٤";
    o.printDoctype=!!pr&&pr.args.html.indexOf("<!DOCTYPE html>")===0;
    o.printContent=!!pr&&pr.args.html.indexOf("وصل الاختبار ٤٤")>0;
    /* تعديلات ما قبل الطباعة طُبّقت: المجموع الأول مُخفى */
    o.printFixups=!!pr&&/class="grand"[^>]*style="display: none;?"/.test(pr.args.html);
    o.noIframePrint=!iframePrinted;

    /* ⑥ بلا جسر: الطباعة كما كانت في المتصفح */
    calls.length=0; delete window.JSBridge;
    document.querySelectorAll("#__pdfFrame__").forEach(f=>f.remove());
    let printed=false;
    _printViaIframe(html,"وصل ٤٥");
    const fr2=document.getElementById("__pdfFrame__");
    if(fr2)fr2.contentWindow.print=()=>{printed=true;};
    await nap(1900);
    o.browserPrint=printed&&calls.length===0;

    /* ⑦ التشخيص يرى جسر التطبيق ودواله */
    window.JSBridge=mk();
    const c=shareCaps();
    o.capsSeesApk=c.bridge&&c.bridgeName==="JSBridge"&&c.bridgeFile.indexOf("shareFile")>=0;

    document.createElement=realCreate; delete window.JSBridge;
    return o;
  }, SIGS);

  const T=[
    ['توقيعات Java مقروءة من المصدر', ['shareFile','shareText','saveBase64','saveFile','printHtml']
        .every(k=>r.sigs[k]) && r.sigs.shareFile.join()==='name,b64,mime'],
    ['المشاركة تستدعي shareFile',             r.shareCalled],
    ['بالاسم والنوع وثلاث وسائط',              r.shareArgs],
    ['والبايتات سليمة بعد base64 (٧٠ كيلو)',   r.shareBytes],
    ['ولا تنزيل ولا حفظ معها',                 r.shareOnly],
    ['خطأ Java يُنقل للطريق التالي',            r.throwFallsThrough],
    ['الحفظ عبر saveBase64 بالبايتات',         r.saveArgs],
    ['ولا رابط تنزيل',                          r.saveNoAnchor],
    ['Excel يُحفظ عبر الجسر بنوعه',             r.xlBridge],
    ['الطباعة عبر printHtml باسم المهمة',      r.printBridge],
    ['بمستند كامل',                             r.printDoctype&&r.printContent],
    ['بعد تعديلات ما قبل الطباعة',              r.printFixups],
    ['ولا window.print داخل التطبيق',           r.noIframePrint],
    ['بلا جسر تبقى طباعة المتصفح',              r.browserPrint],
    ['فحص المشاركة يرى جسر التطبيق',            r.capsSeesApk],
    ['بلا أخطاء جافاسكربت',                     errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ عقد الصفحة مع تطبيق أندرويد سليم ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
