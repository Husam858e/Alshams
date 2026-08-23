const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();
  const base={seq:1,dk:"2026-08-10",status:"weighed",wh:"ابو ابراهيم",mat:"jet",
    gross:9000,empty:3000,net:6000,ppkg:100,final:600000,
    kOn:false,kC:0,kUP:0,kType:"",nOn:false,wOn:false,wPrice:0};

  // ① وزن فارغ ≥ كلي ⇒ يُرفض ولا يُحفظ شيء
  const a=await p.evaluate(b=>{
    S.recs=[{...b,id:"G1",driver:"علي",plate:"11",payments:[],paid:false}];
    const before=JSON.stringify(S.recs[0]);
    openEdit("G1"); setNumIn("eGr",12000); setNumIn("eEm",20000); saveEdit();
    const r=S.recs.find(x=>x.id==="G1");
    return {unchanged:JSON.stringify(r)===before,
            modalStillOpen:document.getElementById("mEdit").classList.contains("active"),
            gross:r.gross,empty:r.empty,final:r.final};
  },base);
  R.ok("الوزن الفارغ ≥ الكلي يُرفض ولا يُحفظ", a.unchanged, a);
  R.ok("المودال يبقى مفتوحاً للتصحيح", a.modalStillOpen, a);

  // ② وزن فارغ صالح ⇒ يُحفظ متّسقاً
  const b2=await p.evaluate(b=>{
    S.recs=[{...b,id:"G2",driver:"علي",plate:"22",payments:[],paid:false}];
    openEdit("G2"); setNumIn("eGr",12000); setNumIn("eEm",4000); saveEdit();
    const r=S.recs.find(x=>x.id==="G2");
    return {gross:r.gross,empty:r.empty,net:r.net,final:r.final,
            consistent:r.net===r.gross-r.empty && r.final===r.net*r.ppkg};
  },base);
  R.ok("التعديل الصالح يُنتج وصلاً متّسقاً", b2.consistent, b2);

  // ③ تخفيض مبلغ وصل مدفوع: يُحذّر — وإن وافق المستخدم يظهر الفائض
  const c=await p.evaluate(b=>{
    let asked=null; window.confirm=m=>{asked=m;return true;};
    S.recs=[{...b,id:"G3",driver:"علي",plate:"33",
             payments:[{amount:600000,at:"x",by:"y"}],paidTotal:600000,paid:true}];
    openEdit("G3"); setNumIn("ePrc",50); saveEdit();
    const r=S.recs.find(x=>x.id==="G3");
    return {asked, over:getOverpay(r), total:getRecTotal(r), paid:getPaidTotal(r),
            btn:payBtnHTML(r,"buy"),
            modal:(openPartialPay("G3","buy"),document.getElementById("mPartialPay").innerText),
            receipt:buildPaymentsSection(r)};
  },base);
  R.ok("التخفيض دون المدفوع يُحذّر قبل الحفظ", !!c.asked && /فائض/.test(c.asked), c.asked);
  R.ok("الفائض يُحسب صحيحاً (300,000)", c.over===300000, c);
  R.ok("زرّ الدفع يعرض الفائض بدل «مدفوع كامل»", /فائض/.test(c.btn)&&!/مدفوع كامل/.test(c.btn), c.btn.slice(0,160));
  R.ok("مودال الدفع يشرح الفائض", /فائض/.test(c.modal), c.modal.slice(0,200));
  R.ok("الوصل المطبوع يذكر الفائض", /فائض/.test(c.receipt), c.receipt.slice(0,200));

  // ④ رفض المستخدم للتحذير ⇒ لا يُحفظ
  const d=await p.evaluate(b=>{
    window.confirm=()=>false;
    S.recs=[{...b,id:"G4",driver:"علي",plate:"44",
             payments:[{amount:600000,at:"x",by:"y"}],paidTotal:600000,paid:true}];
    const before=JSON.stringify(S.recs[0]);
    openEdit("G4"); setNumIn("ePrc",50); saveEdit();
    return {unchanged:JSON.stringify(S.recs.find(x=>x.id==="G4"))===before};
  },base);
  R.ok("رفض التحذير يُلغي التعديل", d.unchanged, d);

  // ⑤ نفس الحارس في البيع
  const e=await p.evaluate(()=>{
    window.confirm=()=>true;
    SELL_RECS=[{id:"V9",seq:1,dk:"2026-08-10",status:"weighed",driver:"سعد",plate:"55",
      dest:"بغداد",mat:"jet",gross:9000,empty:3000,net:6000,ppkg:100,
      wFee:600000,waslFee:0,naqlFee:0,final:600000,wOn:false,nOn:false,
      payments:[],paid:false}];
    const before=JSON.stringify(SELL_RECS[0]);
    openSellEdit("V9"); setNumIn("seEm",20000); saveSellEdit();
    return {unchanged:JSON.stringify(SELL_RECS[0])===before};
  });
  R.ok("حارس الأوزان يعمل في البيع أيضاً", e.unchanged, e);

  // ⑥ وصل لم يُوزن بعد: التعديل بلا وزن فارغ مسموح
  const f=await p.evaluate(()=>{
    window.confirm=()=>true;
    S.recs=[{id:"G5",seq:1,dk:"2026-08-10",status:"waiting",driver:"علي",plate:"66",
      wh:"ابو ابراهيم",mat:"jet",gross:9000,empty:null,net:null,ppkg:null,final:null,
      kOn:false,kC:0,kUP:0,kType:"",nOn:false,wOn:false,wPrice:0,payments:[],paid:false}];
    openEdit("G5"); document.getElementById("eDv").value="علي محسن"; saveEdit();
    const r=S.recs.find(x=>x.id==="G5");
    return {driver:r.driver,saved:r.driver==="علي محسن"};
  });
  R.ok("الوصل غير الموزون يُعدَّل بلا وزن فارغ", f.saved, f);

  process.exit(R.done("حارس التعديل",errs));
})();
