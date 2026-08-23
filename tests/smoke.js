const {chromium}=require("playwright");
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const p=await b.newPage();
  const errs=[],logs=[];
  p.on("pageerror",e=>errs.push("PAGEERROR: "+e.message));
  p.on("console",m=>{ if(m.type()==="error")logs.push("console.error: "+m.text()); });
  // block outbound (firebase/fonts) to simulate the offline yard
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(3000);

  console.log("=== boot errors ===");
  console.log(errs.length?errs.join("\n"):"(none)");
  console.log(logs.length?logs.slice(0,5).join("\n"):"");

  // login screen visible?
  console.log("login visible:", await p.isVisible("#LS"));
  console.log("app hidden   :", !(await p.isVisible("#AS")));

  // --- login flow ---
  await p.click("#u1");
  for(const d of [2,0,0,4]) await p.click(`.nk[onclick="np(${d})"]`);
  await p.waitForTimeout(400);
  // fall back to keyboard entry
  if(!(await p.evaluate(()=>!!window.S&&!!S.cu))){
    await p.evaluate(()=>{S.pin="2004";});
    await p.evaluate(()=>doLogin());
  }
  await p.waitForTimeout(600);
  console.log("logged in    :", await p.evaluate(()=>!!S.cu));
  console.log("app visible  :", await p.isVisible("#AS"));

  // --- unit-ish checks of the fixed functions ---
  const r=await p.evaluate(()=>{
    const out={};
    // Fix 1: getPaidTotal must honour amount-based records
    out.paidTotal_amount = getPaidTotal({paid:true, amount:50000});      // expect 50000
    out.paidTotal_final  = getPaidTotal({paid:true, final:70000});       // expect 70000
    out.paidTotal_unpaid = getPaidTotal({paid:false, amount:50000});     // expect 0
    out.fullyPaid_legacy = isFullyPaid({paid:true, amount:50000});       // expect true
    // Fix: esc applied
    out.escaped = esc('<img src=x onerror=alert(1)>');
    // Fix: showToast must not throw when node missing
    const t=document.getElementById("toast"); t.id="toast_tmp";
    let threw=false; try{ showToast("x"); }catch(e){ threw=true; }
    t.id="toast";
    out.toastSafe=!threw;
    // Fix: PDF tokens present in exported css
    out.pdfHasTokens = getPDFCss().includes("--settled:")&&getPDFCss().includes(":root{");
    // Fix: _NAV ids actually exist
    out.navBadIds = Object.entries(_NAV)
      .flatMap(([k,v])=>[v.search,v.date].filter(Boolean).map(id=>[k,id]))
      .filter(([k,id])=>!document.getElementById(id)).map(x=>x.join(":"));
    // Fix: buy filter ids used by gotoRecord exist
    out.buyFilterIds = ["fM","fS","fW","fPaid","fDt","fSearch"].filter(id=>!document.getElementById(id));
    return out;
  });
  console.log("\n=== assertions ===");
  console.log(JSON.stringify(r,null,1));
  await b.close();
})();
