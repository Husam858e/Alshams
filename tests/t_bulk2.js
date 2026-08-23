const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();
  const r=await p.evaluate(()=>{
    db=null;CLOSURES=[];
    const D=toDay();
    S.recs=[
      {id:"A",seq:1,dk:D,status:"weighed",driver:"عبد الرحمن واثق",plate:"1",final:300000,payments:[],paid:false},
      {id:"B",seq:2,dk:D,status:"weighed",driver:"عبد الله احمد",plate:"2",final:300000,payments:[],paid:false},
    ];
    const out={};
    document.getElementById("bulkPayName").value="عبد";
    bulkPaySearch();
    out.preview=document.getElementById("bulkPayPreview").innerText.replace(/\s+/g," ");
    out.names=_bulkDistinctNames(_getBulkPayRecs("عبد","buy"),"buy");
    // رفض التأكيد ⇒ لا دفع
    window.confirm=()=>false;
    setPayAmt("bulkPayAmount",600000);
    execBulkPay();
    out.blocked=!S.recs.some(x=>getPaidTotal(x)>0);
    // اسم كامل ⇒ بلا تحذير وبلا سؤال
    let asked=false; window.confirm=()=>{asked=true;return true;};
    document.getElementById("bulkPayName").value="عبد الرحمن واثق";
    bulkPaySearch();
    setPayAmt("bulkPayAmount",300000);
    execBulkPay();
    out.asked=asked;
    out.A=getPaidTotal(S.recs.find(x=>x.id==="A"));
    out.B=getPaidTotal(S.recs.find(x=>x.id==="B"));
    return out;
  });
  R.ok("المعاينة تُحذّر من تعدّد الأسماء", /أسماء مختلفة/.test(r.preview), r.preview.slice(0,200));
  R.ok("تُسمّي الأشخاص المطابقين", r.names.length===2, r.names);
  R.ok("رفض التأكيد يمنع الدفع", r.blocked, r);
  R.ok("الاسم الكامل لا يسأل ولا يحذّر", r.asked===false, r);
  R.ok("الاسم الكامل يدفع لصاحبه وحده", r.A===300000&&r.B===0, r);
  process.exit(R.done("حارس الدفع الجامع",errs));
})();
