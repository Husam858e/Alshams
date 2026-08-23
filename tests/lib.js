const {chromium}=require("playwright");
async function open(){
  const b=await chromium.launch({executablePath:process.env.CHROME||"/opt/pw-browsers/chromium-1194/chrome-linux/chrome"});
  const ctx=await b.newContext({timezoneId:"Asia/Baghdad"});
  const p=await ctx.newPage();
  const errs=[];
  p.on("pageerror",e=>errs.push(e.message));
  await p.route("**://**",r=> r.request().url().startsWith("file:")?r.continue():r.abort());
  await p.goto("file://"+require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"));
  await p.waitForTimeout(2300);
  await p.evaluate(()=>{S.su=USERS[0];S.pin="2004";doLogin();window.confirm=()=>true;window.alert=()=>{};});
  await p.waitForTimeout(250);
  return {b,p,errs};
}
function reporter(){
  const A=[];
  return {
    ok:(n,c,x)=>A.push({pass:!!c,n,x}),
    done(title,errs){
      const bad=A.filter(a=>!a.pass);
      console.log("┌─ "+title+" ─ "+A.length+" فحصاً");
      A.forEach(a=>{ if(!a.pass) console.log("│ ✗ "+a.n+"\n│      "+JSON.stringify(a.x).slice(0,320)); });
      console.log("└─ نجح "+(A.length-bad.length)+" / "+A.length
        +(errs&&errs.length?"   ⚠ أخطاء صفحة: "+errs.length:""));
      return bad.length;
    }
  };
}
module.exports={open,reporter};
