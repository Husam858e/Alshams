const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();
  const set=(id,v)=>`(function(){var e=document.getElementById(${JSON.stringify(id)});if(e)e.value=${JSON.stringify(v)};})()`;

  // ═══ دورة الشراء الكاملة: إدخال ← تأكيد المخزن ← الوزن الفارغ ═══
  const buy=await p.evaluate(()=>{
    S.recs=[];
    const st=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
    st("fDrv","علي محسن"); st("fPlt","22 أ 111"); setNumIn("fGrs",9000);
    submitRec();
    const r0=S.recs[0]; const stage1={status:r0.status,gross:r0.gross,final:r0.final};
    // مرحلة ٢: تأكيد المخزن والسعر
    openConf(r0.id); setNumIn("cPrc",535); confWH();
    const r1=S.recs.find(x=>x.id===r0.id);
    const stage2={status:r1.status,ppkg:r1.ppkg};
    // مرحلة ٣: الوزن الفارغ
    openWeigh(r1.id); setNumIn("eWI",3000); confWeigh();
    const r2=S.recs.find(x=>x.id===r0.id);
    return {stage1,stage2,
      stage3:{status:r2.status,net:r2.net,final:r2.final},
      expNet:6000, expFinal:6000*535, id:r0.id};
  });
  R.ok("الشراء ①: يبدأ بانتظار تأكيد المخزن",
       buy.stage1.status==="waiting"&&buy.stage1.final==null, buy.stage1);
  R.ok("الشراء ②: التأكيد يضبط السعر وينقل الحالة",
       buy.stage2.status==="confirmed"&&buy.stage2.ppkg===535, buy.stage2);
  R.ok("الشراء ③: الوزن يُكمل الوصل ويحسب الصافي",
       buy.stage3.status==="weighed"&&buy.stage3.net===buy.expNet, buy.stage3);
  R.ok("الشراء ③: المبلغ النهائي = الصافي × السعر",
       buy.stage3.final===buy.expFinal, buy.stage3);

  // ═══ رفض الوزن الفارغ غير الصالح في مرحلة الوزن ═══
  const w=await p.evaluate(id=>{
    const r=S.recs.find(x=>x.id===id);
    const before=JSON.stringify(r);
    openWeigh(id); setNumIn("eWI",99999); confWeigh();     // فارغ > كلي
    return {unchanged:JSON.stringify(S.recs.find(x=>x.id===id))===before};
  },buy.id);
  R.ok("مرحلة الوزن ترفض فارغاً أكبر من الكلي", w.unchanged, w);

  // ═══ دورة البيع الكاملة ═══
  const sell=await p.evaluate(()=>{
    SELL_RECS=[];
    const st=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
    st("sDrv","سعد"); st("sPlt","33 ب 222"); setNumIn("sEmp",1775);
    submitSellRec();
    const r0=SELL_RECS[0]; const s1={status:r0.status,empty:r0.empty};
    openSellConf(r0.id); setNumIn("scPrc",535); confSellRec();
    const r1=SELL_RECS.find(x=>x.id===r0.id); const s2={status:r1.status,ppkg:r1.ppkg};
    openSellWeigh(r1.id); setNumIn("swGrs",3550); confSellWeigh();
    const r2=SELL_RECS.find(x=>x.id===r0.id);
    return {s1,s2,s3:{status:r2.status,net:r2.net,final:r2.final},
            expNet:3550-1775, expFinal:(3550-1775)*535};
  });
  R.ok("البيع ①: يبدأ بالانتظار مع الوزن الفارغ", sell.s1.status==="waiting"&&sell.s1.empty===1775, sell.s1);
  R.ok("البيع ②: التأكيد يضبط السعر", sell.s2.status==="confirmed"&&sell.s2.ppkg===535, sell.s2);
  R.ok("البيع ③: الصافي والمبلغ صحيحان",
       sell.s3.net===sell.expNet&&sell.s3.final===sell.expFinal, sell);

  // ═══ الضمانة ووصولاتها الفرعية ═══
  const dam=await p.evaluate(()=>{
    DAM_RECS=[];
    const st=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
    st("daDamin","ضامن"); st("daMadmun","مضمون"); setNumIn("daPrice",100000);
    submitDamRec();
    const d0=DAM_RECS[0];
    return {created:!!d0, price:d0&&d0.price, subTotal:d0?getDamSubTotal(d0):null};
  });
  R.ok("الضمانة تُنشأ بمبلغها", dam.created&&dam.price===100000, dam);

  // ═══ الحذف → السلة → الاسترجاع: دورة كاملة بلا فقد ═══
  const tr=await p.evaluate(()=>{
    TRASH=[]; try{localStorage.removeItem("wShamsTrash");}catch(e){}
    S.recs=[{id:"DEL1",seq:1,dk:"2026-08-10",status:"weighed",driver:"علي",plate:"99",
      wh:YARD,mat:"jet",gross:9000,empty:3000,net:6000,ppkg:100,final:600000,
      payments:[{amount:250000,at:"x",by:"y",note:"دفعة"}],paidTotal:250000,paid:false}];
    const original=JSON.stringify(S.recs[0]);
    delBuyRec("DEL1");
    const goneFromList=!S.recs.some(x=>x.id==="DEL1");
    const inTrash=TRASH.some(t=>t.rec&&t.rec.id==="DEL1");
    restoreFromTrash(0);
    const back=S.recs.find(x=>x.id==="DEL1");
    return {goneFromList,inTrash,
      restored:!!back,
      // mk حقل مشتقّ يُضاف عند الحفظ — نستثنيه من المطابقة
      identical:(()=>{const a=JSON.parse(original),c={...back};delete c.mk;
                      return JSON.stringify(c)===JSON.stringify(a);})(),
      onlyMkAdded:(()=>{const a=Object.keys(JSON.parse(original)),c=Object.keys(back);
                        return c.filter(k=>!a.includes(k)).join()==="mk";})(),
      paymentsKept:back?(back.payments||[]).length===1&&getPaidTotal(back)===250000:false,
      trashEmptied:!TRASH.some(t=>t.rec&&t.rec.id==="DEL1")};
  });
  R.ok("الحذف يُزيل الوصل من السجل", tr.goneFromList, tr);
  R.ok("المحذوف يُحفظ في السلة", tr.inTrash, tr);
  R.ok("الاسترجاع يُعيد الوصل", tr.restored, tr);
  R.ok("الاسترجاع يُعيده مطابقاً (عدا مفتاح الشهر المشتقّ)", tr.identical, tr);
  R.ok("لا يُضاف للسجل المستعاد سوى مفتاح الشهر", tr.onlyMkAdded, tr);
  R.ok("الاسترجاع يحفظ سجل الدفعات", tr.paymentsKept, tr);
  R.ok("الاسترجاع يُخرجه من السلة", tr.trashEmptied, tr);

  // ═══ الطابور دون اتصال يسجّل كل كتابة ═══
  const q=await p.evaluate(()=>{
    _writeQueue=[]; try{localStorage.removeItem("wShamsWriteQueue");}catch(e){}
    db=null;
    saveRec({id:"Q1",seq:1,dk:toDay(),driver:"ق",plate:"1",final:1000,payments:[],paid:false});
    saveSrfRec({id:"Q2",seq:1,dk:toDay(),recv:"ر",purp:"س",amount:500,payments:[],paid:false});
    delBuyRec("Q1");
    const persisted=JSON.parse(localStorage.getItem("wShamsWriteQueue")||"[]");
    return {inMemory:_writeQueue.length, persisted:persisted.length,
      ops:_writeQueue.map(w=>w.node+":"+w.op)};
  });
  R.ok("كل كتابة تدخل الطابور دون اتصال", q.inMemory>=2, q);
  R.ok("الطابور يُحفظ على الجهاز", q.persisted===q.inMemory, q);
  R.ok("الحذف يُسجَّل في الطابور كعملية حذف",
       q.ops.some(o=>o.endsWith(":del")), q);

  process.exit(R.done("دورات العمل الكاملة",errs));
})();
