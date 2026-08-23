/* ════════════════════════════════════════════
   أدوات الذكاء الاصطناعي — تنفيذ الإجراءات
════════════════════════════════════════════ */

// ── دفع كامل لوصل واحد ──
function _aiPayOne(type,id){
  let r=null;
  if(type==='buy')  r=(S.recs||[]).find(x=>x.id===id);
  if(type==='sell') r=SELL_RECS.find(x=>x.id===id);
  if(type==='dam')  r=DAM_RECS.find(x=>x.id===id);
  if(type==='srf')  r=SRF_RECS.find(x=>x.id===id);
  if(type==='wrk')  r=WRK_RECS.find(x=>x.id===id);
  if(!r)return false;
  const tot=getRecTotal(r);
  const paid=getPaidTotal(r);
  const rem=Math.max(0,tot-paid);
  if(rem<=0)return 'already';
  const payments=[...(r.payments||[]),{amount:rem,at:nowStr(),by:'🤖 AI'}];
  const upd={...r,payments,paid:true,paidTotal:tot,paidAt:nowStr(),paidBy:'🤖 AI'};
  if(type==='buy')  saveRec(upd);
  if(type==='sell') saveSellRec(upd);
  if(type==='dam')  saveDamRec(upd);
  if(type==='srf')  saveSrfRec(upd);
  if(type==='wrk')  saveWrkRec(upd);
  return true;
}

// ── دفع كل السجلات في نطاق تاريخ ──
function _aiPayRange(type,from,to){
  let recs=[];
  if(type==='buy')  recs=S.recs||[];
  if(type==='sell') recs=SELL_RECS;
  if(type==='dam')  recs=DAM_RECS;
  if(type==='srf')  recs=SRF_RECS;
  if(type==='wrk')  recs=WRK_RECS;
  const filtered=filterByRange(recs,from,to).filter(r=>!isFullyPaid(r));
  if(!filtered.length)return 0;
  filtered.forEach(r=>_aiPayOne(type,r.id));
  return filtered.length;
}

// ── حساب إحصاء نطاق ──
function _aiStats(type,from,to){
  let recs=[];
  if(type==='buy')  recs=filterByRange(S.recs||[],from,to).filter(r=>r.status==='weighed');
  if(type==='sell') recs=filterByRange(SELL_RECS,from,to).filter(r=>r.status==='weighed');
  if(type==='dam')  recs=filterByRange(DAM_RECS,from,to);
  if(type==='srf')  recs=filterByRange(SRF_RECS,from,to);
  if(type==='wrk')  recs=filterByRange(WRK_RECS,from,to);
  const total=recs.reduce((s,r)=>s+getRecTotal(r),0);
  const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
  const net=recs.reduce((s,r)=>s+(r.net||0),0);
  return{count:recs.length,total,paid,remaining:total-paid,net};
}

// ── تحويل نص التاريخ العربي لـ YYYY-MM-DD ──
function _aiParseDate(txt){
  if(!txt)return null;
  // نص مثل "يوم ٢١ شهر ٤" أو "21/4" أو "2025-04-21"
  const ar2en=s=>s.replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const s=ar2en(txt.trim());
  // YYYY-MM-DD مباشر
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  // يوم X شهر Y
  const m1=s.match(/(\d{1,2})[^\d]+(\d{1,2})(?:[^\d]+(\d{4}))?/);
  if(m1){
    const yr=m1[3]||new Date().getFullYear();
    return`${yr}-${String(m1[2]).padStart(2,'0')}-${String(m1[1]).padStart(2,'0')}`;
  }
  return null;
}

// ── تنفيذ أمر/أوامر من المساعد ──
// يدعم تنفيذ أمر واحد {...} أو عدة أوامر معاً دفعة واحدة كمصفوفة [...]
function _aiExecute(cmd){
  try{
    const parsed=typeof cmd==='string'?JSON.parse(cmd):cmd;
    const actions=Array.isArray(parsed)?parsed:[parsed];
    const out=actions.map(c=>{
      try{ return _aiExecuteOne(c); }
      catch(e){ return '❌ خطأ في تنفيذ '+((c&&c.action)||'أمر')+': '+e.message; }
    }).filter(Boolean);
    return out.join('\n');
  }catch(e){return '❌ خطأ في تنفيذ الأمر: '+e.message;}
}

// ── موجّه الأوامر — كل الصلاحيات المتاحة للمساعد ──
function _aiExecuteOne(c){
  if(!c||!c.action)return null;
  switch(c.action){

    /* ── المدفوعات ── */
    case 'pay_range':{
      const types=c.type==='all'?['buy','sell','dam','srf','wrk']:[c.type];
      let total=0;
      types.forEach(t=>{ total+=_aiPayRange(t,c.from,c.to); });
      renderRecs();renderDamRecs();renderSrfRecs();renderWrkRecs();
      if(typeof renderSellRecs==='function')renderSellRecs();
      return `✅ تم تسديد ${AR(total)} وصل بنجاح`;
    }
    case 'pay_one':{
      const res=_aiPayOne(c.type,c.id);
      if(res==='already')return '✅ الوصل مدفوع مسبقاً';
      if(res)return '✅ تم تسديد الوصل بنجاح';
      return '❌ لم أجد الوصل';
    }

    /* ── الإحصاء ── */
    case 'stats':{
      const st=_aiStats(c.type,c.from,c.to);
      const label={buy:'الشراء',sell:'البيع',dam:'الضمانات',srf:'الصرفيات',wrk:'الأجور',all:'الكل'}[c.type]||c.type;
      const from=c.from?tAr(c.from):'';
      const to=c.to?tAr(c.to):'';
      const period=from===to?from:`${from} → ${to}`;
      let r=`📊 **${label}** — ${period}\n`;
      r+=`عدد السجلات: **${AR(st.count)}**\n`;
      r+=`المجموع: **${fIQD(st.total)}**\n`;
      r+=`المدفوع: **${fIQD(st.paid)}**\n`;
      r+=`المتبقي: **${fIQD(st.remaining)}**`;
      if(st.net>0) r+=`\nالوزن الصافي: **${fKG(st.net)}**`;
      if(st.total>0){const pct=Math.round(st.paid/st.total*100);r+=`\nنسبة السداد: **${AR(pct)}%**`;}
      return r;
    }

    /* ── إنشاء سجلات جديدة ── */
    case 'create_buy':  return _aiCreateBuy(c);
    case 'create_sell': return _aiCreateSell(c);
    case 'create_dam':  return _aiCreateDam(c);
    case 'create_srf':  return _aiCreateSrf(c);
    case 'create_wrk':  return _aiCreateWrk(c);
    case 'create_naql': return _aiCreateNaql(c);

    /* ── تقديم مراحل الوصولات ── */
    case 'confirm_buy_price':  return _aiConfirmBuyPrice(c.id,c.ppkg);
    case 'weigh_buy_empty':    return _aiWeighBuyEmpty(c.id,c.empty);
    case 'confirm_sell_price': return _aiConfirmSellPrice(c.id,c.ppkg);
    case 'weigh_sell_full':    return _aiWeighSellFull(c.id,c.gross);

    /* ── تعديل / حذف أي سجل ── */
    case 'update_record': return _aiUpdateRecord(c.type,c.id,c.fields||{});
    case 'delete_record':{
      if(!c.confirm)return '⚠️ الحذف يتطلب تأكيداً صريحاً ("confirm":true) — لم يُنفَّذ أي حذف';
      return _aiDeleteRecord(c.type,c.id);
    }

    /* ── إدارة العمال ── */
    case 'create_employee': return _aiCreateEmployee(c);
    case 'add_emp_bonus':   return _aiAddEmpBonus(c.empName,c.amount,c.note,c.dk);
    case 'add_emp_deduct':  return _aiAddEmpDeduct(c.empName,c.amount,c.note,c.dk);
    case 'add_emp_absent':  return _aiAddEmpAbsent(c.empName,c.days,c.note,c.dk);
    case 'add_emp_advance': return _aiAddAdvance(c.empName,c.amount,c.note);

    default: return null;
  }
}

