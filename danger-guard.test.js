/* حارس العمليات الخطرة: يتحقق أن الثلاث عمليات التي لا رجعة فيها
   لا تُنفَّذ إلا برمز الدخول، وأن فتح الفترة المغلقة يطلب سبباً
   مكتوباً يُسجَّل في التدقيق — على المسار الحقيقي في متصفح فعلي. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('dialog',async d=>{ errs.push('DIALOG: '+d.type()+' — '+d.message()); await d.accept(); });
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const T=[];
  const open  = ()=>p.evaluate(()=>document.getElementById('mDanger').classList.contains('active'));
  const err   = ()=>p.evaluate(()=>{const e=document.getElementById('dgErr');return e.style.display!=='none'?e.textContent:'';});
  const setPin=v=>p.fill('#dgPin',v);
  const hit   = ()=>p.evaluate(()=>_confirmDanger());

  /* ══ سلة المحذوفات ══ */
  /* انتظر تسجيل مستمعي فايربيس قبل فصلها: التهيئة غير متزامنة،
     وفصلٌ قبل التسجيل لا يمنع لقطةً تصل بعده فتمحو بيانات الاختبار. */
  await p.waitForFunction(()=>dbRefClosures!==null,null,{timeout:15000}).catch(()=>{});
  await p.evaluate(()=>{
    /* فصل مستمعي فايربيس أولاً: لقطةٌ متأخرة تستبدل المصفوفات
       التي يبنيها الاختبار فتفشل الفحوص عشوائياً — لا لخللٍ في
       التطبيق. ويُنتظر تسجيل المستمعين أولاً، فالتهيئة غير
       متزامنة وقد تسجّلهم بعد الفصل فيعودون. */
    [dbRef,dbRefSell,dbRefDam,dbRefSrf,dbRefWrk,dbRefMnl,dbRefArb,dbRefOut,
     dbRefEmp,dbRefSal,dbRefAdv,dbRefEmpTxn,dbRefAudit,dbRefClosures]
      .forEach(r=>{try{r&&r.off&&r.off();}catch(e){}});
    try{db&&db.ref&&db.ref().off();}catch(e){}
    db=null;
  });
  await p.evaluate(()=>{ TRASH=[{id:'t1'},{id:'t2'},{id:'t3'}]; clearTrash(); });
  T.push(['clearTrash يفتح الحارس ولا يحذف', await open() &&
          await p.evaluate(()=>TRASH.length)===3]);
  T.push(['حقل السبب مخفي هنا',
          await p.evaluate(()=>document.getElementById('dgWhyBox').style.display==='none')]);

  await setPin('9999'); await hit();
  T.push(['رمز خاطئ يُرفض والسلة سليمة',
          (await err()).includes('غير صحيح') && await open() &&
          await p.evaluate(()=>TRASH.length)===3]);
  T.push(['الحقل يُفرَّغ بعد الخطأ', await p.inputValue('#dgPin')==='']);

  await setPin(String(await p.evaluate(()=>S.cu.pin))); await hit();
  await p.waitForTimeout(150);
  T.push(['الرمز الصحيح ينفّذ ويُغلق',
          !(await open()) && await p.evaluate(()=>TRASH.length)===0]);

  /* ══ الإلغاء ══ */
  await p.evaluate(()=>{ TRASH=[{id:'x'}]; clearTrash(); });
  await p.evaluate(()=>closeM());
  await p.waitForTimeout(120);
  T.push(['الإلغاء لا ينفّذ شيئاً',
          !(await open()) && await p.evaluate(()=>TRASH.length)===1]);

  /* ══ فتح فترة مغلقة — سبب + رمز ══ */
  const R = await p.evaluate(()=>{
    AUDIT=[]; CLOSURES=[{id:'2026-08',month:'2026-08',open:false,closedAt:nowStr(),closedBy:'ح',totals:{count:3,amount:100}}];
    reopenMonth('2026-08');
    return {whyShown:document.getElementById('dgWhyBox').style.display==='block',
            lbl:document.getElementById('dgWhyLbl').textContent,
            closed:isMonthClosed('2026-08')};
  });
  T.push(['فتح الفترة يطلب السبب', R.whyShown && R.lbl.includes('سبب') && R.closed]);

  await setPin(String(await p.evaluate(()=>S.cu.pin))); await hit();
  T.push(['سبب فارغ يُرفض رغم صحّة الرمز',
          (await err()).includes('اكتب السبب') &&
          await p.evaluate(()=>isMonthClosed('2026-08'))]);

  await p.fill('#dgWhy','خطأ في وزن وصل ٤٤');
  await setPin('0000'); await hit();
  T.push(['سبب صحيح ورمز خاطئ يُرفض',
          (await err()).includes('غير صحيح') &&
          await p.evaluate(()=>isMonthClosed('2026-08'))]);

  /* Enter داخل حقل الرمز يؤكّد — ولا يقفز حقلاً */
  await p.fill('#dgPin',String(await p.evaluate(()=>S.cu.pin)));
  await p.press('#dgPin','Enter');
  await p.waitForTimeout(200);
  const after = await p.evaluate(()=>({
    closed:isMonthClosed('2026-08'),
    note:(AUDIT.find(a=>a.action==='reopen')||{changes:[]}).changes.map(c=>c.to).join('|')
  }));
  T.push(['Enter يؤكّد فتُفتح الفترة', !(await open()) && !after.closed]);
  T.push(['السبب مُسجَّل في التدقيق', after.note.includes('خطأ في وزن وصل ٤٤')]);

  /* ══ الاستعادة ══ */
  await p.evaluate(()=>{_restorePayload=null;toolsRestore('replace');});
  T.push(['الاستعادة بلا ملف لا تفتح الحارس', !(await open())]);
  await p.evaluate(()=>{_restorePayload={data:{}};toolsRestore('replace');});
  T.push(['الاستعادة بملف تفتح الحارس', await open() &&
          (await p.evaluate(()=>document.getElementById('dgTxt').textContent)).includes('يحذف')]);
  await p.evaluate(()=>closeM());

  /* ══ مستخدم بلا رمز: لا حارس، لكن السبب يبقى مطلوباً ══ */
  await p.evaluate(()=>{ S.cu={id:9,name:'بلا رمز'}; TRASH=[{id:'z'}]; clearTrash(); });
  T.push(['بلا رمز: الحذف يمرّ مباشرة',
          !(await open()) && await p.evaluate(()=>TRASH.length)===0]);
  await p.evaluate(()=>{ CLOSURES=[{id:'2026-07',month:'2026-07',open:false}]; reopenMonth('2026-07'); });
  T.push(['بلا رمز: السبب ما زال مطلوباً',
          await open() &&
          await p.evaluate(()=>document.getElementById('dgPin').parentNode.style.display==='none')]);
  await hit();
  T.push(['بلا رمز وبلا سبب: يُرفض',
          (await err()).includes('اكتب السبب') &&
          await p.evaluate(()=>isMonthClosed('2026-07'))]);
  await p.fill('#dgWhy','تصحيح'); await hit();
  await p.waitForTimeout(150);
  T.push(['بلا رمز مع سبب: يُنفَّذ',
          !(await open()) && !(await p.evaluate(()=>isMonthClosed('2026-07')))]);

  T.push(['بلا أخطاء جافاسكربت ولا نوافذ متصفح', errs.length===0]);

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(errs.length)console.log('\n'+errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✓ كل الاختبارات ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
