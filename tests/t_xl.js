const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();
  const r=await p.evaluate(()=>{
    const mk=(id,dk)=>({id,seq:1,dk,status:"weighed",driver:"علي",plate:id,wh:YARD,
      mat:"jet",gross:9000,empty:3000,net:6000,ppkg:100,final:600000,payments:[],paid:false});
    const today=toDay();
    S.recs=[mk("T1",today), mk("P1","2026-07-15"), mk("P2","2026-07-16"), mk("O1","2026-06-10")];
    const out={};
    // ① التصدير يتبع تاريخ الشاشة لا اليوم
    out.pastMonth = getXLData("monthly","all","2026-07-15").map(x=>x.id).sort();
    out.pastWeek  = getXLData("weekly","all","2026-07-15").map(x=>x.id).sort();
    out.pastDay   = getXLData("daily","all","2026-07-15").map(x=>x.id);
    out.today     = getXLData("daily","all",today).map(x=>x.id);
    out.all       = getXLData("all","all",today).length;
    // ② نفس نافذة الشاشة بالضبط
    const screen=getCollData("monthly","2026-07-15").map(x=>x.id).sort();
    out.matchesScreen = JSON.stringify(screen)===JSON.stringify(out.pastMonth);
    const screenW=getCollData("weekly","2026-07-15").map(x=>x.id).sort();
    out.matchesScreenWeek = JSON.stringify(screenW)===JSON.stringify(out.pastWeek);
    // ③ التتبّع من شاشة المحصلة
    openCollWH && null;
    _currentCollBase=null;
    openColl("monthly","all");
    out.baseAfterOpenColl=_currentCollBase;
    closePrint();
    out.baseAfterClose=_currentCollBase;
    return out;
  });
  R.ok("تصدير الشهر الماضي يُخرج سجلاته لا سجلات اليوم",
       JSON.stringify(r.pastMonth)===JSON.stringify(["P1","P2"]), r);
  R.ok("تصدير الأسبوع يتبع تاريخ الأساس",
       JSON.stringify(r.pastWeek)===JSON.stringify(["P1","P2"]), r);
  R.ok("تصدير اليوم المحدد دقيق", JSON.stringify(r.pastDay)===JSON.stringify(["P1"]), r);
  R.ok("تصدير اليوم الحالي يعمل", JSON.stringify(r.today)===JSON.stringify(["T1"]), r);
  R.ok("«الكل» يُصدّر كل السجلات", r.all===4, r);
  R.ok("نافذة الشهر تطابق الشاشة تماماً", r.matchesScreen, r);
  R.ok("نافذة الأسبوع تطابق الشاشة تماماً (اثنين→أحد)", r.matchesScreenWeek, r);
  R.ok("فتح المحصلة يسجّل تاريخ الأساس", !!r.baseAfterOpenColl, r);
  R.ok("إغلاق الشاشة يُصفّر التاريخ", r.baseAfterClose===null, r);
  process.exit(R.done("تصدير Excel",errs));
})();