/* ── مطابقة اسم العامل بالبحث الذكي (يتجاهل فروقات الكتابة البسيطة) ── */
function _aiFindEmpByName(name){
  if(!name)return null;
  return EMP_LIST.find(e=>smartMatch(e.name,name))||EMP_LIST.find(e=>smartMatch(name,e.name))||null;
}

/* ── إنشاء وصل شراء جديد ── */
function _aiCreateBuy(p){
  const drv=(p.driver||'').trim();
  const plt=(p.plate||'').trim();
  const grs=parseFloat(p.gross)||0;
  if(!drv)return '❌ يجب توفير اسم الفلاح لإنشاء وصل الشراء';
  if(!plt)return '❌ يجب توفير رقم العجلة';
  if(!grs||grs<=0)return '❌ يجب توفير الوزن الكلي (gross) بشكل صحيح';
  const wh=p.wh&&WHS.includes(p.wh)?p.wh:WHS[0];
  const mat=p.mat&&MAT[p.mat]?p.mat:'jet';
  const kC=parseFloat(p.kabsCount)||0, kUP=parseFloat(p.kabsPrice)||0;
  const kOn=kC>0&&kUP>0;
  const nC=parseFloat(p.naqlKabs)||0, nUP=parseFloat(p.naqlPrice)||0;
  const nOn=nC>0&&nUP>0;
  const naqlList=nOn?[{id:genId(),transporter:(p.transporter||'').trim(),nC,nUP,naqlFee:nC*nUP,naqlPayments:[],naqlPaidTotal:0,naqlPaid:false,naqlPaidAt:null}]:[];
  const wP=parseFloat(p.waslPrice)||0, wOn=wP>0;
  const r={
    id:genId(),seq:Date.now(),
    driver:drv,plate:plt,mat,wh,note:(p.note||'').trim(),
    ppkg:null,gross:grs,empty:null,net:null,
    wFee:null,kabsFee:null,naqlFee:null,waslFee:null,final:null,
    kOn,kC,kUP,kType:kOn?(p.kabsType||'سيم'):"",
    nOn,naqlList,nDeduct:p.naqlDeduct!==false,
    transporter:naqlList.length?naqlList[0].transporter:"",
    nC:naqlList.length===1?naqlList[0].nC:null,
    nUP:naqlList.length===1?naqlList[0].nUP:null,
    wOn,wPrice:wP,
    status:"waiting",
    paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    loadAt:nowStr(),loadBy:(S.cu&&S.cu.name||'')+' 🤖',
    confAt:null,confBy:null,
    weighAt:null,weighBy:null,
    dk:p.dk||toDay(),
  };
  saveRec(r);renderRecs();renderStats();renderWH();
  return `✅ تم إنشاء وصل شراء جديد — ${plt} / ${drv} (${whTitle(wh)}) — المعرف: ${r.id}`;
}

/* ── إنشاء وصل بيع جديد ── */
function _aiCreateSell(p){
  const drv=(p.driver||'').trim();
  const plt=(p.plate||'').trim();
  const emp=parseFloat(p.empty)||0;
  if(!drv)return '❌ يجب توفير اسم الفلاح لإنشاء وصل البيع';
  if(!plt)return '❌ يجب توفير رقم العجلة';
  if(!emp||emp<=0)return '❌ يجب توفير الوزن الفارغ (empty) بشكل صحيح';
  const dst=p.dest&&PROVS.includes(p.dest)?p.dest:PROVS[0];
  const mat=p.mat&&MAT[p.mat]?p.mat:'jet';
  const wP=parseFloat(p.waslPrice)||0, wOn=wP>0;
  const nKabs=parseFloat(p.naqlKabs)||0, nUP=parseFloat(p.naqlPrice)||0;
  const nOn=nKabs>0&&nUP>0;
  const naqlFee=nOn?nKabs*nUP:0;
  const r={
    id:genId(),seq:Date.now(),
    driver:drv,plate:plt,driverPhone:(p.driverPhone||'').trim(),receiver:(p.receiver||'').trim(),dest:dst,note:(p.note||'').trim(),
    mat,ppkg:null,gross:null,empty:emp,net:null,
    wFee:null,waslFee:wOn?wP:0,naqlFee,final:null,
    wOn,wPrice:wP,nOn,nKabs,nUP,transporter:(p.transporter||'').trim(),
    status:"waiting",
    paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    loadAt:nowStr(),loadBy:(S.cu&&S.cu.name||'')+' 🤖',
    confAt:null,confBy:null,
    weighAt:null,weighBy:null,
    dk:p.dk||toDay(),
  };
  saveSellRec(r);renderSellRecs();renderSellStats();
  return `✅ تم إنشاء وصل بيع جديد — ${plt} / ${drv} (وجهة ${dst}) — المعرف: ${r.id}`;
}

