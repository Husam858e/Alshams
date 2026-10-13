/* «الحسابات والأدوات» لصاحب النظام وحده (v17.89): تظهر لحسام عايد
   (المستخدم ١) وتُخفى عن البقية — من القائمة ومن كل طريقٍ آخر. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:412,height:880} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  const login=i=>p.evaluate(i=>{try{doLogout();}catch(e){} S.su=USERS[i];S.pin=USERS[i].pin;doLogin();db=null;},i);
  const TABS=["paylog","aging","acct","gsearch","tools","perf","cash","audit","watch"];
  const view=()=>p.evaluate(TABS=>{
    const btn=id=>[...document.querySelectorAll(".tbb")].find(x=>(x.getAttribute("onclick")||"").includes("sT('"+id+"'"));
    const sec=[...document.querySelectorAll("#navDrawer .navsec")].find(h=>h.textContent.indexOf("الحسابات والأدوات")>=0);
    return {hidden:TABS.map(id=>btn(id).style.display==="none"),
      secHidden:!!sec&&sec.style.display==="none",
      othersShown:[...document.querySelectorAll(".tbb")].filter(x=>!TABS.some(id=>(x.getAttribute("onclick")||"").includes("sT('"+id+"'"))).every(x=>x.style.display!=="none"),
      active:(document.querySelector(".tc.active")||{}).id};
  },TABS);
  const o={};

  /* ① حسام: يرى القسم كاملاً ويفتحه */
  await login(0); await p.waitForTimeout(500);
  let v=await view();
  o.ownerSees = v.hidden.every(h=>!h) && !v.secHidden;
  await p.evaluate(()=>{const b=[...document.querySelectorAll(".tbb")].find(x=>(x.getAttribute("onclick")||"").includes("sT('tools'"));b.click();});
  o.ownerOpens = (await view()).active==="tc-tools";

  /* ② بركات: القسم مخفي، والأقسام الأخرى ظاهرة، والتبويب المفتوح من جلسة حسام أُغلق */
  await login(1); await p.waitForTimeout(500);
  v=await view();
  o.otherHidden = v.hidden.every(h=>h) && v.secHidden;
  o.othersShown = v.othersShown;
  o.leftOwnerTab = v.active==="tc-new";

  /* ③ ولا يصل إليه من طريقٍ آخر */
  const blocked = await p.evaluate(TABS=>{
    const r={};
    let toast=""; const ot=window.showToast; window.showToast=m=>{toast=m;};
    const btn=id=>[...document.querySelectorAll(".tbb")].find(x=>(x.getAttribute("onclick")||"").includes("sT('"+id+"'"));
    r.direct = TABS.every(id=>{ sT(id,btn(id)); return !document.getElementById("tc-"+id).classList.contains("active"); });
    r.click = TABS.every(id=>{ btn(id).click(); return !document.getElementById("tc-"+id).classList.contains("active"); });
    r.toggle = TABS.every(id=>{ try{_toggleTab(id);}catch(e){} return !document.getElementById("tc-"+id).classList.contains("active"); });
    r.toast = toast.indexOf("لصاحب النظام")>=0;
    r.stillNew = document.getElementById("tc-new").classList.contains("active");
    /* التبويبات العادية تعمل */
    btn("naql-coll").click();
    r.normalOk = document.getElementById("tc-naql-coll").classList.contains("active");
    window.showToast=ot;
    return r;
  },TABS);
  Object.assign(o,{blockDirect:blocked.direct,blockClick:blocked.click,blockToggle:blocked.toggle,
                   blockToast:blocked.toast,stillNew:blocked.stillNew,normalOk:blocked.normalOk});

  /* ④ تنبيه الرقابة يُسجَّل ولا يظهر لغير صاحب النظام */
  o.silentAlert = await p.evaluate(()=>{
    let shown=false; const ot=window.showToast; window.showToast=()=>{shown=true;};
    ALERTS.length=0; _alertRaise("t","high","تجربة","");
    window.showToast=ot;
    return !shown && ALERTS.length===1;
  });

  /* ⑤ عودة حسام تُظهره من جديد */
  await login(0); await p.waitForTimeout(500);
  v=await view();
  o.ownerAgain = v.hidden.every(h=>!h) && !v.secHidden;

  /* ⑥ بقية المستخدمين كذلك */
  let all=true;
  for(const i of [2,3]){ await login(i); await p.waitForTimeout(300); const w=await view(); all=all&&w.hidden.every(h=>h)&&w.secHidden; }
  o.allOthers = all;

  const T=[
    ['حسام يرى «الحسابات والأدوات»',          o.ownerSees],
    ['ويفتحها',                               o.ownerOpens],
    ['مخفية عن بركات مع عنوانها',              o.otherHidden],
    ['وبقية الأقسام ظاهرة له',                 o.othersShown],
    ['تبويب حسام المفتوح يُغلق عند تبديل المستخدم', o.leftOwnerTab],
    ['لا يفتحها باستدعاء مباشر',               o.blockDirect],
    ['ولا بالضغط على الزر المخفي',             o.blockClick],
    ['ولا باختصارات التبديل',                  o.blockToggle],
    ['ويُقال له لماذا',                        o.blockToast],
    ['ويبقى حيث كان',                          o.stillNew],
    ['التبويبات العادية تعمل',                 o.normalOk],
    ['تنبيه الرقابة صامتٌ لغيره ومسجَّل',       o.silentAlert],
    ['عودة حسام تُظهرها',                      o.ownerAgain],
    ['مخفية عن كل المستخدمين الآخرين',          o.allOthers],
    ['بلا أخطاء جافاسكربت',                    errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(o,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ الحسابات والأدوات لصاحب النظام وحده ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
