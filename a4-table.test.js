/* جداول ورقة A4 (v17.92): كشف زبون الشراء أحد عشر عموداً، فكانت الكلمة
   تُكسر في وسطها («جلا/ب»، «الس/احة») فتنفصل حروفها، وعمود الكبسات يُظهر
   شيفرة <span style=…> نصّاً لأن نوع الكبس هُرِّب مع وسومه. يُبنى الكشف
   من مساره الحقيقي (_buildCustPrintHTML ← _printDoc بنمط A4) ويُقاس تخطيطه
   بعرض صفحة A4 المطبوعة. */
const { chromium } = require('playwright-core');
const { chromePath } = require('./test-chrome');
const fs = require('fs');
const DIR = '/tmp/claude-0/-home-user-Alshams/98bcaae7-08e9-5aed-8674-486f23e5b998/scratchpad';
(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  const b = await chromium.launch({ executablePath:chromePath(), args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(()=>{
    db=null;
    const names=['مرتضى سعد+كاع الحماد ابو يوسف','مرتضى سعد+ليث','مرتضى سعد+حريث زياد','مرتضى سعد+صلاح احمد'];
    S.recs=Array.from({length:12},(_,i)=>({id:'B'+i,seq:i+1,no:350+i,dk:'2026-06-13',driver:names[i%4],plate:'جلاب',
      mat:'jet',wh:i%2?'الساحة':'ابراهيم',status:'weighed',gross:30000,empty:28000,net:2005+i,ppkg:365,final:690425,
      kOn:true,kC:96+i,kType:'سيم',payments:[{amount:690425,at:'x'}]}));
    SELL_RECS=[];DAM_RECS=[];MNL_RECS=[];
    const html=_buildCustPrintHTML('buy','مرتضى سعد','custom',toDay(),_getCustRecs('buy','مرتضى سعد'));
    _printMode="a4"; const doc=_printDoc(html,'t'); _printMode="roll";
    const roll=_printDoc(html,'t');
    return {doc, roll};
  });
  const o={};
  /* لا شيفرة ظاهرة نصّاً — في A4 وفي الوصل الحراري */
  const textOf=h=>h.replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ');
  o.noRawA4   = !/span style|&lt;span/.test(textOf(r.doc)) && r.doc.indexOf('&lt;span')<0;
  o.noRawRoll = r.roll.indexOf('&lt;span')<0;
  o.kTypeShown = /سيم/.test(textOf(r.doc));

  /* التخطيط بعرض صفحة A4 المطبوعة */
  fs.writeFileSync(DIR+'/a4tbl.html', r.doc);
  const p2 = await b.newPage({ viewport:{width:Math.round(186*96/25.4),height:1100} });
  await p2.emulateMedia({media:'print'});
  await p2.goto('file://'+DIR+'/a4tbl.html');
  await p2.waitForTimeout(400);
  const lay = await p2.evaluate(()=>{
    const broken=[];
    document.querySelectorAll(".coltbl th,.coltbl td").forEach(el=>{
      const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT); let n;
      while((n=w.nextNode())){
        const re=/\S+/g; let m;
        while((m=re.exec(n.data))){
          const rg=document.createRange(); rg.setStart(n,m.index); rg.setEnd(n,m.index+m[0].length);
          if(new Set([...rg.getClientRects()].map(x=>Math.round(x.top))).size>1)broken.push(m[0]);
        }
      }
    });
    const t=document.querySelector(".coltbl");
    return {broken, cols:t?t.rows[0].cells.length:0, fits: t? t.getBoundingClientRect().width<=document.body.getBoundingClientRect().width+1 : false};
  });
  await b.close();

  const T=[
    ['الكشف أحد عشر عموداً',                  lay.cols===11],
    ['لا كلمة تُكسر في وسطها',                lay.broken.length===0],
    ['والجدول داخل عرض الصفحة',               lay.fits],
    ['لا شيفرة <span> ظاهرة في A4',           o.noRawA4],
    ['ولا في الوصل الحراري',                  o.noRawRoll],
    ['ونوع الكبس يظهر',                       o.kTypeShown],
    ['بلا أخطاء جافاسكربت',                   errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify({o,lay},null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ جداول A4 سليمة ('+T.length+')'));
  process.exit(bad?1:0);
})();
