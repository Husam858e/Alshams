/* القائمة الجانبية (v17.88): زرّ ☰ في الترويسة يفتح التبويبات طولياً
   تحت عناوين أقسامها، واختيار تبويب يفتحه ويُغلق القائمة ويكتب اسمه
   في الترويسة. يُضغط كما يضغطه المستخدم (نقرٌ حقيقي لا استدعاء دالة). */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:412,height:880} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();db=null;window.showToast=()=>{};});
  await p.waitForTimeout(700);
  const o={};
  const st=()=>p.evaluate(()=>({open:document.body.classList.contains("nav-open"),
    cur:document.getElementById("curTab").textContent.trim()}));

  /* مغلقة عند الدخول، والتبويبات لا تشغل الشاشة */
  o.closedAtStart = !(await st()).open;
  const box = await p.evaluate(()=>{const r=document.getElementById("navDrawer").getBoundingClientRect();return {left:r.left,w:innerWidth};});
  o.offscreen = box.left>=box.w-1;
  o.curStart = (await st()).cur==="🛒 شراء";

  /* ☰ يفتحها */
  await p.click('#navBtn'); await p.waitForTimeout(400);
  o.opens = (await st()).open;
  const box2 = await p.evaluate(()=>{const r=document.getElementById("navDrawer").getBoundingClientRect();return {right:r.right,w:innerWidth,width:r.width};});
  o.fromRight = Math.abs(box2.right-box2.w)<2 && box2.width<box2.w;

  /* البناء: كل التبويبات داخلها، وعناوين الأقسام العشرة بالترتيب */
  const s = await p.evaluate(()=>{
    const d=document.getElementById("navDrawer");
    const all=[...document.querySelectorAll(".tbb")];
    return {inside:all.every(x=>d.contains(x)), n:all.length,
      secs:[...d.querySelectorAll(".navsec")].map(x=>x.textContent.trim()),
      vertical:(()=>{const a=all[0].getBoundingClientRect(),c=all[1].getBoundingClientRect();return c.top>a.top&&Math.abs(c.left-a.left)<2;})(),
      firstUnder: d.querySelector(".navsec").nextElementSibling.textContent.trim()};
  });
  o.allInside = s.inside && s.n>=57;
  o.sections = s.secs.join("|")==="🛒 الشراء|📤 المخرجات|💰 البيع|🤝 الضمانات|🧾 الصرفيات|🔧 أجور الأعمال|👷 الرواتب|🚚 النقل|🏬 مخزن أربيل|📒 الحسابات والأدوات";
  o.vertical = s.vertical;
  o.firstUnder = s.firstUnder==="🛒 شراء";

  /* اختيار تبويب: يفتحه، يُغلقها، ويكتب اسمه */
  await p.click('#navDrawer .tbb:has-text("حساب النقال")'); await p.waitForTimeout(400);
  const a = await st();
  o.select = !a.open && a.cur==="📊 حساب النقال"
    && await p.evaluate(()=>document.getElementById("tc-naql-coll").classList.contains("active"));

  /* الخلفية الداكنة تُغلقها */
  await p.click('#navBtn'); await p.waitForTimeout(350);
  await p.mouse.click(20,400); await p.waitForTimeout(350);
  o.scrimCloses = !(await st()).open;
  /* ✕ تُغلقها */
  await p.click('#navBtn'); await p.waitForTimeout(350);
  await p.click('#navDrawer .navhd button'); await p.waitForTimeout(350);
  o.xCloses = !(await st()).open;
  /* Esc */
  await p.click('#navBtn'); await p.waitForTimeout(350);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  o.escCloses = !(await st()).open;
  /* زرّ الرجوع في أندرويد يُغلقها أولاً ولا يخرج */
  await p.click('#navBtn'); await p.waitForTimeout(350);
  o.backCloses = await p.evaluate(()=>window.onAndroidBackPressed()===true && !document.body.classList.contains("nav-open"));
  /* والرجوع في المتصفح كذلك */
  await p.click('#navBtn'); await p.waitForTimeout(350);
  await p.goBack().catch(()=>{}); await p.waitForTimeout(400);
  o.histCloses = !(await st()).open;

  /* اسم التبويب بلا رقم الشارة (تبويب الرقابة عليه شارة) */
  await p.evaluate(()=>{ALERTS.length=0;_alertRaise("t","mid","تجربة","");});
  await p.click('#navBtn'); await p.waitForTimeout(350);
  await p.click('#navDrawer .tbb:has-text("الرقابة")'); await p.waitForTimeout(400);
  o.badgeName = (await st()).cur==="🛡️ الرقابة";

  /* الشيفرة التي تضغط الأزرار بنفسها ما زالت تعمل (المساعد، الانتقال إلى حساب الناقل) */
  await p.evaluate(()=>openNaqlAcctFrom("فنر")); await p.waitForTimeout(500);
  o.programmatic = await p.evaluate(()=>document.getElementById("tc-naql-coll").classList.contains("active")
    && document.getElementById("naqlSrch").value==="فنر" && !document.body.classList.contains("nav-open"));

  const T=[
    ['مغلقة عند الدخول وخارج الشاشة',        o.closedAtStart&&o.offscreen],
    ['الترويسة تكتب التبويب المفتوح',          o.curStart],
    ['☰ يفتحها من اليمين',                   o.opens&&o.fromRight],
    ['كل التبويبات داخلها',                   o.allInside],
    ['عناوين الأقسام العشرة بالترتيب',          o.sections],
    ['التبويبات طولية',                       o.vertical],
    ['أول القسم تحت عنوانه',                  o.firstUnder],
    ['الاختيار يفتح التبويب ويُغلقها',          o.select],
    ['الخلفية تُغلقها',                        o.scrimCloses],
    ['✕ تُغلقها',                             o.xCloses],
    ['Esc يُغلقها',                           o.escCloses],
    ['رجوع أندرويد يُغلقها أولاً',              o.backCloses],
    ['رجوع المتصفح يُغلقها',                   o.histCloses],
    ['الاسم بلا رقم الشارة',                   o.badgeName],
    ['الانتقال من الشيفرة يعمل',               o.programmatic],
    ['بلا أخطاء جافاسكربت',                    errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify({o,s},null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ القائمة الجانبية تعمل ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
