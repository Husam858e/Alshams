const {chromium}=require("playwright");
const A=[];const ok=(n,c,x)=>A.push((c?"PASS":"FAIL")+"  "+n+(c?"":"   <-- "+JSON.stringify(x)));
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const ctx=await b.newContext({timezoneId:"Asia/Baghdad"});
  const p=await ctx.newPage();
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2300);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});

  const r=await p.evaluate(()=>{
    const out={};
    // ── calcFees: كل مكوّن يُطرح مرة واحدة ──
    // صافي 6000 كغم × 535 = 3,210,000 ؛ كبس 2×1000=2000 ؛ نقل 45000 ؛ وصل 3000
    const c=calcFees(9000,3000,535, true,2,1000, true,[{nC:1,nUP:45000,naqlFee:45000}], true,3000, true);
    out.net=c.net; out.wFee=c.wFee; out.kabsFee=c.kabsFee; out.naqlFee=c.naqlFee; out.waslFee=c.waslFee;
    out.final=c.final;
    out.expected=c.wFee-c.kabsFee-c.naqlFee-c.waslFee;
    // نقل غير مخصوم
    const c2=calcFees(9000,3000,535,true,2,1000,true,[{nC:1,nUP:45000,naqlFee:45000}],true,3000,false);
    out.finalNoDeduct=c2.final;
    out.expectedNoDeduct=c2.wFee-c2.kabsFee-c2.waslFee;
    // تعدّد الناقلين يُجمع
    const c3=calcFees(9000,3000,535,false,0,0,true,
      [{nC:1,nUP:45000,naqlFee:45000},{nC:2,nUP:10000,naqlFee:20000}],false,0,true);
    out.multiNaql=c3.naqlFee;

    // ── التقريب: مبالغ كسرية لا تتسرّب إلى المجاميع ──
    const recs=[{id:"a",final:333.333,payments:[],paid:false},
                {id:"b",final:333.333,payments:[],paid:false},
                {id:"c",final:333.334,payments:[],paid:false}];
    out.sumFloat=recs.reduce((s,x)=>s+x.final,0);

    // ── الدفع الجزئي لا ينتج متبقياً سالباً ولا يتجاوز الإجمالي ──
    S.recs=[{id:"P1",seq:1,dk:toDay(),status:"weighed",driver:"د",plate:"1",
             final:1000,payments:[],paid:false}];
    _ppId="P1";_ppType="buy";
    applyPayment(400,""); applyPayment(400,""); applyPayment(400,"");   // الثالثة تُقصّ إلى 200
    const rec=S.recs.find(x=>x.id==="P1");
    out.paidTotal=getPaidTotal(rec);
    out.remaining=getRemaining(rec);
    out.payCount=rec.payments.length;
    out.lastPay=rec.payments[rec.payments.length-1].amount;
    out.fully=isFullyPaid(rec);

    // ── حذف دفعة يعيد الحالة بدقّة ──
    removePayment("P1","buy",0);
    const rec2=S.recs.find(x=>x.id==="P1");
    out.afterRemovePaid=getPaidTotal(rec2);
    out.afterRemoveFully=isFullyPaid(rec2);
    return out;
  });

  ok("net = gross - empty", r.net===6000, r);
  ok("weight fee = net × price", r.wFee===6000*535, r);
  ok("final = wFee - kabs - naql - wasl", r.final===r.expected, r);
  ok("transport not deducted when nDeduct=false", r.finalNoDeduct===r.expectedNoDeduct, r);
  ok("multiple transporters summed", r.multiNaql===65000, r);
  ok("partial payments capped at total", r.paidTotal===1000, r);
  ok("third payment clamped to 200", r.lastPay===200, r);
  ok("no negative remaining", r.remaining===0, r);
  ok("marked fully paid", r.fully===true, r);
  ok("removing a payment recomputes exactly", r.afterRemovePaid===600&&r.afterRemoveFully===false, r);

  console.log(A.join("\n"));
  console.log("\npage errors: "+(errs.length?errs.join(" | "):"(none)"));
  console.log(A.some(x=>x.startsWith("FAIL"))?"\n*** FAILURES ***":"\nALL PASSED");
  await b.close();
})();
