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

  const dom=await p.evaluate(()=>({
    tab:!!document.getElementById("tc-sell-bulkpay"),
    inAS:!!document.getElementById("AS")?.contains(document.getElementById("tc-sell-bulkpay")),
    btn:[...document.querySelectorAll(".tbb")].some(x=>(x.getAttribute("onclick")||"").includes("sell-bulkpay")),
  }));
  ok("sell bulk-pay tab exists & inside #AS", dom.tab&&dom.inAS, dom);
  ok("sell tab button registered", dom.btn, dom);

  // ── distribution, oldest first, partial carry, skip unweighed ──
  const r1=await p.evaluate(()=>{
    SELL_RECS=[
      {id:"V3",seq:3,dk:"2026-08-10",status:"weighed",driver:"كريم الساعدي",plate:"33",dest:"بغداد",final:100000,payments:[],paid:false},
      {id:"V1",seq:1,dk:"2026-08-01",status:"weighed",driver:"كريم الساعدي",plate:"11",dest:"البصرة",final:200000,payments:[],paid:false},
      {id:"V2",seq:2,dk:"2026-08-05",status:"weighed",driver:"كريم الساعدي",plate:"22",dest:"أربيل",final:50000,payments:[{amount:20000,at:"x",by:"y"}],paid:false},
      {id:"VW",seq:4,dk:"2026-08-02",status:"waiting",driver:"كريم الساعدي",plate:"99",final:null,payments:[],paid:false},
      {id:"VX",seq:5,dk:"2026-08-03",status:"weighed",driver:"شخص آخر",plate:"88",final:999999,payments:[],paid:false},
    ];
    document.getElementById("sellBulkPayName").value="كريم الساعدي";
    bulkPaySearch("sell");
    const preview=document.getElementById("sellBulkPayPreview").innerText;
    setPayAmt("sellBulkPayAmount",250000);   // 200k(V1) + 30k(V2) + 20k(V3)
    execBulkPay("sell");
    const g=id=>SELL_RECS.find(r=>r.id===id);
    return {preview,
      V1:{paid:getPaidTotal(g("V1")),full:isFullyPaid(g("V1"))},
      V2:{paid:getPaidTotal(g("V2")),full:isFullyPaid(g("V2"))},
      V3:{paid:getPaidTotal(g("V3")),full:isFullyPaid(g("V3"))},
      VW:getPaidTotal(g("VW")), VX:getPaidTotal(g("VX")),
      tag:g("V1").payments.slice(-1)[0].by,
      label:g("V1")&&document.getElementById("sellBulkPayResult").innerText};
  });
  ok("sell oldest paid first & fully", r1.V1.paid===200000&&r1.V1.full, r1);
  ok("sell partial record tops up to full", r1.V2.paid===50000&&r1.V2.full, r1);
  ok("sell last gets leftover as partial", r1.V3.paid===20000&&!r1.V3.full, r1);
  ok("sell skips unweighed receipts", r1.VW===0, r1);
  ok("sell other person untouched", r1.VX===0, r1);
  ok("sell payment tagged", r1.tag.includes("دفع جامع بيع"), r1.tag);
  ok("sell row label shows plate + dest", r1.preview.includes("البصرة")&&r1.preview.includes("11"), r1.preview.slice(0,300));

  // ── matches by receiver too (app convention) ──
  const r2=await p.evaluate(()=>{
    SELL_RECS=[
      {id:"R1",seq:1,dk:"2026-08-01",status:"weighed",driver:"سائق",receiver:"أبو زينب",plate:"55",final:80000,payments:[],paid:false},
    ];
    document.getElementById("sellBulkPayName").value="أبو زينب";
    bulkPaySearch("sell");
    const n=_getBulkPayRecs("أبو زينب","sell").length;
    setPayAmt("sellBulkPayAmount",80000);
    execBulkPay("sell");
    return {n,paid:getPaidTotal(SELL_RECS[0])};
  });
  ok("sell found by receiver name", r2.n===1, r2);
  ok("sell paid when matched by receiver", r2.paid===80000, r2);

  // ── no overpay ──
  const r3=await p.evaluate(()=>{
    SELL_RECS=[{id:"O1",seq:1,dk:"2026-08-01",status:"weighed",driver:"زيد",plate:"1",final:50000,payments:[],paid:false}];
    document.getElementById("sellBulkPayName").value="زيد";
    bulkPaySearch("sell");
    setPayAmt("sellBulkPayAmount",900000);
    execBulkPay("sell");
    return {paid:getPaidTotal(SELL_RECS[0]),
      res:document.getElementById("sellBulkPayResult").innerText};
  });
  ok("sell never overpays", r3.paid===50000, r3);
  ok("sell reports unused leftover", r3.res.includes("لم يُستعمل"), r3.res.slice(0,200));

  // ── other sections still fine (regression on the shared engine) ──
  const reg=await p.evaluate(()=>{
    S.recs=[{id:"B1",seq:1,dk:"2026-08-02",status:"weighed",driver:"علاء",plate:"11",final:300000,payments:[],paid:false},
            {id:"B0",seq:0,dk:"2026-08-01",status:"waiting",driver:"علاء",plate:"00",final:999,payments:[],paid:false}];
    document.getElementById("bulkPayName").value="علاء";
    bulkPaySearch(); setPayAmt("bulkPayAmount",300000); execBulkPay();
    SRF_RECS=[{id:"S1",seq:1,dk:"2026-08-01",recv:"سعد",purp:"a",amount:10000,payments:[],paid:false}];
    document.getElementById("srfBulkPayName").value="سعد";
    bulkPaySearch("srf"); setPayAmt("srfBulkPayAmount",10000); execBulkPay("srf");
    WRK_RECS=[{id:"W1",seq:1,dk:"2026-08-01",provider:"ورشة",service:"a",amount:20000,payments:[],paid:false}];
    document.getElementById("wrkBulkPayName").value="ورشة";
    bulkPaySearch("wrk"); setPayAmt("wrkBulkPayAmount",20000); execBulkPay("wrk");
    return {buy:getPaidTotal(S.recs.find(r=>r.id==="B1")),
            buy0:getPaidTotal(S.recs.find(r=>r.id==="B0")),
            srf:getPaidTotal(SRF_RECS[0]), wrk:getPaidTotal(WRK_RECS[0])};
  });
  ok("buy/srf/wrk unaffected by the change", reg.buy===300000&&reg.buy0===0&&reg.srf===10000&&reg.wrk===20000, reg);

  console.log(A.join("\n"));
  console.log("\npage errors: "+(errs.length?errs.join(" | "):"(none)"));
  console.log(A.some(x=>x.startsWith("FAIL"))?"\n*** FAILURES ***":"\nALL PASSED");
  await b.close();
})();
