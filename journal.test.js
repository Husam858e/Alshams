/* طبقة القيود: يبني بيانات من كل قسم بأرقام محسوبة يدوياً،
   ثم يتحقق أن كل قيد متّزن، وأن أرصدة الحسابات تساوي ما
   تعرضه شاشات التطبيق الأخرى (المخزون · المحصلات). */
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
    db=null;
    S.recs=[];SELL_RECS=[];OUT_RECS=[];MNL_RECS=[];SRF_RECS=[];WRK_RECS=[];
    DAM_RECS=[];SAL_RECS=[];ADV_RECS=[];EMP_TXNS=[];CASH_MOVES=[];CASH_COUNTS=[];
    CASH_BOXES=[{id:"main",name:"صندوق",kind:"cash",opening:1000000,openingDk:"2026-01-01",main:true,active:true}];

    /* شراء: صافي ١٠٠٠٠ × ٥٠٠ = ٥٠٠٠٠٠٠ أجور وزن
       كبس ٢٠٠٠٠٠ · وصل ٥٠٠٠٠ · نقل ٣٠٠٠٠٠ مخصوم
       ⇒ للفلاح ٤٤٥٠٠٠٠ */
    S.recs=[{id:"B1",seq:1,dk:"2026-03-05",status:"weighed",driver:"فلاح",plate:"1",
      mat:"jet",gross:22000,empty:12000,net:10000,ppkg:500,wFee:5000000,
      kOn:true,kC:100,kUP:2000,kabsFee:200000,
      wOn:true,wPrice:50000,waslFee:50000,
      nOn:true,nDeduct:true,naqlFee:300000,
      naqlList:[{id:"n1",transporter:"ناقل",nC:100,nUP:3000,naqlFee:300000,naqlPayments:[]}],
      final:4450000,payments:[{amount:2000000,at:"2026-03-06 10:00",by:"ح"}]}];

    /* بيع: صافي ٤٠٠٠ × ٩٠٠ = ٣٦٠٠٠٠٠ + وصل ٤٠٠٠٠ + نقل ١٠٠٠٠٠ = ٣٧٤٠٠٠٠
       والكلفة بالمتوسط: ٥٠٠٠٠٠٠/١٠٠٠٠ = ٥٠٠ للكغم ⇒ ٢٠٠٠٠٠٠ */
    SELL_RECS=[{id:"S1",seq:2,dk:"2026-03-10",status:"weighed",driver:"زبون",plate:"2",
      mat:"jet",gross:9000,empty:5000,net:4000,ppkg:900,wFee:3600000,
      wOn:true,wPrice:40000,waslFee:40000,
      nOn:true,nKabs:50,nUP:2000,naqlFee:100000,transporter:"ناقل",
      final:3740000,payments:[{amount:3740000,at:"2026-03-11 09:00",by:"ح"}],naqlPayments:[]}];

    SRF_RECS=[{id:"R1",seq:3,dk:"2026-03-12",recv:"مستفيد",purp:"وقود",amount:150000,payments:[]}];
    WRK_RECS=[{id:"W1",seq:4,dk:"2026-03-13",provider:"فنّي",service:"تصليح",amount:90000,
      payments:[{amount:90000,at:"2026-03-14 08:00",by:"ح"}]}];
    MNL_RECS=[{id:"M1",seq:5,dk:"2026-03-15",transporter:"ناقل٢",kabs:10,pricePerK:5000,
      naqlFee:50000,naqlPayments:[]}];

    /* سلفة ٢٠٠٠٠٠ ثم راتب صافيه ٨٠٠٠٠٠ بعد استقطاعها */
    ADV_RECS=[{id:"A1",seq:6,dk:"2026-03-02",empId:1,empName:"عامل",amount:200000,
      paid:true,paidTotal:200000,
      payments:[{amount:200000,at:"2026-03-31 12:00",by:"ح (استقطاع راتب)"}]}];
    SAL_RECS=[{id:"L1",seq:7,dk:"2026-03-31",empId:1,empName:"عامل",month:"2026-03",
      base:1000000,bonus:0,manualBonus:0,autoBonus:0,deduct:0,manualDeduct:0,autoDeduct:0,
      absentDays:0,absentDeduct:0,autoAbsent:0,pendingAdv:200000,net:1000000,finalNet:800000,
      payments:[{amount:800000,at:"2026-04-01 10:00",by:"ح"}]}];

    const J=_journal();
    const o={};
    o.unbalanced=J.filter(e=>{
      const d=e.lines.reduce((s,l)=>s+l.d,0),c=e.lines.reduce((s,l)=>s+l.c,0);
      return Math.abs(d-c)>0.5;
    }).length;
    o.rounding=J.filter(e=>e.lines.some(l=>l.a==="round")).length;

    const L=_ledger("","");
    o.gap=Math.round(L.gap);
    const bal=k=>{const x=L.rows.find(y=>y.k===k);return x?Math.round(x.close):0;};
    o.inv    = bal("inv");
    o.apFarm = bal("apFarm");
    o.ar     = bal("ar");
    o.apTrans= bal("apTrans");
    o.cogs   = bal("cogs");
    o.revSale= bal("revSale");
    o.revWasl= bal("revWasl");
    o.revKabs= bal("revKabs");
    o.revNaql= bal("revNaql");
    o.expNaql= bal("expNaql");
    o.expSal = bal("expSal");
    o.advEmp = bal("advEmp");
    o.apSal  = bal("apSal");
    o.cash   = bal("cash");

    /* مطابقة مع محرّك التقييم ومع المحصلات */
    o.stockValue=Math.round(computeStock(null).totalValue);
    o.agingFarm=Math.round((computeAging().rows.filter(x=>x.k==="buy")
                  .reduce((s,x)=>s+x.rem,0)));
    o.agingCust=Math.round((computeAging().rows.filter(x=>x.k==="sell")
                  .reduce((s,x)=>s+x.rem,0)));

    /* الفترة: قيود آذار وحدها، والرصيد الافتتاحي قبلها */
    const M=_ledger("2026-03-01","2026-03-31");
    o.mGap=Math.round(M.gap);
    const cash=M.rows.find(x=>x.k==="cash");
    o.openCash=cash?Math.round(cash.open):0;

    /* لا قيد بعد نهاية الفترة */
    const E=_ledger("2026-03-01","2026-03-20");
    o.cutoff=!E.rows.some(x=>x.k==="apSal");
    return o;
  });

  const T=[
    ['كل قيد متّزن',                r.unbalanced===0],
    ['لا حاجة لحساب فروق التقريب',  r.rounding===0],
    ['ميزان المراجعة يساوي صفراً',   r.gap===0],
    ['ميزان الشهر يساوي صفراً',      r.mGap===0],
    ['المخزون = ٥٠٠٠٠٠٠ − ٢٠٠٠٠٠٠', r.inv===3000000],
    ['المخزون يطابق شاشة التقييم',   r.inv===r.stockValue],
    ['مستحق الفلاح = ٤٤٥٠٠٠٠ − ٢٠٠٠٠٠٠', r.apFarm===-2450000],
    ['مستحق الفلاح يطابق المحصلة',   Math.abs(r.apFarm)===r.agingFarm],
    ['ذمم الزبائن صفر بعد السداد',   r.ar===0&&r.agingCust===0],
    ['كلفة المبيع = ٤٠٠٠ × ٥٠٠',     r.cogs===2000000],
    ['مبيعات البضاعة = ٣٦٠٠٠٠٠',     r.revSale===-3600000],
    ['أجور الوصل = ٥٠٠٠٠ + ٤٠٠٠٠',   r.revWasl===-90000],
    ['أجور الكبس = ٢٠٠٠٠٠',          r.revKabs===-200000],
    ['أجور نقل محصَّلة = ١٠٠٠٠٠',     r.revNaql===-100000],
    ['نقل مدفوع = بيع ١٠٠٠٠٠ + يدوي ٥٠٠٠٠', r.expNaql===150000],
    ['مستحق الناقلين = ٣٠٠٠٠٠+١٠٠٠٠٠+٥٠٠٠٠', r.apTrans===-450000],
    ['مصروف الرواتب = ١٠٠٠٠٠٠',      r.expSal===1000000],
    ['السلفة صُفِّيت بالراتب',        r.advEmp===0],
    ['رواتب مستحقة صفر بعد الدفع',   r.apSal===0],
    ['الرصيد الافتتاحي خارج الفترة', r.openCash===1000000],
    ['القطع بالتاريخ يعمل',          r.cutoff],
    ['بلا أخطاء جافاسكربت',          errs.length===0],
  ];

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ طبقة القيود متّزنة ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
