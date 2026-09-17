const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(500);
  const r = await p.evaluate(()=>{
    S.recs=[{id:'B1',dk:'2026-08-21',driver:'محمود عيد',plate:'جلاب',mat:'jet',wh:'بركات',
      status:'weighed',gross:30000,empty:8000,net:22000,ppkg:250,final:5500000,wFee:0,payments:[],
      nOn:true,transporter:'فنر',nC:88,nUP:300,naqlFee:26400,naqlPayments:[],
      createdAt:nowStr(),createdBy:'محمد'}];
    const recs=_getCustRecs('naql','فنر');
    const out=[];
    for(const per of ['daily','weekly','monthly','range','all']){
      const h=_buildCustPrintHTML('naql','فنر',per,toDay(),recs);
      out.push(`${per}: ${!h.includes('undefined')}`);
    }
    return out;
  });
  r.forEach(x=>console.log(` ${x.endsWith('true')?'PASS':'FAIL'} لا undefined في الترويسة — ${x}`));
  const f=r.filter(x=>!x.endsWith('true'));
  console.log(f.length?`\n‼ فشل ${f.length}`:`\n✅ الترويسة سليمة (${r.length})`);
  await b.close(); process.exit(f.length?1:0);
})();
