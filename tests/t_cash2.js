const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();
  const reset=()=>p.evaluate(()=>{
    db=null;AUDIT=[];CLOSURES=[];CASH_MOVES=[];CASH_COUNTS=[];
    CASH_BOXES=[{id:"main",name:"صندوق الساحة",kind:"cash",opening:1000000,openingDk:"2026-08-01",main:true,active:true},
                {id:"bank",name:"البنك",kind:"bank",opening:0,openingDk:"2026-08-01",main:false,active:true}];
    CASHBOX={dirs:{..._CASH_DIR_DEFAULT}};
    _cashBoxId="main";
    S.recs=[];SELL_RECS=[];DAM_RECS=[];SRF_RECS=[];WRK_RECS=[];MNL_RECS=[];
    SAL_RECS=[];ADV_RECS=[];EMP_TXNS=[];EMP_LIST=[];ARB_RECS=[];
  });

  // ═══ ① خطّ الأساس: الفرق القديم لا يلاحق الأيام التالية ═══
  await reset();
  const base=await p.evaluate(()=>{
    const out={};
    // حركة خارجة 200,000 في 5 آب ⇒ متوقّع 800,000
    CASH_MOVES=[{id:"m1",boxId:"main",dk:"2026-08-05",at:"2026-08-05 10:00",by:"x",
                 dir:-1,amount:200000,type:"petty",note:"نثريات"}];
    out.before=cashExpected("2026-08-10","main");
    // جرد 5 آب: المعدود 750,000 ⇒ نقص 50,000
    document.getElementById("cashCountAmt").value="750,000";
    document.getElementById("cashCountDk").value="2026-08-05";
    cashAddCount();
    out.count=CASH_COUNTS[0];
    // قبل الاعتماد: الفرق ما زال محمولاً
    out.stillCarried=cashExpected("2026-08-10","main");
    // اعتماد الجرد
    window.prompt=()=>"عجز صندوق";
    cashSettleCount(CASH_COUNTS[0].id);
    out.baselineAfter=cashBaseline("main");
    out.expectedAfter=cashExpected("2026-08-10","main");
    out.adjustMove=CASH_MOVES.find(m=>m.type==="adjust");
    return out;
  });
  R.ok("المتوقّع قبل الجرد = افتتاحي − نثريات", base.before===800000, base);
  R.ok("الجرد يحسب النقص", base.count.diff===-50000, base.count);
  R.ok("قبل الاعتماد يبقى الفرق محمولاً", base.stillCarried===800000, base);
  R.ok("الاعتماد يُنشئ قيد تسوية بقيمة الفرق",
       base.adjustMove&&base.adjustMove.amount===50000&&base.adjustMove.dir===-1, base.adjustMove);
  R.ok("خطّ الأساس صار الجرد المعتمد",
       base.baselineAfter.amount===750000&&base.baselineAfter.fromDk==="2026-08-06", base.baselineAfter);
  R.ok("المتوقّع بعد الاعتماد = المعدود (لا يلاحقه النقص)",
       base.expectedAfter===750000, base);

  // ═══ ② حركات يدوية ═══
  await reset();
  const mv=await p.evaluate(()=>{
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
    const out={};
    set("cashMvType","cap_in"); set("cashMvAmt","500,000"); set("cashMvDk","2026-08-02");
    set("cashMvNote","رأس مال"); cashAddMove();
    set("cashMvType","owner_out"); set("cashMvAmt","300,000"); set("cashMvDk","2026-08-03");
    cashAddMove();
    out.n=CASH_MOVES.length;
    out.dirs=CASH_MOVES.map(m=>m.type+":"+m.dir).sort();
    out.expected=cashExpected("2026-08-31","main");
    out.audited=AUDIT.filter(e=>e.node==="cash_moves").length;
    // مبلغ صفري مرفوض
    set("cashMvAmt","0"); cashAddMove();
    out.zeroRefused=CASH_MOVES.length===2;
    return out;
  });
  R.ok("الحركة اليدوية تُسجَّل باتجاهها الصحيح",
       mv.dirs.join()==="cap_in:1,owner_out:-1", mv);
  R.ok("المتوقّع يشمل الحركات اليدوية", mv.expected===1000000+500000-300000, mv);
  R.ok("كل حركة تدخل سجلّ التدقيق", mv.audited===2, mv);
  R.ok("المبلغ الصفري مرفوض", mv.zeroRefused, mv);

  // ═══ ③ التحويل بين الصناديق ═══
  await reset();
  const xf=await p.evaluate(()=>{
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
    _cashOpenTab();
    set("cashXfFrom","main"); set("cashXfTo","bank");
    set("cashXfAmt","400,000"); set("cashXfDk","2026-08-04");
    window.confirm=()=>true;
    cashTransfer();
    return {n:CASH_MOVES.length,
      main:cashExpected("2026-08-31","main"), bank:cashExpected("2026-08-31","bank"),
      linked:CASH_MOVES[0].xferId&&CASH_MOVES[0].xferId===CASH_MOVES[1].xferId,
      sum:cashExpected("2026-08-31","main")+cashExpected("2026-08-31","bank")};
  });
  R.ok("التحويل يُنشئ قيدين", xf.n===2, xf);
  R.ok("القيدان مترابطان بمعرّف واحد", xf.linked, xf);
  R.ok("الصندوق نقص والبنك زاد", xf.main===600000&&xf.bank===400000, xf);
  R.ok("مجموع الصناديق لم يتغيّر", xf.sum===1000000, xf);

  // ═══ ④ التحويل لنفس الصندوق مرفوض ═══
  const same=await p.evaluate(()=>{
    const n=CASH_MOVES.length;
    document.getElementById("cashXfTo").value="main";
    document.getElementById("cashXfAmt").value="100,000";
    cashTransfer();
    return CASH_MOVES.length===n;
  });
  R.ok("التحويل إلى نفس الصندوق مرفوض", same, {});

  // ═══ ⑤ الحركات المشتقّة للصندوق الرئيسي وحده ═══
  await reset();
  const der=await p.evaluate(()=>{
    SELL_RECS=[{id:"S1",seq:1,dk:"2026-08-06",status:"weighed",driver:"a",plate:"1",final:900000,
                payments:[{amount:900000,at:"2026-08-06 09:00",by:"x"}],paid:true}];
    return {main:cashExpected("2026-08-31","main"), bank:cashExpected("2026-08-31","bank"),
            ledgerMain:cashLedger("main","","2026-08-31").length,
            ledgerBank:cashLedger("bank","","2026-08-31").length};
  });
  R.ok("الوصولات تُحتسب في الصندوق الرئيسي", der.main===1900000&&der.ledgerMain===1, der);
  R.ok("ولا تُحتسب في البنك", der.bank===0&&der.ledgerBank===0, der);

  // ═══ ⑥ الفترة المغلقة تمنع الحركة ═══
  const closed=await p.evaluate(()=>{
    CLOSURES=[{id:"2026-08",month:"2026-08",open:false,closedAt:"x",closedBy:"y"}];
    const n=CASH_MOVES.length;
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
    set("cashMvType","petty"); set("cashMvAmt","1,000"); set("cashMvDk","2026-08-09");
    cashAddMove();
    const blocked=CASH_MOVES.length===n;
    CLOSURES=[];
    return blocked;
  });
  R.ok("الحركة في شهر مغلق مرفوضة", closed, {});

  // ═══ ⑦ كشف الحركة والطباعة ═══
  await reset();
  const led=await p.evaluate(()=>{
    CASH_MOVES=[
      {id:"a",boxId:"main",dk:"2026-08-02",at:"2026-08-02 09:00",by:"x",dir:1,amount:200000,type:"cap_in",note:"ر"},
      {id:"b",boxId:"main",dk:"2026-08-03",at:"2026-08-03 09:00",by:"x",dir:-1,amount:50000,type:"petty",note:"ن"},
    ];
    document.getElementById("cashFrom").value="";
    document.getElementById("cashTo").value="2026-08-31";
    renderCashTab();
    const txt=document.getElementById("cashRes").innerText.replace(/\s+/g," ");
    let printed=false;
    try{openCashPrint();printed=document.getElementById("PC").innerText.includes("كشف الخزينة");closePrint();}catch(e){}
    return {txt:txt.slice(0,500),printed,
            hasRunning:/١,٢٠٠,٠٠٠|1,200,000/.test(txt)};
  });
  R.ok("كشف الحركة يعرض رصيداً متحركاً", led.hasRunning, led);
  R.ok("طباعة كشف الخزينة تعمل", led.printed, led);

  process.exit(R.done("الخزينة",errs));
})();
