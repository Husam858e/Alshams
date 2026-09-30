/* يحاكي الحالة الفعلية: قيود تدقيق وصلت السيرفر ثم عَلِقت في الطابور
   لأن إعادة إرسالها مرفوضة بقاعدة «الإضافة فقط». */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(async ()=>{
    const out=[];
    // سيرفر وهمي: عنده القيود الخمسة الأولى، ويرفض إعادة كتابة الموجود
    const server={audit_log:{}};
    for(let i=0;i<5;i++) server.audit_log['E'+i]={id:'E'+i,at:'t',by:'حسام',dk:'2026-09-21',mk:'2026-09'};
    server.audit_log['E9']=undefined;                 // قيد لم يصل بعد
    let denied=0;
    db={ ref:(node)=>({ child:(id)=>({
      set:(val)=>{
        const cur=(server[node]||{})[id];
        if(node==='audit_log'&&cur!==undefined){denied++;return Promise.reject({code:'PERMISSION_DENIED'});}
        (server[node]=server[node]||{})[id]=val; return Promise.resolve();
      },
      remove:()=>{ if(server[node])delete server[node][id]; return Promise.resolve(); },
      once:()=>Promise.resolve({ exists:()=> (server[node]||{})[id]!==undefined,
                                 val:()=> (server[node]||{})[id] }),
    })})};

    // طابور فيه ٥ واصلة فعلاً + واحدة لم تصل
    _writeQueue=[];
    for(let i=0;i<5;i++) _writeQueue.push({node:'audit_log',id:'E'+i,
      data:{id:'E'+i,at:'t',by:'حسام',dk:'2026-09-21',mk:'2026-09'},op:'set',at:Date.now()});
    _writeQueue.push({node:'audit_log',id:'E9',
      data:{id:'E9',at:'t',by:'حسام',dk:'2026-09-21',mk:'2026-09'},op:'set',at:Date.now()});
    out.push(`الطابور قبل التسوية: ${_writeQueue.length}`);

    await toolsReconcileQueue();
    await new Promise(r=>setTimeout(r,300));
    out.push(`بعد التسوية: ${_writeQueue.length}`);
    out.push(`المتبقّي هو القيد الذي لم يصل: ${_writeQueue.length===1 && _writeQueue[0].id==='E9'}`);

    // إعادة الإرسال تُنجح الباقي
    _flushQueue();
    await new Promise(r=>setTimeout(r,300));
    out.push(`بعد إعادة الإرسال: ${_writeQueue.length}`);
    out.push(`وصل القيد الناقص للسيرفر: ${server.audit_log['E9']!==undefined}`);

    // اختلاف القيمة لا يُعدّ تسوية
    _writeQueue=[{node:'audit_log',id:'E0',data:{id:'E0',at:'مختلف'},op:'set',at:Date.now()}];
    const same=await _reconcileQueued(_writeQueue[0]);
    out.push(`قيمة مختلفة لا تُزال بالتسوية: ${same===false}`);

    // ترتيب المفاتيح لا يمنع المطابقة
    _writeQueue=[{node:'audit_log',id:'E1',
      data:{mk:'2026-09',dk:'2026-09-21',by:'حسام',at:'t',id:'E1'},op:'set',at:Date.now()}];
    const reordered=await _reconcileQueued(_writeQueue[0]);
    out.push(`ترتيب المفاتيح لا يُفسد المقارنة: ${reordered===true}`);
    return out;
  });

  const exp=[/: 6$/,/: 1$/,/true$/,/: 0$/,/true$/,/true$/,/true$/];
  let fail=0;
  r.forEach((line,i)=>{ const ok=exp[i].test(line); if(!ok)fail++;
    console.log(` ${ok?'PASS':'FAIL'} ${line}`); });
  console.log(fail?`\n‼ فشل ${fail}`:`\n✅ تسوية الطابور تعمل (${r.length})`);
  console.log('pageerrors:', errs.length?errs.join(' | '):'none');
  await b.close(); process.exit(fail?1:0);
})();
