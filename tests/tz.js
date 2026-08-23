const {chromium}=require("playwright");
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const ctx=await b.newContext({timezoneId:"Asia/Baghdad"});   // UTC+3, كالعراق
  const p=await ctx.newPage();
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2300);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  const r=await p.evaluate(()=>{
    // أسبوع يبدأ الاثنين ٢٠٢٦-٠٨-١٧ وينتهي الأحد ٢٠٢٦-٠٨-٢٣
    const week=["2026-08-17","2026-08-18","2026-08-19","2026-08-20","2026-08-21","2026-08-22","2026-08-23"];
    const recs=week.map((dk,i)=>({id:"X"+i,dk,final:1000,payments:[],paid:false}));
    const got=_filterByPeriod(recs,"weekly","2026-08-19").map(x=>x.dk);
    const missing=week.filter(d=>!got.includes(d));
    return {tzOffsetMin:new Date().getTimezoneOffset(), got, missing,
            weekKeys:_ds(_D("2026-08-17"))};
  });
  console.log("timezone offset (min, negative = east of UTC):", r.tzOffsetMin);
  console.log("days that SHOULD be in the week: 7");
  console.log("days actually returned:", r.got.length, r.got);
  console.log("DROPPED:", r.missing.length?r.missing:"(none)");
  await b.close();
})();
