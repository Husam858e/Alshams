const {chromium}=require("playwright");
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2300);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  await p.waitForTimeout(300);

  const out=await p.evaluate(()=>{
    const D=toDay();
    // realistic, benign data — no payloads. Any visible "<tag>" means over-escaping.
    const pay=[{amount:50000,at:"2026-08-20 10:00",by:"حسام عايد",note:"دفعة أولى"}];
    const mk=(o)=>Object.assign({dk:D,seq:1,gross:9000,empty:3000,net:6000,ppkg:535,
      final:600000,price:100000,amount:50000,salary:500000,finalNet:400000,
      naqlFee:45000,trans:30000,kC:2,kP:1000,nC:1,nUP:45000,wPrice:3000,kabs:2,
      payments:pay,naqlPayments:pay,paid:false,status:"weighed",month:"2026-08",
      driver:"شاكر شطب",plate:"22 أ 111",note:"ملاحظة",transporter:"حارث كريم",
      receiver:"أبو زينب",dest:"بغداد",damin:"ضامن",madmun:"مضمون",recv:"مستفيد",
      purp:"وقود",provider:"ورشة",service:"لحام",farmer:"فلاح",empName:"عامل",
      role:"سائق",name:"عامل",desc:"وصف",driverPhone:"07700000000",kType:"سيم",
      createdBy:"حسام عايد",createdAt:"2026-08-20 10:00",wh:YARD,mat:"jet",
      nOn:true,kOn:true,wOn:true,edited:true,payType:"monthly"},o);

    S.recs=[mk({id:"B1"})];
    SELL_RECS=[mk({id:"S1"})];
    DAM_RECS=[mk({id:"D1",subRecs:{a:mk({id:"SB1"})}})];
    SRF_RECS=[mk({id:"R1"})]; WRK_RECS=[mk({id:"W1"})];
    MNL_RECS=[mk({id:"M1"})]; ARB_RECS=[mk({id:"A1"})];
    EMP_LIST=[mk({id:"E1"})]; SAL_RECS=[mk({id:"L1"})];
    ADV_RECS=[mk({id:"V1"})]; EMP_TXNS=[mk({id:"T1",type:"bonus"})];
    TRASH=[{kind:"buy",rec:S.recs[0],delAt:"2026-08-20 10:00",delBy:"حسام عايد"}];

    // markup that is VISIBLE as text = over-escaped trusted HTML
    const RE=/&lt;\s*(img|span|div|b|strong|i|br|table|td|tr|button|a)\b/i;
    const bad=[];

    // ① receipt / HTML builders
    const builders=[
      ["buildReceipt",[S.recs[0]]],["buildSellReceipt",[SELL_RECS[0]]],
      ["buildDamReceipt",[DAM_RECS[0]]],["buildSrfReceipt",[SRF_RECS[0]]],
      ["buildWrkReceipt",[WRK_RECS[0]]],["buildArbReceipt",[ARB_RECS[0]]],
      ["buildSalReceipt",[SAL_RECS[0]]],["buildPaymentsSection",[S.recs[0]]],
      ["buildDamSubReceipt",[DAM_RECS[0],Object.values(DAM_RECS[0].subRecs)[0]]],
      ["buildDamAllSubsReceipt",[DAM_RECS[0]]],
    ];
    builders.forEach(([n,a])=>{
      try{const v=window[n].apply(null,a);
        if(typeof v==="string"&&RE.test(v))bad.push({where:"builder:"+n,
          sample:v.match(new RegExp("&lt;\\s*\\w[^;]{0,70}"))[0]});}catch(e){}
    });

    // ② every rendered DOM surface
    Object.keys(window).filter(k=>/^(render|_render)/.test(k)&&typeof window[k]==="function")
      .forEach(k=>{try{window[k]();}catch(e){}});
    try{openPartialPay("B1","buy");}catch(e){}
    try{_naqlPayId="B1";_naqlPayType="buy";openNaqlPay("B1","buy",null);}catch(e){}
    try{renderTrash();}catch(e){}
    try{const i=document.getElementById("toolsSearchInp");if(i)i.value="شاكر";toolsGlobalSearch();}catch(e){}

    document.querySelectorAll("[id]").forEach(el=>{
      if(el.children.length>800)return;
      const t=el.innerText||"";
      const m=t.match(/<\s*(img|span|div|b|strong|i|br|table|td|tr|button|a)\b[^>]{0,60}/i);
      if(m)bad.push({where:"dom#"+el.id,sample:m[0].slice(0,80)});
    });
    // de-dup by sample
    const seen=new Set(),uniq=[];
    bad.forEach(x=>{const k=x.where+"|"+x.sample;if(!seen.has(k)){seen.add(k);uniq.push(x);}});
    return uniq;
  });

  console.log(out.length?"VISIBLE-MARKUP ARTIFACTS FOUND:":"no over-escaping artifacts found");
  out.slice(0,25).forEach(x=>console.log("  "+x.where+"  ::  "+x.sample));
  console.log("\npage errors: "+(errs.length?errs.slice(0,3).join(" | "):"(none)"));
  await b.close();
})();
