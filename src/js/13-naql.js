/* ════════════════════════════════════════════
   حساب النقال — جمع أجور النقل + بحث + دفع
════════════════════════════════════════════ */

function naqlSetRange(r){
  const today=toDay();
  const fd=document.getElementById("naqlFrom");
  const td=document.getElementById("naqlTo");
  if(r==="week"){
    const d=_D(today);d.setDate(d.getDate()-6);
    fd.value=_ds(d);td.value=today;
  }else if(r==="month"){
    fd.value=today.slice(0,7)+"-01";td.value=today;
  }else if(r==="30"){
    const d=_D(today);d.setDate(d.getDate()-29);
    fd.value=_ds(d);td.value=today;
  }else{
    fd.value="";td.value="";
  }
  renderNaqlColl();
}

function naqlInRange(dk,from,to){
  if(!from&&!to)return true;
  if(!dk)return true;
  const d=dk.slice(0,10);
  if(from&&d<from)return false;
  if(to&&d>to)return false;
  return true;
}

/* ── دوال دفع أجور النقل المستقلة ── */
function getNaqlPaidTotal(r){
  if(!r.naqlPayments||!r.naqlPayments.length) return r.naqlPaid?(r.naqlFee||0):0;
  return r.naqlPayments.reduce((s,p)=>s+(p.amount||0),0);
}
function getNaqlRemaining(r){return Math.max(0,(r.naqlFee||0)-getNaqlPaidTotal(r));}
function isNaqlFullyPaid(r){
  const tot=r.naqlFee||0;
  if(!tot)return true;
  return getNaqlPaidTotal(r)>=tot;
}
// لوصولات الضمانات الفرعية
function getDamSubNaqlPaid(sub){
  if(!sub.naqlPayments||!sub.naqlPayments.length) return sub.naqlPaid?(sub.trans||0):0;
  return sub.naqlPayments.reduce((s,p)=>s+(p.amount||0),0);
}
function getDamSubNaqlRemaining(sub){return Math.max(0,(sub.trans||0)-getDamSubNaqlPaid(sub));}
function isDamSubNaqlPaid(sub){
  const tot=sub.trans||0;
  if(!tot)return true;
  return getDamSubNaqlPaid(sub)>=tot;
}

/* ── فتح مودال دفع أجور النقل ── */
let _naqlPayId=null,_naqlPayType=null,_naqlPayDamId=null;

function openNaqlPay(id,type,damId){
  _naqlPayId=id;_naqlPayType=type;_naqlPayDamId=damId||null;
  let r=_getNaqlRec();
  if(!r)return;
  const isSub=type==='dam-sub';
  const fee=isSub?(r.trans||0):(r.naqlFee||0);
  const payments=r.naqlPayments||[];
  const paidSoFar=isSub?getDamSubNaqlPaid(r):getNaqlPaidTotal(r);
  const remaining=Math.max(0,fee-paidSoFar);
  const pct=fee>0?Math.min(100,Math.round(paidSoFar/fee*100)):0;

  const histHTML=payments.length?`
    <div class="pay-hist">
      ${payments.map((p,i)=>`
        <div class="pay-hist-row">
          <span style="color:var(--paper-2)">💳 ${tAr(p.at)} — ${esc(p.by)}${p.note?`<br><span style="color:var(--wheat);font-size:9px">📝 ${esc(p.note)}</span>`:""}</span>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--settled);font-weight:700">${fIQD(p.amount)}</span>
            <button onclick="removeNaqlPayment(${i})" style="background:rgba(239,68,68,.15);color:var(--owing);border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>
          </div>
        </div>`).join("")}
    </div>`:'<div style="font-size:11px;color:var(--paper-4);margin-top:4px">لا توجد دفعات مسجّلة</div>';

  const label=isSub?(r.driver||r.desc||""):`${esc(r.driver||"")} — ${esc(r.plate||"")}${esc(r.transporter?" — 🚚 "+r.transporter:"")}`;
  const el=document.getElementById("mPartialPay");
  el.innerHTML=`
    <div class="mhd"></div>
    <div class="mtit" style="color:var(--wheat)">🚚 دفع أجور النقل</div>
    <p class="mtxt" style="margin-bottom:8px">${label}</p>
    <div class="pay-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">
        <span style="color:var(--paper-2)">أجور النقل: <strong style="color:var(--wheat-hi)">${fIQD(fee)}</strong></span>
        <span style="color:var(--wheat-hi);font-weight:700">${pct}% مدفوع</span>
      </div>
      <div class="pay-bar-track"><div class="pay-bar-fill" style="width:${pct}%;background:var(--wheat)"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px">
        <span style="color:var(--settled);font-weight:700">✅ مدفوع: ${fIQD(paidSoFar)}</span>
        <span style="${remaining>0?"color:var(--owing)":"color:var(--settled)"};font-weight:700">${remaining>0?"⏳ متبقي: "+fIQD(remaining):"✅ مسدّد كامل"}</span>
      </div>
      ${histHTML}
    </div>
    ${remaining>0?`
    <div class="fi-g" style="margin-top:12px">
      <label class="fl">مبلغ الدفعة (د.ع) — الحد الأقصى: ${fIQD(remaining)}</label>
      <input class="fi" id="naqlPayAmt" type="text" inputmode="numeric" autocomplete="off" placeholder="0" dir="ltr" style="text-align:right" oninput="fmtPayInput(this,${remaining})" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div class="fi-g" style="margin-top:8px">
      <label class="fl">ملاحظة (اختياري)</label>
      <input class="fi" id="naqlPayNote" type="text" placeholder="أي تفاصيل عن الدفعة" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn bgn" style="flex:1;justify-content:center;background:var(--wheat)" onclick="addNaqlPayment()">+ تسجيل دفعة</button>
      <button class="btn" style="flex:1;justify-content:center;background:var(--pending-rule);color:var(--wheat);border:1px solid var(--wheat)" onclick="naqlPayFull()">✅ دفع الكل (${fIQD(remaining)})</button>
    </div>`:`
    <div style="background:var(--wheat-wash);border:1px solid var(--wheat);border-radius:8px;padding:10px;text-align:center;color:var(--wheat);font-weight:700;margin-top:10px;font-size:13px">
      ✅ تم سداد أجور النقل كاملاً
    </div>`}
    <div class="mbtns" style="margin-top:12px">
      <button class="btn bgh" style="width:100%;justify-content:center" onclick="closeM()">إغلاق</button>
    </div>`;
  document.getElementById("mPartialPay-ov").classList.add("on");
}

function _getNaqlRec(){
  if(_naqlPayType==='buy'){
    const {recId,entryId}=_parseNaqlMultiId(_naqlPayId);
    const rec=S.recs.find(x=>x.id===recId);
    if(!rec)return null;
    if(entryId&&Array.isArray(rec.naqlList)){
      const entry=rec.naqlList.find(x=>x.id===entryId);
      if(!entry)return null;
      return{...entry,driver:rec.driver,plate:rec.plate,dk:rec.dk,id:_naqlPayId};
    }
    return rec;
  }
  if(_naqlPayType==='sell'){
    return SELL_RECS.find(x=>x.id===_naqlPayId)||null;
  }
  if(_naqlPayType==='dam-sub'){
    const dam=DAM_RECS.find(x=>x.id===_naqlPayDamId);
    if(!dam||!dam.subRecs)return null;
    return Object.values(dam.subRecs).find(x=>x.id===_naqlPayId)||null;
  }
  return null;
}

