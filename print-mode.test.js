/* نمطا الطباعة (v17.91): كل طباعةٍ أو مشاركة تسأل — 🧾 وصل حراري
   (كما كان) أم 📄 ورقة A4 ملوّنة. يتحقق هذا الفحص من النافذة، ومن
   المستند الذي يُطبع في كل نمط، ومن ملف الـPDF المُشارَك (مقاس صفحاته). */
const { chromium } = require('playwright-core');
const { PDFDocument } = require('pdf-lib');
const { chromePath } = require('./test-chrome');
const MM = 2.8346;
(async () => {
  const b = await chromium.launch({ executablePath:chromePath(), args:['--no-sandbox','--ignore-certificate-errors'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(async()=>{
    db=null; const o={};
    window.showToast=()=>{};
    S.recs=Array.from({length:40},(_,i)=>({id:'B'+i,seq:i+1,no:100+i,dk:toDay(),driver:'ابو شاهر',plate:'تريلة',
      mat:'jet',wh:'ابراهيم',status:'weighed',gross:30000,empty:8000,net:22000,ppkg:350,final:7700000,payments:[],
      nOn:true,transporter:'محمد الحياني',nC:1,nUP:300000,naqlFee:300000,naqlPayments:[]}));
    SELL_RECS=[];DAM_RECS=[];MNL_RECS=[];
    /* المستند الذي يذهب للطابعة يُلتقط بدل أن يُطبع */
    const printed=[]; window._printViaIframe=(html,f)=>printed.push(html);
    const shared=[]; window.shareBlobSmart=async(blob,name)=>{shared.push({blob,name});};
    const modal=()=>document.getElementById("mPaper").classList.contains("active");
    const btn=t=>[...document.querySelectorAll("#PS .pact button")].find(x=>x.textContent.indexOf(t)>=0);

    /* ① شاشة الطباعة: «🖨️ طباعة» تفتح النافذة ولا تطبع قبل الاختيار */
    openPrint('B0');
    btn("طباعة").click();
    o.asks = modal() && printed.length===0;
    o.twoChoices = !!document.getElementById("ppk_roll") && !!document.getElementById("ppk_a4");
    /* إلغاء: لا شيء يُطبع */
    document.querySelector("#mPaper .mbtns button").click();
    o.cancel = !modal() && printed.length===0 && _paperPending===null;

    /* ② «وصل»: المستند الحراري كما كان */
    btn("طباعة").click(); _pickPaper('roll');
    const roll=printed.pop()||"";
    o.rollDoc = !/size:A4/.test(roll) && /width:5[0-9]mm|width:6[0-9]mm/.test(roll) && /color:#000 !important/.test(roll);
    o.closed = !modal();

    /* ③ «A4» لوصلٍ مفرد: صفحة A4، ألوان، والوصل وسطها بعرض ١٣٠ */
    btn("طباعة").click(); _pickPaper('a4');
    const a4r=printed.pop()||"";
    o.a4Doc = /@page\{size:A4;margin:12mm;\}/.test(a4r) && /max-width:130mm/.test(a4r) && !/color:#000 !important/.test(a4r);
    o.a4Colors = /\.prh\{background:#1A1714/.test(a4r) && /print-color-adjust:exact/.test(a4r);
    o.a4NoStack = !/class="stk"/.test(a4r);
    /* آخر اختيار مُعلَّم في المرة القادمة */
    btn("طباعة").click();
    o.remembers = document.getElementById("ppk_a4").classList.contains("last") && !document.getElementById("ppk_roll").classList.contains("last");
    _pickPaper('a4'); printed.pop();
    closePrint();

    /* ④ كشفٌ (جدول): عرض الصفحة ١٨٦ ملم، وفي «وصل» بطاقات كما كان */
    const rep=_buildCustPrintHTML('naql','محمد الحياني','daily',toDay(),_getCustRecs('naql','محمد الحياني'));
    _printMode="a4";  const a4rep=_printDoc(rep,'t');
    _printMode="roll"; const rollrep=_printDoc(rep,'t');
    o.a4Report = /max-width:186mm/.test(a4rep) && /<table class="coltbl/.test(a4rep);
    o.rollReport = /class="stk"/.test(rollrep) && !/size:A4/.test(rollrep);

    /* ⑤ «📤» في المحصلة كانت تُنزّل ملف HTML — الآن تسأل ثم تشارك PDF */
    doShareColl('daily','all');
    o.collAsks = modal();
    _pickPaper('a4');
    for(let i=0;i<80&&!shared.length;i++) await new Promise(res=>setTimeout(res,250));
    const sh=shared.pop();
    o.collShared = !!sh && /\.pdf$/.test(sh.name) && /A4/.test(sh.name);
    await new Promise(res=>setTimeout(res,50));
    o.resetAfter = _printMode==="roll";
    if(sh){ const u=new Uint8Array(await sh.blob.arrayBuffer()); let s=''; for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]); o.pdf=btoa(s); }

    /* ⑥ صفحة القياس للطابعة الحرارية وحدها: لا تسأل */
    openPaperRuler();
    btn("طباعة").click();
    o.rulerNoAsk = !modal() && printed.length===1 && !/size:A4/.test(printed[0]);
    closePrint();
    return o;
  });

  /* مقاس صفحات الـPDF المُشارَك */
  let pdfOk=false, pages=0;
  if(r.pdf){
    const d=await PDFDocument.load(Buffer.from(r.pdf,'base64'));
    pages=d.getPageCount();
    pdfOk = d.getPages().every(pg=>{const s=pg.getSize();return Math.abs(s.width/MM-210)<1&&Math.abs(s.height/MM-297)<1;});
  }

  const T=[
    ['الطباعة تسأل قبل أن تطبع',              r.asks],
    ['خياران: وصل وA4',                        r.twoChoices],
    ['الإلغاء لا يطبع شيئاً',                   r.cancel],
    ['«وصل»: المستند الحراري كما كان',          r.rollDoc&&r.closed],
    ['«A4»: صفحة A4 والوصل وسطها',              r.a4Doc],
    ['بالألوان',                                r.a4Colors],
    ['بلا تحويل الجداول إلى بطاقات',            r.a4NoStack],
    ['آخر اختيار مُعلَّم',                       r.remembers],
    ['الكشف بعرض الصفحة في A4',                 r.a4Report],
    ['وبطاقات على البكرة كما كان',               r.rollReport],
    ['مشاركة المحصلة تسأل',                     r.collAsks],
    ['وتُخرج PDF لا ملف HTML',                   r.collShared],
    ['ويعود النمط «وصلاً» بعدها',                r.resetAfter],
    [`صفحاته A4 (${pages})`,                     pdfOk&&pages>=1],
    ['صفحة القياس لا تسأل',                     r.rulerNoAsk],
    ['بلا أخطاء جافاسكربت',                     errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad){ delete r.pdf; console.log('\n'+JSON.stringify(r,null,1)); }
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ نمطا الطباعة يعملان ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
