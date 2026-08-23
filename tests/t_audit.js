const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();

  const a=await p.evaluate(()=>{
    AUDIT=[]; CLOSURES=[]; S.recs=[]; db=null;
    try{localStorage.removeItem("wShamsAudit");}catch(e){}
    const out={};
    // ① إنشاء
    const rec={id:"A1",seq:1,dk:"2026-08-10",status:"weighed",driver:"علي",plate:"11",
      wh:YARD,mat:"jet",gross:9000,empty:3000,net:6000,ppkg:100,final:600000,
      kOn:false,nOn:false,wOn:false,payments:[],paid:false};
    saveRec(rec);
    out.afterCreate=AUDIT.length;
    out.createAction=AUDIT[0]&&AUDIT[0].action;
    // ② تعديل السعر
    saveRec({...S.recs.find(x=>x.id==="A1"),ppkg:50,final:300000});
    out.afterEdit=AUDIT.length;
    const ed=AUDIT[0];
    out.editAction=ed&&ed.action;
    out.priceChange=(ed&&ed.changes||[]).find(c=>c.f==="ppkg");
    out.finalChange=(ed&&ed.changes||[]).find(c=>c.f==="final");
    // ③ دفعة
    _ppId="A1";_ppType="buy"; applyPayment(100000,"دفعة");
    out.payAction=AUDIT[0]&&AUDIT[0].action;
    out.payChange=(AUDIT[0]&&AUDIT[0].changes||[]).find(c=>c.f==="payments");
    // ④ حذف
    delBuyRec("A1");
    out.delAction=AUDIT[0]&&AUDIT[0].action;
    // ⑤ من فعلها
    out.by=AUDIT[0]&&AUDIT[0].by;
    out.total=AUDIT.length;
    // ⑥ لا يوجد أي مسار في التطبيق لحذف قيد
    out.noDeleteFn=typeof window.deleteAudit==="undefined"
                 && typeof window.clearAudit==="undefined";
    return out;
  });
  R.ok("الإنشاء يُسجَّل", a.afterCreate===1&&a.createAction==="create", a);
  R.ok("التعديل يُسجَّل كتعديل", a.editAction==="edit", a);
  R.ok("يسجّل السعر: من ١٠٠ إلى ٥٠",
       a.priceChange&&a.priceChange.from===100&&a.priceChange.to===50, a.priceChange);
  R.ok("يسجّل المبلغ: من ٦٠٠٬٠٠٠ إلى ٣٠٠٬٠٠٠",
       a.finalChange&&a.finalChange.from===600000&&a.finalChange.to===300000, a.finalChange);
  R.ok("الدفعة تُسجَّل كدفعة لا كتعديل", a.payAction==="pay", a);
  R.ok("الدفعة تُلخَّص بالمبلغ", a.payChange&&a.payChange.to===100000, a.payChange);
  R.ok("الحذف يُسجَّل", a.delAction==="delete", a);
  R.ok("كل قيد يحمل اسم من فعله", a.by==="حسام عايد", a);
  R.ok("لا دالة لمحو السجلّ في التطبيق", a.noDeleteFn, a);

  // ═══ إغلاق الفترة يمنع الكتابة فعلاً ═══
  const c=await p.evaluate(()=>{
    AUDIT=[];CLOSURES=[];db=null;
    S.recs=[{id:"C1",seq:1,dk:"2026-07-15",status:"weighed",driver:"علي",plate:"11",
      wh:YARD,mat:"jet",gross:9000,empty:3000,net:6000,ppkg:100,final:600000,
      payments:[],paid:false}];
    window.confirm=()=>true;
    document.getElementById("closeMonthPick").value="2026-07";
    closeMonth();
    const out={closed:isMonthClosed("2026-07"), audited:AUDIT.some(e=>e.action==="close")};
    // محاولة تعديل داخل الشهر المغلق
    const before=JSON.stringify(S.recs[0]);
    saveRec({...S.recs[0],ppkg:999});
    out.editBlocked=JSON.stringify(S.recs[0])===before;
    // محاولة حذف
    delBuyRec("C1");
    out.deleteBlocked=S.recs.some(x=>x.id==="C1");
    // محاولة إضافة سجل جديد بتاريخ داخل الشهر المغلق
    saveRec({id:"C2",seq:2,dk:"2026-07-20",driver:"جديد",plate:"22",final:100,payments:[],paid:false});
    out.createBlocked=!S.recs.some(x=>x.id==="C2");
    // شهر آخر مفتوح
    saveRec({id:"C3",seq:3,dk:"2026-09-01",driver:"مفتوح",plate:"33",final:100,payments:[],paid:false});
    out.otherMonthOk=S.recs.some(x=>x.id==="C3");
    // نقل وصل من شهر مفتوح إلى مغلق مرفوض
    saveRec({...S.recs.find(x=>x.id==="C3"),dk:"2026-07-05"});
    out.moveIntoClosedBlocked=S.recs.find(x=>x.id==="C3").dk==="2026-09-01";
    return out;
  });
  R.ok("الإغلاق يُفعَّل", c.closed, c);
  R.ok("الإغلاق نفسه يُسجَّل في التدقيق", c.audited, c);
  R.ok("التعديل داخل شهر مغلق مرفوض", c.editBlocked, c);
  R.ok("الحذف داخل شهر مغلق مرفوض", c.deleteBlocked, c);
  R.ok("الإضافة بتاريخ مغلق مرفوضة", c.createBlocked, c);
  R.ok("الشهر المفتوح يعمل طبيعياً", c.otherMonthOk, c);
  R.ok("نقل وصل إلى شهر مغلق مرفوض", c.moveIntoClosedBlocked, c);

  // ═══ الفتح يتطلّب سبباً ويُسجَّل ═══
  const o=await p.evaluate(()=>{
    window.prompt=()=>"تصحيح خطأ في وصل";
    reopenMonth("2026-07");
    const out={open:!isMonthClosed("2026-07"),
      audited:AUDIT.some(e=>e.action==="reopen"),
      reason:(AUDIT.find(e=>e.action==="reopen")||{}).changes};
    // بعد الفتح يعمل التعديل
    saveRec({...S.recs.find(x=>x.id==="C1"),ppkg:777});
    out.editWorks=S.recs.find(x=>x.id==="C1").ppkg===777;
    return out;
  });
  R.ok("الفتح يرفع القفل", o.open, o);
  R.ok("الفتح يُسجَّل في التدقيق", o.audited, o);
  R.ok("سبب الفتح محفوظ", JSON.stringify(o.reason||"").includes("تصحيح"), o);
  R.ok("بعد الفتح يعود التعديل", o.editWorks, o);

  // ═══ الفتح بلا سبب مرفوض ═══
  const x=await p.evaluate(()=>{
    window.confirm=()=>true; window.prompt=()=>"";
    document.getElementById("closeMonthPick").value="2026-06";
    closeMonth();
    reopenMonth("2026-06");
    return {stillClosed:isMonthClosed("2026-06")};
  });
  R.ok("الفتح بلا سبب مرفوض", x.stillClosed, x);

  process.exit(R.done("سجلّ التدقيق وإغلاق الفترات",errs));
})();
