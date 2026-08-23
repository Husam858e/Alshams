const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();
  const r=await p.evaluate(()=>{
    db=null;
    try{localStorage.removeItem("wShamsSnapshots");localStorage.removeItem("wShamsLastBackup");}catch(e){}
    const out={};
    S.recs=[{id:"K1",seq:1,dk:toDay(),driver:"a",plate:"1",final:100,payments:[],paid:false},
            {id:"K2",seq:2,dk:toDay(),driver:"b",plate:"2",final:200,payments:[],paid:false}];
    SELL_RECS=[];DAM_RECS=[];SRF_RECS=[];WRK_RECS=[];MNL_RECS=[];ARB_RECS=[];
    EMP_LIST=[];SAL_RECS=[];ADV_RECS=[];EMP_TXNS=[];
    out.first=autoSnapshot();
    out.count1=_snapshots().length;
    out.total1=_snapshots()[0].total;
    out.secondSameDay=autoSnapshot();          // مرة واحدة يومياً
    out.count2=_snapshots().length;
    // لا تحفظ فراغاً
    const keep=S.recs; S.recs=[];
    out.emptyRefused=(autoSnapshot(true)===false) && _snapshots()[0].total===2;
    S.recs=keep;
    // لا تستبدل لقطة ممتلئة بأخرى ناقصة بوضوح (بيانات لم تصل بعد)
    S.recs=Array.from({length:10},(_,i)=>({id:"M"+i,seq:i,dk:toDay(),driver:"x",plate:String(i),
                                          final:100,payments:[],paid:false}));
    let sn=JSON.parse(localStorage.getItem("wShamsSnapshots"));
    sn[0].dk="2020-01-01"; sn[0].total=10;
    localStorage.setItem("wShamsSnapshots",JSON.stringify(sn));
    S.recs=[keep[0]];                       // سجل واحد فقط مقابل ١٠
    out.halfRefused=(autoSnapshot()===false);
    S.recs=keep;
    // التذكير
    out.daysNoBackup=_daysSinceBackup();
    renderToolsTab();
    out.nudge=document.getElementById("bkNudge").innerText.replace(/\s+/g," ");
    // بعد نسخة ملف
    localStorage.setItem("wShamsLastBackup",nowStr());
    renderBackupNudge();
    out.nudgeAfter=document.getElementById("bkNudge").innerText.replace(/\s+/g," ");
    // الاستعادة من لقطة — من لقطة معروفة المحتوى
    localStorage.setItem("wShamsSnapshots",JSON.stringify([
      {at:nowStr(),dk:toDay(),by:"x",total:2,counts:{buy:2},data:{buy:keep}}]));
    S.recs=[];
    restoreSnapshot(0);
    out.payloadReady=!!(_restorePayload&&_restorePayload.data&&_restorePayload.data.buy);
    window.confirm=()=>true;
    toolsRestore("merge");
    out.restored=S.recs.length;
    return out;
  });
  R.ok("اللقطة الأولى تُؤخذ", r.first===true&&r.count1===1, r);
  R.ok("اللقطة تحمل كل السجلات", r.total1===2, r);
  R.ok("لا تتكرّر في نفس اليوم", r.secondSameDay===false&&r.count2===1, r);
  R.ok("لا تُحفظ لقطة فارغة", r.emptyRefused, r);
  R.ok("لا تُستبدل لقطة ممتلئة بشبه فارغة", r.halfRefused, r);
  R.ok("يُنبّه حين لا نسخة ملف إطلاقاً", /لم تأخذ أي نسخة/.test(r.nudge), r.nudge);
  R.ok("يهدأ التنبيه بعد أخذ نسخة", /✅/.test(r.nudgeAfter), r.nudgeAfter);
  R.ok("الاستعادة من لقطة تُجهّز البيانات", r.payloadReady, r);
  R.ok("الاستعادة تُرجع السجلات", r.restored===2, r);
  process.exit(R.done("النسخ الاحتياطي التلقائي",errs));
})();
