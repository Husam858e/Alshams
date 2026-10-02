/* تحديد الوصولات في السجلات + حجم الصفحة.
   يتحقق أن التحديد يُزرع في كل الأقسام بلا تعديل دوال رسمها،
   وأنه يعيش عبر الصفحات والفلترة، وأن أرقامه مطابقة لسجل
   المجموعات، وأن الدفع والطباعة يعملان على المحدَّد وحده. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',async d=>{await d.accept();});       // confirm الدفع
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(700);
  await p.waitForFunction(()=>dbRefClosures!==null,null,{timeout:15000}).catch(()=>{});

  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  const r = await p.evaluate(async ()=>{
    [dbRef,dbRefSell,dbRefDam,dbRefSrf,dbRefWrk,dbRefMnl,dbRefArb,dbRefOut,
     dbRefEmp,dbRefSal,dbRefAdv,dbRefEmpTxn,dbRefAudit,dbRefClosures]
      .forEach(x=>{try{x&&x.off&&x.off();}catch(e){}});
    db=null; CLOSURES=[]; AUDIT=[]; _writeQueue=[];
    const o={}; const nap=()=>new Promise(r=>setTimeout(r,120));

    S.recs=[];
    for(let i=0;i<120;i++)S.recs.push({id:'P'+i,seq:i+1,no:i+1,
      dk:'2026-09-'+String((i%28)+1).padStart(2,'0'),status:'weighed',
      driver:(i%2?'علاء حسين':'ابو خطاب'),plate:String(1000+i),wh:'بركات',mat:'jet',
      gross:22000,empty:12000,net:10000,ppkg:500,wFee:5000000,
      kOn:true,kC:100,kUP:2000,kabsFee:200000,wOn:false,waslFee:0,
      nOn:false,naqlFee:0,naqlList:[],final:4800000,payments:[],paid:false,
      createdAt:'2026-09-01 08:00',createdBy:'حسام'});
    SRF_RECS=[];
    for(let i=0;i<6;i++)SRF_RECS.push({id:'R'+i,seq:i+1,no:i+1,dk:'2026-09-0'+(i+1),
      recv:'كراج النور',purp:'وقود',amount:100000,payments:[],paid:false});
    DAM_RECS=[{id:'D1',seq:1,dk:'2026-09-05',damin:'ضامن',madmun:'مضمون',price:500000,
      payments:[],paid:false,
      subRecs:{S1:{id:'S1',desc:'وصل فرعي',driver:'فلاح',gross:20000,empty:10000,net:10000,
        ppkg:400,wasl:0,press:0,trans:0,weightFee:4000000,amount:4000000,
        payments:[],paid:false,dk:'2026-09-05'}}}];

    document.querySelectorAll(".tbb").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tc").forEach(x=>x.classList.remove("active"));
    document.getElementById("tc-recs").classList.add("active");
    renderRecs(); await nap();

    /* ① حجم الصفحة خمسون */
    o.pageSize=_recPageSize;
    o.cardsOnPage=document.querySelectorAll('#RL [data-rid]').length;
    o.boxesOnPage=document.querySelectorAll('#RL .selcb').length;

    /* ② لا شريط قبل التحديد */
    o.noBarEmpty=!document.getElementById("selbar_buy");

    /* ③ التحديد يُظهر الشريط بأرقام مطابقة للمجموعة */
    _selToggle('buy','P0',true); _selToggle('buy','P1',true); _selToggle('buy','P2',true);
    await nap();
    const st=_selStats('buy');
    o.n=st.n; o.total=st.total; o.rem=st.rem; o.net=st.net;
    o.barShown=!!document.getElementById("selbar_buy");
    o.barText=(document.getElementById("selbar_buy")||{}).textContent||"";
    o.cardMarked=document.querySelector('#RL [data-rid="P0"]').classList.contains("selon");

    /* ④ التحديد يعيش عبر الصفحات */
    _recPageNext(); await nap();
    o.survivesPage=_selStats('buy').n===3
      && !document.querySelector('#RL [data-rid="P0"]');      // صفحة أخرى
    _recPagePrev(); await nap();
    o.restoredOnBack=document.querySelector('#RL [data-rid="P0"] .selcb input').checked;

    /* ⑤ تحديد المعروض ثم كل نتائج الفلترة */
    _selPageAll('buy',true); await nap();
    o.pageAll=_selStats('buy').n===50;
    _selFilteredAll(); await nap();
    o.filteredAll=_selStats('buy').n===120;
    _selClear('buy'); await nap();
    o.cleared=_selStats('buy').n===0 && !document.getElementById("selbar_buy");

    /* ⑥ الدفع يمسّ المحدَّد وحده */
    _selToggle('buy','P5',true); _selToggle('buy','P6',true);
    await nap();
    _selPay('buy'); await nap();
    o.paidSelected=isFullyPaid(S.recs.find(x=>x.id==='P5'))
                && isFullyPaid(S.recs.find(x=>x.id==='P6'));
    o.othersUntouched=S.recs.filter(x=>isFullyPaid(x)).length===2;
    o.clearedAfterPay=_selStats('buy').n===0;
    o.auditedPay=AUDIT.length>=2;

    /* ⑦ قسم آخر يعمل بلا تعديل دالته */
    document.querySelectorAll(".tc").forEach(x=>x.classList.remove("active"));
    document.getElementById("tc-srf-recs").classList.add("active");
    renderSrfRecs(); await nap();
    o.srfBoxes=document.querySelectorAll('#srfRL .selcb').length;
    _selToggle('srf','R0',true); _selToggle('srf','R1',true); await nap();
    o.srfStats=_selStats('srf').total===200000;
    o.srfBar=!!document.getElementById("selbar_srf");

    /* ⑧ البطاقة الفرعية للضمانة ليست سجلاً — لا يُزرع فيها مربّع */
    document.querySelectorAll(".tc").forEach(x=>x.classList.remove("active"));
    document.getElementById("tc-dam-recs").classList.add("active");
    renderDamRecs(); await nap();
    o.damParentBox=!!document.querySelector('#damRL [data-rid="D1"] > .selcb');
    o.damSubNoBox=!document.querySelector('#damRL [data-rid="S1"] > .selcb');

    /* ⑨ الطباعة تُخرج المحدَّد وحده */
    _selToggle('srf','R2',true); await nap();
    _selPrint('srf');
    const pc=document.getElementById("PC").textContent;
    o.printOpen=document.getElementById("PS").classList.contains("active");
    o.printCount=(pc.match(/كراج النور/g)||[]).length;
    o.printTitle=pc.indexOf("وصولات محدَّدة")>=0;
    closePrint&&closePrint();
    document.getElementById("PS").classList.remove("active");

    /* ⑩ التحديد لا يُزرع مرتين عند إعادة الرسم */
    document.querySelectorAll(".tc").forEach(x=>x.classList.remove("active"));
    document.getElementById("tc-recs").classList.add("active");
    renderRecs(); await nap(); renderRecs(); await nap();
    /* ملاحظة: الحفظ يُعيد ترتيب المصفوفة بالتاريخ، فأول بطاقة
       ليست بالضرورة P0 — نفحص البطاقات كما هي معروضة. */
    const cards=[...document.querySelectorAll('#RL [data-rid]')];
    o.cardsNow=cards.length;
    o.noDoubleBox=cards.length>0&&cards.every(el=>
      el.querySelectorAll(':scope > .selcb').length===1);

    return o;
  });

  const T=[
    ['حجم الصفحة خمسون',                  r.pageSize===50&&r.cardsOnPage===50],
    ['مربّع تحديد في كل بطاقة',            r.boxesOnPage===50],
    ['لا شريط قبل التحديد',                r.noBarEmpty],
    ['الشريط يظهر بعد التحديد',            r.barShown&&r.n===3],
    ['المجموع والمتبقي والصافي صحيحة',      r.total===14400000&&r.rem===14400000&&r.net===30000],
    ['الشريط يُسمّي عدد المحدَّد',           r.barText.indexOf("المحدَّد")>=0],
    ['البطاقة المحدَّدة مُعلَّمة',            r.cardMarked],
    ['التحديد يعيش عبر الصفحات',           r.survivesPage],
    ['ويعود مؤشَّراً عند الرجوع',            r.restoredOnBack],
    ['تحديد المعروض = ٥٠',                 r.pageAll],
    ['تحديد كل نتائج الفلترة = ١٢٠',        r.filteredAll],
    ['الإلغاء يُزيل التحديد والشريط',        r.cleared],
    ['الدفع يُسدّد المحدَّد',                r.paidSelected],
    ['ولا يمسّ غيره',                       r.othersUntouched],
    ['ويُفرَّغ التحديد بعده',                r.clearedAfterPay],
    ['والدفع مُسجَّل في التدقيق',            r.auditedPay],
    ['قسم آخر يعمل بلا تعديل دالته',        r.srfBoxes===6&&r.srfBar&&r.srfStats],
    ['بطاقة الضمانة تُحدَّد',                r.damParentBox],
    ['ووصلها الفرعي لا يُحدَّد',             r.damSubNoBox],
    ['الطباعة تُخرج المحدَّد وحده',          r.printOpen&&r.printTitle&&r.printCount===3],
    ['لا مربّع مكرَّر عند إعادة الرسم',       r.noDoubleBox],
    ['بلا أخطاء جافاسكربت',                 errs.length===0],
  ];

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ تحديد الوصولات يعمل ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
