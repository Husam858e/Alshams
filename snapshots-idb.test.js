/* اللقطات في IndexedDB (v17.91): كانت نسخاً كاملة في localStorage (~٥ ميغا
   للتطبيق كلّه) فتملؤه وتفشل كتابة الطابور والكاش بصمت. يتحقق هذا الفحص
   أن اللقطات خرجت منه، وأنها تبقى بعد إعادة الفتح، وتُستعاد، وأن ما كان
   قديماً في localStorage يُنقل ثم يُحذف منه. */
const { chromium } = require('playwright-core');
const { chromePath } = require('./test-chrome');
const fs = require('fs'), os = require('os'), path = require('path');
(async () => {
  /* ملفّ تعريف ثابت كي تبقى IndexedDB بين فتحتين */
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'alshams-snap-'));
  const open = async () => {
    const ctx = await chromium.launchPersistentContext(prof, { executablePath:chromePath(), args:['--no-sandbox'], viewport:{width:430,height:900} });
    const p = ctx.pages()[0] || await ctx.newPage();
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
    await p.waitForTimeout(1800);
    await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();db=null;window.showToast=()=>{};});
    await p.waitForTimeout(400);
    return {ctx,p,errs};
  };
  const o={};
  /* ── الفتحة الأولى: لقطة قديمة في localStorage تنتظر الترحيل ── */
  let {ctx,p,errs}=await open();
  await p.evaluate(()=>{
    const recs=Array.from({length:5},(_,i)=>({id:'OLD'+i,dk:'2026-09-01',driver:'قديم',final:1}));
    localStorage.setItem("wShamsSnapshots",JSON.stringify([{at:'2026-09-01 08:00',dk:'2026-09-01',by:'حسام',total:5,counts:{buy:5},data:{buy:recs}}]));
  });
  await ctx.close();
  ({ctx,p,errs}=await open());
  await p.waitForTimeout(800);
  Object.assign(o, await p.evaluate(async()=>{
    const r={};
    r.migrated = _snapsReady && _snapshots().some(s=>s.dk==='2026-09-01'&&s.total===5);
    r.lsFreed = !localStorage.getItem("wShamsSnapshots");
    r.metaOnly = _snapshots().every(s=>!s.data);
    /* لقطة جديدة بـ٢٠٠٠ وصل: لا شيء منها في localStorage */
    S.recs=Array.from({length:2000},(_,i)=>({id:'N'+i,seq:i+1,dk:toDay(),status:'weighed',driver:'فلاح '+i,plate:'جلاب',net:22000,ppkg:350,final:7700000,payments:[],note:'x'.repeat(80)}));
    const before=JSON.stringify(localStorage).length;
    const t0=performance.now(); r.took=_snapBefore("الدفع الشامل"); r.ms=Math.round(performance.now()-t0);
    await new Promise(res=>setTimeout(res,800));
    r.lsGrowth = JSON.stringify(localStorage).length-before;
    /* والكاش يُكتب كاملاً بعدها (كان يفشل بصمت حين امتلأ التخزين) */
    localStorage.removeItem("wShamsCache"); saveRec({...S.recs[0],note:'بعد اللقطة'});
    r.cacheOk = (JSON.parse(localStorage.getItem("wShamsCache")||"[]")).length===2000;
    /* اللقطة نسخةٌ لا مرجع: تعديل البيانات بعدها لا يغيّرها */
    S.recs[1].driver='تغيّر';
    return r;
  }));
  await ctx.close();
  /* ── الفتحة الثانية: اللقطات باقية وتُستعاد ببياناتها ── */
  ({ctx,p,errs}=await open());
  await p.waitForTimeout(800);
  Object.assign(o, await p.evaluate(async()=>{
    const r={};
    const list=_snapshots();
    const i=list.findIndex(s=>s.pre==="الدفع الشامل");
    r.survives = i>=0 && list[i].total>=2000;
    await restoreSnapshot(i);
    r.restoreData = !!_restorePayload && Array.isArray(_restorePayload.data.buy) && _restorePayload.data.buy.length===2000;
    r.copyNotRef = r.restoreData && _restorePayload.data.buy[1].driver==='فلاح 1';
    const j=list.findIndex(s=>s.dk==='2026-09-01');
    await restoreSnapshot(j);
    r.oldRestores = !!_restorePayload && _restorePayload.data.buy.length===5;
    /* الجهاز المسحوب: تُمسح اللقطات أيضاً */
    await _snapWipe();
    r.wiped = _snapshots().length===0;
    return r;
  }));
  const allErrs=errs;
  await ctx.close();
  fs.rmSync(prof,{recursive:true,force:true});

  const T=[
    ['لقطة localStorage القديمة نُقلت',           o.migrated],
    ['وحُذفت منه فتحرّرت مساحته',                 o.lsFreed],
    ['في الذاكرة الوصف وحده',                    o.metaOnly],
    [`لقطة ٢٠٠٠ وصل لا تزيد localStorage (${o.lsGrowth} بايت)`, o.took&&o.lsGrowth<2000],
    [`ولا تُجمّد الواجهة (${o.ms} ملّي ثانية)`,       o.ms<400],
    ['والكاش يُكتب كاملاً بعدها',                  o.cacheOk],
    ['اللقطة باقية بعد إعادة الفتح',               o.survives],
    ['وتُستعاد ببياناتها',                         o.restoreData],
    ['نسخةٌ لا مرجع',                              o.copyNotRef],
    ['واللقطة المنقولة تُستعاد',                    o.oldRestores],
    ['وتُمسح عند سحب الجهاز',                      o.wiped],
    ['بلا أخطاء جافاسكربت',                        allErrs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(o,null,1));
  if(allErrs.length)console.log(allErrs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ اللقطات في IndexedDB ('+T.length+')'));
  process.exit(bad?1:0);
})();
