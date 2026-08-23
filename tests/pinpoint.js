const {chromium}=require("playwright");
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2200);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  await p.waitForTimeout(300);
  const out=await p.evaluate(()=>{
    const D=toDay();
    const STR=["driver","plate","damin","madmun","transporter","provider","service","recv",
               "purp","note","desc","receiver","driverPhone","empName","kType","farmer",
               "dest","role","name","month","title","who","by","createdBy","editBy",
               "loadBy","paidBy","confBy","weighBy","delBy"];
    // unique marker per field: <b>@field@</b>
    const mark=f=>`<b>@${f}@</b>`;
    const paint=o=>{STR.forEach(f=>o[f]=mark(f));return o;};
    const pay=[{amount:1,at:"2026-08-15 10:00",by:mark("by"),note:mark("note")}];
    const num={dk:D,seq:1,gross:9000,empty:3000,net:6000,ppkg:100,final:600000,
               price:100000,amount:50000,salary:500000,finalNet:400000,naqlFee:5000,
               trans:3000,kC:2,kP:1000,nC:1,nUP:5000,wPrice:1000,kabs:2,
               payments:pay,naqlPayments:pay,paid:false};
    S.recs=[paint({...num,id:"B1",status:"weighed",wh:YARD,mat:"jet",nOn:true,kOn:true,wOn:true})];
    SELL_RECS=[paint({...num,id:"S1",status:"weighed",mat:"jet",nOn:true})];
    DAM_RECS=[paint({...num,id:"D1",subRecs:{a:paint({...num,id:"SB1"})}})];
    SRF_RECS=[paint({...num,id:"R1"})];
    WRK_RECS=[paint({...num,id:"W1"})];
    MNL_RECS=[paint({...num,id:"M1"})];
    ARB_RECS=[paint({...num,id:"A1"})];
    EMP_LIST=[paint({...num,id:"E1",payType:"monthly"})];
    SAL_RECS=[paint({...num,id:"L1"})];
    ADV_RECS=[paint({...num,id:"V1"})];
    EMP_TXNS=[paint({...num,id:"T1",type:"bonus"})];
    TRASH=[{kind:"buy",rec:S.recs[0],delAt:"x",delBy:mark("delBy")}];

    const found={};   // container -> Set(field)
    const note=(host,html)=>{
      const m=html.match(/<b>@(\w+)@<\/b>/g);
      if(!m)return;
      found[host]=found[host]||new Set();
      m.forEach(x=>found[host].add(x.replace(/<\/?b>|@/g,"")));
    };
    Object.keys(window).filter(k=>/^(render|_render)/.test(k)&&typeof window[k]==="function")
      .forEach(k=>{try{window[k]();}catch(e){}});
    try{openPartialPay("B1","buy");}catch(e){}
    try{_naqlPayId="B1";_naqlPayType="buy";openNaqlPay("B1","buy",null);}catch(e){}
    try{renderTrash();}catch(e){}
    document.querySelectorAll("[id]").forEach(el=>{
      if(el.children.length>500)return;
      note(el.id, el.innerHTML);
    });
    // builders
    const bres={};
    [["buildReceipt",[S.recs[0]]],["buildSellReceipt",[SELL_RECS[0]]],
     ["buildDamReceipt",[DAM_RECS[0]]],["buildSrfReceipt",[SRF_RECS[0]]],
     ["buildWrkReceipt",[WRK_RECS[0]]],["buildArbReceipt",[ARB_RECS[0]]],
     ["buildSalReceipt",[SAL_RECS[0]]],
     ["buildDamSubReceipt",[DAM_RECS[0],Object.values(DAM_RECS[0].subRecs)[0]]]]
      .forEach(([n,a])=>{try{const v=window[n].apply(null,a);
        const m=(v||"").match(/<b>@(\w+)@<\/b>/g);
        if(m)bres[n]=[...new Set(m.map(x=>x.replace(/<\/?b>|@/g,"")))];}catch(e){}});

    const o={};
    // only report the innermost host per field to cut noise
    Object.entries(found).forEach(([k,v])=>{ if(/RL$|Grid$|List$|Res$|^m/.test(k)) o[k]=[...v]; });
    return {containers:o, builders:bres};
  });
  console.log("=== leaking fields by container ===");
  Object.entries(out.containers).forEach(([k,v])=>console.log("  "+k+": "+v.join(", ")));
  console.log("\n=== leaking fields by receipt builder ===");
  Object.entries(out.builders).forEach(([k,v])=>console.log("  "+k+": "+v.join(", ")));
  await b.close();
})();
