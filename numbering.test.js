const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const T=[];
  const r = await p.evaluate(async ()=>{
    const o={};
    db=null;                       // نعمل محلياً فقط
    CLOSURES=[]; OUT_RECS=[];

    // ① سجلات جديدة تأخذ ١، ٢، ٣ بالتتابع
    for(let i=0;i<3;i++){
      saveOutRec({id:'N'+i,seq:i+1,farmer:'فلاح '+i,plate:'',wh:'بركات',mat:'jet',
        empty:8000,gross:20000,net:12000,note:'',edited:false,
        createdAt:nowStr(),createdBy:'ح',dk:'2026-09-1'+i});
    }
    o.seq = OUT_RECS.slice().sort((a,b)=>a.seq-b.seq).map(r=>r.no).join(',');

    // ② التعديل لا يُغيّر الرقم
    const first=OUT_RECS.find(r=>r.id==='N0');
    const before=first.no;
    saveOutRec({...first,farmer:'اسم معدَّل',net:9999,edited:true});
    o.keptOnEdit = OUT_RECS.find(r=>r.id==='N0').no===before;

    // ③ المستورد يحتفظ برقمه الأصلي
    saveOutRec({id:'IMP',seq:99,no:777,farmer:'مستورد',plate:'',wh:'بركات',mat:'jet',
      empty:8000,gross:20000,net:12000,note:'',createdAt:nowStr(),createdBy:'ح',dk:'2026-09-20'});
    o.importKept = OUT_RECS.find(r=>r.id==='IMP').no===777;

    // ④ الرقم التالي يتجاوز الأعلى
    saveOutRec({id:'AFT',seq:100,farmer:'بعد',plate:'',wh:'بركات',mat:'jet',
      empty:8000,gross:20000,net:12000,note:'',createdAt:nowStr(),createdBy:'ح',dk:'2026-09-21'});
    o.afterMax = OUT_RECS.find(r=>r.id==='AFT').no===778;

    // ⑤ الفحص يكشف الناقص والمكرّر
    OUT_RECS=[{id:'a',seq:1,dk:'2026-09-01',net:1,no:1},{id:'b',seq:2,dk:'2026-09-02',net:1,no:1},
              {id:'c',seq:3,dk:'2026-09-03',net:1},{id:'d',seq:4,dk:'2026-09-04',net:1,no:5}];
    let sc=_numberingScan().sections.find(x=>x.node==='out_records');
    o.scanMiss=sc.miss; o.scanDup=sc.dup.join(','); o.scanGaps=sc.gaps.join(',');

    // ⑥ الترقيم يُصلحها بترتيب التاريخ
    OUT_RECS.forEach(r=>{delete r.no;});
    const d=_auditDs('out_records');
    const recs=OUT_RECS.slice().sort((x,y)=>String(x.dk).localeCompare(String(y.dk))||x.seq-y.seq);
    let n=0; recs.forEach(x=>{n++; d.save({...x,no:n});});
    sc=_numberingScan().sections.find(x=>x.node==='out_records');
    o.fixed = sc.miss===0 && sc.dup.length===0 && sc.gaps.length===0;
    o.order = OUT_RECS.slice().sort((a,b)=>a.no-b.no).map(r=>r.id).join(',');

    o.fmt = fNo(12);
    return o;
  });

  T.push(['سجلات جديدة تُرقَّم ١،٢،٣', r.seq==='1,2,3']);
  T.push(['التعديل لا يُغيّر الرقم', r.keptOnEdit]);
  T.push(['المستورد يحتفظ برقمه (٧٧٧)', r.importKept]);
  T.push(['الرقم التالي يتجاوز الأعلى (٧٧٨)', r.afterMax]);
  T.push(['الفحص يكشف سجلاً بلا رقم', r.scanMiss===1]);
  T.push(['الفحص يكشف الرقم المكرّر', r.scanDup==='1']);
  T.push(['الفحص يكشف الفجوات', r.scanGaps==='2,3,4']);
  T.push(['الترقيم يُصلح الكل بلا فجوة', r.fixed===true]);
  T.push(['الترتيب بالتاريخ', r.order==='a,b,c,d']);
  T.push(['صيغة العرض #٠٠١٢', r.fmt==='#٠٠١٢']);

  T.forEach(([t,ok])=>console.log(` ${ok?'PASS':'FAIL'} ${t}`));
  const f=T.filter(x=>!x[1]).length;
  console.log(f?`\n‼ فشل ${f}`:`\n✅ الترقيم التسلسلي سليم (${T.length})`);
  console.log('pageerrors:', errs.length?errs.join(' | '):'none');
  await b.close(); process.exit(f?1:0);
})();
