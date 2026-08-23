const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();
  const r=await p.evaluate(()=>{
    db=null;CLOSURES=[];
    const D="2026-08-15";
    const w=(o)=>Object.assign({seq:1,dk:D,status:"weighed",payments:[],paid:false},o);
    S.recs   =[w({id:"B1",driver:"فلاح أ",plate:"1",final:1000000,net:5000}),
               w({id:"B2",driver:"فلاح ب",plate:"2",final:500000,net:2000}),
               w({id:"B3",driver:"فلاح أ",plate:"3",final:300000,net:1000,status:"waiting",final:null})];
    SELL_RECS=[w({id:"S1",driver:"زبون أ",plate:"9",final:3000000,net:8000}),
               w({id:"S2",driver:"زبون ب",plate:"8",final:1000000,net:3000})];
    SRF_RECS =[w({id:"R1",recv:"مستفيد",purp:"وقود",amount:200000})];
    WRK_RECS =[w({id:"W1",provider:"ورشة",service:"لحام",amount:100000})];
    SAL_RECS =[w({id:"L1",empName:"عامل",finalNet:400000})];
    DAM_RECS=[];MNL_RECS=[];ADV_RECS=[];EMP_TXNS=[];EMP_LIST=[];ARB_RECS=[];
    const T=perfTotals("2026-08-01","2026-08-31");
    const out={rev:T.rev,cost:T.cost,profit:T.profit,margin:Math.round(T.margin),
      byBuy:T.by.buy.sum,byBuyN:T.by.buy.n};
    // خارج المدة
    out.outside=perfTotals("2026-09-01","2026-09-30").profit;
    // أكثر المتعاملين
    const top=perfTop("buy","2026-08-01","2026-08-31",5);
    out.top=top.map(x=>x.name+":"+x.amt);
    // الأشهر
    const m=perfMonths(3);
    out.months=m.length;
    out.lastMk=m[m.length-1].mk;
    // الرسم والطباعة
    perfSetRange("all");
    out.rendered=document.getElementById("perfRes").innerText.replace(/\s+/g," ").slice(0,3000);
    let printed=false;
    try{openPerfPrint();printed=document.getElementById("PC").innerText.includes("تقرير الأداء");closePrint();}catch(e){out.perr=e.message;}
    out.printed=printed;
    return out;
  });
  // إيراد 4,000,000 · تكاليف 1,500,000(شراء موزون فقط)+200k+100k+400k = 2,200,000
  R.ok("الإيراد = وصولات البيع المكتملة", r.rev===4000000, r);
  R.ok("الشراء غير الموزون لا يُحتسب", r.byBuy===1500000&&r.byBuyN===2, r);
  R.ok("التكاليف تجمع كل الأقسام", r.cost===2200000, r);
  R.ok("الربح = الإيراد − التكاليف", r.profit===1800000, r);
  R.ok("الهامش يُحسب بنسبة الإيراد", r.margin===45, r);
  R.ok("المدى الزمني يُصفّي فعلاً", r.outside===0, r);
  R.ok("أكثر المتعاملين مُجمّع ومرتّب", r.top[0]==="فلاح أ:1000000", r.top);
  R.ok("الأشهر تُبنى بالعدد المطلوب", r.months===3&&/^\d{4}-\d{2}$/.test(r.lastMk), r);
  R.ok("الشاشة تُرسم بالأرقام", /ربح|خسارة/.test(r.rendered), r.rendered.slice(0,200));
  R.ok("تُذكر أنه ربح استحقاق لا نقد", /استحقاق/.test(r.rendered), r.rendered.slice(0,300));
  R.ok("طباعة التقرير تعمل", r.printed, r);
  process.exit(R.done("تقارير الأداء",errs));
})();