/* ── إنشاء ضمانة جديدة ── */
function _aiCreateDam(p){
  const damin=(p.damin||'').trim();
  const madmun=(p.madmun||'').trim();
  const price=parseFloat(p.price)||0;
  if(!damin)return '❌ يجب توفير اسم الضامن';
  if(!madmun)return '❌ يجب توفير اسم المضمون';
  if(!price||price<=0)return '❌ يجب توفير مبلغ الضمانة';
  const r={id:genId(),seq:Date.now(),damin,madmun,price,note:(p.note||'').trim(),
    paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖',dk:p.dk||toDay()};
  saveDamRec(r);renderDamRecs();
  return `✅ تم إنشاء ضمانة جديدة — ${esc(damin)} ← ${esc(madmun)} — ${fIQD(price)} — المعرف: ${r.id}`;
}

/* ── إنشاء صرفية جديدة ── */
function _aiCreateSrf(p){
  const recv=(p.recv||'').trim();
  const purp=(p.purp||'').trim();
  const amount=parseFloat(p.amount)||0;
  if(!recv)return '❌ يجب توفير اسم المستفيد';
  if(!purp)return '❌ يجب توفير سبب الصرفية';
  if(!amount||amount<=0)return '❌ يجب توفير مبلغ الصرفية';
  const r={id:genId(),seq:Date.now(),recv,purp,amount,note:(p.note||'').trim(),
    payments:[],paidTotal:0,paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖',dk:p.dk||toDay()};
  saveSrfRec(r);renderSrfRecs();
  return `✅ تم إنشاء صرفية جديدة — ${esc(purp)} — ${fIQD(amount)} — المعرف: ${r.id}`;
}

/* ── إنشاء أجر عمل جديد ── */
function _aiCreateWrk(p){
  const provider=(p.provider||'').trim();
  const service=(p.service||'').trim();
  const amount=parseFloat(p.amount)||0;
  if(!provider)return '❌ يجب توفير اسم مقدم الخدمة';
  if(!service)return '❌ يجب توفير اسم الخدمة';
  if(!amount||amount<=0)return '❌ يجب توفير المبلغ';
  const r={id:genId(),seq:Date.now(),provider,service,amount,note:(p.note||'').trim(),
    payments:[],paidTotal:0,paid:false,paidAt:null,paidBy:null,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖',dk:p.dk||toDay()};
  saveWrkRec(r);renderWrkRecs();
  return `✅ تم إنشاء أجر عمل جديد — ${esc(provider)} — ${fIQD(amount)} — المعرف: ${r.id}`;
}

/* ── إنشاء وصل نقل يدوي ── */
function _aiCreateNaql(p){
  const transporter=(p.transporter||'').trim();
  const kabs=parseFloat(p.kabs)||0;
  const pricePerK=parseFloat(p.pricePerK)||0;
  if(!transporter)return '❌ يجب توفير اسم الناقل';
  if(!kabs||kabs<=0)return '❌ يجب توفير عدد الكبسات';
  if(!pricePerK||pricePerK<=0)return '❌ يجب توفير سعر الكبسة';
  const naqlFee=kabs*pricePerK;
  const r={
    id:genId(),seq:Date.now(),
    transporter,farmer:(p.farmer||'').trim(),plate:(p.plate||'').trim(),kabs,pricePerK,naqlFee,note:(p.note||'').trim(),
    naqlPayments:[],naqlPaidTotal:0,naqlPaid:false,naqlPaidAt:null,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖',dk:p.dk||toDay()
  };
  saveMnlRec(r);renderMnlRecs();
  return `✅ تم إنشاء وصل نقل يدوي — ${esc(transporter)} — ${fIQD(naqlFee)} — المعرف: ${r.id}`;
}

/* ── تقديم مراحل وصل الشراء ── */
function _aiConfirmBuyPrice(id,ppkg){
  const r=S.recs.find(x=>x.id===id);
  if(!r)return '❌ لم يتم العثور على وصل الشراء بهذا المعرف';
  const p=parseFloat(ppkg);
  if(!p||p<=0)return '❌ سعر الكغم غير صالح';
  const upd={...r,status:'confirmed',ppkg:p,confAt:nowStr(),confBy:(S.cu&&S.cu.name||'')+' 🤖'};
  saveRec(upd);renderRecs();renderStats();
  return `✅ تم تأكيد سعر ${fIQD(p)}/كغم للوصل ${esc(r.plate||id)}`;
}
function _aiWeighBuyEmpty(id,empty){
  const r=S.recs.find(x=>x.id===id);
  if(!r)return '❌ لم يتم العثور على وصل الشراء بهذا المعرف';
  const ev=parseFloat(empty);
  if(!ev||ev<=0||ev>=r.gross)return '❌ الوزن الفارغ غير صالح (يجب أن يكون أصغر من الوزن الكلي)';
  const c=calcFees(r.gross,ev,r.ppkg,r.kOn,r.kC,r.kUP,r.nOn,getNaqlEntries(r),r.wOn,r.wPrice,r.nDeduct);
  const upd={...r,empty:ev,net:c.net,wFee:c.wFee,kabsFee:c.kabsFee,naqlFee:c.naqlFee,waslFee:c.waslFee,final:c.final,status:'weighed',weighAt:nowStr(),weighBy:(S.cu&&S.cu.name||'')+' 🤖'};
  saveRec(upd);renderRecs();renderStats();renderWH();
  return `✅ تم إغلاق الوصل ${esc(r.plate||id)} — المبلغ النهائي: ${fIQD(c.final)}`;
}

/* ── تقديم مراحل وصل البيع ── */
function _aiConfirmSellPrice(id,ppkg){
  const r=SELL_RECS.find(x=>x.id===id);
  if(!r)return '❌ لم يتم العثور على وصل البيع بهذا المعرف';
  const p=parseFloat(ppkg);
  if(!p||p<=0)return '❌ سعر الكغم غير صالح';
  const upd={...r,status:'confirmed',ppkg:p,confAt:nowStr(),confBy:(S.cu&&S.cu.name||'')+' 🤖'};
  saveSellRec(upd);renderSellRecs();renderSellStats();
  return `✅ تم تأكيد سعر البيع ${fIQD(p)}/كغم للوصل ${esc(r.plate||id)}`;
}
function _aiWeighSellFull(id,gross){
  const r=SELL_RECS.find(x=>x.id===id);
  if(!r)return '❌ لم يتم العثور على وصل البيع بهذا المعرف';
  const gv=parseFloat(gross);
  if(!gv||gv<=r.empty)return '❌ الوزن الكلي غير صالح (يجب أن يكون أكبر من الوزن الفارغ)';
  const net=gv-r.empty;
  const wFee=net*r.ppkg;
  const waslFee=r.wOn?r.wPrice:0;
  const naqlFee=r.nOn?r.naqlFee:0;
  const final=wFee+waslFee+naqlFee;
  const upd={...r,gross:gv,net,wFee,waslFee,naqlFee,final,status:'weighed',weighAt:nowStr(),weighBy:(S.cu&&S.cu.name||'')+' 🤖'};
  saveSellRec(upd);renderSellRecs();renderSellStats();
  return `✅ تم إغلاق وصل البيع ${esc(r.plate||id)} — المبلغ النهائي: ${fIQD(final)}`;
}

/* ── تعديل سجل موجود (أي نوع) ── */
function _aiUpdateRecord(type,id,fields){
  fields=fields||{};
  const by=(S.cu&&S.cu.name||'')+' 🤖';
  if(type==='buy'){
    const r=S.recs.find(x=>x.id===id);
    if(!r)return '❌ لم يتم العثور على وصل الشراء';
    saveRec({...r,...fields,edited:true,editAt:nowStr(),editBy:by});
    renderRecs();renderStats();renderWH();
    return '✏️ تم تعديل وصل الشراء بنجاح';
  }
  if(type==='sell'){
    const r=SELL_RECS.find(x=>x.id===id);
    if(!r)return '❌ لم يتم العثور على وصل البيع';
    saveSellRec({...r,...fields,edited:true,editAt:nowStr(),editBy:by});
    renderSellRecs();renderSellStats();
    return '✏️ تم تعديل وصل البيع بنجاح';
  }
  if(type==='dam'){
    const r=DAM_RECS.find(x=>x.id===id);
    if(!r)return '❌ لم يتم العثور على الضمانة';
    saveDamRec({...r,...fields,edited:true,editAt:nowStr(),editBy:by});
    renderDamRecs();
    return '✏️ تم تعديل الضمانة بنجاح';
  }
  if(type==='srf'){
    const r=SRF_RECS.find(x=>x.id===id);
    if(!r)return '❌ لم يتم العثور على الصرفية';
    saveSrfRec({...r,...fields,edited:true,editAt:nowStr(),editBy:by});
    renderSrfRecs();
    return '✏️ تم تعديل الصرفية بنجاح';
  }
  if(type==='wrk'){
    const r=WRK_RECS.find(x=>x.id===id);
    if(!r)return '❌ لم يتم العثور على أجر العمل';
    saveWrkRec({...r,...fields,edited:true,editAt:nowStr(),editBy:by});
    renderWrkRecs();
    return '✏️ تم تعديل أجر العمل بنجاح';
  }
  return '❌ نوع غير معروف للتعديل';
}

/* ── حذف سجل (أي نوع) ── */
function _aiDeleteRecord(type,id){
  if(type==='buy'){
    if(!S.recs.find(x=>x.id===id))return '❌ لم يتم العثور على وصل الشراء';
    if(dbRef){dbRef.child(id).remove().catch(()=>{});}
    S.recs=S.recs.filter(r=>r.id!==id);
    try{localStorage.setItem("wShamsCache",JSON.stringify(S.recs));}catch(e){}
    renderRecs();renderStats();renderWH();
    return '🗑️ تم حذف وصل الشراء';
  }
  if(type==='sell'){
    if(!SELL_RECS.find(x=>x.id===id))return '❌ لم يتم العثور على وصل البيع';
    delSellRec(id);renderSellRecs();renderSellStats();
    return '🗑️ تم حذف وصل البيع';
  }
  if(type==='dam'){
    if(!DAM_RECS.find(x=>x.id===id))return '❌ لم يتم العثور على الضمانة';
    delDamRec(id);renderDamRecs();
    return '🗑️ تم حذف الضمانة';
  }
  if(type==='srf'){
    if(!SRF_RECS.find(x=>x.id===id))return '❌ لم يتم العثور على الصرفية';
    delSrfRec(id);renderSrfRecs();
    return '🗑️ تم حذف الصرفية';
  }
  if(type==='wrk'){
    if(!WRK_RECS.find(x=>x.id===id))return '❌ لم يتم العثور على أجر العمل';
    delWrkRec(id);renderWrkRecs();
    return '🗑️ تم حذف أجر العمل';
  }
  return '❌ نوع غير معروف للحذف';
}

/* ── إنشاء عامل جديد ── */
function _aiCreateEmployee(p){
  const name=(p.name||'').trim();
  const baseSalary=parseFloat(p.baseSalary)||0;
  if(!name)return '❌ يجب توفير اسم العامل';
  if(!baseSalary||baseSalary<=0)return '❌ يجب توفير الراتب الأساسي';
  const e={id:genId(),name,role:(p.role||'').trim(),payType:p.payType&&EMP_TYPES[p.payType]?p.payType:'monthly',
    baseSalary,active:true,createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖'};
  saveEmp(e);renderEmpList();
  return `✅ تم إضافة العامل ${esc(name)} — راتب أساسي: ${fIQD(baseSalary)}`;
}

/* ── حافز / خصم / غياب / سلفة لعامل ── */
function _aiAddEmpBonus(empName,amount,note,dk){
  const e=_aiFindEmpByName(empName);
  if(!e)return '❌ لم يتم العثور على عامل بالاسم: '+(empName||'');
  const amt=parseFloat(amount)||0;
  if(!amt||amt<=0)return '❌ مبلغ الحافز غير صالح';
  const r={id:genId(),empId:e.id,empName:e.name,type:'bonus',amount:amt,note:(note||'حافز').trim(),
    createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖',dk:dk||toDay()};
  saveEmpTxn(r);
  return `🎁 تم تسجيل حافز ${fIQD(amt)} لـ ${esc(e.name)}`;
}
function _aiAddEmpDeduct(empName,amount,note,dk){
  const e=_aiFindEmpByName(empName);
  if(!e)return '❌ لم يتم العثور على عامل بالاسم: '+(empName||'');
  const amt=parseFloat(amount)||0;
  if(!amt||amt<=0)return '❌ مبلغ الخصم غير صالح';
  const r={id:genId(),empId:e.id,empName:e.name,type:'deduct',amount:amt,note:(note||'خصم').trim(),
    createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖',dk:dk||toDay()};
  saveEmpTxn(r);
  return `✂️ تم تسجيل خصم ${fIQD(amt)} من ${esc(e.name)}`;
}
function _aiAddEmpAbsent(empName,days,note,dk){
  const e=_aiFindEmpByName(empName);
  if(!e)return '❌ لم يتم العثور على عامل بالاسم: '+(empName||'');
  const d=parseFloat(days)||0;
  if(!d||d<=0)return '❌ عدد أيام الغياب غير صالح';
  const daily=(e.baseSalary||0)/30;
  const amount=d*daily;
  const r={id:genId(),empId:e.id,empName:e.name,type:'absent',days:d,amount,note:(note||'غياب').trim(),
    createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖',dk:dk||toDay()};
  saveEmpTxn(r);
  return `🚫 تم تسجيل غياب ${AR(d)} يوم لـ ${esc(e.name)} — خصم: ${fIQD(amount)}`;
}
function _aiAddAdvance(empName,amount,note){
  const e=_aiFindEmpByName(empName);
  if(!e)return '❌ لم يتم العثور على عامل بالاسم: '+(empName||'');
  const amt=parseFloat(amount)||0;
  if(!amt||amt<=0)return '❌ مبلغ السلفة غير صالح';
  const r={id:genId(),empId:e.id,empName:e.name,amount:amt,note:(note||'').trim(),
    payments:[],paidTotal:0,paid:false,paidAt:null,paidBy:null,
    createdAt:nowStr(),createdBy:(S.cu&&S.cu.name||'')+' 🤖',dk:toDay()};
  saveAdvRec(r);renderEmpList();renderAdvSummary();
  return `💸 تم تسجيل سلفة ${fIQD(amt)} لـ ${esc(e.name)}`;
}
let _aiOpen=false;
let _aiHistory=[];
let _aiThinking=false;

function toggleAI(){
  _aiOpen=!_aiOpen;
  document.getElementById("aiPanel").classList.toggle("open",_aiOpen);
  if(_aiOpen&&_aiHistory.length===0) _aiWelcome();
}

function closeAI(){
  _aiOpen=false;
  document.getElementById("aiPanel").classList.remove("open");
}

/* ══════════════════════════════════════════════════════
   محرّك الاستعلام المحلي — v17.41
   ──────────────────────────────────────────────────────
   لماذا وُجد؟
   كان المساعد يعتمد على تخمين بالكلمات المفتاحية لاختيار
   البيانات، ثم يقتصّها إلى ٨٠ سجلاً ويرسلها للنموذج.
   نتيجتان سيئتان:
     ① سؤال لا يحوي كلمة «شراء» قد لا تصله وصولات الشراء.
     ② ما زاد عن ٨٠ سجلاً لا يراه أصلاً — فيجيب عن حساب
       زبون قديم بثقة، ورقمه ناقص. خطأ صامت في المال.
   الحل: لا نرسل السجلات إطلاقاً. النموذج يطلب استعلاماً،
   ونحن ننفّذه هنا على *كامل* البيانات ونعيد النتيجة
   المحسوبة. دقّة تامة بلا حدود حجم، وتعمل مع أي مزوّد
   مهما كان حدّ الرموز عنده.
══════════════════════════════════════════════════════ */
const _AI_SOURCES={
  buy :{label:"وصولات الشراء", get:()=>(S.recs||[]).filter(r=>r.status==="weighed"),
        who:r=>r.driver, amt:r=>r.final||0, paid:r=>getPaidTotal(r), net:r=>r.net||0},
  sell:{label:"وصولات البيع", get:()=>(SELL_RECS||[]).filter(r=>r.status==="weighed"),
        who:r=>r.driver, amt:r=>r.final||0, paid:r=>getPaidTotal(r), net:r=>r.net||0},
  dam :{label:"الضمانات", get:()=>DAM_RECS||[],
        who:r=>r.damin, amt:r=>getRecTotal(r), paid:r=>getPaidTotal(r)},
  srf :{label:"الصرفيات", get:()=>SRF_RECS||[],
        who:r=>r.recv, amt:r=>r.amount||0, paid:r=>getPaidTotal(r)},
  wrk :{label:"أجور الأعمال", get:()=>WRK_RECS||[],
        who:r=>r.provider, amt:r=>r.amount||0, paid:r=>getPaidTotal(r)},
  mnl :{label:"وصولات النقل اليدوية", get:()=>MNL_RECS||[],
        who:r=>r.transporter, amt:r=>r.naqlFee||0, paid:r=>getNaqlPaidTotal_mnl(r)},
  naql:{label:"أجور النقل (كل المصادر)", get:()=>_allNaqlFees(),
        who:r=>r.transporter, amt:r=>r.naqlFee||0, paid:r=>r.naqlPaid||0},
  arb :{label:"أوزان أربيل", get:()=>ARB_RECS||[],
        who:r=>r.farmer, amt:()=>0, paid:()=>0, net:r=>r.net||0},
};

function _aiQuery(q){
  q=q||{};
  const keys=q.source==="all"||!q.source?Object.keys(_AI_SOURCES):[q.source];
  const out={};
  let gAmt=0,gPaid=0,gCount=0;
  keys.forEach(k=>{
    const src=_AI_SOURCES[k]; if(!src)return;
    let rows=src.get().slice();
    if(q.from) rows=rows.filter(r=>(r.dk||"")>=q.from);
    if(q.to)   rows=rows.filter(r=>(r.dk||"")<=q.to);
    if(q.name) rows=rows.filter(r=>smartMatch(String(src.who(r)||""),q.name));
    if(q.unpaid) rows=rows.filter(r=>src.amt(r)-src.paid(r)>0.5);
    if(!rows.length)return;
    const amt=rows.reduce((s,r)=>s+src.amt(r),0);
    const paid=rows.reduce((s,r)=>s+src.paid(r),0);
    const net=src.net?rows.reduce((s,r)=>s+src.net(r),0):0;
    gAmt+=amt; gPaid+=paid; gCount+=rows.length;
    const o={القسم:src.label,العدد:rows.length,المجموع:Math.round(amt),
             المدفوع:Math.round(paid),المتبقي:Math.round(amt-paid)};
    if(net)o.الوزن_كغم=Math.round(net);
    /* تفاصيل مختصرة عند الطلب — سقف ٤٠ سطراً حتى لا تتضخم الرسالة */
    if(q.detail){
      o.تفاصيل=rows.slice(-40).map(r=>({
        id:r.id,التاريخ:r.dk,الاسم:src.who(r)||"",
        المبلغ:Math.round(src.amt(r)),المدفوع:Math.round(src.paid(r))}));
      if(rows.length>40)o.ملاحظة=`عُرض آخر ٤٠ من ${rows.length}`;
    }
    out[k]=o;
  });
  if(!Object.keys(out).length)return{نتيجة:"لا توجد سجلات مطابقة"};
  if(keys.length>1)out.الإجمالي={العدد:gCount,المجموع:Math.round(gAmt),
    المدفوع:Math.round(gPaid),المتبقي:Math.round(gAmt-gPaid)};
  return out;
}

/* أسماء كل الأطراف — يمنع اختراع اسم غير موجود */
function _aiNames(){
  const set=new Set();
  Object.values(_AI_SOURCES).forEach(src=>{
    try{src.get().forEach(r=>{const n=String(src.who(r)||"").trim();if(n)set.add(n);});}catch(e){}
  });
  (EMP_LIST||[]).forEach(e=>{if(e.name)set.add(e.name);});
  return [...set];
}

function _aiWelcome(){
  const user=S.cu?.name||"";
  const n=_aiActive().length;
  const total=Object.values(_AI_SOURCES).reduce((a,v)=>{try{return a+v.get().length;}catch(e){return a;}},0);
  _aiAppend("a",`مرحباً ${user}! 👋
أنا <strong>مساعد ميزان الشمس</strong> — أقرأ <strong>${AR(total)}</strong> سجلاً كاملة، وأحسب الأرقام داخل جهازك فلا تُقتطع ولا تُقرَّب.

<strong>أسألني:</strong>
• شكد يستحق فلان؟ · منو عليه أكبر مبلغ؟
• مجموع الشراء هذا الشهر · قارن الشراء بالبيع
• حسابات النقّالين غير المقبوضة

<strong>وأنفّذ:</strong>
• 💰 تسديد وصل أو نطاق كامل
• ➕ إنشاء شراء/بيع/ضمانة/صرفية/أجر/نقل
• ⚖️ تأكيد سعر · وزن فارغ/كلي
• ✏️ تعديل وحذف · 👷 رواتب وسلف وحوافز وغيابات

${n?`<span style="font-size:11px;color:var(--paper-3)">مفعَّل عبر ${AR(n)} مزوّد — إن امتلأ سقف أحدهم ينتقل السؤال للتالي.</span>`
    :`<span style="font-size:11px;color:var(--owing)">⚠️ لم تُضف مفتاحاً بعد — اضغط ⚙️ المزوّدون بالأعلى.</span>`}`);
}


// ── جمع بيانات الموقع لإعطاء المساعد سياقاً كاملاً ──
/* ══════════════════════════════════════════════════════
   تعليمات المساعد — v17.41
   ──────────────────────────────────────────────────────
   لم تعد السجلات تُرسل هنا. النموذج يعرف *شكل* البيانات
   وأسماء الأطراف فقط، ويطلب الأرقام باستعلام يُنفَّذ محلياً
   على كامل السجلات. هذا يضمن دقّة الأرقام ويمنع تضخّم
   الرسالة، ويجعل المساعد يعمل مع أي مزوّد.
══════════════════════════════════════════════════════ */
function _aiContext(userMsg){
  const today=toDay();
  const yr=new Date().getFullYear();
  const _d=n=>{const d=_D(today);d.setDate(d.getDate()-n);return _ds(d);};

  const counts=Object.entries(_AI_SOURCES).map(([k,v])=>{
    let n=0; try{n=v.get().length;}catch(e){}
    return `${k} (${v.label}): ${n} سجل`;
  }).join('\n');

  const names=_aiNames();
  const namesTxt=names.length>140
    ? names.slice(0,140).join(' · ')+` … (و${names.length-140} اسماً آخر — استعمل الاسم كما كتبه المستخدم)`
    : names.join(' · ');

  const emps=(EMP_LIST||[]).map(e=>e.name).filter(Boolean).join(' · ')||'لا يوجد';
  const user=S.cu?.name||'';

  return `أنت «مساعد ميزان الشمس» — مساعد محاسبي محترف لمكتب تجارة زراعية عراقي.
تتحدث مع: ${user}. أجب بالعربية دائماً، بإيجاز ووضوح، بلا حشو.
اليوم: ${today} (السنة ${yr}).

════════ ① قاعدة الأرقام — الأهم ════════
لا تعرف أي رقم من ذاكرتك. كل رقم مالي أو وزني أو عدد سجلات
يجب أن يأتي من استعلام. لا تخمّن ولا تقرّب ولا تفترض.
لطلب البيانات أخرج سطراً واحداً بهذه الصيغة حصراً:

<<<QUERY>>>{"source":"buy","name":"...","from":"YYYY-MM-DD","to":"YYYY-MM-DD","unpaid":true,"detail":false}<<<END>>>

الحقول كلها اختيارية عدا source:
  source : ${Object.keys(_AI_SOURCES).join(' | ')} | all
  name   : اسم الطرف (فلاح/زبون/ناقل/عامل) — مطابقة ذكية تتحمّل فروق الإملاء
  from/to: نطاق تاريخ الوصل
  unpaid : true ⇒ غير المسدَّد فقط
  detail : true ⇒ تفاصيل السجلات (آخر ٤٠) — استعملها فقط عند طلب القائمة

بعد وصول النتيجة، أجب من أرقامها حصراً. لك ثلاث استعلامات كحد أقصى
لكل سؤال، فاجمع ما تحتاجه في استعلام واحد ما أمكن.
إن جاءت النتيجة «لا توجد سجلات مطابقة» فقل ذلك صراحةً ولا تخترع بديلاً.

════════ ② حجم البيانات ════════
${counts}

════════ ③ الأطراف المسجَّلة ════════
${namesTxt}
العمّال: ${emps}
لا تخترع اسماً غير موجود. إن لم تجد الاسم، قل إنه غير مسجَّل.

════════ ④ التنفيذ ════════
تستطيع تنفيذ عمليات فعلية بإخراج أمر بهذه الصيغة:

<<<CMD>>>{"action":"...", ...}<<<END>>>

الأوامر المتاحة:
• تسديد نطاق: {"action":"pay_range","type":"buy|sell|dam|srf|wrk|all","from":"...","to":"..."}
• تسديد وصل: {"action":"pay_one","type":"buy","id":"..."}
• إحصاء: {"action":"stats","type":"buy|sell|dam|srf|wrk|all","from":"...","to":"..."}
• إنشاء شراء: {"action":"create_buy","driver":"...","plate":"...","gross":9000,"wh":"..."}
• إنشاء بيع: {"action":"create_sell","driver":"...","plate":"...","empty":5000,"receiver":"..."}
• إنشاء ضمانة: {"action":"create_dam","damin":"...","madmun":"...","price":500000}
• إنشاء صرفية: {"action":"create_srf","recv":"...","purp":"...","amount":50000}
• إنشاء أجر عمل: {"action":"create_wrk","provider":"...","service":"...","amount":50000}
• إنشاء وصل نقل: {"action":"create_naql","transporter":"...","farmer":"...","naqlFee":200000}
• تأكيد سعر شراء: {"action":"confirm_buy_price","id":"...","ppkg":250}
• وزن فارغ: {"action":"weigh_buy_empty","id":"...","empty":1435}
• تأكيد سعر بيع: {"action":"confirm_sell_price","id":"...","ppkg":300}
• وزن كلي بيع: {"action":"weigh_sell_full","id":"...","gross":2400}
• تعديل سجل: {"action":"update_record","type":"buy","id":"...","fields":{...}}
• حذف سجل: {"action":"delete_record","type":"buy","id":"...","confirm":true}
• عامل جديد: {"action":"create_employee","name":"...","salary":500000}
• مكافأة/خصم/غياب/سلفة:
  {"action":"add_emp_bonus","empName":"...","amount":25000,"note":"..."}
  {"action":"add_emp_deduct","empName":"...","amount":15000,"note":"..."}
  {"action":"add_emp_absent","empName":"...","days":1,"note":"..."}
  {"action":"add_emp_advance","empName":"...","amount":100000,"note":"..."}

════════ ⑤ حدود السلامة — التزم بها ════════
- لا تنشئ ولا تعدّل ولا تحذف بمعلومات لم يذكرها المستخدم صراحةً. اسأل أولاً.
- الحذف يحتاج "confirm":true، ولا تضعه إلا بعد أن يؤكّد المستخدم بوضوح.
- قبل أي تسديد جماعي أو حذف، اذكر العدد والمبلغ واطلب تأكيداً — إلا إن كان
  المستخدم قد أكّد فعلاً في رسالته.
- لا تستعمل مُعرّفاً (id) لم يظهر في نتيجة استعلام. لا تخترع المعرّفات أبداً.
- المبالغ بالدينار العراقي. الوزن بالكيلوغرام.
- إن كان السؤال غامضاً (اسم مكرر، تاريخ ناقص) اسأل سؤالاً واحداً محدداً.
- لا تخرج <<<QUERY>>> و<<<CMD>>> في رسالة واحدة.

════════ ⑥ المواقع ════════
${WHS.map(w=>`"${w}" = ${whTitle(w)}`).join('، ')}
«الساحة» موقع مستقل وليست مخزناً.

════════ ⑦ التواريخ ════════
"اليوم" = ${today} · "أمس" = ${_d(1)} · "آخر أسبوع" = ${_d(6)} → ${today}
"هذا الشهر" = ${today.slice(0,7)}-01 → ${today}
"يوم 22 شهر 5" = ${yr}-05-22

════════ ⑧ مثال كامل ════════
سؤال: "شكد يستحق ابو خطاب؟"
أنت: <<<QUERY>>>{"source":"all","name":"ابو خطاب","unpaid":true}<<<END>>>
(تصل النتيجة) ثم: "ابو خطاب له ٣ وصولات شراء غير مسدَّدة بمجموع ٤٫٢ مليون د.ع."`;
}
const _AI_PROVIDERS=[
  {id:"gemini", name:"Google Gemini", ks:"ai_key_gemini", pfx:"AIza",
   url:"https://console.cloud.google.com/apis/credentials",
   note:"الأسخى — ~١٥٠٠ طلب يومياً، بلا بطاقة",
   models:["gemini-2.5-flash","gemini-2.5-flash-lite"], big:true},
  {id:"groq", name:"Groq", ks:"ai_key", pfx:"gsk_",
   url:"https://console.groq.com/keys",
   note:"الأسرع — ~٣٠ طلب/دقيقة، بلا بطاقة",
   models:["llama-3.3-70b-versatile","llama-3.1-8b-instant"]},
  {id:"cerebras", name:"Cerebras", ks:"ai_key_cerebras", pfx:"csk-",
   url:"https://cloud.cerebras.ai",
   note:"حصّة رموز يومية كبيرة",
   models:["gpt-oss-120b","zai-glm-4.7"]},
  {id:"openrouter", name:"OpenRouter", ks:"ai_key_or", pfx:"sk-or-",
   url:"https://openrouter.ai/keys",
   note:"احتياط — نماذج مجانية متعددة",
   models:["meta-llama/llama-3.3-70b-instruct:free","deepseek/deepseek-chat:free"]},
];
const _aiKeyOf=p=>(localStorage.getItem(p.ks)||"").trim();
/* v17.47 — بقية كتابات التخزين في التطبيق محميّة، وهاتان لم تكونا.
   في نافذة التصفّح الخاصّ أو حين يمنع المتصفح بيانات الموقع يرمي
   setItem استثناءً: كان يقطع حفظ المفتاح قبل رسالة النجاح، وأسوأ
   منه أنه يُفجّر حلقة المساعد من داخل معالج «مفتاح غير صحيح». */
const _aiSetKey=(p,k)=>{
  try{localStorage.setItem(p.ks,(k||"").trim());return true;}
  catch(e){showToast("⚠ تعذّر حفظ المفتاح — التخزين المحلي ممنوع في هذا المتصفح");return false;}
};
/* المزوّدون الذين أدخل المستخدم مفاتيحهم فعلاً */
const _aiActive=()=>_AI_PROVIDERS.filter(p=>_aiKeyOf(p));
/* توافق مع النسخ السابقة: كان المفتاح يُقرأ من ai_key ويجب أن يبدأ بـ gsk_ */
function _getGroqKey(){return (localStorage.getItem("ai_key")||"").trim();}
function _setGroqKey(k){try{localStorage.setItem("ai_key",(k||"").trim());}catch(e){}}

/* ذاكرة الحدود: مزوّد امتلأ سقفه يُستبعد ٦٠ ثانية بدل إعادة محاولته */
const _aiCooldown={};
const _aiReady=()=>_aiActive().filter(p=>!(_aiCooldown[p.id]>Date.now()));

/* ── نداء موحّد: كل مزوّد وصيغته ── */
async function _aiCall(prov,model,sys,history){
  if(prov.id==="gemini"){
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(_aiKeyOf(prov))}`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:sys}]},
        contents:history.map(m=>({role:m.role==="assistant"?"model":"user",parts:[{text:m.content}]})),
        generationConfig:{temperature:0.2,maxOutputTokens:1400}
      })});
    const d=await res.json();
    if(d.error)throw Object.assign(new Error(d.error.message||"خطأ"),{status:d.error.code||res.status});
    return d?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
  }
  /* البقية جميعاً بصيغة OpenAI */
  const ep={groq:"https://api.groq.com/openai/v1/chat/completions",
            cerebras:"https://api.cerebras.ai/v1/chat/completions",
            openrouter:"https://openrouter.ai/api/v1/chat/completions"}[prov.id];
  const res=await fetch(ep,{method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+_aiKeyOf(prov)},
    body:JSON.stringify({model,max_tokens:1400,temperature:0.2,
      messages:[{role:"system",content:sys},...history]})});
  const txt=await res.text();
  let d; try{d=JSON.parse(txt);}catch(e){throw new Error("رد غير صالح: "+txt.slice(0,80));}
  if(d.error)throw Object.assign(new Error(d.error.message||"خطأ"),{status:d.error.code||res.status});
  return d?.choices?.[0]?.message?.content||"";
}

/* هل الخطأ سببه امتلاء الحصّة أو اختفاء النموذج؟ */
function _aiIsLimit(e){
  const m=(e.message||"").toLowerCase(), s=e.status;
  return s===429||s===503||m.includes("rate")||m.includes("quota")||m.includes("limit")
      ||m.includes("overload")||m.includes("capacity");
}
function _aiIsGone(e){
  const m=(e.message||"").toLowerCase(), s=e.status;
  return s===404||m.includes("decommission")||m.includes("not found")
      ||m.includes("no longer")||m.includes("deprecated")||m.includes("does not exist");
}
function _aiIsBadKey(e){
  const m=(e.message||"").toLowerCase(), s=e.status;
  /* ⚠️ مهم: Gemini يردّ 403 عند امتلاء الحصّة أيضاً، لا عند فساد المفتاح فقط.
     لو عدَدنا ذلك مفتاحاً خاطئاً لحذفنا مفتاح المستخدم الصحيح.
     لذلك نستثني أخطاء الحصّة صراحةً هنا، ونفحصها قبله في _aiRun. */
  if(_aiIsLimit(e))return false;
  return s===401||m.includes("api key")||m.includes("unauthorized")
      ||m.includes("invalid key")||m.includes("permission denied")
      ||(s===403&&m.includes("key"));
}

let _modelIdx=0;

async function _aiSend(){
  if(_aiThinking)return;
  const inp=document.getElementById("aiInput");
  const msg=(inp?.value||"").trim();
  if(!msg)return;
  if(!_aiActive().length){inp.value="";_aiShowKeySetup();return;}
  inp.value="";
  _aiAppend("u",msg);
  _aiHistory.push({role:"user",content:msg});
  _aiSetThinking(true);
  await _aiRun(msg,0);
}

/* ══ الحلقة الرئيسية: يسأل النموذج، ينفّذ استعلاماته، يعيد السؤال ══
   النموذج قد يحتاج بيانات قبل أن يجيب. نسمح بثلاث جولات استعلام
   ثم نطلب منه الإجابة بما لديه — حتى لا يدور بلا نهاية. */
async function _aiRun(msg,round){
  const sys=_aiContext(msg);
  let raw="",lastErr=null,used=null;
  const provs=_aiReady().length?_aiReady():_aiActive();
  outer:
  for(const p of provs){
    for(const model of p.models){
      try{
        raw=await _aiCall(p,model,sys,_aiHistory.slice(-8));
        used=p; break outer;
      }catch(e){
        lastErr=e;
        /* الترتيب مقصود: الحصّة تُفحص قبل المفتاح حتى لا يُحذف مفتاح سليم */
        if(_aiIsLimit(e)){_aiCooldown[p.id]=Date.now()+60000;continue outer;}
        if(_aiIsBadKey(e)){
          _aiSetKey(p,"");
          _aiAppend("a",`⚠️ مفتاح ${p.name} غير صحيح — أُزيل. أضف مفتاحاً جديداً من ⚙️ المزوّدون.`);
          continue outer;
        }
        if(_aiIsGone(e))continue;      // نموذج اختفى — جرّب التالي عند نفس المزوّد
        continue outer;
      }
    }
  }
  if(!used){
    _aiSetThinking(false);
    const busy=Object.keys(_aiCooldown).some(k=>_aiCooldown[k]>Date.now());
    _aiAppend("a", busy
      ? "⏳ امتلأت حصص المزوّدين المتاحين مؤقتاً. انتظر دقيقة، أو أضف مفتاح مزوّد آخر من ⚙️ لرفع السقف."
      : "⚠️ "+((lastErr&&lastErr.message)||"تعذّر الاتصال. تحقّق من الإنترنت."));
    return;
  }

  /* ① استعلام بيانات؟ نفّذه محلياً وأعد السؤال بالنتيجة */
  const qm=raw.match(/<<<QUERY>>>([\s\S]*?)<<<END>>>/);
  if(qm&&round<3){
    let result;
    try{ result=_aiQuery(JSON.parse(qm[1].trim())); }
    catch(e){ result={خطأ:"استعلام غير صالح: "+e.message}; }
    _aiHistory.push({role:"assistant",content:raw});
    _aiHistory.push({role:"user",content:"نتيجة الاستعلام (بيانات دقيقة من كامل السجلات):\n"
      +JSON.stringify(result)+"\nأجب الآن بالعربية بناءً على هذه الأرقام حصراً."});
    return _aiRun(msg,round+1);
  }

  /* ② أمر تنفيذي؟ */
  let cmdJson=null;
  const m1=raw.match(/<<<CMD>>>([\s\S]*?)<<<END>>>/); if(m1)cmdJson=m1[1].trim();
  if(!cmdJson){const m2=raw.match(/```(?:json)?\s*(\{[\s\S]*?"action"[\s\S]*?\})\s*```/);if(m2)cmdJson=m2[1].trim();}
  if(!cmdJson){const m3=raw.match(/(\{"action"\s*:\s*"(?:pay_range|pay_one|stats)"[\s\S]*?\})/);if(m3)cmdJson=m3[1].trim();}

  let reply=raw.replace(/<<<CMD>>>[\s\S]*?<<<END>>>/g,'')
               .replace(/<<<QUERY>>>[\s\S]*?<<<END>>>/g,'')
               .replace(/```(?:json)?[\s\S]*?```/g,'').trim();
  _aiHistory.push({role:"assistant",content:reply||raw});
  _aiSetThinking(false);
  if(reply)_aiAppend("a",reply);
  if(cmdJson){
    _aiAppend("a","⚙️ جاري التنفيذ...");
    setTimeout(()=>{
      const result=_aiExecute(cmdJson);
      const m=document.getElementById("aiMsgs");
      if(m){const l=m.querySelector(".ai-msg-a:last-child");if(l&&l.textContent.includes("جاري التنفيذ"))l.remove();}
      if(result)_aiAppend("a",result);
    },400);
  }
  /* اسم المزوّد المستعمل — ليعرف أين ذهب طلبه */
  const bar=document.getElementById("aiProvBar");
  if(bar)bar.textContent="عبر "+used.name;
}

/* ══════════════════════════════════════════════════════
   إعداد المفاتيح — v17.41
   ──────────────────────────────────────────────────────
   يكفي مفتاح واحد لتشغيل المساعد. كل مفتاح إضافي يرفع
   السقف اليومي، لأن الطلب ينتقل تلقائياً للمزوّد التالي
   حين يمتلئ سقف السابق.
══════════════════════════════════════════════════════ */
function _aiShowKeySetup(){
  const msgs=document.getElementById("aiMsgs");
  if(!msgs)return;
  document.getElementById("aiKeySetup")?.remove();
  const div=document.createElement("div");
  div.className="ai-msg-a";
  div.id="aiKeySetup";
  const rows=_AI_PROVIDERS.map((p,idx)=>{
    const has=!!_aiKeyOf(p);
    return `<div style="border:1px solid ${has?'var(--settled)':'var(--rule)'};border-radius:9px;padding:8px;margin-bottom:6px;background:${has?'rgba(78,138,90,.10)':'transparent'}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <span style="font-size:12px;font-weight:700">${idx+1}. ${p.name} ${has?'<span style="color:var(--settled)">✅</span>':''}</span>
        <a href="${p.url}" target="_blank" rel="noopener" style="color:var(--steel);font-size:10px">فتح الموقع ↗</a>
      </div>
      <div style="font-size:10px;color:var(--paper-3);margin:3px 0 5px">${esc(p.note)}</div>
      <div style="display:flex;gap:5px">
        <input id="aiK_${p.id}" type="text" data-secret="1" placeholder="${has?'••••••  (محفوظ)':p.pfx+'...'}"
          style="flex:1;padding:6px 8px;border-radius:7px;border:1px solid var(--ink-300);background:var(--ink-050);color:var(--paper);font-size:11px;outline:none"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
        <button onclick="_aiSaveKeyFor('${p.id}')" style="padding:6px 11px;border-radius:7px;background:var(--steel);color:#fff;border:none;font-size:11px;cursor:pointer;font-weight:700">حفظ</button>
        ${has?`<button onclick="_aiClearKeyFor('${p.id}')" style="padding:6px 9px;border-radius:7px;background:transparent;color:var(--owing);border:1px solid var(--owing);font-size:11px;cursor:pointer">حذف</button>`:''}
      </div>
    </div>`;
  }).join('');
  div.innerHTML=`🔑 <strong>مزوّدو المساعد</strong><br>
<span style="font-size:11px;color:var(--paper-3)">يكفي مفتاح واحد. كل مفتاح تضيفه يرفع السقف اليومي — حين يمتلئ سقف مزوّد ينتقل السؤال للتالي تلقائياً.</span><br><br>
${rows}
<div style="border:1px solid var(--owing);border-radius:9px;padding:8px;margin-top:8px;background:rgba(168,69,58,.08)">
  <div style="font-size:11px;font-weight:700;color:var(--owing);margin-bottom:3px">⚠️ تنبيه خصوصية مهم</div>
  <div style="font-size:10px;color:var(--paper-2);line-height:1.6">
    الخطط المجانية عند أغلب المزوّدين تسمح لهم باستعمال ما ترسله لتحسين نماذجهم.
    المساعد لا يرسل سجلاتك — يرسل أسماء الأطراف ونص سؤالك فقط، والأرقام تُحسب داخل جهازك.
    ومع ذلك: تجنّب كتابة أرقام هواتف أو تفاصيل شخصية في أسئلتك.
  </div>
</div>`;
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}

function _aiSaveKeyFor(id){
  const p=_AI_PROVIDERS.find(x=>x.id===id); if(!p)return;
  const k=(document.getElementById("aiK_"+id)?.value||"").trim();
  if(!k){showToast("⚠️ الصق المفتاح أولاً");return;}
  if(p.pfx&&!k.startsWith(p.pfx)){
    showToast(`⚠️ مفتاح ${p.name} يبدأ بـ ${p.pfx}`);return;
  }
  if(!_aiSetKey(p,k))return;          // v17.47 — لا تُعلن النجاح إن لم يُحفظ
  delete _aiCooldown[p.id];
  showToast(`✅ حُفظ مفتاح ${p.name}`);
  _aiShowKeySetup();
}
function _aiClearKeyFor(id){
  const p=_AI_PROVIDERS.find(x=>x.id===id); if(!p)return;
  _aiSetKey(p,"");
  showToast(`🗑 حُذف مفتاح ${p.name}`);
  _aiShowKeySetup();
}
/* توافق مع الاستدعاء القديم */
function _aiSaveKey(){_aiSaveKeyFor("groq");}

/* ══════════════════════════════════════════════════════
   عرض رسائل المساعد — v17.43
   ──────────────────────────────────────────────────────
   كانت الرسالة تُحقن كما هي في innerHTML. وهذا يعني أن أي
   وسم HTML — سواء كتبه المستخدم في سؤاله أو ورد في ردّ
   النموذج — يُنفَّذ داخل الصفحة. والصفحة تملك صلاحية
   الكتابة في فايربيس، فالثغرة ليست تشويهاً للشكل فحسب.
   الآن: نُهرّب النص أولاً، ثم نُطبّق تحويل markdown على
   النص المُهرَّب — فتبقى **الغامق** تعمل ولا يعمل أي وسم.
══════════════════════════════════════════════════════ */
function _aiAppend(role,text){
  const msgs=document.getElementById("aiMsgs");
  if(!msgs)return;
  const div=document.createElement("div");
  div.className=role==="u"?"ai-msg-u":"ai-msg-a";
  // تهريب أولاً — ثم markdown بسيط على النص الآمن
  div.innerHTML=esc(text)
    .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")
    .replace(/\n/g,"<br>");
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}

function _aiSetThinking(v){
  _aiThinking=v;
  const el=document.getElementById("aiThinking");
  if(el)el.style.display=v?"flex":"none";
  const btn=document.getElementById("aiSendBtn");
  if(btn)btn.disabled=v;
}

function _aiChip(txt){
  const inp=document.getElementById("aiInput");
  if(inp)inp.value=txt;
  _aiSend();
}

function _aiKeyDown(e){
  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();_aiSend();}
}

function _aiClear(){
  _aiHistory=[];
  const msgs=document.getElementById("aiMsgs");
  if(msgs)msgs.innerHTML="";
  _aiWelcome();
}

function _recPageNext(){
  const total=_recFiltered.length;
  if((_recPage+1)*_recPageSize>=total)return;
  _recPage++;
  _renderRecPage(false);
  document.getElementById("RL")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function _recPagePrev(){
  if(_recPage<=0)return;
  _recPage--;
  _renderRecPage(false);
  document.getElementById("RL")?.scrollIntoView({behavior:"smooth",block:"start"});
}

function clrF(){
  ["fM","fS","fW","fPaid"].forEach(id=>document.getElementById(id).value="all");
  document.getElementById("fDt").value="";
  document.getElementById("fSearch").value="";
  renderRecs();
}

