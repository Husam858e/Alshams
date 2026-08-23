const {chromium}=require("playwright");
const A=[];const ok=(n,c,x)=>A.push((c?"PASS":"FAIL")+"  "+n+(c?"":"  <-- "+JSON.stringify(x).slice(0,300)));
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2200);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  await p.waitForTimeout(300);

  const r=await p.evaluate(()=>{
    const D=toDay();
    const NAME="عبد الكريم أبو خطاب";
    const NOTE='حمولة "مميزة" & سريعة';
    const rec={id:"N1",seq:1,dk:D,status:"weighed",driver:NAME,plate:"٢٢ أ ١٢٣",
      wh:YARD,mat:"jet",gross:10000,empty:4000,net:6000,ppkg:100,final:600000,
      note:NOTE,createdBy:"حسام عايد",payments:[{amount:100000,at:"2026-08-15 10:00",by:"حسام عايد",note:"دفعة"}],paid:false,
      nOn:true,transporter:"ناقل الشمس",nC:1,nUP:5000,naqlFee:5000,naqlPayments:[]};
    S.recs=[rec];renderRecs();
    const listText=document.getElementById("RL").innerText;
    const receipt=buildReceipt(rec);
    // render receipt into a detached node to read its text
    const d=document.createElement("div");d.innerHTML=receipt;
    const rText=d.innerText;
    openPartialPay("N1","buy");
    const modalText=document.getElementById("mPartialPay").innerText;
    closeM();
    return {listText,rText,modalText,
      rawHasDoubleEsc:/&amp;(lt|gt|quot|#39|amp);/.test(receipt+document.getElementById("RL").innerHTML)};
  });

  ok("driver name renders correctly in list", r.listText.includes("عبد الكريم أبو خطاب"), r.listText.slice(0,200));
  ok("quotes+ampersand note renders literally in receipt", r.rText.includes('حمولة "مميزة" & سريعة'), r.rText.slice(0,400));
  ok("driver name renders in receipt", r.rText.includes("عبد الكريم أبو خطاب"));
  ok("transporter renders in receipt", r.rText.includes("ناقل الشمس"));
  ok("payments section title now visible in receipt", r.rText.includes("سجل الدفعات"), r.rText.slice(0,600));
  ok("name renders in payment modal", r.modalText.includes("عبد الكريم أبو خطاب"), r.modalText.slice(0,200));
  ok("no double-escaping artifacts", r.rawHasDoubleEsc===false);
  console.log(A.join("\n"));
  console.log("\npage errors: "+(errs.length?errs.join(" | "):"(none)"));
  console.log(A.some(x=>x.startsWith("FAIL"))?"\n*** FAILURES ***":"\nALL PASSED");
  await b.close();
})();
