const {chromium}=require("playwright");
const A=[];const ok=(n,c,extra)=>A.push((c?"PASS":"FAIL")+"  "+n+(c?"":"   <-- "+JSON.stringify(extra)));
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[];
  p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2500);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  await p.waitForTimeout(500);

  // ── seed a buy record whose driver name is an XSS payload ──
  const res=await p.evaluate(()=>{
    const o={};
    const XSS='<img src=x onerror="window.__pwned=1">';
    const rec={id:"TESTREC1",seq:Date.now(),dk:toDay(),status:"weighed",
      driver:XSS, plate:'A"><b>7</b>', wh:YARD, mat:"jet",
      gross:10000,empty:4000,net:6000,ppkg:100,final:600000,
      payments:[],paid:false,note:"ملاحظة & <script>"};
    S.recs=[rec];
    renderRecs();
    o.listHTML=document.getElementById("RL")?.innerHTML||document.body.innerHTML;
    o.pwned=!!window.__pwned;
    o.hasLiveImg=!!document.querySelector('#RL img[onerror]');
    // receipt path
    o.receipt=buildReceipt(rec);
    // partial-pay modal path (this was the unescaped line 10305)
    openPartialPay("TESTREC1","buy");
    o.modalHTML=document.getElementById("mPartialPay").innerHTML;
    o.modalPwned=!!window.__pwned;
    closeM();
    return o;
  });
  ok("driver XSS not executed in list", res.pwned===false, res.pwned);
  ok("no live <img onerror> injected into list", res.hasLiveImg===false);
  ok("payload appears escaped in list", res.listHTML.includes("&lt;img")||!res.listHTML.includes("<img src=x"));
  ok("partial-pay modal did not execute payload", res.modalPwned===false);
  ok("receipt escapes payload", !res.receipt.includes('<img src=x onerror='));

  // ── payment flows ──
  const pay=await p.evaluate(()=>{
    const o={};
    _ppId="TESTREC1";_ppType="buy";
    applyPayment(200000,"دفعة ١");
    o.after1=getPaidTotal(getPayRec());
    applyPayment(999999999,"دفعة زائدة");      // must clamp to remaining
    o.after2=getPaidTotal(getPayRec());
    o.total=getRecTotal(getPayRec());
    o.fully=isFullyPaid(getPayRec());
    o.remaining=getRemaining(getPayRec());
    return o;
  });
  ok("first payment recorded", pay.after1===200000, pay);
  ok("overpay clamped to total", pay.after2===pay.total, pay);
  ok("no negative remaining", pay.remaining===0, pay);
  ok("marked fully paid", pay.fully===true, pay);

  // ── naql overpay guard (the newly added clamp) ──
  const naql=await p.evaluate(()=>{
    const o={};
    const rec={id:"TESTNAQL",seq:Date.now(),dk:toDay(),status:"weighed",
      driver:"فلاح",plate:"77",wh:YARD,mat:"jet",final:100000,
      nOn:true,transporter:"ناقل",nC:2,nUP:25000,naqlFee:50000,naqlPayments:[]};
    S.recs=[rec];
    _naqlPayId="TESTNAQL";_naqlPayType="buy";_naqlPayDamId=null;
    _applyNaqlPayment(30000,"");
    o.after1=getNaqlPaidTotal(_getNaqlRec());
    _applyNaqlPayment(500000,"");            // must clamp to 20000 remaining
    o.after2=getNaqlPaidTotal(_getNaqlRec());
    o.fee=50000;
    o.rem=getNaqlRemaining(_getNaqlRec());
    return o;
  });
  ok("naql first payment", naql.after1===30000, naql);
  ok("naql overpay clamped to fee", naql.after2===50000, naql);
  ok("naql remaining not negative", naql.rem===0, naql);

  // ── restore: replace must actually delete ──
  const rest=await p.evaluate(()=>{
    const o={};
    S.recs=[{id:"KEEP",dk:toDay(),driver:"a",final:1},
            {id:"STALE",dk:toDay(),driver:"b",final:1}];
    _restorePayload={data:{buy:[{id:"KEEP",dk:toDay(),driver:"a",final:1},
                                {id:"NEW",dk:toDay(),driver:"c",final:1}]}};
    window.confirm=()=>true;
    toolsRestore("replace");
    o.ids=S.recs.map(r=>r.id).sort();
    o.trashHasStale=TRASH.some(t=>t.rec&&t.rec.id==="STALE");
    return o;
  });
  ok("replace deleted record absent from file", !rest.ids.includes("STALE"), rest);
  ok("replace kept + added file records", rest.ids.includes("KEEP")&&rest.ids.includes("NEW"), rest);
  ok("deleted record recoverable from trash", rest.trashHasStale===true, rest);

  // ── merge must NOT delete ──
  const mg=await p.evaluate(()=>{
    S.recs=[{id:"KEEP",dk:toDay(),driver:"a",final:1},{id:"STALE",dk:toDay(),driver:"b",final:1}];
    _restorePayload={data:{buy:[{id:"NEW2",dk:toDay(),driver:"c",final:1}]}};
    toolsRestore("merge");
    return S.recs.map(r=>r.id).sort();
  });
  ok("merge preserves existing records", mg.includes("STALE")&&mg.includes("KEEP")&&mg.includes("NEW2"), mg);

  // ── login lockout ──
  const lock=await p.evaluate(()=>{
    localStorage.removeItem("wShamsLoginLock");
    S.cu=null;S.su=USERS[0];
    for(let i=0;i<5;i++){S.pin="0000";doLogin();}
    const left=_lockLeft();
    S.pin="2004";doLogin();                 // correct PIN, but locked out
    return {left, loggedInWhileLocked: !!S.cu};
  });
  ok("lockout engages after 5 wrong PINs", lock.left>0, lock);
  ok("correct PIN rejected while locked", lock.loggedInWhileLocked===false, lock);

  console.log(A.join("\n"));
  console.log("\npage errors during run: "+(errs.length?errs.join(" | "):"(none)"));
  console.log(A.some(x=>x.startsWith("FAIL"))?"\n*** SOME CHECKS FAILED ***":"\nALL CHECKS PASSED");
  await b.close();
})();
