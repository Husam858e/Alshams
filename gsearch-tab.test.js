/* الجمع الشامل تبويبٌ مستقل (v17.83): البحث في كل الأقسام والدفع
   الشامل خرجا من «الأدوات» إلى تبويبٍ خاص. يتحقق هذا الفحص أنهما
   انتقلا كاملين، وأن البحث والدفع يعملان من مكانهما الجديد،
   وأن «الأدوات» تُفتح سليمةً بدونهما. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(()=>{
    db=null; const o={};
    const tabBtn=[...document.querySelectorAll(".tbb")].find(x=>/sT\('gsearch'/.test(x.getAttribute("onclick")||""));
    const toolsBtn=[...document.querySelectorAll(".tbb")].find(x=>/sT\('tools'/.test(x.getAttribute("onclick")||""));
    o.btn = !!tabBtn && tabBtn.textContent.indexOf("الجمع الشامل")>=0;
    /* بجانب «الأدوات» مباشرةً */
    o.order = !!tabBtn && tabBtn.nextElementSibling===toolsBtn;

    const G=document.getElementById("tc-gsearch"), T=document.getElementById("tc-tools");
    const ids=["toolsSearchInp","toolsSrchFrom","toolsSrchTo","toolsSearchRes","gPayPreview","gPayAmount","gPayNote","gPayResult"];
    o.moved = !!G && ids.every(id=>{const e=document.getElementById(id);return e&&G.contains(e);});
    o.notInTools = ids.every(id=>!T.contains(document.getElementById(id)));
    o.unique = ids.every(id=>document.querySelectorAll("#"+id).length===1);
    /* داخل #AS كبقية التبويبات — لا بعد شاشة سوداء */
    o.inAS = G.parentElement===T.parentElement;

    /* بيانات: فلاحٌ له وصلا شراء غير مدفوعين */
    S.recs=[
      {id:'A',seq:1,no:1,dk:'2026-09-01',status:'weighed',driver:'كرواي الطويل',plate:'',mat:'jet',
       net:1000,ppkg:300,final:300000,payments:[],createdAt:'2026-09-01 08:00',createdBy:'حسام'},
      {id:'B',seq:2,no:2,dk:'2026-09-05',status:'weighed',driver:'كرواي الطويل',plate:'',mat:'jet',
       net:1000,ppkg:300,final:300000,payments:[],createdAt:'2026-09-05 08:00',createdBy:'حسام'},
    ];
    SELL_RECS=[];MNL_RECS=[];

    tabBtn.click();
    o.active = G.classList.contains("active") && !T.classList.contains("active") && tabBtn.classList.contains("active");
    const inp=document.getElementById("toolsSearchInp");
    toolsSrchSetRange('all');
    inp.value="كرواي"; toolsGlobalSearch();
    const res=document.getElementById("toolsSearchRes").textContent;
    o.search = res.indexOf("كرواي")>=0 && res.indexOf("٦٠٠,٠٠٠")>=0;
    o.preview = document.getElementById("gPayPreview").textContent.indexOf("٦٠٠,٠٠٠")>=0;

    /* الدفع الشامل من التبويب الجديد: يسدّد الأقدم أولاً */
    document.getElementById("gPayAmount").value="300,000";
    window.confirm=()=>true;
    let payErr=null;
    try{ const pr=execGlobalPay(); if(pr&&pr.then)pr.catch(e=>payErr=e); }catch(e){payErr=e;}
    const byId=id=>S.recs.find(x=>x.id===id)||{};
    o.paidOldest = !payErr && (byId('A').payments||[]).length===1 && (byId('B').payments||[]).length===0;

    /* «الأدوات» تُفتح بلا البحث وبلا أخطاء */
    toolsBtn.click();
    o.toolsOk = T.classList.contains("active") && !G.classList.contains("active")
             && !!document.getElementById("paperBox") && T.contains(document.getElementById("paperBox"));
    /* والعودة للجمع الشامل تُبقي البحث كما كان */
    tabBtn.click();
    o.keeps = document.getElementById("toolsSearchInp").value==="كرواي"
           && document.getElementById("toolsSearchRes").textContent.indexOf("كرواي")>=0;
    o.payErr = payErr?String(payErr.message||payErr):null;
    return o;
  });
  await p.waitForTimeout(400);

  const T=[
    ['زرّ تبويب «الجمع الشامل»',            r.btn],
    ['بجانب «الأدوات»',                     r.order],
    ['البحث والدفع الشامل انتقلا كاملين',   r.moved],
    ['ولم يبقَ منهما شيء في الأدوات',        r.notInTools],
    ['بلا عناصر مكرّرة',                    r.unique],
    ['داخل حاوية التبويبات',                 r.inAS],
    ['التبويب يُفتح وحده',                   r.active],
    ['البحث يعمل من التبويب الجديد',         r.search],
    ['معاينة الدفع الشامل تتبع البحث',       r.preview],
    ['الدفع الشامل يسدّد الأقدم أولاً',       r.paidOldest],
    ['«الأدوات» تُفتح سليمة بدونه',          r.toolsOk],
    ['العودة تُبقي البحث',                   r.keeps],
    ['بلا أخطاء جافاسكربت',                  errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ الجمع الشامل في تبويبه ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
