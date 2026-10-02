/* يقيس أين يقع الحبر عرضياً على الورق — لا يفحص CSS بل النتيجة.
   العطل الواقع: الوصل خرج مقطوعاً من طرفه الأيسر لأن الحبر كان
   يمتدّ ٧٣٫٩ ملم، ورأس الطابعة ذات الثلاث بوصات يطبع ٧٢ ملم فقط
   في وسط الورق. وما تجاوز الشريط لا حبر له أصلاً. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const { execSync } = require('child_process');

const DIR = '/tmp/claude-0/-home-user-Alshams/98bcaae7-08e9-5aed-8674-486f23e5b998/scratchpad';
const DPI = 203;                 // دقّة رؤوس الطباعة الحرارية
const PX  = DPI/25.4;

/* يبني مستند الطباعة الحقيقي (نفس مسار الطباعة لا نسخةً منه) */
async function buildDoc(paperMM){
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
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
    return {html, css:getPDFCss(), w:paperW()};
  }, paperMM);
  await b.close();
  return out;
}

/* يطبع المستند إلى PDF بعرض ورقٍ معلوم ويقيس امتداد الحبر */
async function measure(doc, pageMM, tag){
  const file=`${DIR}/pw_${tag}`;
  fs.writeFileSync(file+'.html',
    `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
     <style>${doc.css}</style></head><body>${doc.html}</body></html>`);
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const p=await b.newPage();
  await p.goto('file://'+file+'.html');
  await p.waitForTimeout(400);
  await p.pdf({path:file+'.pdf',width:pageMM+'mm',height:'400mm',
    printBackground:true,margin:{top:0,right:0,bottom:0,left:0}});
  await b.close();
  execSync(`cd ${DIR} && pdftoppm -r ${DPI} -png -f 1 -l 1 pw_${tag}.pdf pw_${tag}_pg`);
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

  /* ① الافتراضي: ٧٢ ملم — شريط الطابعة ذات الثلاث بوصات */
  const d72=await buildDoc(null);
  add('العرض الافتراضي ٧٢ ملم', d72.w===72, d72.w+'mm');

  const m80=await measure(d72,80,'d72p80');
  add('الحبر لا يتجاوز شريط الطباعة', m80.ink<=72.5, m80.ink.toFixed(1)+'mm');
  add('ويتوسّط الورق', Math.abs(m80.mRight-m80.mLeft)<1.2,
      `يمين ${m80.mRight.toFixed(1)} · يسار ${m80.mLeft.toFixed(1)}`);
  /* شريط الطباعة ٧٢ ملم في وسط ورق ٨٠ ⇒ من ٤ إلى ٧٦ */
  add('كل الحبر داخل الشريط ٤–٧٦ ملم',
      m80.left>=3.5&&m80.right<=76.5,
      `${m80.left.toFixed(1)} → ${m80.right.toFixed(1)}`);

  /* ② ورق ثلاث بوصات بالضبط (٧٦٫٢ ملم) */
  const m76=await measure(d72,76.2,'d72p76');
  add('على ورق ٣ بوصة أيضاً', m76.ink<=72.5&&m76.left>=1.5&&m76.right<=74.7,
      `${m76.left.toFixed(1)} → ${m76.right.toFixed(1)}`);

  /* ③ الإعداد يُحترم: ٤٨ ملم لورق البوصتين */
  const d48=await buildDoc(48);
  const m58=await measure(d48,58,'d48p58');
  add('إعداد ٤٨ ملم يُحترم', d48.w===48&&m58.ink<=48.5, m58.ink.toFixed(1)+'mm');
  add('ويتوسّط ورق ٥٨', Math.abs(m58.mRight-m58.mLeft)<1.2,
      `يمين ${m58.mRight.toFixed(1)} · يسار ${m58.mLeft.toFixed(1)}`);

  /* القواعد تُفحص بعد نزع التعليقات: التعليقات تشرح ما لا يُفعل،
     فمطابقتها نصّاً تُنتج فشلاً كاذباً. */
  const rules=d72.css.replace(/\/\*[\s\S]*?\*\//g,"");
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
