/* طباعة الوصولات المحدَّدة: المادة والكبس والنقل ومجاميعها.
   كل قسم يحفظ الكبس والنقل بحقولٍ مختلفة — يتحقق هذا الفحص أن
   كلاً منها يُقرأ صحيحاً وأن المجاميع تساوي ما حُسب يدوياً. */
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
    const txt=()=>document.getElementById("PC").textContent.replace(/\s+/g," ");
    const sel=(k,ids)=>{_selSet(k).clear();ids.forEach(i=>_selSet(k).add(i));_selPrint(k);return txt();};

    /* ── الشراء: كبس + نقل بناقلَين بسعرين مختلفين ── */
    S.recs=[
      {id:'A',seq:1,no:10,dk:'2026-09-30',status:'weighed',driver:'أبو شاهر',mat:'jet',
       net:2085,ppkg:350,kOn:true,kC:20,kUP:2000,kabsFee:40000,nOn:true,
       naqlList:[{id:'n1',nC:10,nUP:3000,naqlFee:30000}],final:659750,payments:[]},
      {id:'B',seq:2,no:11,dk:'2026-10-01',status:'weighed',driver:'أبو شاهر',mat:'gravel',
       net:2180,ppkg:350,kOn:false,nOn:true,
       naqlList:[{id:'n2',nC:6,nUP:3000,naqlFee:18000},{id:'n3',nC:6,nUP:2500,naqlFee:15000}],
       final:730000,payments:[]},
    ];
    const dA=_selDetail('buy',S.recs[0]), dB=_selDetail('buy',S.recs[1]);
    o.buyKabs = dA.kN===20&&dA.kUP===2000&&dA.kFee===40000;
    o.buyNaql = dA.nN===10&&dA.nUP===3000&&dA.nFee===30000;
    o.buyMultiNaql = dB.nN===12&&dB.nFee===33000&&dB.nUP===0;   // سعران ⇒ يُكتفى بالمجموع
    o.buyMat = dA.mat==="الجت المكبوس"&&dB.mat==="الجرش";
    let t=sel('buy',['A','B']);
    const Q=q=>[...document.querySelectorAll("#PC .seltbl "+q)];
    const T=el=>el.textContent.replace(/\s+/g," ").trim();
    o.buyNetTotal = t.indexOf("٤,٢٦٥ كغم")>=0;                       // ٢٠٨٥+٢١٨٠
    /* صفّ العناوين الثاني: حقولٌ بأسمائها */
    o.subHead = Q("thead tr.sh th").map(T).join("|")==="المادة|عدد الكبس|أجور الكبس|عدد النقل|أجور النقل";
    /* كل صفّ حقول يملأ أعمدة الجدول السبعة بالضبط — لا يزيد ولا ينقص */
    const head=Q("thead tr:first-child th").length;
    o.aligned = Q("tr.seldet").every(tr=>[...tr.cells].reduce((a,c)=>a+(+c.getAttribute("colspan")||1),0)===head)
             && Q("thead tr.sh th").reduce((a,c)=>a+(+c.getAttribute("colspan")||1),0)===head;
    /* حقول الوصل الأول تحت عناوينها */
    o.buyLine = Q("tr.seldet")[0] && [...Q("tr.seldet")[0].cells].map(T).join("|")==="الجت المكبوس|٢٠|٤٠,٠٠٠|١٠|٣٠,٠٠٠";
    /* المجاميع تحت الحقول نفسها */
    const st=Q("tfoot tr.st")[0];
    const stv=st?[...st.cells].map(T):[];
    o.buyKabsTotal= stv[1]==="٢٠"&&stv[2]==="٤٠,٠٠٠";
    o.buyNaqlTotal= stv[3]==="٢٢"&&stv[4]==="٦٣,٠٠٠";              // ١٠+١٢ · ٣٠٠٠٠+٣٣٠٠٠
    o.buyMatSum   = (stv[0]||"").indexOf("الجت المكبوس: ١ وصل")>=0&&(stv[0]||"").indexOf("الجرش: ١ وصل")>=0;
    /* لا سعر وحدة في الحقول — العدد والأجر فقط */
    o.noUnitPrice = t.indexOf("×")<0;
    /* ── وصل لم يُوزن بعد: أجر الكبس من العدد × السعر ── */
    o.unweighed = _selDetail('buy',{kOn:true,kC:5,kUP:2000}).kFee===10000;

    /* ── البيع: نقل بحقول nKabs/nUP ── */
    SELL_RECS=[{id:'S1',seq:1,dk:'2026-10-01',status:'weighed',driver:'زبون',mat:'straw',
      net:3000,nOn:true,nKabs:15,nUP:2000,naqlFee:30000,final:900000,payments:[]}];
    const dS=_selDetail('sell',SELL_RECS[0]);
    o.sell = dS.nN===15&&dS.nUP===2000&&dS.nFee===30000&&dS.mat==="تبن"&&dS.kN===0;

    /* ── النقل اليدوي: kabs/pricePerK ── */
    MNL_RECS=[{id:'M1',seq:1,dk:'2026-10-01',transporter:'ناقل',kabs:8,pricePerK:25000,naqlFee:200000,naqlPayments:[]}];
    const dM=_selDetail('mnl',MNL_RECS[0]);
    o.mnl = dM.nN===8&&dM.nUP===25000&&dM.nFee===200000;
    t=sel('mnl',['M1']);
    const mst=[...document.querySelectorAll("#PC .seltbl tfoot tr.st td")].map(e=>e.textContent.trim());
    o.mnlPrint = mst[1]==="٨"&&mst[2]==="٢٠٠,٠٠٠"
      && [...document.querySelectorAll("#PC .seltbl thead tr.sh th")].map(e=>e.textContent.trim()).join("|")==="|عدد النقل|أجور النقل";

    /* ── الضمانة: تجمع وصولاتها الفرعية ── */
    DAM_RECS=[{id:'D1',seq:1,dk:'2026-10-01',damin:'ض',madmun:'م',price:0,payments:[],
      subRecs:{a:{net:1000,pressCount:4,press:8000,transCount:2,trans:6000},
               b:{net:500,pressCount:1,press:2000,transCount:0,trans:0}}}];
    const dD=_selDetail('dam',DAM_RECS[0]);
    o.dam = dD.net===1500&&dD.kN===5&&dD.kFee===10000&&dD.nN===2&&dD.nFee===6000;

    /* ── المخرجات: أوزان ومادة بلا مبالغ ── */
    OUT_RECS=[{id:'O1',seq:1,no:1,dk:'2026-10-01',farmer:'فلاح',mat:'jet',net:4000}];
    t=sel('out',['O1']);
    o.outNet  = t.indexOf("٤,٠٠٠ كغم")>=0;
    o.outNoMoney = t.indexOf("المدفوع")<0;
    o.outNoKabs  = t.indexOf("عدد الكبس")<0&&t.indexOf("أجور النقل")<0;
    o.outMat  = t.indexOf("الجت المكبوس: ١ وصل")>=0;

    /* ── الصرفيات: لا وزن ولا كبس ولا مادة — الجدول كما كان ── */
    SRF_RECS=[{id:'R1',seq:1,dk:'2026-10-01',recv:'كراج',purp:'وقود',amount:50000,payments:[]}];
    t=sel('srf',['R1']);
    o.srfPlain = t.indexOf("الصافي")<0&&!document.querySelector("#PC .seltbl tr.seldet")&&t.indexOf("٥٠,٠٠٠")>=0;

    /* الأرقام تنكسر عند الفاصلة لا في وسط الخانات */
    sel('buy',['A']);
    o.wbr = document.querySelector("#PC .seltbl tbody").innerHTML.indexOf(",<wbr>")>0;
    return o;
  });

  const T=[
    ['الشراء: عدد الكبس وسعره وأجره',        r.buyKabs],
    ['الشراء: عدد النقل وسعره وأجره',        r.buyNaql],
    ['ناقلان بسعرين: يُجمع ولا يُخترع سعر',   r.buyMultiNaql],
    ['نوع المادة باسمه',                     r.buyMat],
    ['مجموع الوزن الصافي',                   r.buyNetTotal],
    ['صفّ عناوين الحقول',                     r.subHead],
    ['الحقول تملأ الأعمدة السبعة بالضبط',      r.aligned],
    ['مجموع الكبسات وأجور الكبس',            r.buyKabsTotal],
    ['مجموع كبسات النقل وأجوره',             r.buyNaqlTotal],
    ['ملخّص حسب المادة',                     r.buyMatSum],
    ['حقول الوصل تحت عناوينها',               r.buyLine],
    ['العدد والأجر بلا سعر وحدة',              r.noUnitPrice],
    ['وصلٌ لم يُوزن: الأجر من العدد × السعر', r.unweighed],
    ['البيع: نقل وتبن',                      r.sell],
    ['النقل اليدوي',                         r.mnl&&r.mnlPrint],
    ['الضمانة تجمع وصولاتها الفرعية',          r.dam],
    ['المخرجات: وزن ومادة بلا مبالغ',          r.outNet&&r.outNoMoney&&r.outNoKabs&&r.outMat],
    ['الصرفيات: الجدول كما كان',              r.srfPlain],
    ['الأرقام تنكسر عند الفاصلة فقط',          r.wbr],
    ['بلا أخطاء جافاسكربت',                   errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ طباعة المحدَّد بتفاصيلها سليمة ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
