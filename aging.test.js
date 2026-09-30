/* يتحقق من الشرائح والاتجاه، ومن تطابق الرقم مع المستحق المحسوب أصلاً */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:1100} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(()=>{
    const ago=n=>{const d=new Date();d.setDate(d.getDate()-n);
      const p=x=>String(x).padStart(2,'0');
      return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
    const buy=(id,days,amt,paid,who)=>({id,seq:1,dk:ago(days),driver:who,plate:'ج',mat:'jet',
      wh:'بركات',status:'weighed',gross:20000,empty:8000,net:12000,ppkg:1,final:amt,
      payments:paid?[{amount:paid,at:'x',by:'y'}]:[],nOn:false});

    // علينا: أربعة أعمار لنفس الفلاح + فلاح مسدَّد بالكامل
    S.recs=[ buy('A',  5,1000000,0,'ابو خطاب'),     // جارٍ
             buy('B', 45,2000000,0,'ابو خطاب'),     // ٣١–٦٠
             buy('C', 75,3000000,0,'ابو خطاب'),     // ٦١–٩٠
             buy('D',200,4000000,1000000,'ابو خطاب'), // ٩١+ ومدفوع جزئياً ٣ مليون
             buy('E', 10,5000000,5000000,'مسدَّد') ]; // مسدَّد بالكامل — يجب ألا يظهر
    // لنا: زبون بيع
    SELL_RECS=[{id:'S1',seq:1,dk:ago(100),driver:'زبون بعيد',mat:'jet',status:'weighed',
      gross:16000,empty:8000,net:8000,ppkg:1,final:7000000,payments:[],nOn:false}];
    DAM_RECS=[];SRF_RECS=[];WRK_RECS=[];SAL_RECS=[];MNL_RECS=[];

    const A=computeAging();
    const k=A.out.find(x=>x.name==='ابو خطاب');
    const paidMan=A.out.find(x=>x.name==='مسدَّد');
    const cust=A.in[0];

    // المستحق كما يحسبه النظام أصلاً (مصدر المحصلات)
    const direct=S.recs.filter(r=>r.status==='weighed')
      .reduce((s,r)=>s+Math.max(0,getRecTotal(r)-getPaidTotal(r)),0);

    return {buckets:k.buckets, total:k.total, oldest:k.oldest,
            paidHidden: !paidMan,
            outTotals:A.totals.out, inTotal:A.totals.in.reduce((s,x)=>s+x,0),
            custName:cust&&cust.name, custBucket:cust&&cust.buckets[3],
            direct, agingOut:A.totals.out.reduce((s,x)=>s+x,0)};
  });

  const T=[];
  T.push(['شريحة جارٍ ٠–٣٠',            r.buckets[0]===1000000]);
  T.push(['شريحة ٣١–٦٠',                r.buckets[1]===2000000]);
  T.push(['شريحة ٦١–٩٠',                r.buckets[2]===3000000]);
  T.push(['شريحة ٩١+ بعد خصم المدفوع',  r.buckets[3]===3000000]);
  T.push(['إجمالي الشخص',               r.total===9000000]);
  T.push(['أقدم دين ≈ ٢٠٠ يوم',         Math.abs(r.oldest-200)<=1]);
  T.push(['المسدَّد بالكامل لا يظهر',    r.paidHidden===true]);
  T.push(['البيع في جهة «لنا»',          r.inTotal===7000000 && r.custName==='زبون بعيد']);
  T.push(['دين الزبون في شريحة ٩١+',     r.custBucket===7000000]);
  T.push(['المجموع مطابق لحساب المستحق الأصلي', r.direct===r.agingOut]);

  T.forEach(([t,ok])=>console.log(` ${ok?'PASS':'FAIL'} ${t}`));
  const f=T.filter(x=>!x[1]).length;
  console.log(f?`\n‼ فشل ${f}`:`\n✅ أعمار الديون سليمة (${T.length})`);
  console.log('pageerrors:', errs.length?errs.join(' | '):'none');
  await b.close(); process.exit(f?1:0);
})();
