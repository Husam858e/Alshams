/* يتحقق من حساب المتوسط المرجّح مقابل أرقام محسوبة يدوياً */
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
    // ١٠٬٠٠٠ كغم @ ٢٥٠  ثم  ١٠٬٠٠٠ @ ٣٠٠  →  المتوسط ٢٧٥
    S.recs=[
      {id:'P1',seq:1,dk:'2026-09-01',mat:'jet',wh:'بركات',status:'weighed',
       gross:18000,empty:8000,net:10000,ppkg:250,final:2500000,payments:[]},
      {id:'P2',seq:2,dk:'2026-09-02',mat:'jet',wh:'بركات',status:'weighed',
       gross:18000,empty:8000,net:10000,ppkg:300,final:3000000,payments:[]},
    ];
    // بيع ٥٬٠٠٠ بإيراد ١٫٦ مليون → تكلفة المبيع ٥٠٠٠×٢٧٥ = ١٬٣٧٥٬٠٠٠
    SELL_RECS=[{id:'S1',seq:3,dk:'2026-09-03',mat:'jet',status:'weighed',
       gross:13000,empty:8000,net:5000,ppkg:320,final:1600000,payments:[],driver:'زبون'}];
    // مخرج ٢٬٠٠٠ → تكلفة ٢٠٠٠×٢٧٥ = ٥٥٠٬٠٠٠
    OUT_RECS=[{id:'O1',seq:4,dk:'2026-09-04',mat:'jet',wh:'بركات',
       empty:8000,gross:10000,net:2000,farmer:'فلاح'}];

    const R=computeStock();
    const sell=R.priced.find(x=>x.kind==='sell');
    const out =R.priced.find(x=>x.kind==='out');
    const m=R.mats[0];
    return {qty:m.qty, avg:m.avg, value:m.value,
            cogs:sell.cogs, profit:sell.profit, outCost:out.cogs,
            warn:R.warn.length, total:R.totalValue};
  });

  const exp = {qty:13000, avg:275, value:3575000, cogs:1375000, profit:225000, outCost:550000, warn:0, total:3575000};
  const checks = Object.keys(exp).map(k => [k, Math.abs(r[k]-exp[k])<0.01, r[k], exp[k]]);
  checks.forEach(([k,ok,got,want]) =>
    console.log(` ${ok?'PASS':'FAIL'} ${k} = ${got.toLocaleString('en')}${ok?'':'  (توقّع '+want.toLocaleString('en')+')'}`));

  // رصيد سالب يجب أن يُعلَن لا يُخفى
  const neg = await p.evaluate(()=>{
    S.recs=[{id:'P1',seq:1,dk:'2026-09-01',mat:'jet',wh:'بركات',status:'weighed',
      gross:13000,empty:8000,net:5000,ppkg:250,final:1250000,payments:[]}];
    SELL_RECS=[{id:'S1',seq:2,dk:'2026-09-02',mat:'jet',status:'weighed',
      gross:16000,empty:8000,net:8000,ppkg:300,final:2400000,payments:[],driver:'ز'}];
    OUT_RECS=[];
    const R=computeStock();
    return {warn:R.warn.length, short:R.warn[0]?Math.round(R.warn[0].short):0, qty:R.mats.length?R.mats[0].qty:0};
  });
  const negOk = neg.warn===1 && neg.short===3000;
  console.log(` ${negOk?'PASS':'FAIL'} رصيد سالب يُعلَن — تحذيرات: ${neg.warn} · نقص: ${neg.short} كغم`);

  const failed = checks.filter(c=>!c[1]).length + (negOk?0:1);
  console.log(failed ? `\n‼ فشل ${failed}` : `\n✅ حساب التقييم مطابق (${checks.length+1})`);
  console.log('pageerrors:', errs.length?errs.join(' | '):'none');
  await b.close(); process.exit(failed?1:0);
})();
