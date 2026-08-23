const {chromium}=require("playwright");
const A=[];const ok=(n,c,x)=>A.push((c?"PASS":"FAIL")+"  "+n+(c?"":"   <-- "+JSON.stringify(x).slice(0,500)));
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2300);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();window.confirm=()=>true;});
  await p.waitForTimeout(300);

  const seed=()=>p.evaluate(()=>{
    const N="حيدر الجبوري";
    S.recs=[{id:"GB1",seq:1,dk:"2026-08-01",status:"weighed",driver:N,plate:"11",wh:YARD,mat:"jet",
             final:100000,net:5000,payments:[],paid:false,
             nOn:true,transporter:N,nC:1,nUP:20000,naqlFee:20000,naqlPayments:[]}];
    SELL_RECS=[{id:"GS1",seq:1,dk:"2026-08-03",status:"weighed",driver:N,plate:"22",dest:"بغداد",
                final:60000,payments:[],paid:false}];
    DAM_RECS=[{id:"GD1",seq:1,dk:"2026-08-05",damin:"ضامن",madmun:N,price:40000,payments:[],paid:false}];
    SRF_RECS=[{id:"GR1",seq:1,dk:"2026-08-07",recv:N,purp:"وقود",amount:30000,payments:[],paid:false}];
    WRK_RECS=[{id:"GW1",seq:1,dk:"2026-08-09",provider:N,service:"لحام",amount:25000,payments:[],paid:false}];
    MNL_RECS=[{id:"GM1",seq:1,dk:"2026-08-11",transporter:N,farmer:"فلاح",plate:"33",
               naqlFee:15000,naqlPayments:[]}];
    // excluded sections — must stay untouched
    EMP_LIST=[{id:"GE1",name:N,role:"سائق",salary:500000}];
    ADV_RECS=[{id:"GV1",seq:1,dk:"2026-08-02",empName:N,amount:70000,payments:[],paid:false}];
    EMP_TXNS=[{id:"GT1",seq:1,dk:"2026-08-04",empName:N,type:"bonus",amount:9000,payments:[]}];
    document.getElementById("toolsSearchInp").value=N;
    document.getElementById("toolsSrchFrom").value="";
    document.getElementById("toolsSrchTo").value="";
    toolsGlobalSearch();
    return N;
  });

  await seed();
  const pre=await p.evaluate(()=>{
    const {items}=_globalPayItems();
    return {n:items.length, keys:items.map(i=>i.k), dks:items.map(i=>i.dk),
      rem:items.reduce((s,i)=>s+i.rem,0),
      preview:document.getElementById("gPayPreview").innerText};
  });
  // expected payable: buy 100k, sell 60k, dam 40k, srf 30k, wrk 25k, naql(buy 20k)+naql(mnl 15k) = 290k
  ok("finds payable items across sections", pre.n===7, pre);
  ok("total remaining = 290,000", pre.rem===290000, pre);
  ok("excludes emp/adv/etx", !pre.keys.includes("emp")&&!pre.keys.includes("adv")&&!pre.keys.includes("etx"), pre.keys);
  ok("includes naql fees", pre.keys.filter(k=>k==="naql").length===2, pre.keys);
  ok("mnl not double-counted", !pre.keys.includes("mnl"), pre.keys);
  ok("sorted oldest first", pre.dks.join()===[...pre.dks].sort().join(), pre.dks);
  ok("preview shows section chips", pre.preview.includes("وصولات الشراء")&&pre.preview.includes("أجور النقل"), pre.preview.slice(0,300));

  // ═══ partial pay: 175,000 -> buy100k + naqlBuy20k? order by date ═══
  const run=await p.evaluate(()=>{
    setPayAmt("gPayAmount",175000);
    execGlobalPay();
    const naqlBuy=getNaqlPaidTotal(getNaqlEntries(S.recs[0])[0]);
    return {
      buy:getPaidTotal(S.recs[0]), buyRecIntact:S.recs[0].final===100000&&S.recs[0].net===5000,
      naqlBuy,
      sell:getPaidTotal(SELL_RECS[0]),
      dam:getPaidTotal(DAM_RECS[0]),
      srf:getPaidTotal(SRF_RECS[0]),
      wrk:getPaidTotal(WRK_RECS[0]),
      mnlNaql:getNaqlPaidTotal_mnl(MNL_RECS[0]),
      advUntouched:(ADV_RECS[0].payments||[]).length===0,
      empUntouched:EMP_LIST[0].payments===undefined,
      etxUntouched:(EMP_TXNS[0].payments||[]).length===0,
      buyPayTag:(S.recs[0].payments.slice(-1)[0]||{}).by,
      buyNaqlNotInPayments:S.recs[0].payments.length===1,
      result:document.getElementById("gPayResult").innerText};
  });
  // date order: buy(08-01)+naqlBuy(08-01) 120k, sell(08-03) 60k -> 175k covers buy100k, naql20k, sell55k
  ok("buy paid in full first", run.buy===100000, run);
  ok("buy receipt NOT corrupted by naql payment", run.buyRecIntact, run);
  ok("buy transport fee paid separately", run.naqlBuy===20000, run);
  ok("naql money did NOT land in receipt payments", run.buyNaqlNotInPayments, run);
  ok("sell got the remaining 55k", run.sell===55000, run);
  ok("later sections untouched", run.dam===0&&run.srf===0&&run.wrk===0&&run.mnlNaql===0, run);
  ok("advances untouched", run.advUntouched, run);
  ok("employees untouched", run.empUntouched, run);
  ok("emp transactions untouched", run.etxUntouched, run);
  ok("payment tagged 'دفع شامل'", (run.buyPayTag||"").includes("دفع شامل"), run.buyPayTag);

  // ═══ pay the rest via "كامل المتبقي" ═══
  const rest=await p.evaluate(()=>{
    gPayFillAll();
    const filled=payAmt("gPayAmount");
    execGlobalPay();
    const {items}=_globalPayItems();
    return {filled, leftItems:items.length,
      dam:getPaidTotal(DAM_RECS[0]),srf:getPaidTotal(SRF_RECS[0]),
      wrk:getPaidTotal(WRK_RECS[0]),mnl:getNaqlPaidTotal_mnl(MNL_RECS[0]),
      sell:getPaidTotal(SELL_RECS[0])};
  });
  ok("fill-all set the exact remaining (115k)", rest.filled===115000, rest);
  ok("everything settled after second run", rest.leftItems===0, rest);
  ok("all sections fully paid", rest.dam===40000&&rest.srf===30000&&rest.wrk===25000&&rest.mnl===15000&&rest.sell===60000, rest);

  // ═══ date range must be respected ═══
  const ranged=await p.evaluate(()=>{
    // reset
    SRF_RECS=[{id:"R1",seq:1,dk:"2026-08-01",recv:"سعد",purp:"a",amount:10000,payments:[],paid:false},
              {id:"R2",seq:2,dk:"2026-09-01",recv:"سعد",purp:"b",amount:10000,payments:[],paid:false}];
    S.recs=[];SELL_RECS=[];DAM_RECS=[];WRK_RECS=[];MNL_RECS=[];
    document.getElementById("toolsSearchInp").value="سعد";
    document.getElementById("toolsSrchFrom").value="2026-08-01";
    document.getElementById("toolsSrchTo").value="2026-08-31";
    toolsGlobalSearch();
    const {items}=_globalPayItems();
    setPayAmt("gPayAmount",20000);
    execGlobalPay();
    return {scoped:items.length,
      R1:getPaidTotal(SRF_RECS.find(r=>r.id==="R1")),
      R2:getPaidTotal(SRF_RECS.find(r=>r.id==="R2"))};
  });
  ok("date range limits the payable set", ranged.scoped===1, ranged);
  ok("in-range record paid", ranged.R1===10000, ranged);
  ok("out-of-range record NOT paid", ranged.R2===0, ranged);

  console.log(A.join("\n"));
  console.log("\npage errors: "+(errs.length?errs.join(" | "):"(none)"));
  console.log(A.some(x=>x.startsWith("FAIL"))?"\n*** FAILURES ***":"\nALL PASSED");
  await b.close();
})();
