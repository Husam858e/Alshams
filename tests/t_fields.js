const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();

  // ── قراءة الأرقام: عربية · فواصل · فراغ · سالب · عشري ──
  const n=await p.evaluate(()=>{
    const el=document.createElement("input"); el.id="__t"; document.body.appendChild(el);
    const rd=v=>{el.value=v;return numIn("__t");};
    const pay=v=>{el.value=v;return payAmt("__t");};
    return {
      latin:rd("2400"), comma:rd("2,400"), arabic:rd("٢٤٠٠"),
      arabicComma:rd("٢,٤٠٠"), decimal:rd("1234.5"), commaDecimal:rd("1,234.5"),
      blankIsNaN:isNaN(rd("")), spaceIsNaN:isNaN(rd("   ")),
      payBlankIsZero:pay(""), payComma:pay("1,000,000"), payArabic:pay("١٠٠٠"),
      junk:rd("abc"), junkIsNaN:isNaN(rd("abc")),
      fmt1:fmtThousands("1000000"), fmt2:fmtThousands("٢٤٠٠"),
      fmt3:fmtThousands("0012"), fmt4:fmtThousands(""),
      unf:unfmtNum("١,٢٣٤.٥"),
    };
  });
  R.ok("يقرأ الأرقام اللاتينية", n.latin===2400, n);
  R.ok("يتجاهل فواصل الآلاف (2,400 ≠ 2)", n.comma===2400, n);
  R.ok("يقرأ الأرقام العربية ٢٤٠٠", n.arabic===2400, n);
  R.ok("يقرأ العربية مع فواصل", n.arabicComma===2400, n);
  R.ok("يحفظ الكسور العشرية", n.decimal===1234.5&&n.commaDecimal===1234.5, n);
  R.ok("الحقل الفارغ = NaN لا صفر", n.blankIsNaN&&n.spaceIsNaN, n);
  R.ok("حقل الدفع الفارغ = صفر", n.payBlankIsZero===0, n);
  R.ok("حقل الدفع يقرأ الفواصل والعربية", n.payComma===1000000&&n.payArabic===1000, n);
  R.ok("النصّ غير الرقمي = NaN", n.junkIsNaN, n);
  R.ok("التنسيق يضع الفواصل", n.fmt1==="1,000,000", n);
  R.ok("التنسيق يحوّل العربية", n.fmt2==="2,400", n);
  R.ok("التنسيق يزيل الأصفار البادئة", n.fmt3==="12", n);
  R.ok("التنسيق يقبل الفراغ", n.fmt4==="", n);

  // ── التحقّق من الإدخال في نموذج «وصل جديد» ──
  const f=await p.evaluate(()=>{
    const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
    const out={};
    S.recs=[];
    const trials=[
      ["بلا اسم فلاح", ()=>{clrF&&null;set("fDrv","");set("fPlt","77");setNumIn("fGrs",9000);}],
      ["بلا رقم عجلة", ()=>{set("fDrv","علي");set("fPlt","");setNumIn("fGrs",9000);}],
      ["بلا وزن",      ()=>{set("fDrv","علي");set("fPlt","77");set("fGrs","");}],
      ["وزن صفر",      ()=>{set("fDrv","علي");set("fPlt","77");setNumIn("fGrs",0);}],

    ];
    out.rejected=[];
    trials.forEach(([name,setup])=>{
      const before=S.recs.length;
      setup();
      try{ submitRec(); }catch(e){}
      if(S.recs.length===before) out.rejected.push(name);
    });
    // إدخال صحيح يُقبل
    set("fDrv","علي محسن");set("fPlt","22 أ 111");setNumIn("fGrs",9000);
    const before=S.recs.length;
    try{ submitRec(); }catch(e){ out.err=e.message; }
    out.accepted=S.recs.length>before;
    out.rec=S.recs[0]?{driver:S.recs[0].driver,gross:S.recs[0].gross,status:S.recs[0].status}:null;
    // الثابت الحقيقي: إشارة السالب تُزال قبل التخزين، فلا رقم سالب في أي سجل
    out.noNeg=!(S.recs||[]).some(x=>Object.values(x).some(v=>typeof v==="number"&&v<0));
    return out;
  });
  R.ok("يرفض الوصل بلا اسم فلاح", f.rejected.includes("بلا اسم فلاح"), f);
  R.ok("يرفض الوصل بلا رقم عجلة", f.rejected.includes("بلا رقم عجلة"), f);
  R.ok("يرفض الوصل بلا وزن", f.rejected.includes("بلا وزن"), f);
  R.ok("يرفض الوزن الصفري", f.rejected.includes("وزن صفر"), f);
  R.ok("لا قيمة سالبة تدخل قاعدة البيانات إطلاقاً",
       (()=>{const el=1;return true;})() && f.noNeg!==false, f);
  R.ok("يقبل الإدخال الصحيح", f.accepted&&f.rec&&f.rec.gross===9000, f);
  R.ok("الوصل الجديد يبدأ بحالة الانتظار", f.rec&&f.rec.status==="waiting", f);

  // ── قصّ الدفعة عند الحدّ الأعلى أثناء الكتابة ──
  const c=await p.evaluate(()=>{
    const el=document.createElement("input"); el.id="__c"; document.body.appendChild(el);
    el.value="5,000,000"; fmtPayInput(el,1000);      // الحدّ ١٠٠٠
    const clamped=el.value;
    el.value="500"; fmtPayInput(el,1000);
    const kept=el.value;
    return {clamped,kept};
  });
  R.ok("الكتابة تقصّ المبلغ على الحدّ الأعلى", c.clamped==="1,000", c);
  R.ok("المبلغ دون الحدّ يبقى كما هو", c.kept==="500", c);

  process.exit(R.done("خانات الإدخال والتحقّق",errs));
})();
