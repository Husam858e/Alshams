const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();

  // التبويبات الجديدة موجودة وداخل الحاوية
  const dom=await p.evaluate(()=>({
    audit:!!document.getElementById("tc-audit"),
    cash:!!document.getElementById("tc-cash"),
    auditIn:!!document.getElementById("AS")?.contains(document.getElementById("tc-audit")),
    cashIn:!!document.getElementById("AS")?.contains(document.getElementById("tc-cash")),
    btns:[...document.querySelectorAll(".tbb")].map(x=>x.getAttribute("onclick")||"")
          .filter(x=>/'audit'|'cash'/.test(x)).length,
    nudge:!!document.getElementById("bkNudge"),
    snap:!!document.getElementById("snapBox"),
  }));
  R.ok("تبويبتا التدقيق والصندوق موجودتان داخل التطبيق",
       dom.audit&&dom.cash&&dom.auditIn&&dom.cashIn, dom);
  R.ok("زرّا التبويبتين مسجّلان", dom.btns===2, dom);
  R.ok("عناصر النسخ التلقائي موجودة", dom.nudge&&dom.snap, dom);

  // mk يُكتب تلقائياً
  const mk=await p.evaluate(()=>{
    db=null;CLOSURES=[];AUDIT=[];S.recs=[];
    saveRec({id:"MK1",seq:1,dk:"2026-08-21",driver:"a",plate:"1",final:100,payments:[],paid:false});
    saveSrfRec({id:"MK2",seq:1,dk:"2026-07-03",recv:"b",purp:"c",amount:50,payments:[],paid:false});
    return {buy:S.recs[0].mk, srf:SRF_RECS[0].mk,
            notAudited:!(AUDIT[0].changes||[]).some(c=>c.f==="mk")};
  });
  R.ok("مفتاح الشهر يُكتب تلقائياً", mk.buy==="2026-08"&&mk.srf==="2026-07", mk);
  R.ok("مفتاح الشهر لا يلوّث سجلّ التدقيق", mk.notAudited, mk);

  // المصادقة موجودة ولا تُعطّل التطبيق حين تفشل
  const auth=await p.evaluate(()=>({
    fnExists:typeof _fbSignIn==="function",
    flag:typeof _authReady!=="undefined",
  }));
  R.ok("دالة المصادقة موجودة", auth.fnExists&&auth.flag, auth);

  // رسم كل التبويبات الجديدة بلا خطأ
  const render=await p.evaluate(()=>{
    const errs=[];
    S.recs=[{id:"R1",seq:1,dk:toDay(),status:"weighed",driver:"علي",plate:"11",wh:YARD,
      mat:"jet",gross:9000,empty:3000,net:6000,ppkg:100,final:600000,
      payments:[{amount:100000,at:nowStr(),by:"حسام"}],paid:false}];
    ["renderAuditTab","renderCashTab","renderBackupNudge","renderSnapshots","_renderClosuresBox"]
      .forEach(f=>{try{window[f]();}catch(e){errs.push(f+": "+e.message);}});
    try{openRecHistory("R1","وصل تجريبي");closeM();}catch(e){errs.push("openRecHistory: "+e.message);}
    try{openAuditPrint();closePrint();}catch(e){errs.push("openAuditPrint: "+e.message);}
    return errs;
  });
  R.ok("كل شاشات الميزات الجديدة تُرسم بلا خطأ", render.length===0, render);

  process.exit(R.done("الميزات الجديدة",errs));
})();
