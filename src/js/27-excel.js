/* ════════════════════════════════════════════
   EXCEL
════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════
   بيانات تصدير Excel — v17.48
   ──────────────────────────────────────────────────────
   كانت هذه الدالة تتجاهل تاريخ الأساس تماماً وتحسب من
   «اليوم» دائماً، وتستعمل أسبوعاً متدحرجاً (آخر ٧ أيام)
   بينما كل شاشات التطبيق تستعمل أسبوعاً يبدأ الاثنين.
   فمن يفتح «محصلة أسبوع» لأسبوع ماضٍ أو «محصلة شهر»
   لشهر ماضٍ ثم يضغط «📊 Excel» كان يحصل على بيانات
   الأسبوع/الشهر الحالي بدلاً منها — ملفٌ لا يطابق الوصل
   المطبوع أمامه، وهذا أخطر من خطأ ظاهر لأنه صامت.
   الآن: نفس نافذة getCollData بالضبط، وبنفس تاريخ الأساس
   الذي فُتحت به الشاشة.
   ⚠️ أي تغيير في نافذة getCollData يجب أن يُتبع هنا.
══════════════════════════════════════════════════════ */
function _xlInPeriod(dk,period,base){
  if(!dk)return false;
  if(!period||period==="all")return true;
  if(period==="daily")return dk===base;
  if(period==="monthly")return dk.slice(0,7)===base.slice(0,7);
  if(period==="weekly"){
    const bd=_D(base), rd=_D(dk);
    const sow=_D(bd); sow.setDate(bd.getDate()-((bd.getDay()+6)%7));
    const eow=_D(sow); eow.setDate(sow.getDate()+6);
    return rd>=sow&&rd<=eow;
  }
  return true;
}
function getXLData(period,wh,baseDate){
  wh=wh||"all";
  const base=baseDate||toDay();
  let data=S.recs.filter(r=>_xlInPeriod(r.dk,period,base));
  if(wh!=="all")data=data.filter(r=>r.wh===wh);
  return data;
}
function makeXLBlob(data,sheet){
  const ws_data=[
    ["التاريخ","اللوحة","الفلاح","المادة","المخزن","الكلي(كغم)","الفارغ(كغم)","الصافي(كغم)","سعر كغم","كبس","نوع كبس","أج.كبس","ع.كبسات نقل","الناقل","أج.نقل","سعر وصل","المبلغ النهائي","الحالة"],
    ...data.map(r=>[r.dk,r.plate,r.driver,MAT[r.mat]?.label,whTitle(r.wh),r.gross||"",r.empty||"",r.net||"",r.ppkg||"",r.kOn?r.kC:"",r.kOn?r.kType:"",r.kOn?r.kabsFee:"",r.nOn?getNaqlEntries(r).reduce((s,en)=>s+(en.nC||0),0):"",r.nOn?(r.transporter||""):"",r.nOn?r.naqlFee:"",r.wOn?r.waslFee:"",r.final||"",SL[r.status]||r.status]),
    [],["","","","","","","","الإجمالي:",data.filter(r=>r.net!=null).reduce((s,r)=>s+r.net,0),"","","","","",data.filter(r=>r.final!=null).reduce((s,r)=>s+r.final,0),""]
  ];
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb,ws,sheet||"وصلات");
  return XLSX.write(wb,{bookType:"xlsx",type:"array"});
}

