const {chromium}=require("playwright");
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[];
  p.on("pageerror",e=>errs.push({t:"pageerror",m:e.message}));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2300);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();window.confirm=()=>false;window.alert=()=>{};});
  await p.waitForTimeout(300);

  // seed realistic data so renderers have something to chew on
  await p.evaluate(()=>{
    const D=toDay();
    const pay=[{amount:50000,at:"2026-08-20 10:00",by:"حسام عايد",note:"دفعة"}];
    const mk=o=>Object.assign({dk:D,seq:1,gross:9000,empty:3000,net:6000,ppkg:535,
      final:600000,price:100000,amount:50000,salary:500000,finalNet:400000,
      naqlFee:45000,trans:30000,kC:2,kP:1000,nC:1,nUP:45000,wPrice:3000,kabs:2,
      payments:pay,naqlPayments:pay,paid:false,status:"weighed",month:"2026-08",
      driver:"شاكر شطب",plate:"22 أ 111",note:"ملاحظة",transporter:"حارث كريم",
      receiver:"أبو زينب",dest:"بغداد",damin:"ضامن",madmun:"مضمون",recv:"مستفيد",
      purp:"وقود",provider:"ورشة",service:"لحام",farmer:"فلاح",empName:"عامل",
      role:"سائق",name:"عامل",desc:"وصف",kType:"سيم",createdBy:"حسام عايد",
      createdAt:"2026-08-20 10:00",wh:YARD,mat:"jet",nOn:true,kOn:true,wOn:true,
      payType:"monthly",type:"bonus"},o);
    S.recs=[mk({id:"B1"}),mk({id:"B2",status:"waiting",final:null}),mk({id:"B3",status:"confirmed",final:null})];
    SELL_RECS=[mk({id:"S1"}),mk({id:"S2",status:"waiting",final:null})];
    DAM_RECS=[mk({id:"D1",subRecs:{a:mk({id:"SB1"})}})];
    SRF_RECS=[mk({id:"R1"})];WRK_RECS=[mk({id:"W1"})];MNL_RECS=[mk({id:"M1"})];
    ARB_RECS=[mk({id:"A1"})];EMP_LIST=[mk({id:"E1"})];SAL_RECS=[mk({id:"L1"})];
    ADV_RECS=[mk({id:"V1"})];EMP_TXNS=[mk({id:"T1"})];
  });

  // ── 1) visit every tab ──
  const tabs=await p.$$eval(".tbb",els=>els.map(e=>e.getAttribute("onclick")||""));
  let visited=0;
  for(const oc of tabs){
    const m=oc.match(/sT\('([^']+)'/); if(!m)continue;
    const before=errs.length;
    await p.evaluate(id=>{
      const btn=[...document.querySelectorAll(".tbb")].find(x=>(x.getAttribute("onclick")||"").includes("'"+id+"'"));
      if(btn)btn.click();
    },m[1]);
    await p.waitForTimeout(60);
    visited++;
    if(errs.length>before) errs[errs.length-1].tab=m[1];
  }
  console.log("tabs visited: "+visited);

  // ── 2) click every in-page button that isn't destructive/navigational ──
  const SKIP=/doLogout|toolsRestore|clearTrash|confirmDel|execBulkPay|execGlobalPay|execNaqlBulkPay|toggleFullscreen|_aiSend|doPrint|doShareXL|doMakePDF|dlRec|_doSaveHTML|toolsBackup|toolsExportXL|window\.open|location/;
  const res=await p.evaluate(async(skipSrc)=>{
    const SKIP=new RegExp(skipSrc);
    const out=[];
    const btns=[...document.querySelectorAll("button")];
    for(const btn of btns){
      const oc=btn.getAttribute("onclick")||"";
      if(!oc||SKIP.test(oc))continue;
      try{ new Function(oc).call(btn); }
      catch(e){ out.push({onclick:oc.slice(0,90),err:String(e.message).slice(0,110)}); }
    }
    return out;
  }, SKIP.source);

  console.log("buttons invoked, throwing: "+res.length);
  const seen=new Set();
  res.forEach(r=>{const k=r.err;if(seen.has(k))return;seen.add(k);
    console.log("  ✗ "+r.err+"\n      via: "+r.onclick);});

  console.log("\npage errors during crawl: "+errs.length);
  const es=new Set();
  errs.forEach(e=>{if(es.has(e.m))return;es.add(e.m);
    console.log("  ! "+e.m.slice(0,140)+(e.tab?"   [tab: "+e.tab+"]":""));});
  await b.close();
})();
