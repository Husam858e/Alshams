const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();

  const seeded=await p.evaluate(()=>{
    const D="2026-08-19";                       // أربعاء داخل أسبوع واحد
    // ثلاثة فلاحين، أسماء بصيغ مختلفة عمداً لاختبار التوحيد
    const names=["عبد الكريم","عبدالكريم","علاء حسين","حارث"];
    S.recs=[];
    let expTotal=0,expNet=0,expPaid=0;
    names.forEach((nm,i)=>{
      for(let k=0;k<2;k++){
        const net=1000*(i+1)+k*100, ppkg=100, final=net*ppkg;
        const paid=k===0?Math.round(final/2):0;
        S.recs.push({id:"J"+i+k,seq:i*10+k,dk:D,status:"weighed",driver:nm,
          plate:"P"+i+k,wh:YARD,mat:"jet",gross:net+2000,empty:2000,net,ppkg,final,
          kOn:false,nOn:false,wOn:false,
          payments:paid?[{amount:paid,at:"x",by:"y"}]:[],paid:false});
        expTotal+=final; expNet+=net; expPaid+=paid;
      }
    });
    return {D,expTotal,expNet,expPaid,count:S.recs.length};
  });

  // ── ① السجل الجامع: المجاميع = مجموع السجلات، وكل وصل مرة واحدة ──
  const j=await p.evaluate(d=>{
    const rows=getJamiData("buy","daily",d.D);
    return {rows:rows.length,
      sumNet:rows.reduce((s,x)=>s+(x.net||0),0),
      sumAmt:rows.reduce((s,x)=>s+(x.amount||0),0),
      sumCount:rows.reduce((s,x)=>s+(x.count||0),0),
      names:rows.map(x=>x.name)};
  },seeded);
  R.ok("الجامع: مجموع الأوزان = مجموع الوصولات", j.sumNet===seeded.expNet, {...j,exp:seeded.expNet});
  R.ok("الجامع: مجموع المبالغ = مجموع الوصولات", j.sumAmt===seeded.expTotal, {...j,exp:seeded.expTotal});
  R.ok("الجامع: كل وصل محسوب مرة واحدة", j.sumCount===seeded.count, {...j,exp:seeded.count});
  R.ok("الجامع: يوحّد «عبد الكريم» و«عبدالكريم»", j.rows===3, j);

  // ── ② المحصلة اليومية ──
  const c=await p.evaluate(d=>{
    const x=getCollData("daily",d.D);
    const flat=[];
    Object.values(x||{}).forEach(v=>{ if(Array.isArray(v))flat.push(...v); });
    return {keys:Object.keys(x||{}), recs:flat.length, raw:JSON.stringify(x).length};
  },seeded);
  R.ok("المحصلة تُرجع بيانات لليوم", c.recs>0||c.keys.length>0, c);

  // ── ③ الإحصائيات على الشاشة = مجموع السجلات ──
  const st=await p.evaluate(d=>{
    ["fM","fS","fW","fPaid"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="all";});
    const dt=document.getElementById("fDt"); if(dt)dt.value="";
    const q=document.getElementById("fSearch"); if(q)q.value="";
    renderRecs();
    const t=document.getElementById("FSm").innerText.replace(/[٠-٩]/g,ch=>"٠١٢٣٤٥٦٧٨٩".indexOf(ch));
    const nums=(t.match(/[\d,]+/g)||[]).map(x=>+x.replace(/,/g,""));
    return {text:t.replace(/\s+/g," "),nums};
  },seeded);
  R.ok("شريط الإحصاء يعرض عدد الوصولات الصحيح",
       st.nums.includes(seeded.count), {...st,exp:seeded.count});
  R.ok("شريط الإحصاء يعرض المجموع الصحيح",
       st.nums.includes(seeded.expTotal), {...st,exp:seeded.expTotal});
  R.ok("شريط الإحصاء يعرض المدفوع الصحيح",
       st.nums.includes(seeded.expPaid), {...st,exp:seeded.expPaid});

  // ── ④ سجل الدفعات الموحّد = كل الدفعات في التطبيق ──
  const pl=await p.evaluate(()=>{
    const all=collectAllPayments();
    const fromRecs=(S.recs||[]).reduce((s,r)=>s+(r.payments||[]).reduce((a,x)=>a+x.amount,0),0);
    return {logSum:all.filter(x=>x.src==="buy").reduce((s,x)=>s+x.amount,0), fromRecs,
            n:all.length};
  });
  R.ok("سجل الدفعات = مجموع دفعات الوصولات", pl.logSum===pl.fromRecs, pl);

  // ── ⑤ تصدير Excel = نفس عدد السجلات ──
  const xl=await p.evaluate(d=>{
    const rows=getXLData("daily","all",d.D);   // v17.48 — يتبع تاريخ الشاشة
    return {rows:Array.isArray(rows)?rows.length:-1};
  },seeded);
  R.ok("Excel يُصدّر كل وصولات اليوم", xl.rows>=seeded.count, {...xl,exp:seeded.count});

  // ── ⑥ الفلترة لا تُغيّر المجاميع الكلية للسجل الواحد ──
  const f=await p.evaluate(d=>{
    const all=getJamiData("buy","daily",d.D).reduce((s,x)=>s+x.amount,0);
    const wk =getJamiData("buy","weekly",d.D).reduce((s,x)=>s+x.amount,0);
    const mo =getJamiData("buy","monthly",d.D).reduce((s,x)=>s+x.amount,0);
    return {all,wk,mo};
  },seeded);
  R.ok("اليومي ⊆ الأسبوعي ⊆ الشهري", f.all<=f.wk&&f.wk<=f.mo, f);
  R.ok("كل السجلات في نفس اليوم ⇒ المجاميع متساوية", f.all===f.wk&&f.wk===f.mo, f);

  process.exit(R.done("صحّة التجميع",errs));
})();
