/* الرقابة (v17.87): كشفُ النشاط غير المعتاد، والتنبيه، واللقطة قبل
   العمليات الجماعية، وسحب صلاحية جهاز. كل حالةٍ تُشغَّل بمسارها
   الحقيقي (الحفظ والحذف والاستعادة تمرّ بـ_fbWrite ← _auditCapture)
   لا باستدعاء الكاشف مباشرةً. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(()=>{
    db=null; const o={};
    window.confirm=()=>true;
    localStorage.removeItem("wShamsWatchCfg");
    localStorage.removeItem("wShamsSnapshots");
    const reset=()=>{ ALERTS.length=0; _watchDelTimes=[]; Object.keys(_watchOpen).forEach(k=>delete _watchOpen[k]); };
    const rules=()=>ALERTS.map(a=>a.rule);
    const day=n=>{const d=new Date();d.setDate(d.getDate()-n);return _ds(d);};
    const mk=(id,dk,extra)=>({id,seq:1,dk,mk:dk.slice(0,7),status:'weighed',driver:'فلاح '+id,plate:'',mat:'jet',
      net:1000,ppkg:300,final:300000,payments:[],...(extra||{})});

    /* ── التبويب ── */
    const btn=[...document.querySelectorAll(".tbb")].find(x=>(x.getAttribute("onclick")||"").includes("sT('watch'"));
    o.tab = !!btn && !!document.getElementById("tc-watch");
    reset(); btn.click();
    o.emptyMsg = document.getElementById("watchRes").textContent.indexOf("لا تنبيهات")>=0;

    /* ── ① حذفٌ جماعي: خمسة خلال عشر دقائق ── */
    S.recs=[1,2,3,4,5,6].map(i=>mk('R'+i,toDay()));
    reset();
    ['R1','R2','R3','R4'].forEach(id=>delBuyRec(id));
    o.fourQuiet = !rules().includes("del_burst");
    delBuyRec('R5');
    o.burst = rules().filter(x=>x==="del_burst").length===1 && ALERTS[0].sev==="high";
    delBuyRec('R6');
    o.burstMerged = rules().filter(x=>x==="del_burst").length===1 && ALERTS.find(a=>a.rule==="del_burst").n===2;

    /* ── ② دفعة كبيرة ── */
    reset();
    S.recs=[mk('P1',toDay(),{final:9000000}),mk('P2',toDay(),{final:9000000})];
    _watchSetCfg("nightFrom",25); _watchSetCfg("nightTo",25);          // لا ليل في هذه الحالة
    saveRec({...S.recs[0],payments:[{amount:1000000,at:nowStr()}]});
    o.smallPayQuiet = !rules().includes("big_pay");
    saveRec({...S.recs[1],payments:[{amount:6000000,at:nowStr()}]});
    o.bigPay = rules().includes("big_pay");

    /* ── ③ دفعاتٌ في الليل: «الليل» هو الساعة الحالية ── */
    reset();
    const h=new Date().getHours();
    _watchSetCfg("nightFrom",h); _watchSetCfg("nightTo",(h+1)%24);
    S.recs=[mk('N1',toDay()),mk('N2',toDay())];
    saveRec({...S.recs[0],payments:[{amount:100000,at:nowStr()}]});
    saveRec({...S.recs[1],payments:[{amount:200000,at:nowStr()}]});
    const np=ALERTS.filter(a=>a.rule==="night_pay");
    o.night = np.length===1 && np[0].n===2 && np[0].detail.indexOf("٣٠٠,٠٠٠")>=0;
    localStorage.removeItem("wShamsWatchCfg");

    /* ── ④ تعديل مبلغ وصلٍ قديم ── */
    reset();
    S.recs=[mk('O1',day(10)),mk('O2',toDay()),mk('O3',day(10))];
    const R=id=>S.recs.find(x=>x.id===id);               // الحفظ يُعيد ترتيب القائمة بالتاريخ
    saveRec({...R('O2'),final:250000});                   // وصل اليوم: لا تنبيه
    o.todayEditQuiet = !rules().includes("old_edit");
    saveRec({...R('O3'),plate:'جلاب'});                   // قديم لكن ليس مبلغاً
    o.nonMoneyQuiet = !rules().includes("old_edit");
    saveRec({...R('O1'),final:200000});
    const oe=ALERTS.find(a=>a.rule==="old_edit");
    o.oldEdit = !!oe && oe.sev==="high" && oe.detail.indexOf("المبلغ النهائي")>=0;

    /* ── ⑤ الاستعادة: تنبيهٌ واحد ولقطةٌ قبلها، لا «حذف جماعي» ── */
    reset(); localStorage.removeItem("wShamsSnapshots");
    S.recs=[1,2,3,4,5,6,7].map(i=>mk('S'+i,toDay()));
    _restorePayload={app:"نسائم الخير",version:17,data:{buy:[mk('S1',toDay())]}};
    _toolsRestoreNow("replace");
    o.restoreOne = rules().includes("restore") && !rules().includes("del_burst");
    const snaps=_snapshots();
    o.preRestore = snaps.length>=1 && /استعادة/.test(snaps[0].pre||"");

    /* ── ⑥ لقطة قبل العمليات الجماعية: لا تتكرّر خلال عشر دقائق ── */
    localStorage.removeItem("wShamsSnapshots");
    S.recs=[mk('G1',toDay()),mk('G2',toDay())];
    o.snap1 = _snapBefore("الدفع الشامل")===true;
    o.snapDup = _snapBefore("الدفع الشامل")===false && _snapshots().filter(s=>s.pre).length===1;
    /* واللقطة اليومية تبقى تؤخذ — لقطة «قبل» لا تُحسب يومية */
    o.dailyStill = autoSnapshot()===true && _snapshots().filter(s=>!s.pre).length===1;
    /* وتظهر في قائمة اللقطات باسم العملية */
    const sb=document.getElementById("snapBox");
    if(sb){renderSnapshots(); o.snapLabel = sb.textContent.indexOf("قبل: الدفع الشامل")>=0;} else o.snapLabel=false;
    /* تسديد المحدَّد يأخذ لقطته */
    localStorage.removeItem("wShamsSnapshots");
    S.recs=[mk('Q1',toDay()),mk('Q2',toDay())];
    _selSet('buy').clear(); _selSet('buy').add('Q1'); _selPay('buy');
    o.selSnap = _snapshots().some(s=>s.pre==="تسديد المحدَّد");

    /* ── ⑦ الاطّلاع والشارة ── */
    reset();
    _alertRaise("t1","mid","تجربة ١","");
    _alertRaise("t2","high","تجربة ٢","");
    _watchBadge();
    o.badge2 = /٢/.test(btn.textContent);
    ackAlert(ALERTS[0].id);
    o.badge1 = _watchUnacked()===1 && /١/.test(btn.textContent);
    ackAllAlerts();
    o.badge0 = _watchUnacked()===0 && btn.textContent.trim()==="🛡️ الرقابة";

    /* ── ⑧ الأجهزة والسحب ── */
    const me=_devId();
    window._authUser=()=>({uid:'me-uid',isAnonymous:true});
    DEVICES=[{id:me,uid:'me-uid',label:'ويندوز',user:'حسام',last:nowStr()},
             {id:'d2',uid:'other-uid',label:'أندرويد · X',user:'حسام',last:nowStr()},
             {id:'d3',uid:'me-uid',label:'أندرويد · Y',user:'حسام',last:nowStr()}];
    REVOKED={};
    renderWatchTab();
    const res=document.getElementById("watchRes");
    const revBtns=[...res.querySelectorAll("button")].filter(x=>/revokeDevice/.test(x.getAttribute("onclick")||""));
    o.listDevs = res.textContent.indexOf("أندرويد · X")>=0 && res.textContent.indexOf("(هذا الجهاز)")>=0;
    o.noSelfBtn = !revBtns.some(x=>(x.getAttribute("onclick")||"").indexOf(me)>=0);
    revokeDevice(me);           o.selfRefused = !REVOKED['me-uid'];
    revokeDevice('d3');         o.sameUidRefused = !REVOKED['me-uid'];
    reset();
    revokeDevice('d2');
    o.askedPin = document.getElementById("mDanger").classList.contains("active");
    document.getElementById("dgWhy").value="الهاتف ضاع";
    document.getElementById("dgPin").value=String(S.cu.pin);
    _confirmDanger();
    o.revoked = !!REVOKED['other-uid'] && REVOKED['other-uid'].why==="الهاتف ضاع" && rules().includes("revoke");
    unrevokeDevice('other-uid');
    o.unrevoked = !REVOKED['other-uid'] && rules().includes("unrevoke");

    /* ── ⑨ الجهاز المسحوب: يُقفل وتُمسح بياناته، ويبقى مقفلاً بعد إعادة الفتح ── */
    localStorage.setItem("wShamsCache","[1]"); localStorage.setItem("wShamsSnapshots","[]");
    S.recs=[mk('L1',toDay())];
    REVOKED={'me-uid':{uid:'me-uid'}};
    _lockRevoked({at:nowStr()});
    const scr=document.getElementById("revokedScr");
    o.locked = !!scr && scr.textContent.indexOf("سُحبت صلاحية هذا الجهاز")>=0;
    o.wiped = !localStorage.getItem("wShamsCache") && !localStorage.getItem("wShamsSnapshots") && S.recs.length===0;
    o.keepsIds = localStorage.getItem("wShamsDevId")===me && !!localStorage.getItem("wShamsRevoked");
    scr.remove();
    o.bootLock = _watchBootLock()===true && !!document.getElementById("revokedScr");
    localStorage.removeItem("wShamsRevoked");
    document.getElementById("revokedScr").remove();
    o.bootFree = _watchBootLock()===false;
    return o;
  });
  await p.waitForTimeout(300);

  const T=[
    ['تبويب «🛡️ الرقابة»',                      r.tab&&r.emptyMsg],
    ['أربعة حذوفات لا تُنبّه',                   r.fourQuiet],
    ['الخامس خلال عشر دقائق: حذفٌ جماعي',        r.burst],
    ['وما بعده يُضاف لنفس التنبيه',               r.burstMerged],
    ['دفعة عادية لا تُنبّه',                      r.smallPayQuiet],
    ['دفعة فوق الحدّ تُنبّه',                     r.bigPay],
    ['دفعات الليل تنبيهٌ واحد بمجموعها',          r.night],
    ['تعديل وصل اليوم لا يُنبّه',                 r.todayEditQuiet],
    ['تعديل غير المبلغ لا يُنبّه',                r.nonMoneyQuiet],
    ['تعديل مبلغ وصلٍ قديم يُنبّه',               r.oldEdit],
    ['الاستعادة: تنبيهٌ واحد لا حذفٌ جماعي',       r.restoreOne],
    ['ولقطةٌ قبلها',                              r.preRestore],
    ['لقطةٌ قبل العملية الجماعية',                r.snap1],
    ['لا تتكرّر خلال عشر دقائق',                  r.snapDup],
    ['واللقطة اليومية باقية',                     r.dailyStill],
    ['تظهر باسم العملية',                         r.snapLabel],
    ['تسديد المحدَّد يأخذ لقطته',                  r.selSnap],
    ['الشارة تعدّ ما لم يُطَّلع عليه',             r.badge2&&r.badge1&&r.badge0],
    ['قائمة الأجهزة',                             r.listDevs],
    ['لا زرّ سحب للجهاز الذي بيدك',               r.noSelfBtn],
    ['لا يسحب نفسه',                              r.selfRefused],
    ['ولا جهازاً يشاركه الحساب',                   r.sameUidRefused],
    ['السحب يطلب الرمز والسبب',                   r.askedPin&&r.revoked],
    ['وإعادة السماح',                             r.unrevoked],
    ['الجهاز المسحوب يُقفل',                       r.locked],
    ['وتُمسح بيانات التطبيق منه',                  r.wiped],
    ['ويبقى معرّفه وعلامة السحب',                  r.keepsIds],
    ['ويبقى مقفلاً بعد إعادة الفتح',               r.bootLock&&r.bootFree],
    ['بلا أخطاء جافاسكربت',                        errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ الرقابة تكشف وتُنبّه وتستجيب ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
