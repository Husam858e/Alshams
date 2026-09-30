/* ميزان المراجعة وقائمة الدخل: يبني شهرين متتاليين بأرقام
   محسوبة يدوياً، ويتحقق أن الميزان يتّزن، وأن الربح يُحسب
   بالاستحقاق لا بالقبض، وأن المقارنة تقرأ الشهر السابق. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  /* انتظر تسجيل مستمعي فايربيس قبل فصلها: التهيئة غير متزامنة،
     وفصلٌ قبل التسجيل لا يمنع لقطةً تصل بعده فتمحو بيانات الاختبار. */
  await p.waitForFunction(()=>dbRefClosures!==null,null,{timeout:15000}).catch(()=>{});

  const r = await p.evaluate(()=>{
    /* فصل مستمعي فايربيس أولاً: لقطةٌ متأخرة تستبدل المصفوفات
       التي يبنيها الاختبار فتفشل الفحوص عشوائياً — لا لخللٍ في
       التطبيق. ويُنتظر تسجيل المستمعين أولاً، فالتهيئة غير
       متزامنة وقد تسجّلهم بعد الفصل فيعودون. */
    [dbRef,dbRefSell,dbRefDam,dbRefSrf,dbRefWrk,dbRefMnl,dbRefArb,dbRefOut,
     dbRefEmp,dbRefSal,dbRefAdv,dbRefEmpTxn,dbRefAudit,dbRefClosures]
      .forEach(r=>{try{r&&r.off&&r.off();}catch(e){}});
    try{db&&db.ref&&db.ref().off();}catch(e){}
    db=null;
    S.recs=[];SELL_RECS=[];OUT_RECS=[];MNL_RECS=[];SRF_RECS=[];WRK_RECS=[];
    DAM_RECS=[];SAL_RECS=[];ADV_RECS=[];EMP_TXNS=[];CASH_MOVES=[];CASH_COUNTS=[];
    CASH_BOXES=[{id:"main",name:"صندوق",kind:"cash",opening:0,openingDk:"2026-01-01",main:true,active:true}];

    const buy=(id,dk,net,ppkg)=>({id,seq:+id.slice(1),dk,status:"weighed",driver:"فلاح",plate:id,
      mat:"jet",gross:net+1000,empty:1000,net,ppkg,wFee:net*ppkg,
      kOn:false,kabsFee:0,wOn:false,waslFee:0,nOn:false,naqlFee:0,
      final:net*ppkg,payments:[]});
    const sell=(id,dk,net,ppkg,paid)=>({id,seq:+id.slice(1),dk,status:"weighed",driver:"زبون",plate:id,
      mat:"jet",gross:net+1000,empty:1000,net,ppkg,wFee:net*ppkg,
      wOn:false,waslFee:0,nOn:false,naqlFee:0,final:net*ppkg,
      payments:paid?[{amount:net*ppkg,at:dk+" 10:00",by:"ح"}]:[],naqlPayments:[]});

    /* آذار: شراء ١٠٠٠٠ كغم × ٤٠٠ = ٤٠٠٠٠٠٠ ، بيع ٥٠٠٠ × ٧٠٠ = ٣٥٠٠٠٠٠
       الكلفة ٥٠٠٠ × ٤٠٠ = ٢٠٠٠٠٠٠ ⇒ مجمل الربح ١٥٠٠٠٠٠
       صرفية ٣٠٠٠٠٠ ⇒ صافي ١٢٠٠٠٠٠   (البيع غير مقبوض إطلاقاً) */
    S.recs.push(buy("B1","2026-03-05",10000,400));
    SELL_RECS.push(sell("S1","2026-03-20",5000,700,false));
    SRF_RECS.push({id:"R1",seq:9,dk:"2026-03-25",recv:"كراج",purp:"وقود",amount:300000,payments:[]});

    /* نيسان: يُقبض بيع آذار كاملاً (لا يجوز أن يظهر ربحاً في نيسان)
       وبيع ٢٠٠٠ × ٧٠٠ = ١٤٠٠٠٠٠ بكلفة ٢٠٠٠ × ٤٠٠ = ٨٠٠٠٠٠
       ⇒ مجمل الربح ٦٠٠٠٠٠ ولا مصروف ⇒ صافي ٦٠٠٠٠٠ */
    SELL_RECS[0].payments=[{amount:3500000,at:"2026-04-03 09:00",by:"ح"}];
    SELL_RECS.push(sell("S2","2026-04-10",2000,700,false));

    const o={};
    const M=(f,t)=>_ledger(f,t);
    o.marGap=Math.round(M("2026-03-01","2026-03-31").gap);
    o.aprGap=Math.round(M("2026-04-01","2026-04-30").gap);
    o.allGap=Math.round(M("","").gap);

    const mar=_incomeRows("2026-03-01","2026-03-31");
    const apr=_incomeRows("2026-04-01","2026-04-30");
    o.marRev=Math.round(mar.totRev); o.marCogs=Math.round(mar.cogs);
    o.marGross=Math.round(mar.gross);o.marExp=Math.round(mar.totExp);
    o.marNet=Math.round(mar.net);
    o.aprRev=Math.round(apr.totRev); o.aprCogs=Math.round(apr.cogs);
    o.aprNet=Math.round(apr.net);

    /* المركز المالي آخر نيسان */
    const L=M("","2026-04-30");
    o.assets=Math.round(_accSum(L.rows,"asset"));
    o.liab  =Math.round(_accSum(L.rows,"liab"));
    o.eq    =Math.round(_accSum(L.rows,"eq"));
    o.keep  =Math.round(_accSum(L.rows,"rev")-_accSum(L.rows,"exp"));
    o.identity = Math.abs(o.assets-(o.liab+o.eq+o.keep))<1;
    o.invEnd = Math.round((L.rows.find(x=>x.k==="inv")||{close:0}).close);
    o.cashEnd= Math.round((L.rows.find(x=>x.k==="cash")||{close:0}).close);

    /* الفترة السابقة تُحسب من نفس المرساة */
    document.getElementById("acctDt").value="2026-04-15";
    _acctPeriod="month";
    const R=_acctRange(), P=_acctPrev();
    o.rangeFrom=R.from; o.rangeTo=R.to; o.prevFrom=P.from; o.prevTo=P.to;

    /* الشاشة نفسها تُرسم بلا خطأ */
    _acctView="trial";  renderAcct();
    o.trialHTML=(document.getElementById("acctBody").innerHTML||"").length>200;
    o.trialBalanced=(document.getElementById("acctBody").innerHTML||"").indexOf("الدفتر متّزن")!==-1;
    _acctView="income"; renderAcct();
    const ih=document.getElementById("acctBody").innerHTML||"";
    o.incHTML=ih.length>200;
    o.showsPrev=ih.indexOf("آذار")!==-1||ih.indexOf("مارس")!==-1;
    _acctView="journal";
    return o;
  });

  const T=[
    ['ميزان آذار متّزن',              r.marGap===0],
    ['ميزان نيسان متّزن',             r.aprGap===0],
    ['الميزان الكلي متّزن',            r.allGap===0],
    ['إيراد آذار ٣٥٠٠٠٠٠ رغم عدم القبض', r.marRev===3500000],
    ['كلفة مبيع آذار ٢٠٠٠٠٠٠',        r.marCogs===2000000],
    ['مجمل ربح آذار ١٥٠٠٠٠٠',         r.marGross===1500000],
    ['مصروف آذار ٣٠٠٠٠٠',             r.marExp===300000],
    ['صافي آذار ١٢٠٠٠٠٠',             r.marNet===1200000],
    ['قبضُ نيسان لا يُضاف إيراداً',     r.aprRev===1400000],
    ['كلفة مبيع نيسان ٨٠٠٠٠٠',        r.aprCogs===800000],
    ['صافي نيسان ٦٠٠٠٠٠',             r.aprNet===600000],
    ['الأصول = الخصوم + الملكية + الأرباح', r.identity],
    ['المخزون الباقي ٣٠٠٠ × ٤٠٠',      r.invEnd===1200000],
    ['النقد = ما قُبض فعلاً',           r.cashEnd===3500000],
    ['الأرباح المتراكمة ١٨٠٠٠٠٠',      r.keep===1800000],
    ['نطاق الشهر صحيح',               r.rangeFrom==='2026-04-01'&&r.rangeTo==='2026-04-30'],
    ['الفترة السابقة هي آذار',         r.prevFrom==='2026-03-01'&&r.prevTo==='2026-03-31'],
    ['ميزان المراجعة يُرسم ويعلن الاتزان', r.trialHTML&&r.trialBalanced],
    ['قائمة الدخل تُرسم ومعها السابقة', r.incHTML&&r.showsPrev],
    ['بلا أخطاء جافاسكربت',            errs.length===0],
  ];

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ الميزان وقائمة الدخل سليمان ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
