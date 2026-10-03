/* الدفع الجامع لأجور النقل تبويبٌ مستقل (v17.84): خرج من «حساب
   النقال» إلى «💵 دفع جامع» في قسم النقل، كبقية الأقسام. يتحقق هذا
   الفحص أنه انتقل كاملاً، وأن المعاينة والتوزيع يعملان من مكانه
   الجديد، وأن «حساب النقال» يُفتح سليماً ببحثه وجدوله بدونه. */
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
    const btnOf=id=>[...document.querySelectorAll(".tbb")].find(x=>(x.getAttribute("onclick")||"").includes("sT('"+id+"'"));
    const tabBtn=btnOf('naql-bulkpay'), collBtn=btnOf('naql-coll'), custBtn=btnOf('naql-cust');
    o.btn = !!tabBtn && tabBtn.textContent.indexOf("دفع جامع")>=0;
    /* في مجموعة النقل، بعد «🔍 ناقل» كبقية الأقسام */
    o.order = !!tabBtn && custBtn.nextElementSibling===tabBtn;

    const N=document.getElementById("tc-naql-bulkpay"), C=document.getElementById("tc-naql-coll");
    const ids=["naqlBulkPayName","naqlBulkPayAmount","naqlBulkPayNote","naqlBulkPayPreview","naqlBulkPayResult"];
    o.moved = !!N && ids.every(id=>{const e=document.getElementById(id);return e&&N.contains(e);});
    o.notInColl = ids.every(id=>!C.contains(document.getElementById(id)));
    o.unique = ids.every(id=>document.querySelectorAll("#"+id).length===1);
    o.inAS = N.parentElement===C.parentElement;
    /* «حساب النقال» احتفظ ببحثه وفلتره وجدوله */
    o.collKeeps = ["naqlSrch","naqlSrchResult","naqlFrom","naqlTo","naqlCollResult"].every(id=>C.contains(document.getElementById(id)));

    tabBtn.click();
    o.active = N.classList.contains("active") && !C.classList.contains("active") && tabBtn.classList.contains("active");
    o.emptyHint = document.getElementById("naqlBulkPayPreview").textContent.indexOf("اكتب اسم الناقل")>=0;

    /* ناقلٌ له وصلا نقل يدوي غير مدفوعين */
    S.recs=[];SELL_RECS=[];DAM_RECS=[];
    MNL_RECS=[
      {id:'M1',seq:1,dk:'2026-09-01',transporter:'فنر',farmer:'كرواي',kabs:8,pricePerK:25000,naqlFee:200000,naqlPayments:[]},
      {id:'M2',seq:2,dk:'2026-09-05',transporter:'فنر',farmer:'كرواي',kabs:8,pricePerK:25000,naqlFee:200000,naqlPayments:[]},
    ];
    document.getElementById("naqlBulkPayName").value="فنر"; naqlBulkPaySearch();
    const pv=document.getElementById("naqlBulkPayPreview").textContent;
    o.preview = pv.indexOf("٤٠٠,٠٠٠")>=0;

    document.getElementById("naqlBulkPayAmount").value="250,000";
    window.confirm=()=>true;
    let err=null; try{ execNaqlBulkPay(); }catch(e){ err=e; }
    const paid=id=>((MNL_RECS.find(x=>x.id===id)||{}).naqlPayments||[]).reduce((a,x)=>a+(+x.amount||0),0);
    o.oldestFirst = !err && paid('M1')===200000 && paid('M2')===50000;
    o.result = document.getElementById("naqlBulkPayResult").textContent.indexOf("٢٥٠,٠٠٠")>=0;
    o.err = err?String(err.message||err):null;

    /* «حساب النقال» يُفتح سليماً وبحثه يعمل */
    collBtn.click();
    o.collOk = C.classList.contains("active") && !N.classList.contains("active");
    document.getElementById("naqlSrch").value="فنر"; doNaqlSearch();
    o.collSearch = document.getElementById("naqlSrchResult").textContent.indexOf("فنر")>=0;
    /* العودة تُبقي الاسم ونتيجة الدفع */
    tabBtn.click();
    o.keeps = document.getElementById("naqlBulkPayName").value==="فنر";
    return o;
  });
  await p.waitForTimeout(400);

  const T=[
    ['زرّ تبويب «💵 دفع جامع» للنقل',        r.btn],
    ['بعد «🔍 ناقل» كبقية الأقسام',          r.order],
    ['الدفع الجامع انتقل كاملاً',             r.moved],
    ['ولم يبقَ منه شيء في حساب النقال',      r.notInColl],
    ['بلا عناصر مكرّرة',                     r.unique],
    ['داخل حاوية التبويبات',                  r.inAS],
    ['حساب النقال احتفظ ببحثه وجدوله',       r.collKeeps],
    ['التبويب يُفتح وحده',                    r.active],
    ['تلميح قبل كتابة الاسم',                 r.emptyHint],
    ['المعاينة تعرض متبقي الناقل',            r.preview],
    ['التوزيع من الأقدم إلى الأحدث',          r.oldestFirst],
    ['نتيجة الدفع تظهر',                      r.result],
    ['حساب النقال يُفتح سليماً',              r.collOk],
    ['وبحثه يعمل',                            r.collSearch],
    ['العودة تُبقي الاسم',                    r.keeps],
    ['بلا أخطاء جافاسكربت',                   errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ الدفع الجامع للنقل في تبويبه ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
