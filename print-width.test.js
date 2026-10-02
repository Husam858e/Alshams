/* يقيس أين يقع الحبر عرضياً على الورق — لا يفحص CSS بل النتيجة.
   العطل الأول: الوصل خرج مقطوعاً من طرفه الأيسر لأن الحبر كان
   يمتدّ ٧٣٫٩ ملم، ورأس الطابعة يطبع شريطاً أضيق في وسط الورق.
   العطل الثاني (v17.80): خرج مقطوعاً من الطرفين. مستند الطباعة
   الحقيقي كان يكتب <body style="margin:0"> فيُلصق الوصل بالحافة
   اليمنى، وهذا الفحص كان يبني مستنداً خاصاً به بلا ذلك فيراه
   متوسّطاً. الآن يقيس ما تبنيه _printDoc نفسها — المستند الذي يُطبع. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const { execSync } = require('child_process');

const DIR = '/tmp/claude-0/-home-user-Alshams/98bcaae7-08e9-5aed-8674-486f23e5b998/scratchpad';
const DPI = 203;                 // دقّة رؤوس الطباعة الحرارية
const PX  = DPI/25.4;

/* يبني مستند الطباعة الحقيقي (نفس مسار الطباعة لا نسخةً منه) */
async function buildDoc(paperMM){
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox','--ignore-certificate-errors'] });
  const p = await b.newPage();
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);
  const out = await p.evaluate((mm)=>{
    db=null;
    if(mm)localStorage.setItem("wShamsPaperW",String(mm));
    else localStorage.removeItem("wShamsPaperW");
    S.recs=[];SELL_RECS=[];MNL_RECS=[];
    /* أعرض جدول في التطبيق: سبعة أعمدة بأرقام طويلة */
    for(let i=0;i<6;i++)MNL_RECS.push({id:'M'+i,seq:i+1,no:i+1,
      dk:'2026-09-'+String(22+i).padStart(2,'0'),
      transporter:'ابو عبد الله خالدية',farmer:'كرواي الطويل',plate:'',
      kabs:10,pricePerK:29400,naqlFee:294000,naqlPayments:[]});
    const R={q:"ابو عبد الله",from:"",to:"",totalHits:6,
      totalAmt:1764000,totalPaid:0,totalRem:1764000,
      groups:[{d:_DS("naql"),hits:_allNaqlFees(),amt:1764000,paid:0,rem:1764000}]};
    const old=window._toolsSearchData;
    window._toolsSearchData=()=>R;
    let html; try{ html=buildToolsSearchHTML(); } finally{ window._toolsSearchData=old; }
    /* وصل الشراء نفسه الذي خرج مقطوعاً في الصورة */
    const r={id:'X',seq:1,no:4288,dk:'2026-10-01',status:'weighed',driver:'ابو شاهر',plate:'جلاب',
      wh:'ابراهيم',mat:'jet',gross:3885,empty:1705,net:2180,ppkg:350,wFee:763000,
      kOn:false,kabsFee:0,wOn:true,wPrice:3000,waslFee:3000,nOn:true,nDeduct:true,
      naqlList:[{id:'n',transporter:'شاكر طالب',nC:100,nUP:500,naqlFee:50000}],naqlFee:50000,
      final:710000,payments:[],createdAt:'2026-10-01 08:00',createdBy:'حسام'};
    S.recs=[r];
    const rec=buildReceipt(r);
    openPaperRuler(); const ruler=_printHTML;
    closePrint&&closePrint();
    return {doc:_printDoc(html,'t'), rec:_printDoc(rec,'v'), ruler:_printDoc(ruler,'r'),
            css:getPDFCss(), w:paperW()};
  }, paperMM);
  /* ملف الـPDF الذي يُشارَك إلى تطبيق الطابعة — من مساره الحقيقي */
  const toPDF = full => p.evaluate(async(full)=>{
    const blob=await _generatePDFBlob(full,'t'); if(!blob)return null;
    const u=new Uint8Array(await blob.arrayBuffer()); let s='';
    for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]); return btoa(s);
  }, full);
  out.pdf = await toPDF(out.rec);
  out.rulerPdf = await toPDF(out.ruler);
  await b.close();
  return out;
}

