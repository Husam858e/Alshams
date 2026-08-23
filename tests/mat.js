const {chromium}=require("playwright");
const A=[];const ok=(n,c,x)=>A.push((c?"PASS":"FAIL")+"  "+n+(c?"":"   <-- "+String(x).slice(0,300)));
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[];p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2300);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  await p.waitForTimeout(300);

  const r=await p.evaluate(()=>{
    const XSS='<b>BAD</b>';
    const base={dk:toDay(),seq:1,status:"weighed",gross:3550,empty:1775,net:1775,
                ppkg:535,final:949625,payments:[],paid:false,wh:YARD};
    const sell={...base,id:"SS",driver:"شاكر شطب",plate:"فلاح",dest:"بغداد",
                mat:"jet",note:"تم تعديله",transporter:"حارث كريم",nOn:true,naqlFee:45000};
    const buy ={...base,id:"BB",driver:"شاكر شطب",plate:"77",mat:"gravel",note:XSS};
    const sHTML=buildSellReceipt(sell), bHTML=buildReceipt(buy);
    // render to read what the user actually sees
    const d=document.createElement("div"); d.innerHTML=sHTML;
    const row=[...d.querySelectorAll(".prr")].find(x=>x.textContent.includes("نوع الحمولة"));
    const d2=document.createElement("div"); d2.innerHTML=bHTML;
    const row2=[...d2.querySelectorAll(".prr")].find(x=>x.textContent.includes("نوع الحمولة"));
    return {
      sellHasImgTag: /<img[^>]+mat-ico-jet/.test(sHTML),
      sellShowsRawMarkup: sHTML.includes("&lt;img"),
      sellRowText: row?row.textContent.trim():"(missing)",
      sellRowImgCount: row?row.querySelectorAll("img").length:0,
      buyRowText: row2?row2.textContent.trim():"(missing)",
      buyRowImgCount: row2?row2.querySelectorAll("img").length:0,
      // user data still escaped?
      noteEscaped: bHTML.includes("&lt;b&gt;BAD"),
      noteRawLeak: bHTML.includes("<b>BAD</b>"),
      // unknown material falls back safely
      unknown: (()=>{const h=buildReceipt({...buy,mat:"<i>x</i>"});
                     return {leak:h.includes("<i>x</i>"), esc:h.includes("&lt;i&gt;x")};})(),
    };
  });

  ok("sell receipt emits a real <img> icon", r.sellHasImgTag, r);
  ok("sell receipt no longer prints raw markup", !r.sellShowsRawMarkup, r);
  ok("sell material row renders 1 image", r.sellRowImgCount===1, r);
  ok("sell material row text is clean", r.sellRowText.replace(/\s+/g," ")==="نوع الحمولة الجت المكبوس", r.sellRowText);
  ok("buy material row renders 1 image", r.buyRowImgCount===1, r);
  ok("buy material row text is clean", r.buyRowText.replace(/\s+/g," ")==="نوع الحمولة الجرش", r.buyRowText);
  ok("user note still escaped", r.noteEscaped && !r.noteRawLeak, r);
  ok("unknown material label escaped, not executed", r.unknown.esc && !r.unknown.leak, r.unknown);

  console.log(A.join("\n"));
  console.log("\npage errors: "+(errs.length?errs.join(" | "):"(none)"));
  console.log(A.some(x=>x.startsWith("FAIL"))?"\n*** FAILURES ***":"\nALL PASSED");
  await b.close();
})();
