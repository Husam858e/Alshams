const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();

  // ═══ الدفع الجزئي في كل قسم يحترم نفس الثوابت ═══
  const secs=await p.evaluate(()=>{
    const D=toDay();
    const base={seq:1,dk:D,payments:[],paid:false};
    S.recs   =[{...base,id:"X",status:"weighed",driver:"a",plate:"1",final:1000}];
    SELL_RECS=[{...base,id:"X",status:"weighed",driver:"a",plate:"1",final:1000}];
    DAM_RECS =[{...base,id:"X",damin:"a",madmun:"b",price:1000}];
    SRF_RECS =[{...base,id:"X",recv:"a",purp:"b",amount:1000}];
    WRK_RECS =[{...base,id:"X",provider:"a",service:"b",amount:1000}];
    ADV_RECS =[{...base,id:"X",empName:"a",amount:1000}];
    const out={};
    ["buy","sell","dam","srf","wrk","adv"].forEach(t=>{
      _ppId="X";_ppType=t;
      const r0=getPayRec();
      applyPayment(300,"أولى");
      applyPayment(5000,"زائدة");        // يجب أن تُقصّ إلى 700
      const r=getPayRec();
      out[t]={total:getRecTotal(r),paid:getPaidTotal(r),rem:getRemaining(r),
              over:getOverpay(r),full:isFullyPaid(r),n:(r.payments||[]).length,
              last:(r.payments||[]).slice(-1)[0].amount};
    });
    return out;
  });
  ["buy","sell","dam","srf","wrk","adv"].forEach(t=>{
    const s=secs[t];
    R.ok(`الدفع [${t}]: لا يتجاوز الإجمالي`, s.paid===1000&&s.last===700, {t,...s});
    R.ok(`الدفع [${t}]: لا متبقٍّ ولا فائض`, s.rem===0&&s.over===0, {t,...s});
    R.ok(`الدفع [${t}]: يُعلَّم مسدَّداً`, s.full===true, {t,...s});
  });

  // ═══ دفع أجور النقل من مصادره الأربعة ═══
  const naql=await p.evaluate(()=>{
    const D=toDay();
    S.recs=[{id:"NB",seq:1,dk:D,status:"weighed",driver:"f",plate:"1",final:100,
             nOn:true,transporter:"ن",nC:1,nUP:10000,naqlFee:10000,naqlPayments:[],payments:[],paid:false}];
    SELL_RECS=[{id:"NS",seq:1,dk:D,status:"weighed",driver:"f",plate:"2",final:100,
             nOn:true,transporter:"ن",naqlFee:20000,naqlPayments:[],payments:[],paid:false}];
    DAM_RECS=[{id:"ND",seq:1,dk:D,damin:"a",madmun:"b",price:100,payments:[],paid:false,
             subRecs:{k:{id:"NSUB",dk:D,driver:"f",transporter:"ن",trans:30000,naqlPayments:[],amount:100}}}];
    MNL_RECS=[{id:"NM",seq:1,dk:D,transporter:"ن",farmer:"f",plate:"3",kabs:1,
             pricePerK:40000,naqlFee:40000,naqlPayments:[]}];
    const out={};
    const cases=[["buy","NB",null,10000],["sell","NS",null,20000],
                 ["dam-sub","NSUB","ND",30000]];
    cases.forEach(([type,id,damId,fee])=>{
      _naqlPayId=id;_naqlPayType=type;_naqlPayDamId=damId;
      _applyNaqlPayment(fee*10,"");        // مبلغ ضخم — يجب أن يُقصّ على الأجرة
      const r=_getNaqlRec();
      const isSub=type==="dam-sub";
      out[type]={fee, paid:isSub?getDamSubNaqlPaid(r):getNaqlPaidTotal(r)};
    });
    // النقل اليدوي له مساره الخاص openMnlPay/_applyMnlPayment
    _mnlPayId="NM"; _applyMnlPayment(400000,"");
    out["mnl"]={fee:40000, paid:getNaqlPaidTotal_mnl(MNL_RECS[0])};
    // الوصل الأصلي لم يتضرّر
    const b=S.recs[0];
    out.buyRecIntact = b.final===100 && (b.payments||[]).length===0;
    out.buyKeys=Object.keys(b).length;
    return out;
  });
  ["buy","sell","dam-sub","mnl"].forEach(t=>{
    R.ok(`أجور النقل [${t}]: تُقصّ على الأجرة`, naql[t].paid===naql[t].fee, {t,...naql[t]});
  });
  R.ok("دفع أجرة النقل لا يمسّ مبلغ وصل الفلاح", naql.buyRecIntact, naql);

  // ═══ فاحص سلامة البيانات ═══
  const h=await p.evaluate(()=>{
    const D=toDay();
    S.recs=[
      {id:"H1",seq:1,dk:"",status:"weighed",driver:"بلا تاريخ",plate:"1",final:100,payments:[],paid:false},
      {id:"H2",seq:2,dk:"2099-01-01",status:"weighed",driver:"مستقبلي",plate:"2",final:100,payments:[],paid:false},
      {id:"H3",seq:3,dk:"2020-01-01",status:"waiting",driver:"عالق",plate:"3",final:null,payments:[],paid:false},
      {id:"H3",seq:4,dk:D,status:"weighed",driver:"مكرر",plate:"4",final:100,payments:[],paid:false},
      {id:"H5",seq:5,dk:D,status:"weighed",driver:"زائد",plate:"5",final:100,
       payments:[{amount:900,at:"x",by:"y"}],paidTotal:900,paid:true},
    ];
    toolsHealthCheck();
    const txt=document.getElementById("toolsHealthRes").innerText;
    return {txt:txt.replace(/\s+/g," ").slice(0,2500), issues:(window._healthIssues||[]).length};
  });
  R.ok("الفاحص يجد التاريخ الناقص", /تاريخ/.test(h.txt), h);
  R.ok("الفاحص يجد المعرّف المكرر", /مكرر|مكرّر/.test(h.txt), h);
  R.ok("الفاحص يجد الدفع الزائد", /زائد/.test(h.txt), h);
  R.ok("الفاحص يجد الوصولات العالقة (أقدم من ٧ أيام)", /عالق/.test(h.txt), h);
  R.ok("الفاحص يُرجع قائمة مشاكل", h.issues>0, h);

  process.exit(R.done("مسارات الدفع وفاحص السلامة",errs));
})();
