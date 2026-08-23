const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();
  const seed=()=>p.evaluate(()=>{
    db=null;CLOSURES=[];_gPayOwner=null;_gPayLastQ=null;
    const D=toDay();
    const mk=(id,driver,note)=>({id,seq:1,dk:D,status:"weighed",driver,plate:"11",
      wh:YARD,mat:"jet",gross:9000,empty:3000,net:6000,ppkg:100,final:500000,
      note:note||"",payments:[],paid:false});
    S.recs=[mk("A","عبد الرحمن واثق",""),
            mk("B","عبد الله احمد","سلّمها عبد الرحمن واثق"),
            mk("C","عبد الله احمد","")];
    SELL_RECS=[];DAM_RECS=[];SRF_RECS=[];WRK_RECS=[];MNL_RECS=[];
    SAL_RECS=[];ADV_RECS=[];EMP_TXNS=[];EMP_LIST=[];ARB_RECS=[];
    const q=document.getElementById("toolsSearchInp"); q.value="عبد الرحمن واثق";
    document.getElementById("toolsSrchFrom").value="";
    document.getElementById("toolsSrchTo").value="";
    toolsGlobalSearch();
  });

  // ═══ العطل الأصلي: الملاحظة لم تعد تُدخل وصل غيره ═══
  await seed();
  const a=await p.evaluate(()=>{
    const r=_globalPayItems();
    return {payIds:r.items.map(x=>x.rec.id), offIds:r.offName.map(x=>x.rec.id),
            owners:r.owners.map(o=>o.name)};
  });
  R.ok("لا يُدفع إلا وصل صاحب الاسم", JSON.stringify(a.payIds)===JSON.stringify(["A"]), a);
  R.ok("وصل الغير المطابق بالملاحظة يُستبعَد", JSON.stringify(a.offIds)===JSON.stringify(["B"]), a);
  R.ok("شخص واحد ⇒ يُختار تلقائياً", a.owners.length===1, a);

  // التنفيذ فعلياً: المال كله لصاحبه
  const exec=await p.evaluate(()=>{
    window.confirm=()=>true;
    setPayAmt("gPayAmount",500000);
    execGlobalPay();
    const g=id=>S.recs.find(x=>x.id===id);
    return {A:getPaidTotal(g("A")),B:getPaidTotal(g("B")),C:getPaidTotal(g("C")),
            forName:(g("A").payments.slice(-1)[0]||{}).forName};
  });
  R.ok("المال كله ذهب لصاحبه", exec.A===500000, exec);
  R.ok("لم يمسّ وصولات الآخر إطلاقاً", exec.B===0&&exec.C===0, exec);
  R.ok("الدفعة تحمل اسم من دُفعت له", exec.forName==="عبد الرحمن واثق", exec);

  // ═══ اسم قصير يطابق عدّة أشخاص ⇒ لا دفع بلا اختيار ═══
  await seed();
  const s2=await p.evaluate(()=>{
    document.getElementById("toolsSearchInp").value="عبد";
    toolsGlobalSearch();
    const r=_globalPayItems();
    const out={owners:r.owners.map(o=>o.name).sort(),selected:r.items.length,auto:_gPayOwner};
    window.confirm=()=>true;
    setPayAmt("gPayAmount",900000);
    execGlobalPay();
    out.paidAny=(S.recs||[]).some(x=>getPaidTotal(x)>0);
    return out;
  });
  R.ok("الاسم القصير يكشف الأشخاص المتعدّدين", s2.owners.length===2, s2);
  R.ok("لا يُختار أحد تلقائياً عند التعدّد", s2.auto===null&&s2.selected===0, s2);
  R.ok("التنفيذ مرفوض قبل اختيار الشخص", s2.paidAny===false, s2);

  // بعد الاختيار يُدفع للمختار وحده
  const pick=await p.evaluate(()=>{
    const r=_globalPayItems();
    const target=r.owners.find(o=>o.name==="عبد الله احمد");
    gPayPickOwner(target.key);
    window.confirm=()=>true;
    setPayAmt("gPayAmount",900000);
    execGlobalPay();
    const g=id=>S.recs.find(x=>x.id===id);
    return {A:getPaidTotal(g("A")),B:getPaidTotal(g("B")),C:getPaidTotal(g("C"))};
  });
  R.ok("بعد الاختيار يُدفع للمختار وحده", pick.B+pick.C===900000&&pick.A===0, pick);

  // ═══ البحث باسم مخزن لم يعد يلتقط مال الجميع ═══
  await seed();
  const wh=await p.evaluate(()=>{
    document.getElementById("toolsSearchInp").value="ابراهيم";
    toolsGlobalSearch();
    const r=_globalPayItems();
    return {payable:r.all.length, off:r.offName.length};
  });
  R.ok("البحث باسم المخزن لا يُدرج شيئاً في الدفع", wh.payable===0, wh);
  R.ok("ويُعرض المستبعَد للتوضيح", wh.off===3, wh);

  // ═══ تغيير البحث يُلغي اختيار الشخص السابق ═══
  const reset=await p.evaluate(()=>{
    document.getElementById("toolsSearchInp").value="عبد";
    toolsGlobalSearch();
    const r=_globalPayItems();
    gPayPickOwner(r.owners[0].key);
    const before=_gPayOwner;
    document.getElementById("toolsSearchInp").value="عبد الله احمد";
    toolsGlobalSearch();
    return {before,after:_gPayOwner};
  });
  R.ok("تغيير البحث يُلغي الاختيار السابق", !!reset.before, reset);

  process.exit(R.done("الدفع بالهوية لا بالبحث",errs));
})();
