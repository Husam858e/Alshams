/* الجداول العريضة بطاقاتُ حقول في الطباعة (v17.86).
   كشف «حساب النقال» تسعة أعمدة على ورق ٥٨ ملم: كانت الكلمة تنكسر
   حرفاً حرفاً وتنفصل حروفها في الـPDF. يتحقق هذا الفحص من المستند
   الذي يُطبع فعلاً (_printDoc) ومن تخطيطه على ورق ٥٨:
   لا كلمة تنكسر، ولا قيمة تضيع، والبطاقات بترتيبٍ واحد. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const DIR = '/tmp/claude-0/-home-user-Alshams/98bcaae7-08e9-5aed-8674-486f23e5b998/scratchpad';
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(()=>{
    db=null; localStorage.removeItem("wShamsPaperW");
    const o={};
    S.recs=[['ابو مسلم خالية','2026-08-22'],['ابو شاهر','2026-08-21'],['ابو مسلم خالي','2026-08-18']].map(([f,dk],i)=>({
      id:'B'+i,seq:i+1,no:10+i,dk,driver:f,plate:'تريلة',mat:'jet',wh:'',status:'weighed',net:1000,ppkg:300,final:300000,payments:[],
      nOn:true,transporter:'محمد الحياني',nC:1,nUP:300000,naqlFee:300000,naqlPayments:[]}));
    SELL_RECS=[];DAM_RECS=[];MNL_RECS=[];
    const html=_buildCustPrintHTML('naql','محمد الحياني','custom',toDay(),_getCustRecs('naql','محمد الحياني'));
    const doc=_printDoc(html,'t');
    o.doc=doc;
    const d=new DOMParser().parseFromString(doc,"text/html");
    const src=new DOMParser().parseFromString(html,"text/html");
    const srcTbl=[...src.querySelectorAll("table.coltbl")].find(t=>t.rows[0]&&t.rows[0].cells.length>5);
    o.srcCols = srcTbl?srcTbl.rows[0].cells.length:0;
    /* ① الجدول العريض صار بطاقات */
    o.noWideTable = ![...d.querySelectorAll("table.coltbl")].some(t=>t.rows[0]&&t.rows[0].cells.length>_stkCols());
    const cards=[...d.querySelectorAll(".stk .stk-card")];
    o.cards = cards.length===4;                         // ثلاثة وصولات + المجموع
    o.totCard = cards.length&&cards[cards.length-1].classList.contains("tot")
             && cards[cards.length-1].textContent.indexOf("٩٠٠,٠٠٠")>=0;
    /* ② كل قيمة في الجدول الأصلي موجودة في البطاقات */
    const want=[...srcTbl.querySelectorAll("tbody td")].map(c=>c.textContent.replace(/\s+/g," ").trim()).filter(Boolean);
    const got=d.querySelector(".stk").textContent.replace(/\s+/g," ");
    o.missing = want.filter(w=>got.indexOf(w)<0);
    /* ③ ترتيب الحقول واحدٌ في كل بطاقة */
    const order=c=>[...c.querySelectorAll(".stk-k")].map(k=>k.textContent).join("|");
    const data=cards.filter(c=>!c.classList.contains("tot"));
    o.sameOrder = data.length===3 && data.every(c=>order(c)===order(data[0]));
    o.order0 = data.length?order(data[0]):"";
    /* ④ ما يتّسع يبقى جدولاً: جدول بأربعة أعمدة */
    const small=`<table class="coltbl"><thead><tr><th>أ</th><th>ب</th><th>ج</th><th>د</th></tr></thead><tbody><tr><td>١</td><td>٢</td><td>٣</td><td>٤</td></tr></tbody></table>`;
    o.smallKept = _stackWide(small).indexOf("<table")>=0;
    /* ⑤ طباعة المحدَّد مصمَّمة بحقولها — لا تُمسّ */
    const sel=`<table class="coltbl seltbl"><thead><tr><th>#</th><th>١</th><th>٢</th><th>٣</th><th>٤</th><th>٥</th><th>٦</th></tr></thead><tbody><tr><td>1</td><td>a</td><td>b</td><td>c</td><td>d</td><td>e</td><td>f</td></tr></tbody></table>`;
    o.selKept = _stackWide(sel).indexOf("seltbl")>=0;
    /* ⑥ على ورق ٨٠ يتّسع جدولٌ بسبعة أعمدة فيبقى جدولاً */
    localStorage.setItem("wShamsPaperW","80");
    const seven=`<table class="coltbl"><thead><tr>${"<th>ع</th>".repeat(7)}</tr></thead><tbody><tr>${"<td>١</td>".repeat(7)}</tr></tbody></table>`;
    o.wideKept80 = _stackWide(seven).indexOf("<table")>=0;
    localStorage.removeItem("wShamsPaperW");
    /* ⑦ لا يُكسر ما ليس فيه جدول */
    o.plainSame = _stackWide("<div>نص</div>")==="<div>نص</div>";
    return o;
  });

  /* ⑧ التخطيط الفعلي على ورق ٥٨: لا كلمة تنقسم على سطرين */
  fs.writeFileSync(DIR+'/stk.html', r.doc);
  const b2 = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p2 = await b2.newPage({ viewport:{width:Math.round(76.2*96/25.4),height:900} });
  await p2.emulateMedia({media:'print'});
  await p2.goto('file://'+DIR+'/stk.html');
  await p2.waitForTimeout(400);
  const lay = await p2.evaluate(()=>{
    const broken=[];
    document.querySelectorAll(".stk-v,.stk-k,.stk-hd").forEach(el=>{
      const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      let n; while((n=w.nextNode())){
        const re=/\S+/g; let m;
        while((m=re.exec(n.data))){
          const rg=document.createRange(); rg.setStart(n,m.index); rg.setEnd(n,m.index+m[0].length);
          const tops=new Set([...rg.getClientRects()].map(x=>Math.round(x.top)));
          if(tops.size>1)broken.push(m[0]);
        }
      }
    });
    const stk=document.querySelector(".stk");
    return {broken, overflow: stk? stk.scrollWidth>stk.clientWidth+1 : true};
  });
  await b2.close();

  const T=[
    ['الجدول الأصلي تسعة أعمدة',               r.srcCols===9],
    ['صار بطاقاتٍ على ورق ٥٨',                 r.noWideTable],
    ['بطاقة لكل وصل وبطاقة للمجموع',            r.cards],
    ['بطاقة المجموع بمبلغها',                   r.totCard],
    ['لا قيمة تضيع',                            r.missing.length===0],
    ['الحقول بترتيبٍ واحد في كل بطاقة',          r.sameOrder],
    ['لا كلمة تنقسم على سطرين',                 lay.broken.length===0],
    ['ولا شيء يتجاوز عرض الورق',                !lay.overflow],
    ['الجدول الذي يتّسع يبقى جدولاً',            r.smallKept],
    ['طباعة المحدَّد لا تُمسّ',                  r.selKept],
    ['على ورق ٨٠ يبقى ذو السبعة جدولاً',          r.wideKept80],
    ['ما ليس فيه جدول لا يتغيّر',                r.plainSame],
    ['بلا أخطاء جافاسكربت',                     errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad){ delete r.doc; console.log('\n'+JSON.stringify({...r,lay},null,1)); }
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ الجداول العريضة بطاقاتٌ مقروءة ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
