const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();

  // ① رفض الصلاحيات يُبلَّغ عنه بوضوح لا كـ«انقطاع شبكة»
  const perm=await p.evaluate(()=>{
    const toasts=[];
    const orig=window.showToast;
    window.showToast=(m)=>{toasts.push(m);orig(m);};
    _fbReportWriteError({code:"PERMISSION_DENIED"},"records");
    const dot=document.getElementById("syncDot");
    const out={toast:toasts.join(" | "),dot:dot.style.background,err:_fbLastErr};
    _fbReportWriteError({code:"NETWORK_ERROR"},"records");
    out.netToast=toasts[toasts.length-1];
    window.showToast=orig;
    return out;
  });
  R.ok("رفض الصلاحيات يُذكر صراحةً", /صلاحيات/.test(perm.toast), perm.toast);
  R.ok("ويُوجّه لأداة الفحص", /فحص/.test(perm.toast), perm.toast);
  R.ok("ويُلوّن نقطة الاتصال بالأحمر", /owing/.test(perm.dot), perm);
  R.ok("ويُسجَّل آخر خطأ", perm.err&&perm.err.code==="PERMISSION_DENIED", perm.err);
  R.ok("انقطاع الشبكة يبقى برسالته المطمئنة", /محفوظ محلياً/.test(perm.netToast), perm.netToast);

  // ② أداة الفحص تعمل وتُبلّغ عن غياب الهوية
  const diag=await p.evaluate(async()=>{
    db=null;
    await toolsConnCheck();
    const t=document.getElementById("connCheckRes").innerText.replace(/\s+/g," ");
    return {t,hasPanel:!!document.getElementById("connCheckRes")};
  });
  R.ok("لوحة الفحص موجودة وتعمل بلا اتصال", diag.hasPanel&&diag.t.length>20, diag.t.slice(0,200));
  R.ok("تكشف غياب الاتصال بقاعدة البيانات", /✗/.test(diag.t), diag.t.slice(0,200));
  R.ok("تُبلّغ حين لا تُحمَّل مكتبة المصادقة", /مكتبة المصادقة/.test(diag.t), diag.t.slice(0,300));

  // مكتبة محمّلة لكن بلا هوية — أشيع سبب للرفض
  const noAuth=await p.evaluate(async()=>{
    window.firebase={auth:()=>({currentUser:null})};
    db=null;
    await toolsConnCheck();
    const t=document.getElementById("connCheckRes").innerText.replace(/\s+/g," ");
    delete window.firebase;
    return t;
  });
  R.ok("تُرشد لتفعيل Anonymous حين لا توجد هوية",
       /Anonymous/.test(noAuth)&&/هوية/.test(noAuth), noAuth.slice(0,320));

  // ③ الطابور المعلّق يظهر في الفحص
  const q=await p.evaluate(async()=>{
    _writeQueue=[{node:"records",id:"x",data:{},op:"set",at:Date.now()}];
    await toolsConnCheck();
    return document.getElementById("connCheckRes").innerText.replace(/\s+/g," ");
  });
  R.ok("الفحص يُظهر عدد المعلّق", /معلّقة/.test(q), q.slice(0,300));
  R.ok("ويعرض زرّ إعادة الإرسال", /إعادة إرسال/.test(q), q.slice(0,300));

  process.exit(R.done("تشخيص الاتصال والصلاحيات",errs));
})();
