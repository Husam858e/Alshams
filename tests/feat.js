const {chromium}=require("playwright");
const A=[];const ok=(n,c,x)=>A.push((c?"PASS":"FAIL")+"  "+n+(c?"":"   <-- "+JSON.stringify(x).slice(0,400)));
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2300);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  await p.waitForTimeout(300);

  // ═══ tabs exist and are inside #AS ═══
  const dom=await p.evaluate(()=>({
    srfTab:!!document.getElementById("tc-srf-bulkpay"),
    wrkTab:!!document.getElementById("tc-wrk-bulkpay"),
    srfInAS:!!document.getElementById("AS")?.contains(document.getElementById("tc-srf-bulkpay")),
    wrkInAS:!!document.getElementById("AS")?.contains(document.getElementById("tc-wrk-bulkpay")),
    gPayInAS:!!document.getElementById("AS")?.contains(document.getElementById("gPayAmount")),
    srfBtn:[...document.querySelectorAll(".tbb")].some(x=>(x.getAttribute("onclick")||"").includes("srf-bulkpay")),
    wrkBtn:[...document.querySelectorAll(".tbb")].some(x=>(x.getAttribute("onclick")||"").includes("wrk-bulkpay")),
  }));
  ok("srf bulk-pay tab exists & inside #AS", dom.srfTab&&dom.srfInAS, dom);
  ok("wrk bulk-pay tab exists & inside #AS", dom.wrkTab&&dom.wrkInAS, dom);
  ok("global-pay panel inside #AS", dom.gPayInAS, dom);
  ok("tab buttons registered", dom.srfBtn&&dom.wrkBtn, dom);

  // ═══ A) srf bulk pay ═══
  const srf=await p.evaluate(()=>{
    SRF_RECS=[
      {id:"S3",seq:3,dk:"2026-08-10",recv:"أبو محمد",purp:"وقود",amount:100000,payments:[],paid:false},
      {id:"S1",seq:1,dk:"2026-08-01",recv:"أبو محمد",purp:"إطارات",amount:200000,payments:[],paid:false},
      {id:"S2",seq:2,dk:"2026-08-05",recv:"أبو محمد",purp:"زيت",amount:50000,payments:[{amount:20000,at:"x",by:"y"}],paid:false},
      {id:"SX",seq:4,dk:"2026-08-02",recv:"شخص آخر",purp:"غير",amount:999999,payments:[],paid:false},
    ];
    document.getElementById("srfBulkPayName").value="أبو محمد";
    bulkPaySearch("srf");
    const preview=document.getElementById("srfBulkPayPreview").innerText;
    setPayAmt("srfBulkPayAmount",250000);   // 200000 (S1) + 30000 (S2) + 20000 (S3)
    execBulkPay("srf");
    const g=id=>SRF_RECS.find(r=>r.id===id);
    return {preview,
      S1:{paid:getPaidTotal(g("S1")),full:isFullyPaid(g("S1"))},
      S2:{paid:getPaidTotal(g("S2")),full:isFullyPaid(g("S2"))},
      S3:{paid:getPaidTotal(g("S3")),full:isFullyPaid(g("S3"))},
      SX:{paid:getPaidTotal(g("SX"))},
      byTag:g("S1").payments.slice(-1)[0].by};
  });
  ok("srf preview lists only matching person", srf.preview.includes("إطارات")&&!srf.preview.includes("غير"), srf.preview);
  ok("srf oldest paid first & fully", srf.S1.paid===200000&&srf.S1.full, srf);
  ok("srf second gets its remaining 30k", srf.S2.paid===50000&&srf.S2.full, srf);
  ok("srf third gets leftover 20k partial", srf.S3.paid===20000&&!srf.S3.full, srf);
  ok("srf other person untouched", srf.SX.paid===0, srf);
  ok("srf payment tagged", srf.byTag.includes("دفع جامع صرفيات"), srf.byTag);

  // ═══ A2) wrk bulk pay ═══
  const wrk=await p.evaluate(()=>{
    WRK_RECS=[
      {id:"W2",seq:2,dk:"2026-08-09",provider:"ورشة الأمين",service:"لحام",amount:80000,payments:[],paid:false},
      {id:"W1",seq:1,dk:"2026-08-03",provider:"ورشة الأمين",service:"صيانة",amount:120000,payments:[],paid:false},
    ];
    document.getElementById("wrkBulkPayName").value="ورشة الأمين";
    bulkPaySearch("wrk");
    setPayAmt("wrkBulkPayAmount",500000);   // more than owed -> leftover reported
    execBulkPay("wrk");
    const g=id=>WRK_RECS.find(r=>r.id===id);
    return {W1:getPaidTotal(g("W1")),W2:getPaidTotal(g("W2")),
      over:g("W1").payments.reduce((s,x)=>s+x.amount,0)+g("W2").payments.reduce((s,x)=>s+x.amount,0),
      result:document.getElementById("wrkBulkPayResult").innerText};
  });
  ok("wrk both paid in full", wrk.W1===120000&&wrk.W2===80000, wrk);
  ok("wrk never overpays (total = 200k not 500k)", wrk.over===200000, wrk);
  ok("wrk reports unused leftover", wrk.result.includes("لم يُستعمل"), wrk.result.slice(0,300));

  // ═══ A3) buy regression ═══
  const buy=await p.evaluate(()=>{
    S.recs=[
      {id:"B2",seq:2,dk:"2026-08-08",status:"weighed",driver:"علاء حسين",plate:"22",final:100000,payments:[],paid:false},
      {id:"B1",seq:1,dk:"2026-08-02",status:"weighed",driver:"علاء حسين",plate:"11",final:300000,payments:[],paid:false},
      {id:"B0",seq:0,dk:"2026-08-01",status:"waiting",driver:"علاء حسين",plate:"00",final:999,payments:[],paid:false},
    ];
    document.getElementById("bulkPayName").value="علاء حسين";
    bulkPaySearch();
    setPayAmt("bulkPayAmount",350000);
    execBulkPay();
    const g=id=>S.recs.find(r=>r.id===id);
    return {B1:getPaidTotal(g("B1")),B2:getPaidTotal(g("B2")),B0:getPaidTotal(g("B0")),
      by:g("B1").payments.slice(-1)[0].by};
  });
  ok("buy still oldest-first (regression)", buy.B1===300000&&buy.B2===50000, buy);
  ok("buy still skips non-weighed (regression)", buy.B0===0, buy);
  ok("buy tag unchanged (regression)", buy.by.includes("(دفع جامع)"), buy.by);

  console.log(A.join("\n"));
  console.log("\npage errors: "+(errs.length?errs.join(" | "):"(none)"));
  console.log(A.some(x=>x.startsWith("FAIL"))?"\n*** FAILURES ***":"\nALL PASSED");
  await b.close();
})();
