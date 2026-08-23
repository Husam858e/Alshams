const {chromium}=require("playwright");
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2200);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  const r=await p.evaluate(()=>{
    // LEGACY buy record: single transporter, no naqlList
    S.recs=[{id:"LEG1",seq:1,dk:toDay(),status:"weighed",driver:"علي",plate:"77أ",
      wh:YARD,mat:"jet",gross:10000,empty:4000,net:6000,ppkg:100,final:600000,
      payments:[{amount:100000,at:"x",by:"y"}],paid:false,
      nOn:true,transporter:"ناقل الشمس",nC:2,nUP:5000,naqlFee:10000,naqlPayments:[]}];
    const before=JSON.parse(JSON.stringify(S.recs[0]));
    const entries=_getNaqlBulkEntries("ناقل الشمس");
    if(!entries.length) return {err:"no entries"};
    _applyBulkNaqlEntryPayment(entries[0],5000,"");
    const after=S.recs[0];
    return {
      beforeKeys:Object.keys(before).length,
      afterKeys:Object.keys(after).length,
      driverLost: after.driver===undefined,
      finalLost: after.final===undefined,
      paymentsLost: after.payments===undefined,
      after:{driver:after.driver,plate:after.plate,final:after.final,net:after.net,status:after.status}
    };
  });
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