function addNaqlPayment(){
  const amount=payAmt("naqlPayAmt");
  const note=(document.getElementById("naqlPayNote")?.value||"").trim();
  if(!amount||amount<=0){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  _applyNaqlPayment(amount,note);
}
function naqlPayFull(){
  const r=_getNaqlRec();if(!r)return;
  const isSub=_naqlPayType==='dam-sub';
  const fee=isSub?(r.trans||0):(r.naqlFee||0);
  const paid=isSub?getDamSubNaqlPaid(r):getNaqlPaidTotal(r);
  const rem=fee-paid;
  if(rem<=0){showToast("✅ مدفوع بالكامل بالفعل");return;}
  const note=(document.getElementById("naqlPayNote")?.value||"").trim();
  _applyNaqlPayment(rem,note);
}
function _applyNaqlPayment(amount,note){
  const r=_getNaqlRec();if(!r)return;
  const isSub=_naqlPayType==='dam-sub';
  const fee=isSub?(r.trans||0):(r.naqlFee||0);
  /* ══════════════════════════════════════════════════════
     حاجز الدفع الزائد — v17.43
     ──────────────────────────────────────────────────────
     دفع أجور الوصل (applyPayment) يقصّ المبلغ على المتبقي،
     لكن دفع أجور النقل كان يقبل أي رقم. القصّ في الواجهة
     وحدها (fmtPayInput) لا يكفي: المودال يبقى مفتوحاً بعد
     كل دفعة وقيمة max المحقونة فيه تصبح قديمة، فدفعتان
     متتاليتان تتجاوزان الأجرة ويظهر الناقل دائناً للساحة.
     نقيس المتبقي لحظة التنفيذ من البيانات نفسها.
  ══════════════════════════════════════════════════════ */
  const paidNow=isSub?getDamSubNaqlPaid(r):getNaqlPaidTotal(r);
  const _rem=Math.max(0,fee-paidNow);
  if(_rem<=0){showToast("✅ أجور النقل مدفوعة بالكامل بالفعل");return;}
  if(amount>_rem){showToast("⚠ المبلغ أكبر من المتبقي — تم ضبطه على "+fIQD(_rem));amount=_rem;}
  const payments=[...(r.naqlPayments||[]),{amount,at:nowStr(),by:S.cu.name,note:(note||"").trim()||null}];
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const fullyPaid=paidTotal>=fee;
  const upd={...r,naqlPayments:payments,naqlPaidTotal:paidTotal,naqlPaid:fullyPaid,naqlPaidAt:fullyPaid?(r.naqlPaidAt||nowStr()):null};
  _saveNaqlUpdated(upd);
  showToast("✅ تم تسجيل "+fIQD(amount));
  openNaqlPay(_naqlPayId,_naqlPayType,_naqlPayDamId);
}
function removeNaqlPayment(idx){
  const r=_getNaqlRec();if(!r)return;
  const isSub=_naqlPayType==='dam-sub';
  const fee=isSub?(r.trans||0):(r.naqlFee||0);
  const payments=(r.naqlPayments||[]).filter((_,i)=>i!==idx);
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const fullyPaid=paidTotal>=fee;
  const upd={...r,naqlPayments:payments,naqlPaidTotal:paidTotal,naqlPaid:fullyPaid,naqlPaidAt:fullyPaid?(r.naqlPaidAt||nowStr()):null};
  _saveNaqlUpdated(upd);
  showToast("↩️ تم إلغاء الدفعة");
  openNaqlPay(_naqlPayId,_naqlPayType,_naqlPayDamId);
}
function _saveNaqlUpdated(upd){
  if(_naqlPayType==='buy'){
    const {recId,entryId}=_parseNaqlMultiId(upd.id);
    if(entryId){
      const rec=S.recs.find(x=>x.id===recId);
      if(!rec||!Array.isArray(rec.naqlList))return;
      const newList=rec.naqlList.map(x=>x.id===entryId?{...x,naqlPayments:upd.naqlPayments,naqlPaidTotal:upd.naqlPaidTotal,naqlPaid:upd.naqlPaid,naqlPaidAt:upd.naqlPaidAt}:x);
      const updRec={...rec,naqlList:newList};
      const idx=S.recs.findIndex(x=>x.id===recId);
      if(idx>=0)S.recs[idx]=updRec; else S.recs.unshift(updRec);
      saveRec(updRec);
    } else {
      // تحديث الذاكرة فوراً قبل Firebase — سجل بناقل واحد قديم
      const idx=S.recs.findIndex(x=>x.id===recId);
      if(idx>=0)S.recs[idx]=upd; else S.recs.unshift(upd);
      saveRec(upd);
    }
  } else if(_naqlPayType==='sell'){
    const idx=SELL_RECS.findIndex(x=>x.id===upd.id);
    if(idx>=0)SELL_RECS[idx]=upd; else SELL_RECS.unshift(upd);
    saveSellRec(upd);
  } else if(_naqlPayType==='dam-sub'){
    const dam=DAM_RECS.find(x=>x.id===_naqlPayDamId);
    if(!dam||!dam.subRecs)return;
    const subKey=Object.keys(dam.subRecs).find(k=>dam.subRecs[k].id===_naqlPayId);
    if(!subKey)return;
    const updDam={...dam,subRecs:{...dam.subRecs,[subKey]:upd}};
    const di=DAM_RECS.findIndex(x=>x.id===_naqlPayDamId);
    if(di>=0)DAM_RECS[di]=updDam;
    saveDamRec(updDam);
  }
  // render فوري بعد تحديث الذاكرة
  renderNaqlColl();
  renderNaqlRecs();
  const s=document.getElementById("naqlSrchResult");
  if(s&&s.innerHTML)doNaqlSearch();
}

/* ════════════════════════════════════════════
   الدفع الجامع لأجور النقل — توزيع مبلغ واحد
   على وصولات ناقل معيّن من الأقدم إلى الأحدث
   (يشمل: شراء / بيع / ضمانات فرعية / نقل يدوي)
════════════════════════════════════════════ */
let _naqlBulkPayName='';

function naqlBulkPaySearch(){
  _naqlBulkPayName=(document.getElementById('naqlBulkPayName')?.value||'').trim();
  document.getElementById('naqlBulkPayResult').innerHTML='';
  renderNaqlBulkPayPreview();
}

/* جمع كل وصولات النقل غير المسددة بالكامل لناقل معيّن، مرتبة من الأقدم للأحدث */
function _getNaqlBulkEntries(name){
  if(!name)return[];
  let entries=[];
  // شراء
  (S.recs||[]).forEach(r=>{
    if(!r.nOn)return;
    getNaqlEntries(r).forEach(en=>{
      if(!en.naqlFee||en.naqlFee<=0)return;
      if(!smartMatch(en.transporter,name))return;
      const compId=_naqlCompositeId(r.id,en._entryId);
      const rRef={...en,id:compId,driver:r.driver,plate:r.plate,dk:r.dk};
      const rem=getNaqlRemaining(rRef);
      if(rem<=0)return;
      entries.push({type:'buy',damId:null,rRef,dk:r.dk||'',fee:en.naqlFee,paid:getNaqlPaidTotal(en),remaining:rem,label:"شراء — "+(r.plate||"")+" | "+(r.driver||"")});
    });
  });
  // بيع
  (SELL_RECS||[]).forEach(r=>{
    if(!r.nOn||!r.naqlFee||r.naqlFee<=0)return;
    if(!smartMatch(r.transporter,name))return;
    const rem=getNaqlRemaining(r);
    if(rem<=0)return;
    entries.push({type:'sell',damId:null,rRef:r,dk:r.dk||'',fee:r.naqlFee,paid:getNaqlPaidTotal(r),remaining:rem,label:"بيع — "+(r.plate||"")+" | "+(r.driver||"")});
  });
  // ضمانات فرعية
  (DAM_RECS||[]).forEach(dam=>{
    const subs=dam.subRecs?Object.values(dam.subRecs):[];
    subs.forEach(sub=>{
      if(!sub.trans||sub.trans<=0)return;
      if(!smartMatch(sub.transporter,name))return;
      const rem=getDamSubNaqlRemaining(sub);
      if(rem<=0)return;
      entries.push({type:'dam-sub',damId:dam.id,rRef:sub,dk:sub.dk||dam.dk||'',fee:sub.trans,paid:getDamSubNaqlPaid(sub),remaining:rem,label:"ضمانة — "+(dam.damin||"")+" / "+(sub.driver||sub.desc||"")});
    });
  });
  // نقل يدوي
  (MNL_RECS||[]).forEach(r=>{
    if(!r.naqlFee||r.naqlFee<=0)return;
    if(!smartMatch(r.transporter,name))return;
    const paid=getNaqlPaidTotal_mnl(r);
    const rem=Math.max(0,(r.naqlFee||0)-paid);
    if(rem<=0)return;
    const dk=r.dk||(r.createdAt?r.createdAt.slice(0,10):"");
    entries.push({type:'mnl',damId:null,rRef:r,dk,fee:r.naqlFee,paid,remaining:rem,label:"نقل يدوي"+(r.farmer?" — "+r.farmer:"")+(r.plate?" | "+r.plate:"")});
  });

  entries.sort((a,b)=>{
    const dkA=a.dk||"",dkB=b.dk||"";
    if(dkA!==dkB)return dkA.localeCompare(dkB);
    return 0;
  });
  return entries;
}

/* تطبيق دفعة على وصل نقل واحد ضمن عملية الدفع الجامع — مستقل عن حالة المودال الفردي */
function _applyBulkNaqlEntryPayment(entry,payAmount,note){
  const type=entry.type;
  const rRef=entry.rRef;
  const fee=type==='dam-sub'?(rRef.trans||0):(rRef.naqlFee||0);
  const payments=[...(rRef.naqlPayments||[]),{amount:payAmount,at:nowStr(),by:S.cu.name+" (دفع جامع نقل)",note:note||null}];
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const fullyPaid=paidTotal>=fee;
  const upd={...rRef,naqlPayments:payments,naqlPaidTotal:paidTotal,naqlPaid:fullyPaid,naqlPaidAt:fullyPaid?(rRef.naqlPaidAt||nowStr()):null};

  if(type==='buy'){
    const {recId,entryId}=_parseNaqlMultiId(upd.id);
    const rec=S.recs.find(x=>x.id===recId);
    if(!rec)return;
    let updRec;
    if(entryId){
      if(!Array.isArray(rec.naqlList))return;
      const newList=rec.naqlList.map(x=>x.id===entryId?{...x,naqlPayments:upd.naqlPayments,naqlPaidTotal:upd.naqlPaidTotal,naqlPaid:upd.naqlPaid,naqlPaidAt:upd.naqlPaidAt}:x);
      updRec={...rec,naqlList:newList};
    } else {
      /* ══════════════════════════════════════════════════════
         ⚠️ إتلاف وصل الشراء — v17.44
         ──────────────────────────────────────────────────────
         الوصل القديم بناقل واحد (بلا naqlList) تُمثّله
         getNaqlEntries بكائن مُركَّب لا يحوي إلا حقول النقل.
         وكان الكود هنا يحفظ ذلك الكائن مكان الوصل كاملاً:
         S.recs[idx]=upd ثم saveRec(upd).
         النتيجة أن دفع أجور النقل جامعاً كان يمحو الوصل —
         يذهب المبلغ النهائي والصافي والوزن والحالة والمخزن
         وسجل دفعات الفلاح كلها (قِسنا ٢١ حقلاً تصير ١٣).
         الصحيح: ندمج حقول النقل في الوصل الأصلي ولا نستبدله.
         (المسار الفردي في _saveNaqlUpdated كان سليماً لأنه
          يقرأ الوصل كاملاً من _getNaqlRec.)
      ══════════════════════════════════════════════════════ */
      updRec={...rec,
        naqlPayments:upd.naqlPayments,
        naqlPaidTotal:upd.naqlPaidTotal,
        naqlPaid:upd.naqlPaid,
        naqlPaidAt:upd.naqlPaidAt};
    }
    const idx=S.recs.findIndex(x=>x.id===recId);
    if(idx>=0)S.recs[idx]=updRec; else S.recs.unshift(updRec);
    saveRec(updRec);
  } else if(type==='sell'){
    const idx=SELL_RECS.findIndex(x=>x.id===upd.id);
    if(idx>=0)SELL_RECS[idx]=upd; else SELL_RECS.unshift(upd);
    saveSellRec(upd);
  } else if(type==='dam-sub'){
    const dam=DAM_RECS.find(x=>x.id===entry.damId);
    if(!dam||!dam.subRecs)return;
    const subKey=Object.keys(dam.subRecs).find(k=>dam.subRecs[k].id===upd.id);
    if(!subKey)return;
    const updDam={...dam,subRecs:{...dam.subRecs,[subKey]:upd}};
    const di=DAM_RECS.findIndex(x=>x.id===entry.damId);
    if(di>=0)DAM_RECS[di]=updDam;
    saveDamRec(updDam);
  } else if(type==='mnl'){
    saveMnlRec(upd);
  }
}

function renderNaqlBulkPayPreview(){
  const el=document.getElementById('naqlBulkPayPreview');
  if(!el)return;
  const name=_naqlBulkPayName;
  if(!name){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:22px;font-size:12px">🔍 اكتب اسم الناقل لعرض وصولاته غير المسددة</div>`;
    return;
  }
  const entries=_getNaqlBulkEntries(name);
  if(!entries.length){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:22px;font-size:12px">✅ لا توجد أجور نقل غير مسددة لـ "${esc(name)}"</div>`;
    return;
  }
  const totalRem=entries.reduce((s,e)=>s+e.remaining,0);
  const rows=entries.map((e,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 9px;border-bottom:1px solid var(--rule);font-size:11px">
    <span style="color:var(--paper-2)">${AR(i+1)}. 📅 ${tAr(e.dk)} — ${esc(e.label)}${e.paid>0?' | 💰 جزئي':''}</span>
    <span style="color:var(--wheat-hi);font-weight:700">${fIQD(e.remaining)}</span>
  </div>`).join("");
  el.innerHTML=`
    <div style="background:var(--ink-200);border-radius:9px;padding:9px 11px;margin-bottom:8px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:12px">
      <span style="color:var(--paper-2)">عدد الوصولات: <strong style="color:var(--wheat-hi)">${AR(entries.length)}</strong></span>
      <span style="color:var(--paper-2)">إجمالي المتبقي: <strong style="color:var(--owing)">${fIQD(totalRem)}</strong></span>
    </div>
    <div style="max-height:260px;overflow-y:auto;background:var(--ink-100);border-radius:9px;border:1px solid var(--rule)">${rows}</div>`;
}

function execNaqlBulkPay(){
  const name=_naqlBulkPayName||(document.getElementById('naqlBulkPayName')?.value||'').trim();
  const amount=payAmt("naqlBulkPayAmount");
  const note=(document.getElementById('naqlBulkPayNote')?.value||'').trim();
  if(!name){showToast('⚠ أدخل اسم الناقل');return;}
  if(!amount||amount<=0){showToast('⚠ أدخل مبلغاً صحيحاً');return;}
  const entries=_getNaqlBulkEntries(name);
  if(!entries.length){showToast('⚠ لا توجد وصولات نقل غير مسددة لهذا الناقل');return;}
  let pool=amount;
  const results=[];
  for(const e of entries){
    if(pool<=0)break;
    const pay=Math.min(pool,e.remaining);
    _applyBulkNaqlEntryPayment(e,pay,note);
    results.push({label:e.label,dk:e.dk,paid:pay,fullyPaid:pay>=e.remaining});
    pool-=pay;
  }
  const totalPaid=amount-pool;
  if(!results.length){showToast('⚠ لم يتم تسجيل أي دفعة');return;}
  const summary=`<div style="background:var(--wheat-wash);border:1px solid var(--wheat);border-radius:10px;padding:11px;margin-top:8px">
    <div style="font-size:12px;color:var(--wheat);font-weight:700;margin-bottom:7px">✅ تم توزيع الدفعة على ${AR(results.length)} وصل</div>
    <div style="max-height:200px;overflow-y:auto">
    ${results.map(r=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px dashed var(--pending-rule)">
      <span style="color:var(--paper-2)">📅 ${tAr(r.dk)} — ${esc(r.label)}</span>
      <span style="color:var(--wheat);font-weight:700">${fIQD(r.paid)}${r.fullyPaid?' ✅ مكتمل':' 💰 جزئي'}</span>
    </div>`).join("")}
    </div>
    <div style="margin-top:7px;font-size:13px;color:var(--wheat-hi);font-weight:700">إجمالي المدفوع: ${fIQD(totalPaid)}</div>
    ${pool>0?`<div style="margin-top:4px;font-size:11px;color:var(--owing)">⚠ متبقي من المبلغ المُدخل لم يُستخدم (لا توجد وصولات أخرى لهذا الناقل): ${fIQD(pool)}</div>`:""}
  </div>`;
  document.getElementById('naqlBulkPayResult').innerHTML=summary;
  document.getElementById('naqlBulkPayAmount').value="";
  const noteEl=document.getElementById('naqlBulkPayNote');if(noteEl)noteEl.value="";
  renderNaqlBulkPayPreview();
  renderNaqlColl();
  renderNaqlRecs();
  const s=document.getElementById("naqlSrchResult");
  if(s&&s.innerHTML)doNaqlSearch();
  showToast('✅ تم الدفع الجامع لأجور النقل — '+fIQD(totalPaid));
}

function clrNaqlBulkPay(){
  const n=document.getElementById('naqlBulkPayName');if(n)n.value="";
  const a=document.getElementById('naqlBulkPayAmount');if(a)a.value="";
  const nt=document.getElementById('naqlBulkPayNote');if(nt)nt.value="";
  _naqlBulkPayName="";
  const p=document.getElementById('naqlBulkPayPreview');if(p)p.innerHTML="";
  const r=document.getElementById('naqlBulkPayResult');if(r)r.innerHTML="";
}

/* ── زر دفع النقل في الكارت ── */
function naqlPayBtnHTML(r,type,damId){
  const isSub=type==='dam-sub';
  const isMnl=type==='mnl';
  const fee=isSub?(r.trans||0):isMnl?(r.naqlFee||0):(r.naqlFee||0);
  if(!fee)return "";
  const paid=isSub?getDamSubNaqlPaid(r):isMnl?getNaqlPaidTotal_mnl(r):getNaqlPaidTotal(r);
  const pct=fee>0?Math.min(100,Math.round(paid/fee*100)):0;
  const full=isSub?isDamSubNaqlPaid(r):isMnl?(r.naqlPaid||paid>=fee):isNaqlFullyPaid(r);
  const damArg=damId?`,'${damId}'`:'';
  const onclick=isMnl?`openMnlPay('${r.id}')`:`openNaqlPay('${r.id}','${type}'${damArg})`;
  if(full) return `<button class="btn bsm" style="background:rgba(251,146,60,.15);color:var(--wheat);border:1px solid #fb923c55" onclick="${onclick}">✅ نقل مدفوع</button>`;
  if(paid>0) return `<button class="btn bsm" style="background:rgba(251,191,36,.12);color:var(--wheat-hi);border:1px solid var(--wheat-hi)" onclick="${onclick}">🚚 ${pct}% — نقل جزئي</button>`;
  return `<button class="btn bsm" style="background:rgba(249,115,22,.12);color:var(--wheat);border:1px solid #f9731655" onclick="${onclick}">⏳ دفع أجور النقل</button>`;
}

/* ── بحث عن ناقل بالاسم ── */
function doNaqlSearch(){
  const srch=(document.getElementById("naqlSrch")?.value||"").trim().toLowerCase();
  const el=document.getElementById("naqlSrchResult");
  if(!el)return;
  if(!srch){el.innerHTML="";return;}

  let entries=[];

  // شراء (يدعم أكثر من ناقل بالوصل الواحد)
  (S.recs||[]).forEach(r=>{
    if(!r.nOn)return;
    getNaqlEntries(r).forEach(en=>{
      if(!en.naqlFee)return;
      if(!smartMatch(en.transporter,srch)&&!smartMatch(r.driver,srch))return;
      const compId=_naqlCompositeId(r.id,en._entryId);
      entries.push({r:{...en,id:compId,driver:r.driver,plate:r.plate,dk:r.dk},type:'buy',damId:null});
    });
  });
  // بيع
  (SELL_RECS||[]).forEach(r=>{
    if(!r.nOn||!r.naqlFee)return;
    if(!smartMatch(r.transporter,srch)&&!smartMatch(r.driver,srch))return;
    entries.push({r,type:'sell',damId:null});
  });
  // ضمانات
  (DAM_RECS||[]).forEach(dam=>{
    const subs=dam.subRecs?Object.values(dam.subRecs):[];
    subs.forEach(sub=>{
      if(!sub.trans||sub.trans<=0)return;
      if(!smartMatch(sub.transporter,srch)&&!smartMatch(sub.driver||sub.desc,srch))return;
      entries.push({r:sub,type:'dam-sub',damId:dam.id,damName:dam.damin||""});
    });
  });
  // وصولات النقل اليدوية
  (MNL_RECS||[]).forEach(r=>{
    if(!r.naqlFee||r.naqlFee<=0)return;
    if(!smartMatch(r.transporter,srch)&&!smartMatch(r.farmer,srch)&&!smartMatch(r.plate,srch))return;
    entries.push({r,type:'mnl',damId:null,damName:""});
  });

  if(!entries.length){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-3);padding:20px;font-size:13px">لا توجد نتائج لـ "${srch}"</div>`;
    return;
  }

  // ترتيب بالتاريخ تنازلي
  entries.sort((a,b)=>(b.r.dk||"").localeCompare(a.r.dk||""));

  const totalFee=entries.reduce((s,e)=>{
    if(e.type==='dam-sub') return s+(e.r.trans||0);
    return s+(e.r.naqlFee||0);
  },0);
  const totalPaid=entries.reduce((s,e)=>{
    if(e.type==='dam-sub') return s+getDamSubNaqlPaid(e.r);
    if(e.type==='mnl') return s+getNaqlPaidTotal_mnl(e.r);
    return s+getNaqlPaidTotal(e.r);
  },0);
  const totalRem=totalFee-totalPaid;

  let html=`
  <div style="background:#fb923c18;border:1px solid #fb923c44;border-radius:10px;padding:11px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
    <div style="font-size:12px;color:var(--wheat);font-weight:700">🔍 نتائج: ${AR(entries.length)} وصل</div>
    <div style="text-align:left;font-size:12px">
      <span style="color:var(--wheat-hi);font-weight:800">${fIQD(totalFee)}</span>
      <span style="color:var(--paper-2)"> | مدفوع: </span><span style="color:var(--settled);font-weight:700">${fIQD(totalPaid)}</span>
      ${totalRem>0?`<span style="color:var(--paper-2)"> | متبقي: </span><span style="color:var(--owing);font-weight:700">${fIQD(totalRem)}</span>`:""}
    </div>
  </div>`;

  entries.forEach(({r,type,damId,damName})=>{
    const isSub=type==='dam-sub';
    const isMnl=type==='mnl';
    const fee=isSub?(r.trans||0):(r.naqlFee||0);
    const paid=isSub?getDamSubNaqlPaid(r):isMnl?getNaqlPaidTotal_mnl(r):getNaqlPaidTotal(r);
    const rem=Math.max(0,fee-paid);
    const full=isSub?isDamSubNaqlPaid(r):isMnl?(r.naqlPaid||paid>=fee):isNaqlFullyPaid(r);
    const typeLabel=type==='buy'?'🛒 شراء':type==='sell'?'💰 بيع':isMnl?'🚚 نقل يدوي':`🤝 ضمانة — ${damName}`;
    const farmer=isSub?(r.driver||r.desc||""):isMnl?(r.farmer||""):(r.driver||"");
    const transporter=r.transporter||"(بدون اسم ناقل)";
    const kabs=isSub?(r.transCount||0):isMnl?(r.kabs||0):(r.nC||r.nKabs||r.kC||0);
    const pricePerKab=isSub?(r.transPpcs||0):isMnl?(r.pricePerK||0):(r.nUP||0);
    const plate=r.plate||"";

    html+=`
    <div style="background:var(--ink-100);border:1px solid ${full?'#fb923c33':'#f9731644'};border-radius:10px;padding:10px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;margin-bottom:6px">
        <div>
          <span style="font-size:10px;background:#fb923c22;color:var(--wheat);padding:2px 7px;border-radius:5px;font-weight:700">${typeLabel}</span>
          <div style="font-size:13px;font-weight:800;color:var(--paper);margin-top:4px">🚚 ${esc(transporter)}</div>
          <div style="font-size:11px;color:var(--paper-2);margin-top:2px">👤 ${esc(farmer)}${esc(plate?" | 🚛 "+plate:"")} | 📅 ${tAr(r.dk||"")}</div>
          <div style="font-size:11px;color:var(--steel);margin-top:1px">${AR(kabs)} كبسة × ${fIQD(pricePerKab)} = <strong style="color:var(--wheat-hi)">${fIQD(fee)}</strong></div>
        </div>
        <div style="text-align:left">
          ${full?`<div style="font-size:11px;color:var(--wheat);font-weight:700">✅ مدفوع</div>`:`<div style="font-size:11px;color:var(--owing);font-weight:700">⏳ متبقي: ${fIQD(rem)}</div>`}
          ${paid>0&&!full?`<div style="font-size:10px;color:var(--settled)">✅ ${fIQD(paid)}</div>`:""}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${naqlPayBtnHTML(r,type,damId)}
      </div>
    </div>`;
  });

  el.innerHTML=html;
}

function renderNaqlColl(){
  const from=(document.getElementById("naqlFrom")?.value||"").trim();
  const to=(document.getElementById("naqlTo")?.value||"").trim();
  const el=document.getElementById("naqlCollResult");
  if(!el)return;

  // map: transporterName → {fee,paidTotal,kabs,entries:[]}
  const map={};

  function addEntry(name,fee,paidAmt,kabs,label,dk,farmer,id,type,damId,rRef,note,price){
    if(!name||fee<=0)return;
    if(!map[name])map[name]={fee:0,paid:0,kabs:0,entries:[]};
    map[name].fee+=fee;
    map[name].paid+=paidAmt;
    map[name].kabs+=kabs;
    const priceVal=price!=null?price:(kabs>0?fee/kabs:0);
    map[name].entries.push({label,dk,fee,paid:paidAmt,kabs,price:priceVal,farmer:farmer||"",id,type,damId,rRef,note:note||""});
  }

  // ── ١. وصولات الشراء (يدعم أكثر من ناقل بالوصل الواحد) ──
  (S.recs||[]).forEach(r=>{
    if(!r.nOn)return;
    if(!naqlInRange(r.dk,from,to))return;
    getNaqlEntries(r).forEach(en=>{
      if(!en.naqlFee||en.naqlFee<=0)return;
      const name=en.transporter||"(بدون اسم ناقل)";
      const kabs=en.nC||0;
      const compId=_naqlCompositeId(r.id,en._entryId);
      addEntry(name,en.naqlFee,getNaqlPaidTotal(en),kabs,"شراء — "+(r.plate||"")+" | "+whTitle(r.wh),r.dk,r.driver,compId,'buy',null,{...en,id:compId,driver:r.driver,plate:r.plate,dk:r.dk},null,en.nUP||0);
    });
  });

  // ── ٢. وصولات البيع ──
  (SELL_RECS||[]).forEach(r=>{
    if(!r.nOn||!r.naqlFee||r.naqlFee<=0)return;
    if(!naqlInRange(r.dk,from,to))return;
    const name=r.transporter||"(بدون اسم ناقل)";
    const kabs=r.nKabs||r.nC||0;
    addEntry(name,r.naqlFee,getNaqlPaidTotal(r),kabs,"بيع — "+(r.plate||"")+" | "+(r.dest||""),r.dk,r.driver,r.id,'sell',null,r,null,r.nUP||0);
  });

  // ── ٣. وصولات الضمانات الفرعية ──
  (DAM_RECS||[]).forEach(dam=>{
    const subs=dam.subRecs?Object.values(dam.subRecs):[];
    subs.forEach(sub=>{
      if(!sub.trans||sub.trans<=0)return;
      if(!naqlInRange(sub.dk||dam.dk,from,to))return;
      const name=sub.transporter||"(بدون اسم ناقل)";
      const kabs=sub.transCount||0;
      addEntry(name,sub.trans,getDamSubNaqlPaid(sub),kabs,"ضمانة — "+(dam.damin||"")+" / "+(sub.driver||sub.desc||""),sub.dk||dam.dk,sub.driver||sub.desc,sub.id,'dam-sub',dam.id,sub,sub.note,sub.transPpcs||0);
    });
  });

  // ── ٤. وصولات النقل اليدوية ──
  (MNL_RECS||[]).forEach(r=>{
    if(!r.naqlFee||r.naqlFee<=0)return;
    const dk=r.dk||(r.createdAt?r.createdAt.slice(0,10):"");
    if(!naqlInRange(dk,from,to))return;
    const name=r.transporter||"(بدون اسم ناقل)";
    addEntry(name,r.naqlFee,getNaqlPaidTotal_mnl(r),r.kabs||0,"نقل يدوي"+(r.farmer?" — "+r.farmer:"")+(r.plate?" | "+r.plate:""),dk,r.farmer,r.id,'mnl',null,r,r.note,r.pricePerK||0);
  });
  const keys=Object.keys(map);
  if(keys.length===0){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-3);padding:32px;font-size:14px">لا توجد أجور نقل في هذه الفترة</div>`;
    return;
  }

  keys.sort((a,b)=>map[b].fee-map[a].fee);

  const totalFee=keys.reduce((s,k)=>s+map[k].fee,0);
  const totalPaid=keys.reduce((s,k)=>s+map[k].paid,0);
  const totalKabs=keys.reduce((s,k)=>s+map[k].kabs,0);
  const totalRem=totalFee-totalPaid;

  const rangeLabel=from&&to?`${tAr(from)} → ${tAr(to)}`:from?`من ${tAr(from)}`:to?`إلى ${tAr(to)}`:"كل الفترات";

  let html=`
  <div style="background:#fb923c18;border:1px solid #fb923c44;border-radius:10px;padding:12px;margin-bottom:12px">
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">
      <div>
        <div style="font-size:11px;color:var(--paper-2);margin-bottom:2px">📅 ${rangeLabel}</div>
        <div style="font-size:13px;color:var(--wheat);font-weight:700">إجمالي أجور النقل</div>
      </div>
      <div style="text-align:left">
        <div style="font-size:18px;font-weight:900;color:var(--wheat-hi)">${fIQD(totalFee)}</div>
        <div style="font-size:11px;color:var(--paper-2)">${AR(totalKabs)} كبسة | ${AR(keys.length)} ناقل</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:12px;background:var(--ink-100);border-radius:8px;padding:8px">
      <span>✅ مدفوع: <strong style="color:var(--settled)">${fIQD(totalPaid)}</strong></span>
      <span>⏳ متبقي: <strong style="color:var(--owing)">${fIQD(totalRem)}</strong></span>
    </div>
  </div>
  <button class="btn bsm" style="background:var(--wheat);color:#fff;width:100%;margin-bottom:12px;justify-content:center" onclick="printNaqlColl()">🖨️ طباعة حساب النقال</button>`;

  keys.forEach(name=>{
    const d=map[name];
    const dRem=d.fee-d.paid;
    const dPct=d.fee>0?Math.min(100,Math.round(d.paid/d.fee*100)):0;
    html+=`
    <div style="background:var(--ink-100);border:1px solid var(--rule);border-radius:11px;padding:12px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:6px">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--wheat)">🚚 ${esc(name)}</div>
          <div style="font-size:11px;color:var(--paper-3);margin-top:2px">${AR(d.entries.length)} وصل | ${AR(d.kabs)} كبسة</div>
        </div>
        <div style="text-align:left">
          <div style="font-size:16px;font-weight:900;color:var(--wheat-hi)">${fIQD(d.fee)}</div>
          ${dRem>0?`<div style="font-size:11px;color:var(--owing)">⏳ متبقي: ${fIQD(dRem)}</div>`:`<div style="font-size:11px;color:var(--settled)">✅ مسدّد</div>`}
        </div>
      </div>
      <div style="background:var(--ink-200);border-radius:5px;height:5px;margin-bottom:10px;overflow:hidden">
        <div style="width:${dPct}%;height:100%;background:var(--wheat)"></div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead>
          <tr style="background:var(--ink-200);color:var(--paper-2)">
            <th style="padding:5px 4px;text-align:right">التاريخ</th>
            <th style="padding:5px 4px;text-align:right">اسم الفلاح</th>
            <th style="padding:5px 4px;text-align:right">التفاصيل</th>
            <th style="padding:5px 4px;text-align:center">كبسة</th>
            <th style="padding:5px 4px;text-align:center">سعر النقل</th>
            <th style="padding:5px 4px;text-align:left">المبلغ</th>
            <th style="padding:5px 4px;text-align:center">الدفع</th>
          </tr>
        </thead>
        <tbody>
          ${d.entries.map((e,i)=>{
            const eFull=e.fee>0&&e.paid>=e.fee;
            const eRem=Math.max(0,e.fee-e.paid);
            return`<tr style="border-bottom:1px solid var(--rule);${i%2===0?"":"background:var(--ink-200)"}">
              <td style="padding:5px 4px;color:var(--paper-2)">${tAr(e.dk)}</td>
              <td style="padding:5px 4px;color:var(--paper);font-weight:600">${esc(e.farmer||"—")}</td>
              <td style="padding:5px 4px;color:var(--paper-3)">${esc(e.label)}${e.note?`<div style="color:var(--wheat);font-size:9px;margin-top:2px">📝 ${esc(e.note)}</div>`:""}</td>
              <td style="padding:5px 4px;text-align:center;color:var(--steel)">${AR(e.kabs)}</td>
              <td style="padding:5px 4px;text-align:center;color:var(--steel)">${e.price>0?fIQD(e.price):"—"}</td>
              <td style="padding:5px 4px;text-align:left">
                <div style="color:var(--wheat-hi);font-weight:700">${fIQD(e.fee)}</div>
                ${e.paid>0?`<div style="color:var(--settled);font-size:10px">✅ ${fIQD(e.paid)}</div>`:""}
                ${eRem>0?`<div style="color:var(--owing);font-size:10px">⏳ ${fIQD(eRem)}</div>`:""}
              </td>
              <td style="padding:4px;text-align:center">
                ${naqlPayBtnHTML(e.rRef,e.type,e.damId)}
              </td>
            </tr>`;
          }).join("")}
        </tbody>
        <tfoot>
          <tr style="background:var(--ink-200);font-weight:800">
            <td colspan="3" style="padding:6px;color:var(--wheat);font-size:12px">المجموع</td>
            <td style="padding:6px;text-align:center;color:var(--steel)">${AR(d.kabs)}</td>
            <td></td>
            <td style="padding:6px;text-align:left">
              <div style="color:var(--wheat-hi);font-size:13px">${fIQD(d.fee)}</div>
              ${dRem>0?`<div style="color:var(--owing);font-size:10px">⏳ ${fIQD(dRem)}</div>`:""}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>`;
  });

  el.innerHTML=html;
  window._naqlPrintData={map,keys,totalFee,totalPaid,totalKabs,rangeLabel};
}

function printNaqlColl(){
  const d=window._naqlPrintData;
  if(!d){showToast("⚠ لا توجد بيانات");return;}
  const {map,keys,totalFee,totalPaid,totalKabs,rangeLabel}=d;
  const totalRem=totalFee-totalPaid;
  let rows="";
  keys.forEach(name=>{
    const nd=map[name];
    const dRem=nd.fee-nd.paid;
    rows+=`<tr style="background:#fff3e0;font-weight:800">
      <td colspan="6" style="padding:7px 10px;color:#8A5A14;font-size:13px;border-bottom:2px solid #A8701C">
        🚚 ${esc(name)} — ${AR(nd.entries.length)} وصل — ${AR(nd.kabs)} كبسة — ${fIQD(nd.fee)}${dRem>0?" | ⏳ متبقي: "+fIQD(dRem):" | ✅ مسدّد"}
      </td>
    </tr>`;
    nd.entries.forEach((e,i)=>{
      const eFull=e.fee>0&&e.paid>=e.fee;
      rows+=`<tr style="${i%2===0?"":"background:#fff8f0"}">
        <td style="padding:5px 8px">${tAr(e.dk)}</td>
        <td style="padding:5px 8px;font-weight:600">${esc(e.farmer||"—")}</td>
        <td style="padding:5px 8px;color:#57503F">${esc(e.label)}${e.note?`<br><span style="color:#8A5A14;font-size:10px">📝 ${esc(e.note)}</span>`:""}</td>
        <td style="padding:5px 8px;text-align:center;color:#4A5A68">${AR(e.kabs)}</td>
        <td style="padding:5px 8px;text-align:center;color:#3E4D5A">${e.price>0?fIQD(e.price):"—"}</td>
        <td style="padding:5px 8px;text-align:left;font-weight:700;color:#8A6218">${fIQD(e.fee)}</td>
        <td style="padding:5px 8px;text-align:center;font-weight:700;color:${eFull?"#3F7A4C":"#943A31"}">${eFull?"✅ مدفوع":"⏳ "+fIQD(Math.max(0,e.fee-e.paid))}</td>
      </tr>`;
    });
  });
  const w=window.open("","_blank","width=800,height=700");
  w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
  <title>حساب النقال</title>
  <style>body{font-family:Arial,sans-serif;padding:20px;background:#fff;color:#1A1714}
  table{width:100%;border-collapse:collapse}th{background:#8A5A14;color:#fff;padding:8px}
  td{border:1px solid #DED8CB;padding:5px 8px}
  .hdr{text-align:center;margin-bottom:16px}
  .tot{background:#8A5A14;color:#fff;padding:10px 16px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  @media print{
    button{display:none}
    tfoot{display:table-row-group}
    tr{page-break-inside:avoid}
  }</style></head><body>
  <div class="hdr"><h2 style="color:#8A5A14;margin:0">🚚 حساب النقال</h2><p style="color:#57503F;margin:4px 0">${rangeLabel}</p></div>
  <div class="tot">
    <span>إجمالي: <strong>${fIQD(totalFee)}</strong> | ${AR(totalKabs)} كبسة | ${AR(keys.length)} ناقل</span>
    <span>✅ مدفوع: <strong>${fIQD(totalPaid)}</strong> | ⏳ متبقي: <strong>${fIQD(totalRem)}</strong></span>
  </div>
  <table><thead><tr><th>التاريخ</th><th>اسم الفلاح</th><th>التفاصيل</th><th>الكبسات</th><th>سعر النقل</th><th>المبلغ</th><th>الحالة</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr style="background:#8A5A14;color:#fff;font-weight:900">
    <td colspan="3">الإجمالي</td>
    <td style="text-align:center">${AR(totalKabs)}</td>
    <td></td>
    <td style="text-align:left">${fIQD(totalFee)}</td>
    <td style="text-align:center">${fIQD(totalRem)>0?"⏳ "+fIQD(totalRem):"✅ مسدّد"}</td>
  </tr></tfoot></table>
  <div style="margin-top:16px;text-align:center">
    <button onclick="window.print()" style="background:#8A5A14;color:#fff;padding:10px 28px;border:none;border-radius:8px;font-size:14px;cursor:pointer">🖨️ طباعة</button>
  </div></body></html>`);
  w.document.close();
}

/* ════════════════════════════════════════════
   سجل وصولات النقل
════════════════════════════════════════════ */
let _naqlRecsPay='all';

function naqlRecsSetRange(r){
  const today=toDay();
  const fd=document.getElementById("naqlRecsFrom");
  const td=document.getElementById("naqlRecsTo");
  if(r==="week"){const d=_D(today);d.setDate(d.getDate()-6);fd.value=_ds(d);td.value=today;}
  else if(r==="month"){fd.value=today.slice(0,7)+"-01";td.value=today;}
  else if(r==="30"){const d=_D(today);d.setDate(d.getDate()-29);fd.value=_ds(d);td.value=today;}
  else{fd.value="";td.value="";}
  renderNaqlRecs();
}

function naqlRecsSetPay(v){
  _naqlRecsPay=v;
  ['all','unpaid','partial','paid'].forEach(x=>{
    const b=document.getElementById('nrpf_'+x);
    if(b){b.style.background=x===v?'var(--wheat)':'transparent';b.style.color=x===v?'#fff':'var(--paper-3)';b.style.borderColor=x===v?'var(--wheat)':'var(--rule)';}
  });
  renderNaqlRecs();
}

/* v17.29 — مطابقة إدخال نقل مع نص البحث.
   تشمل: الناقل · الفلاح · رقم العجلة · الملاحظة · المصدر ·
   والتاريخ (لتبحث "٢٠٢٦-٠٧" فتحصل على شهر كامل). */
function _naqlMatch(e,q){
  if(!q)return true;
  const fields=[e.transporter,e.farmer,e.plate,e.label,
                e.r&&e.r.note,e.r&&e.r.dk,e.r&&e.r.desc];
  for(const f of fields){
    if(f&&smartMatch(String(f),q))return true;
  }
  // بحث بالتاريخ بصيغته العربية أيضاً
  if(e.r&&e.r.dk&&tAr(e.r.dk).includes(tAr(q)))return true;
  return false;
}
function naqlRecsClearSrch(){
  const i=document.getElementById("naqlRecsSrch");
  if(i)i.value="";
  renderNaqlRecs();
}

function renderNaqlRecs(){
  const from=(document.getElementById("naqlRecsFrom")?.value||"").trim();
  const to=(document.getElementById("naqlRecsTo")?.value||"").trim();
  const el=document.getElementById("naqlRecsResult");
  if(!el)return;

  let entries=[];
  (S.recs||[]).forEach(r=>{
    if(!r.nOn)return;
    if(!naqlInRange(r.dk,from,to))return;
    getNaqlEntries(r).forEach(en=>{
      if(!en.naqlFee||en.naqlFee<=0)return;
      const compId=_naqlCompositeId(r.id,en._entryId);
      const refObj={...en,id:compId,driver:r.driver,plate:r.plate,dk:r.dk};
      entries.push({r:refObj,type:'buy',damId:null,fee:en.naqlFee,paid:getNaqlPaidTotal(en),farmer:r.driver||'',plate:r.plate||'',transporter:en.transporter||'',kabs:en.nC||0,label:'شراء'});
    });
  });
  (SELL_RECS||[]).forEach(r=>{
    if(!r.nOn||!r.naqlFee||r.naqlFee<=0)return;
    if(!naqlInRange(r.dk,from,to))return;
    entries.push({r,type:'sell',damId:null,fee:r.naqlFee,paid:getNaqlPaidTotal(r),farmer:r.driver||'',plate:r.plate||'',transporter:r.transporter||'',kabs:r.nKabs||r.nC||0,label:'بيع'});
  });
  (DAM_RECS||[]).forEach(dam=>{
    const subs=dam.subRecs?Object.values(dam.subRecs):[];
    subs.forEach(sub=>{
      if(!sub.trans||sub.trans<=0)return;
      if(!naqlInRange(sub.dk||dam.dk,from,to))return;
      entries.push({r:sub,type:'dam-sub',damId:dam.id,fee:sub.trans,paid:getDamSubNaqlPaid(sub),farmer:sub.driver||sub.desc||'',plate:sub.plate||'',transporter:sub.transporter||'',kabs:sub.transCount||0,label:'ضمانة'});
    });
  });
  // ── وصولات النقل اليدوية ──
  (MNL_RECS||[]).forEach(r=>{
    if(!r.naqlFee||r.naqlFee<=0)return;
    const dk=r.dk||(r.createdAt?r.createdAt.slice(0,10):"");
    if(!naqlInRange(dk,from,to))return;
    entries.push({r,type:'mnl',damId:null,fee:r.naqlFee,paid:getNaqlPaidTotal_mnl(r),farmer:r.farmer||'',plate:r.plate||'',transporter:r.transporter||'',kabs:r.kabs||0,label:'نقل يدوي'});
  });
  entries=entries.filter(e=>{
    const full=e.fee>0&&e.paid>=e.fee;
    const partial=e.paid>0&&!full;
    if(_naqlRecsPay==='paid') return full;
    if(_naqlRecsPay==='unpaid') return e.paid===0&&!full;
    if(_naqlRecsPay==='partial') return partial;
    return true;
  });

  // v17.29 — بحث نصّي فوق الفلاتر
  const q=(document.getElementById("naqlRecsSrch")?.value||"").trim();
  if(q)entries=entries.filter(e=>_naqlMatch(e,q));

  entries.sort((a,b)=>(b.r.dk||"").localeCompare(a.r.dk||""));

  if(!entries.length){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-3);padding:28px;font-size:13px">لا توجد وصولات نقل في هذه الفترة</div>`;
    return;
  }

  const totalFee=entries.reduce((s,e)=>s+e.fee,0);
  const totalPaid=entries.reduce((s,e)=>s+e.paid,0);
  const totalRem=totalFee-totalPaid;
  const totalKabs=entries.reduce((s,e)=>s+e.kabs,0);

  let html=`
  <div style="background:#fb923c18;border:1px solid #fb923c44;border-radius:10px;padding:11px;margin-bottom:10px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;align-items:center">
    <div style="font-size:12px;color:var(--wheat);font-weight:700">${AR(entries.length)} وصل | ${AR(totalKabs)} كبسة</div>
    <div style="text-align:left;font-size:12px">
      <div style="color:var(--wheat-hi);font-weight:800;font-size:15px">${fIQD(totalFee)}</div>
      <div><span style="color:var(--settled)">✅ ${fIQD(totalPaid)}</span> <span style="color:var(--owing)">⏳ ${fIQD(totalRem)}</span></div>
    </div>
    <button class="btn bsm bg" style="width:100%;justify-content:center" onclick="openNaqlLogPrint()">🖨️ طباعة السجل كاملاً</button>
  </div>`;

  entries.forEach(e=>{
    const full=e.fee>0&&e.paid>=e.fee;
    const rem=Math.max(0,e.fee-e.paid);
    html+=`
    <div style="background:var(--ink-100);border:1px solid ${full?'#fb923c33':'#f9731633'};border-radius:10px;padding:10px;margin-bottom:7px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px;margin-bottom:6px">
        <div>
          <span style="font-size:10px;background:#fb923c22;color:var(--wheat);padding:2px 6px;border-radius:5px;font-weight:700">${esc(e.label)}</span>
          <div style="font-size:13px;font-weight:800;color:var(--wheat);margin-top:3px">🚚 ${esc(e.transporter||"(بدون اسم ناقل)")}</div>
          <div style="font-size:11px;color:var(--paper-2);margin-top:2px">👤 ${esc(e.farmer||"—")}${esc(e.plate?" | 🚛 "+e.plate:"")} | 📅 ${tAr(e.r.dk||"")}</div>
          <div style="font-size:11px;color:var(--steel);margin-top:1px">${AR(e.kabs)} كبسة = <strong style="color:var(--wheat-hi)">${fIQD(e.fee)}</strong></div>
        </div>
        <div style="text-align:left">
          ${full?`<div style="color:var(--wheat);font-weight:700;font-size:11px">✅ مدفوع</div>`:`<div style="color:var(--owing);font-weight:700;font-size:11px">⏳ ${fIQD(rem)}</div>`}
          ${e.paid>0&&!full?`<div style="color:var(--settled);font-size:10px">✅ ${fIQD(e.paid)}</div>`:""}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        ${naqlPayBtnHTML(e.r,e.type,e.damId)}
        ${naqlPrintBtnHTML(e.r.id,e.type,e.damId)}
      </div>
    </div>`;
  });

  el.innerHTML=html;
}


/* ══════════════════════════════════════════════════════
   طباعة وصولات سجل النقل — v17.3
   ──────────────────────────────────────────────────────
   سجل النقل يجمع أربعة مصادر: أجور نقل من وصولات الشراء
   (بمعرّف مركّب لتعدّد الناقلين)، ومن وصولات البيع، ومن
   الوصولات الفرعية للضمانات، ووصولات النقل اليدوية.
   كان اليدوي وحده قابلاً للطباعة — هذه الدوال توحّد
   الأربعة في وصل واحد وتضيف طباعة السجل كاملاً.
══════════════════════════════════════════════════════ */

/* يحوّل أي إدخال نقل — مهما كان مصدره — إلى شكل موحّد */
function _resolveNaqlEntry(id, type, damId){
  if(type==='mnl'){
    const r=(MNL_RECS||[]).find(x=>x.id===id);
    if(!r)return null;
    return{type,label:"نقل يدوي",dk:r.dk||(r.createdAt||"").slice(0,10),
      transporter:r.transporter||"",farmer:r.farmer||"",plate:r.plate||"",
      kabs:r.kabs||0,price:r.pricePerK||0,fee:r.naqlFee||0,
      paid:getNaqlPaidTotal_mnl(r),payments:r.naqlPayments||[],note:r.note||"",
      createdAt:r.createdAt,createdBy:r.createdBy,editAt:r.editAt,editBy:r.editBy,src:r};
  }
  if(type==='dam-sub'){
    const dam=(DAM_RECS||[]).find(x=>x.id===damId);
    if(!dam)return null;
    const subs=dam.subRecs?Object.values(dam.subRecs):[];
    const sub=subs.find(x=>x.id===id);
    if(!sub)return null;
    return{type,label:"ضمانة",dk:sub.dk||dam.dk,
      transporter:sub.transporter||"",farmer:sub.driver||sub.desc||"",plate:sub.plate||"",
      kabs:sub.transCount||0,price:sub.transUP||0,fee:sub.trans||0,
      paid:getDamSubNaqlPaid(sub),payments:sub.naqlPayments||[],note:sub.note||"",
      createdAt:sub.createdAt||dam.createdAt,createdBy:sub.createdBy||dam.createdBy,
      damin:dam.damin||"",madmun:dam.madmun||"",src:sub};
  }
  if(type==='sell'){
    const r=(SELL_RECS||[]).find(x=>x.id===id);
    if(!r)return null;
    return{type,label:"بيع",dk:r.dk,
      transporter:r.transporter||"",farmer:r.driver||"",plate:r.plate||"",
      kabs:r.nKabs||r.nC||0,price:r.nUP||0,fee:r.naqlFee||0,
      paid:getNaqlPaidTotal(r),payments:r.naqlPayments||[],note:r.note||"",
      dest:r.dest||"",createdAt:r.createdAt,createdBy:r.createdBy,src:r};
  }
  /* شراء — قد يحمل الوصل الواحد أكثر من ناقل */
  const {recId,entryId}=_parseNaqlMultiId(id);
  const rec=(S.recs||[]).find(x=>x.id===recId);
  if(!rec)return null;
  const en=getNaqlEntries(rec).find(x=>(x._entryId||null)===(entryId||null));
  if(!en)return null;
  return{type:'buy',label:"شراء",dk:rec.dk,
    transporter:en.transporter||"",farmer:rec.driver||"",plate:rec.plate||"",
    kabs:en.nC||0,price:en.nUP||0,fee:en.naqlFee||0,
    paid:getNaqlPaidTotal(en),payments:en.naqlPayments||[],note:rec.note||"",
    wh:rec.wh||"",mat:rec.mat||"",createdAt:rec.loadAt,createdBy:rec.loadBy,src:en};
}

/* وصل نقل موحّد لكل الأنواع */
function buildNaqlEntryReceipt(e){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  const rem=Math.max(0,(e.fee||0)-(e.paid||0));

  let b=sec("بيانات وصل النقل");
  b+=row("📅 التاريخ",tAr(e.dk||"—"));
  b+=row("المصدر",e.label);
  b+=row("الناقل",e.transporter||"—");
  if(e.farmer)b+=row(e.type==='sell'?"المستلم / السائق":"الفلاح",e.farmer);
  if(e.plate)b+=row("رقم العجلة",e.plate);
  if(e.wh)b+=row(whFieldLbl(e.wh),whTitle(e.wh));
  if(e.dest)b+=row("الوجهة",e.dest);
  if(e.damin)b+=row("الضامن",e.damin);
  if(e.madmun)b+=row("المضمون",e.madmun);

  b+=sec("تفاصيل الأجور");
  if(e.kabs)b+=row("عدد الكبسات",AR(e.kabs)+" كبسة");
  if(e.price)b+=row("سعر الكبسة",fIQD(e.price));
  b+=row("إجمالي أجور النقل",fIQD(e.fee));
  if(e.note)b+=row("ملاحظة",e.note);

  b+=sec("حالة الدفع");
  b+=row("الحالة", rem<=0&&e.fee>0 ? "✅ مدفوع كامل"
        : e.paid>0 ? "💰 جزئي — متبقي: "+fIQD(rem)
        : "⏳ غير مدفوع");
  if(e.createdAt){
    b+=sec("التوقيتات");
    b+=row("تاريخ التسجيل",tAr(e.createdAt)+(e.createdBy?" | "+e.createdBy:""));
    if(e.editAt)b+=row("آخر تعديل",tAr(e.editAt)+" | "+(e.editBy||""));
  }

  const payRows=(e.payments||[]).map((p,i)=>
    `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #DED8CB;font-size:10px"><span style="color:#57503F">دفعة ${AR(i+1)} — ${tAr(p.at)} | ${esc(p.by)}</span><span style="color:#3F7A4C;font-weight:700">+${fIQD(p.amount)}</span></div>`).join("");
  const paySec=payRows?`<div style="background:#EAF2EB;border:1.5px solid #3F7A4C;border-radius:7px;padding:8px 10px;margin:5px 0"><div style="font-size:10px;font-weight:700;color:#2B5334;margin-bottom:5px">سجل الدفعات</div>${payRows}<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:5px;padding-top:5px;border-top:1px solid #3F7A4C"><span style="color:#3F7A4C;font-weight:700">مدفوع: ${fIQD(e.paid)}</span><span style="${rem>0?"color:#943A31":"color:#3F7A4C"};font-weight:700">${rem>0?"متبقي: "+fIQD(rem):"مسدّد كامل"}</span></div></div>`:"";
  const tot=`${paySec}<div class="prtot" style="background:#5A431C"><span class="pk">أجور النقل</span><span class="pv">${fIQD(e.fee)}</span></div>`;

  return`${COHEAD}
    <div class="prh" style="background:#5A431C">
      <div class="prhtl">وصل أجور نقل — ${e.label}</div>
      <div class="prhmt">${tAr(e.dk||toDay())}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${tot}${COFTR}`;
}

/* فتح شاشة الطباعة لإدخال واحد */
function openNaqlPrint(id,type,damId){
  const e=_resolveNaqlEntry(id,type,damId||null);
  if(!e){showToast("⚠ تعذّر العثور على وصل النقل");return;}
  _printHTML=buildNaqlEntryReceipt(e);_isCollScreen=false;
  document.getElementById("pactTitle").textContent=`🚚 ${esc(e.transporter||"وصل نقل")}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(x){}
}

/* زر الطباعة داخل بطاقة السجل */
function naqlPrintBtnHTML(id,type,damId){
  const d=damId?`,'${damId}'`:'';
  return `<button class="btn bsm bgh" onclick="openNaqlPrint('${id}','${type}'${d})">🖨️ وصل</button>`;
}

/* ── طباعة سجل النقل كاملاً حسب الفلترة الحالية ── */
function _naqlLogEntries(){
  const from=(document.getElementById("naqlRecsFrom")?.value||"").trim();
  const to=(document.getElementById("naqlRecsTo")?.value||"").trim();
  let entries=[];
  (S.recs||[]).forEach(r=>{
    if(!r.nOn||!naqlInRange(r.dk,from,to))return;
    getNaqlEntries(r).forEach(en=>{
      if(!en.naqlFee||en.naqlFee<=0)return;
      entries.push({id:_naqlCompositeId(r.id,en._entryId),type:'buy',damId:null,dk:r.dk,
        label:'شراء',transporter:en.transporter||'',farmer:r.driver||'',plate:r.plate||'',
        kabs:en.nC||0,fee:en.naqlFee,paid:getNaqlPaidTotal(en)});
    });
  });
  (SELL_RECS||[]).forEach(r=>{
    if(!r.nOn||!r.naqlFee||r.naqlFee<=0||!naqlInRange(r.dk,from,to))return;
    entries.push({id:r.id,type:'sell',damId:null,dk:r.dk,label:'بيع',
      transporter:r.transporter||'',farmer:r.driver||'',plate:r.plate||'',
      kabs:r.nKabs||r.nC||0,fee:r.naqlFee,paid:getNaqlPaidTotal(r)});
  });
  (DAM_RECS||[]).forEach(dam=>{
    (dam.subRecs?Object.values(dam.subRecs):[]).forEach(sub=>{
      if(!sub.trans||sub.trans<=0||!naqlInRange(sub.dk||dam.dk,from,to))return;
      entries.push({id:sub.id,type:'dam-sub',damId:dam.id,dk:sub.dk||dam.dk,label:'ضمانة',
        transporter:sub.transporter||'',farmer:sub.driver||sub.desc||'',plate:sub.plate||'',
        kabs:sub.transCount||0,fee:sub.trans,paid:getDamSubNaqlPaid(sub)});
    });
  });
  (MNL_RECS||[]).forEach(r=>{
    if(!r.naqlFee||r.naqlFee<=0)return;
    const dk=r.dk||(r.createdAt?r.createdAt.slice(0,10):"");
    if(!naqlInRange(dk,from,to))return;
    entries.push({id:r.id,type:'mnl',damId:null,dk,label:'نقل يدوي',
      transporter:r.transporter||'',farmer:r.farmer||'',plate:r.plate||'',
      kabs:r.kabs||0,fee:r.naqlFee,paid:getNaqlPaidTotal_mnl(r)});
  });
  entries=entries.filter(e=>{
    const full=e.fee>0&&e.paid>=e.fee;
    const partial=e.paid>0&&!full;
    if(_naqlRecsPay==='paid')return full;
    if(_naqlRecsPay==='unpaid')return e.paid===0&&!full;
    if(_naqlRecsPay==='partial')return partial;
    return true;
  });
  // v17.29 — الطباعة تحترم البحث الحالي أيضاً
  const q=(document.getElementById("naqlRecsSrch")?.value||"").trim();
  if(q)entries=entries.filter(e=>_naqlMatch({...e,r:e},q));
  entries.sort((a,b)=>(b.dk||"").localeCompare(a.dk||""));
  return{entries,from,to,q};
}

function buildNaqlLogHTML(){
  const {entries,from,to,q}=_naqlLogEntries();
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  const tFee=entries.reduce((s,e)=>s+e.fee,0);
  const tPaid=entries.reduce((s,e)=>s+e.paid,0);
  const tKabs=entries.reduce((s,e)=>s+e.kabs,0);
  const tRem=Math.max(0,tFee-tPaid);
  const PAYL={all:"الكل",paid:"المدفوع",unpaid:"غير المدفوع",partial:"الجزئي"};
  const range=(from||to)?`${tAr(from||"البداية")} ← ${tAr(to||"اليوم")}`:"كل الفترات";

  const rows=entries.map((e,i)=>{
    const rem=Math.max(0,e.fee-e.paid);
    const st=rem<=0?"مدفوع":e.paid>0?"جزئي":"غير مدفوع";
    return`<tr>
      <td>${AR(i+1)}</td>
      <td>${tAr(e.dk||"—")}</td>
      <td>${esc(e.label)}</td>
      <td>${esc(e.transporter||"—")}</td>
      <td>${esc(e.farmer||"—")}</td>
      <td>${esc(e.plate||"—")}</td>
      <td>${e.kabs?AR(e.kabs):"—"}</td>
      <td>${fIQD(e.fee)}</td>
      <td>${fIQD(e.paid)}</td>
      <td>${rem>0?fIQD(rem):"—"}</td>
      <td>${st}</td>
    </tr>`;}).join("");

  /* تجميع حسب الناقل — الأهم عملياً عند التحاسب */
  const byT={};
  entries.forEach(e=>{
    const k=(e.transporter||"(بدون اسم)").trim();
    byT[k]=byT[k]||{fee:0,paid:0,kabs:0,n:0};
    byT[k].fee+=e.fee;byT[k].paid+=e.paid;byT[k].kabs+=e.kabs;byT[k].n++;
  });
  const tRows=Object.entries(byT).sort((a,b)=>b[1].fee-a[1].fee).map(([n,v])=>{
    const rem=Math.max(0,v.fee-v.paid);
    return`<tr>
      <td>${esc(n)}</td><td>${AR(v.n)}</td><td>${AR(v.kabs)}</td>
      <td>${fIQD(v.fee)}</td><td>${fIQD(v.paid)}</td>
      <td>${rem>0?fIQD(rem):"—"}</td>
    </tr>`;}).join("");

  return`${COHEAD}
  <div class="prh" style="background:#5A431C">
    <div class="prhtl">سجل أجور النقل</div>
    <div class="prhmt">${range}<br/>${tAr(toDay())} — ${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
  </div>
  <div class="psec">ملخص — الحالة: ${PAYL[_naqlRecsPay]||"الكل"}${q?` · بحث: ${esc(q)}`:""}</div>
  <div class="prr"><span class="prk">عدد الوصولات</span><span class="prv">${AR(entries.length)}</span></div>
  <div class="prr"><span class="prk">مجموع الكبسات</span><span class="prv">${AR(tKabs)} كبسة</span></div>
  <div class="prr"><span class="prk">المدفوع</span><span class="prv">${fIQD(tPaid)}</span></div>
  <div class="prr"><span class="prk">المتبقي</span><span class="prv">${fIQD(tRem)}</span></div>
  <div class="prtot" style="background:#5A431C"><span class="pk">إجمالي أجور النقل</span><span class="pv">${fIQD(tFee)}</span></div>
  ${tRows?`<div class="col-wh-title">التجميع حسب الناقل</div>
  <table class="coltbl"><thead><tr>
    <th>الناقل</th><th>وصولات</th><th>كبسات</th><th>الأجور</th><th>مدفوع</th><th>متبقي</th>
  </tr></thead><tbody>${tRows}</tbody></table>`:""}
  ${rows?`<div class="col-wh-title">تفاصيل الوصولات</div>
  <table class="coltbl"><thead><tr>
    <th>#</th><th>التاريخ</th><th>المصدر</th><th>الناقل</th><th>الفلاح</th>
    <th>العجلة</th><th>كبسات</th><th>الأجور</th><th>مدفوع</th><th>متبقي</th><th>الحالة</th>
  </tr></thead><tbody>${rows}
  <tr class="ctot"><td colspan="6">المجموع</td><td>${AR(tKabs)}</td><td>${fIQD(tFee)}</td><td>${fIQD(tPaid)}</td><td>${fIQD(tRem)}</td><td>—</td></tr>
  </tbody></table>`:`<div style="padding:14px;text-align:center;font-size:11px">لا توجد وصولات في هذه الفترة</div>`}
  ${COFTR}`;
}

function openNaqlLogPrint(){
  const {entries}=_naqlLogEntries();
  if(!entries.length){showToast("⚠ لا توجد وصولات نقل لطباعتها");return;}
  _printHTML=buildNaqlLogHTML();_isCollScreen=true;
  document.getElementById("pactTitle").textContent="🚚 سجل أجور النقل";
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(x){}
  showToast("🖨️ "+AR(entries.length)+" وصل نقل");
}

/* ══════════════════════════════════════════════════════
   قسم وصولات النقل اليدوية (Manual Naql)
══════════════════════════════════════════════════════ */
let MNL_RECS=[];
let dbRefMnl=null;

function loadMnlCache(){
  try{const c=localStorage.getItem("wShamsMnlCache");if(c)MNL_RECS=JSON.parse(c).sort(_byDkDesc);}catch(e){}
}
function saveMnlRec(r){
  _fbWrite("mnl_records",r.id,r,safe=>{
    const idx=MNL_RECS.findIndex(x=>x.id===r.id);
    if(idx>=0)MNL_RECS[idx]=safe; else MNL_RECS.unshift(safe);
    MNL_RECS.sort(_byDkDesc);   // v17.39 — تعديل التاريخ ينقل الوصل ليومه فوراً
    try{localStorage.setItem("wShamsMnlCache",JSON.stringify(MNL_RECS));}catch(e){}
  });
  if(_tabActive("naql-new"))_scheduleRender(renderMnlRecs);
}
function delMnlRec(id){
  _toTrash("mnl",MNL_RECS.find(r=>r.id===id));
  _fbWrite("mnl_records",id,null,()=>{
    MNL_RECS=MNL_RECS.filter(r=>r.id!==id);
    try{localStorage.setItem("wShamsMnlCache",JSON.stringify(MNL_RECS));}catch(e){}
  });
}

/* ── إضافة وصل نقل يدوي ── */
function submitMnlRec(){
  const transporter=(document.getElementById("mnlTransporter")?.value||"").trim();
  const farmer    =(document.getElementById("mnlFarmer")?.value||"").trim();
  const plate     =(document.getElementById("mnlPlate")?.value||"").trim();
  const kabs      =parseFloat(document.getElementById("mnlKabs")?.value)||0;
  const pricePerK =numIn("mnlPrice")||0;
  const note      =(document.getElementById("mnlNote")?.value||"").trim();
  if(!transporter){showToast("⚠ أدخل اسم الناقل");return;}
  if(!kabs||kabs<=0){showToast("⚠ أدخل عدد الكبسات");return;}
  if(!pricePerK||pricePerK<=0){showToast("⚠ أدخل سعر الكبسة");return;}
  const naqlFee=kabs*pricePerK;
  const r={
    id:genId(),seq:Date.now(),
    transporter,farmer,plate,kabs,pricePerK,naqlFee,note,
    naqlPayments:[],naqlPaidTotal:0,naqlPaid:false,naqlPaidAt:null,
    edited:false,editAt:null,editBy:null,
    createdAt:nowStr(),createdBy:S.cu.name,dk:toDay()
  };
  saveMnlRec(r);
  clrMnlForm();
  showToast("✅ تم حفظ وصل النقل — "+transporter+" | "+fIQD(naqlFee));
}
function clrMnlForm(){
  ["mnlTransporter","mnlFarmer","mnlPlate","mnlKabs","mnlPrice","mnlNote"].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value="";
  });
  document.getElementById("mnlCalcPreview").textContent="";
}
function mnlCalcPreview(){
  const k=parseFloat(document.getElementById("mnlKabs")?.value)||0;
  const p=numIn("mnlPrice")||0;
  const el=document.getElementById("mnlCalcPreview");
  if(el) el.textContent=k>0&&p>0?`${AR(k)} كبسة × ${fIQD(p)} = ${fIQD(k*p)}`:"";
}

/* ── عرض السجل ── */
function renderMnlRecs(){
  if(!S.cu)return;
  const srch=(document.getElementById("mnlSearch")?.value||"").toLowerCase();
  const pf  =document.getElementById("mnlPaid")?.value||"all";
  const df  =document.getElementById("mnlDt")?.value||"";
  let f=MNL_RECS.filter(r=>{
    if(df&&r.dk!==df)return false;
    if(pf==="paid"&&!r.naqlPaid)return false;
    if(pf==="unpaid"&&r.naqlPaid)return false;
    if(pf==="partial"&&!(getNaqlPaidTotal_mnl(r)>0&&!r.naqlPaid))return false;
    if(srch&&!smartMatch(r.transporter,srch)&&
              !smartMatch(r.farmer,srch)&&
              !smartMatch(r.plate,srch))return false;
    return true;
  });
  const tFee=f.reduce((s,r)=>s+(r.naqlFee||0),0);
  const tPaid=f.reduce((s,r)=>s+getNaqlPaidTotal_mnl(r),0);
  const tKabs=f.reduce((s,r)=>s+(r.kabs||0),0);
  document.getElementById("mnlFSm").innerHTML=
    `<span>الوصولات: <strong>${AR(f.length)}</strong></span>
     <span>الكبسات: <strong>${AR(tKabs)}</strong></span>
     <span>المجموع: <strong style="color:var(--wheat)">${fIQD(tFee)}</strong></span>
     <span>المدفوع: <strong style="color:var(--settled)">${fIQD(tPaid)}</strong></span>
     <span>الباقي: <strong style="color:var(--owing)">${fIQD(tFee-tPaid)}</strong></span>`;
  const list=document.getElementById("mnlRL");
  if(!f.length){list.innerHTML=`<div style="text-align:center;color:var(--ink-300);padding:35px;font-size:14px">📭 لا توجد وصولات نقل</div>`;return;}
  list.innerHTML=f.map(r=>{
    const paid=getNaqlPaidTotal_mnl(r);
    const rem=Math.max(0,(r.naqlFee||0)-paid);
    const pct=r.naqlFee>0?Math.min(100,Math.round(paid/r.naqlFee*100)):0;
    const full=r.naqlPaid||paid>=(r.naqlFee||0);
    return`<div class="rc" style="border-right:4px solid var(--wheat)" data-rid="${r.id}">
      <div class="rt">
        <div class="rtl">
          <span class="rpl" style="color:var(--wheat)">🚚 ${esc(r.transporter)}</span>
          ${r.farmer?`<span class="rdr">👤 ${esc(r.farmer)}</span>`:""}
          <span class="badge" style="background:var(--ink-200);color:var(--paper-2)">📅 ${tAr(r.dk)}</span>
          ${r.plate?`<span class="badge" style="background:rgba(251,146,60,.15);color:var(--wheat)">${esc(r.plate)}</span>`:""}
          ${r.edited?`<span class="badge" style="background:rgba(234,179,8,.15);color:var(--wheat)">✏️ معدّل</span>`:""}
        </div>
        <div style="text-align:left">
          <div style="font-size:18px;font-weight:700;color:var(--wheat-hi)">${fIQD(r.naqlFee)}</div>
          ${full?`<div style="font-size:10px;color:var(--settled);font-weight:700">✅ مدفوع</div>`:paid>0?`<div style="font-size:10px;color:var(--wheat-hi);font-weight:700">💰 ${pct}%</div>`:""}
        </div>
      </div>
      <div style="background:var(--ink-200);border-radius:8px;padding:8px 10px;margin-bottom:7px;font-size:12px;color:var(--paper-2)">
        <span style="color:var(--steel);font-weight:700">${AR(r.kabs)} كبسة</span>
        × <span style="color:var(--wheat-hi);font-weight:700">${fIQD(r.pricePerK)}</span>
        = <span style="color:var(--wheat);font-weight:700">${fIQD(r.naqlFee)}</span>
        ${r.note?`<span style="color:var(--paper-4);margin-right:8px">| ${esc(r.note)}</span>`:""}
      </div>
      ${paid>0?`<div style="margin:4px 0 7px">
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--paper-3);margin-bottom:3px">
          <span>مدفوع: <span style="color:var(--settled);font-weight:700">${fIQD(paid)}</span></span>
          <span>باقي: <span style="color:var(--owing);font-weight:700">${fIQD(rem)}</span></span>
        </div>
        <div style="background:var(--ink-300);border-radius:3px;height:5px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--wheat)"></div>
        </div>
      </div>`:""}
      <div class="rmt">
        <span>📅 ${tAr(r.createdAt)}</span><span>👤 ${esc(r.createdBy)}</span>
        ${r.naqlPaidAt?`<span style="color:var(--settled)">✅ ${tAr(r.naqlPaidAt)}</span>`:""}
        ${r.editAt?`<span style="color:var(--wheat)">✏️ ${tAr(r.editAt)} — ${esc(r.editBy)}</span>`:""}
      </div>
      <div class="rac">
        ${mnlPayBtnHTML(r)}
        <button class="btn bgh bsm" onclick="openMnlEdit('${r.id}')">✏️ تعديل</button>
        <button class="btn bg bsm" onclick="openMnlPrint('${r.id}')">🖨️ وصل</button>
        <button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openMnlDel('${r.id}')">🗑️</button>
      </div>
    </div>`;
  }).join("");
}
function clrMnlF(){
  ["mnlSearch","mnlDt"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  const p=document.getElementById("mnlPaid");if(p)p.value="all";
  renderMnlRecs();
}

/* ── دفع وصل نقل يدوي ── */
function getNaqlPaidTotal_mnl(r){
  if(!r.naqlPayments||!r.naqlPayments.length)return r.naqlPaid?(r.naqlFee||0):0;
  return r.naqlPayments.reduce((s,p)=>s+(p.amount||0),0);
}
function mnlPayBtnHTML(r){
  const fee=r.naqlFee||0;
  const paid=getNaqlPaidTotal_mnl(r);
  const pct=fee>0?Math.min(100,Math.round(paid/fee*100)):0;
  const full=r.naqlPaid||paid>=fee;
  const onclick=`openMnlPay('${r.id}')`;
  if(full)return`<button class="btn bsm" style="background:rgba(251,146,60,.15);color:var(--wheat);border:1px solid #fb923c55" onclick="${onclick}">✅ مدفوع</button>`;
  if(paid>0)return`<button class="btn bsm" style="background:rgba(251,191,36,.12);color:var(--wheat-hi);border:1px solid var(--wheat-hi)" onclick="${onclick}">💰 ${pct}% — دفع</button>`;
  return`<button class="btn bsm" style="background:rgba(249,115,22,.12);color:var(--wheat);border:1px solid #f9731655" onclick="${onclick}">⏳ دفع أجور النقل</button>`;
}
let _mnlPayId=null;
function openMnlPay(id){
  _mnlPayId=id;
  const r=MNL_RECS.find(x=>x.id===id);if(!r)return;
  const fee=r.naqlFee||0;
  const payments=r.naqlPayments||[];
  const paid=getNaqlPaidTotal_mnl(r);
  const rem=Math.max(0,fee-paid);
  const pct=fee>0?Math.min(100,Math.round(paid/fee*100)):0;
  const histHTML=payments.length?`<div class="pay-hist">${payments.map((p,i)=>`
    <div class="pay-hist-row">
      <span style="color:var(--paper-2)">💳 ${tAr(p.at)} — ${esc(p.by)}${p.note?`<br><span style="color:var(--wheat);font-size:9px">📝 ${esc(p.note)}</span>`:""}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="color:var(--settled);font-weight:700">${fIQD(p.amount)}</span>
        <button onclick="removeMnlPayment(${i})" style="background:rgba(239,68,68,.15);color:var(--owing);border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>
      </div>
    </div>`).join("")}</div>`:`<div style="font-size:11px;color:var(--paper-4);margin-top:4px">لا توجد دفعات</div>`;
  const el=document.getElementById("mPartialPay");
  el.innerHTML=`
    <div class="mhd"></div>
    <div class="mtit" style="color:var(--wheat)">🚚 دفع أجور النقل</div>
    <p class="mtxt" style="margin-bottom:8px">${esc(r.transporter)}${esc(r.farmer?" | "+r.farmer:"")}${esc(r.plate?" | "+r.plate:"")}</p>
    <div class="pay-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">
        <span style="color:var(--paper-2)">الأجور: <strong style="color:var(--wheat-hi)">${fIQD(fee)}</strong> (${AR(r.kabs)} كبسة × ${fIQD(r.pricePerK)})</span>
        <span style="color:var(--wheat-hi);font-weight:700">${pct}% مدفوع</span>
      </div>
      <div class="pay-bar-track"><div class="pay-bar-fill" style="width:${pct}%;background:var(--wheat)"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px">
        <span style="color:var(--settled);font-weight:700">✅ مدفوع: ${fIQD(paid)}</span>
        <span style="${rem>0?"color:var(--owing)":"color:var(--settled)"};font-weight:700">${rem>0?"⏳ متبقي: "+fIQD(rem):"✅ مسدّد"}</span>
      </div>
      ${histHTML}
    </div>
    ${rem>0?`
    <div class="fi-g" style="margin-top:12px">
      <label class="fl">مبلغ الدفعة (د.ع) — الحد الأقصى: ${fIQD(rem)}</label>
      <input class="fi" id="mnlPayAmt" type="text" inputmode="numeric" autocomplete="off" placeholder="0" dir="ltr" style="text-align:right" oninput="fmtPayInput(this,${rem})" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div class="fi-g" style="margin-top:8px">
      <label class="fl">ملاحظة (اختياري)</label>
      <input class="fi" id="mnlPayNote" type="text" placeholder="أي تفاصيل عن الدفعة" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn bgn" style="flex:1;justify-content:center;background:var(--wheat)" onclick="addMnlPayment()">+ تسجيل دفعة</button>
      <button class="btn" style="flex:1;justify-content:center;background:var(--pending-rule);color:var(--wheat);border:1px solid var(--wheat)" onclick="mnlPayFull()">✅ دفع الكل (${fIQD(rem)})</button>
    </div>`:`
    <div style="background:var(--wheat-wash);border:1px solid var(--wheat);border-radius:8px;padding:10px;text-align:center;color:var(--wheat);font-weight:700;margin-top:10px">✅ تم سداد الأجور كاملاً</div>`}
    <div class="mbtns" style="margin-top:12px">
      <button class="btn bgh" style="width:100%;justify-content:center" onclick="closeM()">إغلاق</button>
    </div>`;
  document.getElementById("mPartialPay-ov").classList.add("on");
}
function addMnlPayment(){
  const amount=payAmt("mnlPayAmt");
  const note=(document.getElementById("mnlPayNote")?.value||"").trim();
  if(!amount||amount<=0){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  _applyMnlPayment(amount,note);
}
function mnlPayFull(){
  const r=MNL_RECS.find(x=>x.id===_mnlPayId);if(!r)return;
  const rem=Math.max(0,(r.naqlFee||0)-getNaqlPaidTotal_mnl(r));
  if(rem<=0){showToast("✅ مدفوع بالكامل");return;}
  const note=(document.getElementById("mnlPayNote")?.value||"").trim();
  _applyMnlPayment(rem,note);
}
function _applyMnlPayment(amount,note){
  const r=MNL_RECS.find(x=>x.id===_mnlPayId);if(!r)return;
  /* ══════════════════════════════════════════════════════
     حاجز الدفع الزائد — v17.48
     ──────────────────────────────────────────────────────
     آخر مسار دفع بقي بلا حاجز. القصّ في الواجهة وحده لا
     يكفي: المودال يبقى مفتوحاً بعد كل دفعة وقيمة الحدّ
     المحقونة فيه تصير قديمة، فدفعتان متتاليتان تتجاوزان
     الأجرة. قِسناه: أجرة ٥٠,٠٠٠ قُبض عليها ١٢٠,٠٠٠.
     نقيس المتبقي لحظة التنفيذ من البيانات نفسها.
  ══════════════════════════════════════════════════════ */
  const fee=r.naqlFee||0;
  const _rem=Math.max(0,fee-getNaqlPaidTotal_mnl(r));
  if(_rem<=0){showToast("✅ أجور النقل مدفوعة بالكامل بالفعل");return;}
  if(amount>_rem){showToast("⚠ المبلغ أكبر من المتبقي — تم ضبطه على "+fIQD(_rem));amount=_rem;}
  const payments=[...(r.naqlPayments||[]),{amount,at:nowStr(),by:S.cu.name,note:(note||"").trim()||null}];
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const full=paidTotal>=(r.naqlFee||0);
  saveMnlRec({...r,naqlPayments:payments,naqlPaidTotal:paidTotal,naqlPaid:full,naqlPaidAt:full?(r.naqlPaidAt||nowStr()):null});
  showToast("✅ تم تسجيل "+fIQD(amount));
  openMnlPay(_mnlPayId);
}
function removeMnlPayment(idx){
  const r=MNL_RECS.find(x=>x.id===_mnlPayId);if(!r)return;
  const payments=(r.naqlPayments||[]).filter((_,i)=>i!==idx);
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const full=paidTotal>=(r.naqlFee||0);
  saveMnlRec({...r,naqlPayments:payments,naqlPaidTotal:paidTotal,naqlPaid:full,naqlPaidAt:full?(r.naqlPaidAt||nowStr()):null});
  showToast("↩️ تم إلغاء الدفعة");
  openMnlPay(_mnlPayId);
}

/* ── تعديل ── */
let _mneOrigDk=null;
function openMnlEdit(id){
  const r=MNL_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("mneId").value=id;
  _mneOrigDk=r.dk||toDay();
  document.getElementById("mneDk").value=_mneOrigDk;
  document.getElementById("mneTransporter").value=r.transporter||"";
  document.getElementById("mneFarmer").value=r.farmer||"";
  document.getElementById("mnePlate").value=r.plate||"";
  document.getElementById("mneKabs").value=r.kabs||"";
  setNumIn("mnePrice",r.pricePerK||"");
  document.getElementById("mneNote").value=r.note||"";
  document.getElementById("mMnlEdit").classList.add("active");
}
function saveMnlEdit(){
  const id=document.getElementById("mneId").value;
  const r=MNL_RECS.find(x=>x.id===id);if(!r)return;
  const transporter=document.getElementById("mneTransporter").value.trim();
  const farmer=document.getElementById("mneFarmer").value.trim();
  const plate=document.getElementById("mnePlate").value.trim();
  const kabs=parseFloat(document.getElementById("mneKabs").value)||r.kabs;
  const pricePerK=numIn("mnePrice")||r.pricePerK;
  const note=document.getElementById("mneNote").value.trim();
  const mneDkNow=document.getElementById("mneDk").value;
  const dkVal=mneDkNow||_mneOrigDk||toDay();
  if(!transporter||!kabs||!pricePerK){showToast("⚠ أكمل البيانات");return;}
  saveMnlRec({...r,transporter,farmer,plate,kabs,pricePerK,naqlFee:kabs*pricePerK,note,dk:dkVal,edited:true,editAt:nowStr(),editBy:S.cu.name});
  closeM();showToast("✏️ تم تعديل الوصل");
}

/* ── حذف ── */
let _mnlDelId=null;
function openMnlDel(id){
  _mnlDelId=id;
  const r=MNL_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("mnlDelTxt").innerHTML=`حذف وصل نقل: <strong>${esc(r.transporter)}</strong><br><strong style="color:var(--wheat)">${fIQD(r.naqlFee)}</strong>`;
  document.getElementById("mMnlDel").classList.add("active");
}
function confirmMnlDel(){
  if(!_mnlDelId)return;
  delMnlRec(_mnlDelId);_mnlDelId=null;closeM();renderMnlRecs();showToast("🗑️ تم الحذف");
}

/* ── طباعة ── */
function openMnlPrint(id){
  const r=MNL_RECS.find(x=>x.id===id);if(!r)return;
  _printHTML=buildMnlReceipt(r);_isCollScreen=false;
  document.getElementById("pactTitle").textContent=`🚚 ${esc(r.transporter)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildMnlReceipt(r){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  const paid=getNaqlPaidTotal_mnl(r);
  const rem=Math.max(0,(r.naqlFee||0)-paid);
  let b=sec("بيانات وصل النقل");
  b+=row("📅 التاريخ",tAr(r.dk));
  b+=row("الناقل",r.transporter);
  if(r.farmer)b+=row("الفلاح",r.farmer);
  if(r.plate)b+=row("رقم العجلة",r.plate);
  b+=sec("تفاصيل الأجور");
  b+=row("عدد الكبسات",AR(r.kabs)+" كبسة");
  b+=row("سعر الكبسة",fIQD(r.pricePerK));
  b+=row("إجمالي أجور النقل",fIQD(r.naqlFee));
  if(r.note)b+=row("ملاحظة",r.note);
  b+=sec("حالة الدفع");
  b+=row("الحالة",r.naqlPaid?"✅ مدفوع كامل":paid>0?"💰 جزئي — متبقي: "+fIQD(rem):"⏳ غير مدفوع");
  b+=sec("التوقيتات");
  b+=row("تاريخ التسجيل",tAr(r.createdAt)+" | "+r.createdBy);
  if(r.editAt)b+=row("آخر تعديل",tAr(r.editAt)+" | "+r.editBy);
  const payRows=(r.naqlPayments||[]).map((p,i)=>`<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #DED8CB;font-size:10px"><span style="color:#57503F">دفعة ${AR(i+1)} — ${tAr(p.at)} | ${esc(p.by)}</span><span style="color:#3F7A4C;font-weight:700">+${fIQD(p.amount)}</span></div>`).join("");
  const paySec=payRows?`<div style="background:#EAF2EB;border:1.5px solid #3F7A4C;border-radius:7px;padding:8px 10px;margin:5px 0"><div style="font-size:10px;font-weight:700;color:#2B5334;margin-bottom:5px">سجل الدفعات</div>${payRows}<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:5px;padding-top:5px;border-top:1px solid #3F7A4C"><span style="color:#3F7A4C;font-weight:700">مدفوع: ${fIQD(paid)}</span><span style="${rem>0?"color:#943A31":"color:#3F7A4C"};font-weight:700">${rem>0?"متبقي: "+fIQD(rem):"مسدّد كامل"}</span></div></div>`:"";
  const tot=`${paySec}<div class="prtot" style="background:#5A431C"><span class="pk">أجور النقل</span><span class="pv">${fIQD(r.naqlFee)}</span></div>`;
  return`${COHEAD}
    <div class="prh" style="background:#5A431C">
      <div class="prhtl">وصل نقل يدوي</div>
      <div class="prhmt">${tAr(r.dk||toDay())}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${tot}${COFTR}`;
}

/* ── دمج MNL في renderNaqlColl و renderNaqlRecs ── */
// يُضاف تلقائياً عبر إضافة MNL_RECS في الدوال مباشرة

