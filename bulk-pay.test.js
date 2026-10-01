/* يحاكي العطل الواقع: «سدّد شهر ٧ كاملاً» على ١٢٠٠ وصل.
   كان كل حفظٍ يُسلسل مصفوفة السجلات كاملةً ويكتبها في التخزين
   المحلي، فتجمّد الواجهة واحدةً وخمسين ثانية — فيقتل المتصفحُ
   الصفحة ويبدو أن النظام سقط.

   الفحص هنا لا يقيس المجموع وحده بل **أطول توقّفٍ للواجهة**،
   لأنه هو ما يقتل الصفحة: عملٌ طويل مقطَّع لا يُقتل، وعملٌ
   قصيرٌ غير مقطَّع قد يُقتل. */
const { chromium } = require('playwright-core');

const N = 1200;
const MAX_BLOCK_MS = 400;     // أطول توقّف مسموح للواجهة في الشريحة الواحدة

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('crash',()=>errs.push('الصفحة انهارت'));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);
  await p.waitForFunction(()=>dbRefClosures!==null,null,{timeout:15000}).catch(()=>{});

  const r = await p.evaluate(async (N)=>{
    [dbRef,dbRefSell,dbRefDam,dbRefSrf,dbRefWrk,dbRefMnl,dbRefArb,dbRefOut,
     dbRefEmp,dbRefSal,dbRefAdv,dbRefEmpTxn,dbRefAudit,dbRefClosures]
      .forEach(x=>{try{x&&x.off&&x.off();}catch(e){}});
    db=null; CLOSURES=[]; AUDIT=[]; _writeQueue=[]; _aiPendingPay=null;
    try{localStorage.clear();}catch(e){}
    const o={};

    const mk=n=>{S.recs=[];for(let i=0;i<n;i++)S.recs.push({
      id:'P'+i,seq:i+1,no:i+1,dk:'2026-07-'+String((i%28)+1).padStart(2,'0'),
      status:'weighed',driver:'فلاح رقم '+i,plate:String(1000+i),wh:'بركات',mat:'jet',
      gross:22000,empty:12000,net:10000,ppkg:500,wFee:5000000,
      kOn:true,kC:100,kUP:2000,kabsFee:200000,wOn:false,waslFee:0,
      nOn:false,naqlFee:0,naqlList:[],final:4800000,payments:[],
      note:'ملاحظة تجريبية لقياس الحجم الحقيقي',
      createdAt:'2026-07-01 08:00',createdBy:'حسام عايد'});};

    /* ① الدفع الكبير يطلب تأكيداً قبل أن يمسّ مالاً */
    mk(N);
    const ask=await _aiExecuteOne({action:'pay_range',type:'buy',from:'2026-07-01',to:'2026-07-31'});
    o.asked = String(ask).indexOf("<<<ASKPAY>>>")>=0 && String(ask).indexOf("١٢٠٠")>=0;
    o.askShowsSum = /٥٬٧٦٠٬٠٠٠٬٠٠٠|5,760,000,000/.test(String(ask).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
                 || String(ask).indexOf("بمجموع")>=0;
    o.nothingPaidYet = S.recs.every(x=>!x.payments||!x.payments.length);
    o.pendingKept = !!_aiPendingPay;

    /* ② التنفيذ بعد التأكيد: يُقاس أطول توقّف للواجهة */
    let worst=0,last=performance.now();
    const tick=setInterval(()=>{const now=performance.now();
      worst=Math.max(worst,now-last);last=now;},16);
    const t0=performance.now();
    const res=await _aiExecuteOne(_aiPendingPay);
    o.ms=Math.round(performance.now()-t0);
    clearInterval(tick);
    o.worst=Math.round(worst);
    o.msg=String(res);

    /* ③ النتيجة صحيحة: كلُّها مسدَّدة بالمبلغ الصحيح */
    o.allPaid = S.recs.every(x=>isFullyPaid(x));
    o.onePayEach = S.recs.every(x=>(x.payments||[]).length===1);
    o.amountRight = S.recs.every(x=>(x.payments||[])[0]&&(x.payments||[])[0].amount===4800000);
    o.byAI = ((S.recs[0].payments||[])[0]||{}).by==='🤖 AI';

    /* ④ التدقيق لم يُفقد قيداً، والطابور يحمل الاثنين */
    o.audit=AUDIT.length;
    o.queue=_writeQueue.length;

    /* ⑤ التخزين المحلي كُتب مرة واحدة في النهاية — لا مؤجَّل عالق */
    o.flushed=_bulkPending.size===0 && _bulkDepth===0;
    let cached=[];
    try{cached=JSON.parse(localStorage.getItem("wShamsCache")||"[]");}catch(e){}
    o.cacheWritten = cached.length===N && cached.every(x=>x.paid===true);
    let qls=[];
    try{qls=JSON.parse(localStorage.getItem("wShamsWriteQueue")||"[]");}catch(e){}
    o.queueWritten = qls.length>0;

    /* ⑥ الترتيب لم يضع: مؤجَّلٌ لا ملغى */
    o.sorted = S.recs.every((x,i)=>i===0||String(S.recs[i-1].dk)>=String(x.dk));

    /* ⑦ الإلغاء لا يُسدّد شيئاً */
    mk(50); AUDIT=[]; _writeQueue=[];
    await _aiExecuteOne({action:'pay_range',type:'buy',from:'2026-07-01',to:'2026-07-31'});
    _aiCancelPay();
    o.cancelPaysNothing = S.recs.every(x=>!x.payments||!x.payments.length) && !_aiPendingPay;

    /* ⑧ ما دون الحدّ يُنفَّذ بلا سؤال */
    mk(10); AUDIT=[]; _writeQueue=[];
    const small=await _aiExecuteOne({action:'pay_range',type:'buy',from:'2026-07-01',to:'2026-07-31'});
    o.smallDirect = String(small).indexOf("<<<ASKPAY>>>")<0 && S.recs.every(x=>isFullyPaid(x));

    /* ⑨ خارج الدفعة لا يتغيّر شيء: الكتابة فورية كما كانت */
    try{localStorage.removeItem("wShamsCache");}catch(e){}
    saveRec({...S.recs[0],note:'تعديل مفرد'});
    let c2=[];try{c2=JSON.parse(localStorage.getItem("wShamsCache")||"[]");}catch(e){}
    o.singleWriteImmediate = c2.length===10;

    /* ⑩ الدفعة تنتهي ولو رمى العمل داخلها */
    try{ await _bulkRun(async()=>{throw new Error("فشل مقصود");}); }catch(e){}
    o.depthRestored = _bulkDepth===0;

    return o;
  }, N);

  const T=[
    ['الدفع الكبير يطلب تأكيداً',            r.asked],
    ['ويعرض العدد والمجموع',                 r.askShowsSum],
    ['ولا يُسدَّد شيء قبل التأكيد',           r.nothingPaidYet&&r.pendingKept],
    ['الإلغاء لا يُسدّد شيئاً',               r.cancelPaysNothing],
    ['ما دون الحدّ يُنفَّذ مباشرة',            r.smallDirect],
    [`الواجهة لا تتجمّد (أطول توقّف ${r.worst}ms < ${MAX_BLOCK_MS})`, r.worst<MAX_BLOCK_MS],
    ['ولا تنهار الصفحة',                     !errs.some(e=>e.indexOf('انهارت')>=0)],
    [`١٢٠٠ وصل تُسدَّد كلها (${r.ms}ms)`,     r.allPaid],
    ['دفعة واحدة لكل وصل لا أكثر',            r.onePayEach],
    ['بالمبلغ المتبقّي الصحيح',               r.amountRight],
    ['ومنسوبةً للمساعد',                      r.byAI],
    [`سجلّ التدقيق كامل (${r.audit})`,        r.audit===N],
    [`الطابور يحمل السجل والقيد (${r.queue})`, r.queue===N*2],
    ['لا عملٌ مؤجَّل عالق بعد الدفعة',         r.flushed],
    ['التخزين المحلي كُتب بالحالة النهائية',   r.cacheWritten],
    ['والطابور كُتب كذلك',                    r.queueWritten],
    ['الترتيب مؤجَّلٌ لا ملغى',                r.sorted],
    ['خارج الدفعة الكتابة فورية كما كانت',     r.singleWriteImmediate],
    ['الدفعة تنتهي ولو رمى العمل داخلها',      r.depthRestored],
    ['بلا أخطاء جافاسكربت',                   errs.length===0],
  ];

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ الدفع الجماعي لا يُسقط التطبيق ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
