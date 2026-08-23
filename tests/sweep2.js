const {chromium}=require("playwright");
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[]; p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2200);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();});
  await p.waitForTimeout(400);

  const out=await p.evaluate(()=>{
    const X='<img src=q onerror="window.__pwn=1">';
    const D=toDay();
    // every user-writable string field carries the payload
    const STR=["driver","plate","damin","madmun","transporter","provider","service","recv",
               "purp","note","desc","receiver","driverPhone","empName","kType","farmer",
               "dest","role","name","month","title","who","by","createdBy","editBy",
               "loadBy","paidBy","confBy","weighBy","delBy"];
    const paint=o=>{STR.forEach(f=>o[f]=X);return o;};
    const pay=[{amount:1,at:"2026-08-15 10:00",by:X,note:X}];
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
    TRASH=[{kind:"buy",rec:S.recs[0],delAt:"2026-08-15 10:00",delBy:X}];

    const bad=[],threw=[];
    const tryS=(n,fn)=>{try{const v=fn();if(typeof v==="string"&&v.includes("<img src=q"))bad.push(n);}
                        catch(e){threw.push(n+": "+e.message);}};
    const tryV=(n,fn)=>{try{fn();}catch(e){threw.push(n+": "+e.message);}};

    // every receipt / HTML builder reachable by name
    Object.keys(window).filter(k=>/^build.*(Receipt|HTML|Sec)$/.test(k)&&typeof window[k]==="function")
      .forEach(k=>{
        const f=window[k];
        const args=[[S.recs[0]],[SELL_RECS[0]],[DAM_RECS[0]],
                    [DAM_RECS[0],Object.values(DAM_RECS[0].subRecs)[0]],
                    [SRF_RECS[0]],[WRK_RECS[0]],[ARB_RECS[0]],[SAL_RECS[0]],['buy'],[]];
        for(const a of args){ try{ const v=f.apply(null,a);
          if(typeof v==="string"&&v.includes("<img src=q")){bad.push(k);break;} }catch(e){} }
      });
    // every render* / open* that paints the DOM
    Object.keys(window).filter(k=>/^(render|show|open|_render)/.test(k)&&typeof window[k]==="function")
      .forEach(k=>{ try{ window[k](); }catch(e){} });
    tryV("openPartialPay",()=>openPartialPay("B1","buy"));
    tryV("openNaqlPay",()=>{_naqlPayId="B1";_naqlPayType="buy";openNaqlPay("B1","buy",null);});
    tryV("renderTrash",()=>renderTrash());
    tryV("toolsGlobalSearch",()=>{const i=document.getElementById("toolsSearchInp");if(i)i.value="a";toolsGlobalSearch();});

    return {bad:[...new Set(bad)],threw,
            pwned:!!window.__pwn,
            liveImgs:[...document.querySelectorAll('img[onerror]')]
                       .map(e=>(e.closest('[id]')||{}).id||'(no id)')};
  });
  await p.waitForTimeout(600);
  const pwnedAfter=await p.evaluate(()=>!!window.__pwn);

  console.log("builders leaking payload :", out.bad.length?out.bad:"(none)");
  console.log("live img[onerror] hosts  :", out.liveImgs.length?out.liveImgs:"(none)");
  console.log("payload executed         :", out.pwned||pwnedAfter);
  console.log("page errors              :", errs.length?errs.slice(0,4):"(none)");
  console.log((out.bad.length===0&&out.liveImgs.length===0&&!(out.pwned||pwnedAfter))
    ?"\nEXHAUSTIVE SWEEP CLEAN":"\n*** ISSUES REMAIN ***");
  await b.close();
})();