/* يقيس حبر ملف PDF جاهز: المقاس من الملف نفسه */
function measurePDF(b64, tag){
  const file=`${DIR}/pw_${tag}`;
  fs.writeFileSync(file+'.pdf', Buffer.from(b64,'base64'));
  execSync(`cd ${DIR} && rm -f pw_${tag}_pg*.png && pdftoppm -r ${DPI} -png -f 1 -l 1 pw_${tag}.pdf pw_${tag}_pg`);
  const png=fs.readdirSync(DIR).find(f=>f.startsWith(`pw_${tag}_pg`));
  const [pw,left,right]=execSync(`cd ${DIR} && python3 -c "
from PIL import Image
im=Image.open('${png}').convert('L'); w,h=im.size; px=im.load()
l=w; r=0
for y in range(h):
  for x in range(w):
    if px[x,y]<200:
      if x<l: l=x
      if x>r: r=x
print(w,l,r)"`).toString().trim().split(' ').map(Number);
  return{page:pw/PX, left:left/PX, right:right/PX, ink:(right-left)/PX,
         mRight:left/PX, mLeft:(pw-right)/PX};
}

/* يطبع المستند إلى PDF بعرض ورقٍ معلوم ويقيس امتداد الحبر */
async function measure(html, pageMM, tag){
  const file=`${DIR}/pw_${tag}`;
  fs.writeFileSync(file+'.html', html);
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const p=await b.newPage();
  await p.goto('file://'+file+'.html');
  await p.waitForTimeout(400);
  await p.pdf({path:file+'.pdf',width:pageMM+'mm',height:'400mm',
    printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});
  await b.close();
  execSync(`cd ${DIR} && rm -f pw_${tag}_pg*.png && pdftoppm -r ${DPI} -png -f 1 -l 1 pw_${tag}.pdf pw_${tag}_pg`);
  const png=fs.readdirSync(DIR).find(f=>f.startsWith(`pw_${tag}_pg`));
  const o=execSync(`cd ${DIR} && python3 -c "
from PIL import Image
im=Image.open('${png}').convert('L'); w,h=im.size; px=im.load()
l=w; r=0
for y in range(h):
  for x in range(w):
    if px[x,y]<200:
      if x<l: l=x
      if x>r: r=x
print(w,l,r)"`).toString().trim().split(' ').map(Number);
  const [pw,left,right]=o;
  return{page:pw/PX, left:left/PX, right:right/PX, ink:(right-left)/PX,
         mRight:left/PX, mLeft:(pw-right)/PX};
}

