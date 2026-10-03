/* حساب النقال: الناقل الواحد لا يظهر بطاقتين (v17.85).
   ① ما اختلف كتابةً لا حرفاً (مسافة، همزة، «عبدالله»/«عبد الله»)
      يُجمع تلقائياً في بطاقة واحدة.
   ② ما اختلف بحرف («منذر»/«منثر») لا يُدمج تلقائياً — يُنبَّه عليه،
      والتوحيد يكتب الصيغة المختارة في وصولات الأقسام الأربعة. */
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
    const btn=[...document.querySelectorAll(".tbb")].find(x=>(x.getAttribute("onclick")||"").includes("sT('naql-coll'"));
    btn.click();
    const seed=()=>{
      S.recs=[
        /* شراء بناقلَين — الأول «رائد حيمد» بمسافة زائدة وهمزة */
        {id:'B1',seq:1,dk:'2026-08-01',status:'weighed',driver:'بركات عيد',plate:'جلاب',wh:'',nOn:true,
         naqlList:[{id:'n1',transporter:'رائد  حيمد ',nC:45,nUP:250,naqlFee:11250,naqlPayments:[]}],payments:[]},
        /* شراء قديم بناقل واحد بلا naqlList */
        {id:'B2',seq:2,dk:'2026-07-04',status:'weighed',driver:'امجد',plate:'فلاح',wh:'',nOn:true,
         transporter:'منثر ابو عبد الله',nC:46,nUP:250,naqlFee:11500,naqlPayments:[],payments:[]},
      ];
      SELL_RECS=[{id:'S1',seq:1,dk:'2026-08-03',status:'weighed',driver:'زبون',nOn:true,
        transporter:'رائد حيمد',nKabs:20,nUP:250,naqlFee:5000,naqlPayments:[],payments:[]}];
      DAM_RECS=[{id:'D1',seq:1,dk:'2026-08-04',damin:'ض',madmun:'م',payments:[],
        subRecs:{a:{id:'sa',dk:'2026-08-04',transporter:'منذر أبو عبدالله',trans:3000,transCount:12,transPpcs:250}}}];
      MNL_RECS=[{id:'M1',seq:1,dk:'2026-08-05',transporter:'منذر ابو عبد الله',farmer:'ف',kabs:10,pricePerK:250,naqlFee:2500,naqlPayments:[]}];
    };
    seed();
    document.getElementById("naqlFrom").value=""; document.getElementById("naqlTo").value="";
    renderNaqlColl();
    const cards=()=>[...document.querySelectorAll("#naqlCollResult > div")].filter(d=>d.querySelector("table"));
    const titles=()=>cards().map(c=>c.querySelector("div div div").textContent.replace("🚚","").trim());
    const t1=titles();
    o.t1=t1;
    /* ① «رائد  حيمد » (شراء) و«رائد حيمد» (بيع) بطاقة واحدة */
    const raed=cards().filter(c=>c.textContent.indexOf("رائد")>=0);
    o.raedOne = raed.length===1 && raed[0].textContent.indexOf("١٦,٢٥٠")>=0;
    /* «منذر أبو عبدالله» (ضمانة) و«منذر ابو عبد الله» (يدوي) بطاقة واحدة */
    const mundhir=cards().filter(c=>/منذر/.test(c.querySelector("div div div").textContent));
    o.mundhirOne = mundhir.length===1 && mundhir[0].textContent.indexOf("٥,٥٠٠")>=0;
    o.formsShown = mundhir.length===1 && mundhir[0].textContent.indexOf("يُكتب أيضاً")>=0;
    /* المجموع العام لم يتغيّر بالتجميع */
    o.total = document.getElementById("naqlCollResult").textContent.indexOf("٣٣,٢٥٠")>=0;   // 11250+11500+5000+3000+2500

    /* ② «منثر» و«منذر» حرفٌ مختلف: لا دمج تلقائي، بل تنبيه */
    o.notAutoMerged = cards().length===3;
    o.nearPairs = _naqlNear.length===1;
    o.nearShown = document.getElementById("naqlCollResult").textContent.indexOf("هل هي نفس الناقل")>=0;
    /* «رائد حيمد» لا يُقرَن بأحد */
    o.noFalsePair = _naqlNear.every(p=>p.every(x=>x.name.indexOf("رائد")<0));

    /* الرفض لا يغيّر شيئاً */
    window.confirm=()=>false;
    const side=_naqlNear[0][0].name.indexOf("منذر")>=0?0:1;
    naqlUnify(0,side);
    o.cancelKeeps = S.recs.find(x=>x.id==='B2').transporter==='منثر ابو عبد الله';

    /* التوحيد إلى «منذر …» يكتبه في وصل الشراء القديم */
    window.confirm=()=>true;
    naqlUnify(0,side);
    const target=_naqlNear.length?null:true;
    o.renamedBuy = /^منذر/.test(S.recs.find(x=>x.id==='B2').transporter);
    o.oneCard = cards().filter(c=>/منذر|منثر/.test(c.querySelector("div div div").textContent)).length===1
             && cards().length===2;
    o.mergedSum = cards().some(c=>/منذر/.test(c.textContent)&&c.textContent.indexOf("١٧,٠٠٠")>=0); // 11500+3000+2500
    o.nearGone = _naqlNear.length===0;
    /* لم يمسّ ما سواه: الوزن والمبلغ والمخزن ودفعات الفلاح */
    const b2=S.recs.find(x=>x.id==='B2');
    o.restIntact = b2.naqlFee===11500&&b2.driver==='امجد'&&b2.status==='weighed'&&Array.isArray(b2.payments);
    o.othersIntact = S.recs.find(x=>x.id==='B1').naqlList[0].transporter==='رائد  حيمد '
                  && SELL_RECS[0].transporter==='رائد حيمد';

    /* توحيدٌ يشمل الأقسام الأربعة: نوحّد «رائد حيمد» إلى صيغة مختلفة حرفاً */
    seed();
    S.recs[0].naqlList[0].transporter='رائد حميد';
    MNL_RECS.push({id:'M2',seq:2,dk:'2026-08-06',transporter:'رائد حميد',farmer:'ف',kabs:1,pricePerK:250,naqlFee:250,naqlPayments:[]});
    DAM_RECS[0].subRecs.b={id:'sb',dk:'2026-08-04',transporter:'رائد حميد',trans:250,transCount:1};
    const n=_naqlRename(nameKey('رائد حميد'),'رائد حيمد');
    o.renameAll = n===3 && S.recs[0].naqlList[0].transporter==='رائد حيمد'
      && MNL_RECS.find(x=>x.id==='M2').transporter==='رائد حيمد'
      && DAM_RECS[0].subRecs.b.transporter==='رائد حيمد'
      && DAM_RECS[0].subRecs.a.transporter==='منذر أبو عبدالله';

    /* الطباعة تتبع البطاقات الموحّدة */
    renderNaqlColl();
    o.printKeys = window._naqlPrintData.keys.length===cards().length;
    return o;
  });
  await p.waitForTimeout(300);

  const T=[
    ['مسافة زائدة لا تفصل الناقل',               r.raedOne],
    ['همزة و«عبدالله» لا تفصلان الناقل',          r.mundhirOne],
    ['الصيغ الأخرى تُذكر تحت الاسم',              r.formsShown],
    ['المجموع العام كما هو',                      r.total],
    ['حرفٌ مختلف لا يُدمج تلقائياً',              r.notAutoMerged],
    ['بل يُنبَّه عليه',                           r.nearPairs&&r.nearShown],
    ['لا تنبيه كاذب لاسمٍ بعيد',                  r.noFalsePair],
    ['الرفض لا يغيّر شيئاً',                      r.cancelKeeps],
    ['التوحيد يكتب الاسم في الوصل',               r.renamedBuy],
    ['فتصير بطاقة واحدة',                         r.oneCard],
    ['بحسابٍ مجموع',                              r.mergedSum],
    ['ويزول التنبيه',                             r.nearGone],
    ['لا يمسّ بقية حقول الوصل',                   r.restIntact],
    ['ولا الناقلين الآخرين',                      r.othersIntact],
    ['يشمل الشراء والضمانات والنقل اليدوي',        r.renameAll],
    ['الطباعة تتبع البطاقات الموحّدة',             r.printKeys],
    ['بلا أخطاء جافاسكربت',                       errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ الناقل الواحد بطاقة واحدة ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