(async()=>{
  const T=[];
  const add=(n,ok,d)=>T.push([n+(d?` (${d})`:""),ok]);

  const mid=m=>Math.abs(m.mRight-m.mLeft)<1.2;
  const lr=m=>`يمين ${m.mRight.toFixed(1)} · يسار ${m.mLeft.toFixed(1)}`;

  /* ① الافتراضي ٦٤ ملم: يدخل حتى شريطاً ضيقاً (~٦٨) بهامش */
  const d=await buildDoc(null);
  add('العرض الافتراضي ٦٤ ملم', d.w===64, d.w+'mm');

  /* ② وصل الشراء على ورق ٣ بوصات — ما خرج مقطوعاً من الطرفين */
  const r76=await measure(d.rec,76.2,'rec76');
  add('الوصل لا يتجاوز ٦٤ ملم', r76.ink<=64.5, r76.ink.toFixed(1)+'mm');
  add('الوصل يتوسّط ورق ٣ بوصات', mid(r76), lr(r76));
  /* شريط ٦٨ في وسط ٧٦٫٢ ⇒ من ٤٫١ إلى ٧٢٫١ */
  add('كل الحبر داخل شريط ٦٨ ملم', r76.left>=4.1&&r76.right<=72.1,
      `${r76.left.toFixed(1)} → ${r76.right.toFixed(1)}`);
  const r80=await measure(d.rec,80,'rec80');
  add('ويتوسّط ورق ٨٠', mid(r80), lr(r80));

  /* ③ حارس: لو عاد أحدٌ وكتب <body style="margin:0"> يبقى الوصل في الوسط */
  const rIn=await measure(d.rec.replace('<body>','<body style="margin:0;padding:0">'),76.2,'recIn');
  add('هامش مكتوب على body لا يُلصقه بالحافة', mid(rIn), lr(rIn));
  add('مستند الطباعة بلا هامشٍ مكتوب على body', !/<body[^>]*style=/i.test(d.rec));

  /* ④ أعرض جدول في التطبيق */
  const t76=await measure(d.doc,76.2,'tbl76');
  add('الجدول العريض داخل العرض ومتوسّط', t76.ink<=64.5&&mid(t76),
      `${t76.ink.toFixed(1)}mm · ${lr(t76)}`);

  /* ⑤ صفحة القياس: الأشرطة متمركزة وبعرضها الحقيقي (أعرضها ٧٦) */
  const k=await measure(d.ruler,80,'ruler80');
  add('صفحة القياس: أعرض شريط ٧٦ ملم في الوسط', Math.abs(k.ink-76)<0.6&&mid(k),
      `${k.ink.toFixed(1)}mm · ${lr(k)}`);

  /* ⑥ ملف الـPDF المُرسَل لتطبيق الطابعة: التطبيق يُكبّره إلى عرض
     الورق كله، ورأس الطابعة لا يطبع إلا وسطه. فالمهمّ نسبة الهامش
     لا مقداره: يُحاكى التكبير إلى ورق ٨٠ و٧٦٫٢ ويُقاس بالشريط. */
  add('توليد PDF نجح', !!d.pdf);
  if(d.pdf){
    const f=measurePDF(d.pdf,'pdf');
    add('صفحة الـPDF ٨٠ ملم والوصل ٦٤ في وسطها',
        Math.abs(f.page-80)<0.6&&f.ink<=64.5&&mid(f), `${f.page.toFixed(1)}mm · ${f.ink.toFixed(1)} · ${lr(f)}`);
    /* مكبَّرة إلى ورق P: الحبر من left·P/page إلى right·P/page؛ الشريط B في الوسط */
    const fit=(P,B)=>{const k=P/f.page,a=(P-B)/2;return f.left*k>=a&&f.right*k<=P-a;};
    add('مكبَّرة إلى ورق ٨٠: داخل شريط ٧٢', fit(80,72));
    add('مكبَّرة إلى ورق ٧٦٫٢: داخل شريط ٦٨', fit(76.2,68));
    add('مكبَّرة إلى ورق ٨٠: داخل شريط ٦٨', fit(80,68));
  }
  /* صفحة القياس بالـPDF نفسه: الأشرطة الأعرض من الوصل لا تُقصّ،
     فالرقم المختار منها يصدق على الوصل أيّاً كان تكبير التطبيق */
  if(d.rulerPdf){
    const g=measurePDF(d.rulerPdf,'rulerpdf');
    add('صفحة القياس PDF: ٨٠ ملم وأعرض شريط ٧٦ في الوسط',
        Math.abs(g.page-80)<0.6&&Math.abs(g.ink-76)<0.8&&mid(g), `${g.page.toFixed(1)}mm · ${g.ink.toFixed(1)} · ${lr(g)}`);
  } else add('صفحة القياس PDF', false);

  /* ⑦ الإعداد يُحترم: ٤٨ ملم لورق البوصتين */
  const d48=await buildDoc(48);
  const m58=await measure(d48.rec,58,'d48p58');
  add('إعداد ٤٨ ملم يُحترم', d48.w===48&&m58.ink<=48.5, m58.ink.toFixed(1)+'mm');
  add('ويتوسّط ورق ٥٨', mid(m58), lr(m58));

  /* القواعد تُفحص بعد نزع التعليقات: التعليقات تشرح ما لا يُفعل،
     فمطابقتها نصّاً تُنتج فشلاً كاذباً. */
  const rules=d.css.replace(/\/\*[\s\S]*?\*\//g,"");
  /* ④ لا مقاس صفحة صريح — يُفسد الطباعة على أندرويد */
  add('لا @page size صريح', !/@page\s*\{[^}]*\bsize\s*:/i.test(rules));
  /* ⑤ ولا قواعد منع كسرٍ تُنتج فراغات على البكرة */
  add('لا منع كسر في الطباعة',
      !/page-break-inside\s*:\s*avoid|break-inside\s*:\s*avoid/i.test(rules));

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ عرض الطباعة داخل شريط الطابعة ('+T.length+')'));
  process.exit(bad?1:0);
})();
