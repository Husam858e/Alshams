/* ══════════════════════════════════════════════════════
   نظام رواتب العمال — الأكثر شمولاً
══════════════════════════════════════════════════════ */
let EMP_LIST=[];   // قائمة العمال
let SAL_RECS=[];   // سجلات الرواتب الشهرية
let ADV_RECS=[];   // سجلات السلف
let dbRefEmp=null, dbRefSal=null, dbRefAdv=null;

const EMP_TYPES={monthly:"شهري",daily:"يومي",task:"مهمة"};
const EMP_ROLES=["سائق","عامل","حارس","مشرف","محاسب","سكرتير","عامل نظافة","آخر"];

/* ── كاش ── */
function loadSalCache(){
  try{const e=localStorage.getItem("wShamsEmp");if(e)EMP_LIST=JSON.parse(e);}catch(x){}
  try{const s=localStorage.getItem("wShamsSal");if(s)SAL_RECS=JSON.parse(s);}catch(x){}
  try{const a=localStorage.getItem("wShamsAdv");if(a)ADV_RECS=JSON.parse(a);}catch(x){}
}

/* ── حفظ ── */
function saveEmp(r){
  _fbWrite("emp_list",r.id,r,safe=>{
    const idx=EMP_LIST.findIndex(x=>x.id===r.id);
    if(idx>=0)EMP_LIST[idx]=safe; else EMP_LIST.push(safe);
    try{localStorage.setItem("wShamsEmp",JSON.stringify(EMP_LIST));}catch(x){}
  });
}
function delEmp(id){
  _toTrash("emp",EMP_LIST.find(x=>x.id===id));
  // v17: كانت رواتب/سلف العامل تُحذف محلياً فقط وتعود عند أول مزامنة — الآن تُحذف من السيرفر أيضاً
  SAL_RECS.filter(x=>x.empId===id).forEach(x=>{_toTrash("sal",x);_fbWrite("sal_records",x.id,null);});
  ADV_RECS.filter(x=>x.empId===id).forEach(x=>{_toTrash("adv",x);_fbWrite("adv_records",x.id,null);});
  (EMP_TXNS||[]).filter(x=>x.empId===id).forEach(x=>{_fbWrite("emp_txns",x.id,null);});
  SAL_RECS=SAL_RECS.filter(x=>x.empId!==id);
  ADV_RECS=ADV_RECS.filter(x=>x.empId!==id);
  EMP_TXNS=(EMP_TXNS||[]).filter(x=>x.empId!==id);
  try{localStorage.setItem("wShamsSal",JSON.stringify(SAL_RECS));}catch(x){}
  try{localStorage.setItem("wShamsAdv",JSON.stringify(ADV_RECS));}catch(x){}
  try{localStorage.setItem("wShamsEmpTxn",JSON.stringify(EMP_TXNS));}catch(x){}
  _fbWrite("emp_list",id,null,()=>{
    EMP_LIST=EMP_LIST.filter(x=>x.id!==id);
    try{localStorage.setItem("wShamsEmp",JSON.stringify(EMP_LIST));}catch(x){}
  });
}
function saveSalRec(r){
  _fbWrite("sal_records",r.id,r,safe=>{
    const idx=SAL_RECS.findIndex(x=>x.id===r.id);
    if(idx>=0)SAL_RECS[idx]=safe; else SAL_RECS.unshift(safe);
    try{localStorage.setItem("wShamsSal",JSON.stringify(SAL_RECS));}catch(x){}
  });
  if(_tabActive("sal-recs"))_scheduleRender(renderSalRecs);
}
function delSalRec(id){
  _toTrash("sal",SAL_RECS.find(x=>x.id===id));
  _fbWrite("sal_records",id,null,()=>{
    SAL_RECS=SAL_RECS.filter(x=>x.id!==id);
    try{localStorage.setItem("wShamsSal",JSON.stringify(SAL_RECS));}catch(x){}
  });
}
function saveAdvRec(r){
  _fbWrite("adv_records",r.id,r,safe=>{
    const idx=ADV_RECS.findIndex(x=>x.id===r.id);
    if(idx>=0)ADV_RECS[idx]=safe; else ADV_RECS.unshift(safe);
    try{localStorage.setItem("wShamsAdv",JSON.stringify(ADV_RECS));}catch(x){}
  });
}
function delAdvRec(id){
  _toTrash("adv",ADV_RECS.find(x=>x.id===id));
  _fbWrite("adv_records",id,null,()=>{
    ADV_RECS=ADV_RECS.filter(x=>x.id!==id);
    try{localStorage.setItem("wShamsAdv",JSON.stringify(ADV_RECS));}catch(x){}
  });
}

/* ══ إدارة العمال ══ */
function renderEmpList(){
  if(!S.cu)return;
  const el=document.getElementById("empListGrid");if(!el)return;
  if(!EMP_LIST.length){
    el.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:30px;font-size:13px">لا يوجد عمال مسجلون</div>`;
    return;
  }
  el.innerHTML=EMP_LIST.map(e=>{
    const salRecs=SAL_RECS.filter(s=>s.empId===e.id);
    const advRecs=ADV_RECS.filter(a=>a.empId===e.id);
    // حوافز وخصومات وغيابات من سجلات الشهر الحالي
    const thisMonth=toDay().slice(0,7);
    const curSal=salRecs.find(s=>s.month===thisMonth);
    const totalAdv=advRecs.reduce((s,a)=>s+(a.amount||0),0);
    const paidAdv=advRecs.reduce((s,a)=>s+getPaidTotal(a),0);
    const pendingAdv=totalAdv-paidAdv;
    // آخر ٣ رواتب
    const lastSals=salRecs.slice(0,3);
    const salRows=lastSals.map(s=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--ink-300);font-size:11px">
        <span style="color:var(--paper-2)">${esc(s.month)}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="color:var(--settled);font-weight:700">${fIQD(s.finalNet)}</span>
          ${payBtnHTMLSal(s)}
        </div>
      </div>`).join("");
    // سلف مفتوحة
    const openAdvs=advRecs.filter(a=>!a.paid);
    const advRows=openAdvs.map(a=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--wheat-wash);font-size:11px">
        <span style="color:var(--paper-2)">💸 سلفة ${tAr(a.dk)} — ${fIQD(a.amount)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="color:var(--wheat);font-weight:700">متبقي: ${fIQD(getRemaining(a))}</span>
          <button class="btn bsm" style="background:rgba(249,115,22,.15);color:var(--wheat);border:1px solid var(--wheat);padding:3px 8px" onclick="openPartialPay('${a.id}','adv')">دفع</button>
        </div>
      </div>`).join("");
    return`<div style="background:var(--ink-100);border-radius:12px;padding:14px;border:2px solid ${e.active!==false?'var(--settled-rule)':'var(--rule-hi)'}">
      <!-- رأس البطاقة -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:16px;font-weight:700;color:var(--settled)">👷 ${esc(e.name)}</div>
          <div style="font-size:12px;color:var(--paper-2);margin-top:2px">${esc(e.role||"")} — ${EMP_TYPES[e.payType]||e.payType}</div>
          <div style="font-size:12px;color:var(--wheat-hi);margin-top:2px">الأساسي: ${fIQD(e.baseSalary)}</div>
          ${pendingAdv>0?`<div style="font-size:11px;color:var(--owing);margin-top:2px">⚠ سلف متبقية: ${fIQD(pendingAdv)}</div>`:""}
        </div>
        <span style="font-size:10px;padding:3px 8px;border-radius:8px;${e.active!==false?'background:rgba(52,211,153,.15);color:var(--settled)':'background:rgba(107,114,128,.15);color:var(--paper-2)'}">${e.active!==false?'● نشط':'○ متوقف'}</span>
      </div>
      <!-- أزرار العمليات -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        <button class="btn bsm" style="background:var(--settled-rule);color:#fff;justify-content:center" onclick="openAddSal('${e.id}')">💰 راتب شهري</button>
        <button class="btn bsm" style="background:var(--pending-rule);color:#fff;justify-content:center" onclick="openAddAdv('${e.id}')">💸 سلفة</button>
        <button class="btn bsm" style="background:var(--ink-300);color:var(--steel);border:1px solid var(--steel);justify-content:center" onclick="openAddBonus('${e.id}')">🎁 حافز</button>
        <button class="btn bsm" style="background:var(--owing-wash);color:var(--owing);border:1px solid var(--owing);justify-content:center" onclick="openAddDeduct('${e.id}')">✂️ خصم</button>
        <button class="btn bsm" style="background:var(--wheat-wash);color:var(--wheat-hi);border:1px solid var(--wheat-hi);justify-content:center" onclick="openAddAbsent('${e.id}')">🚫 غياب</button>
        <div style="display:flex;gap:4px">
          <button class="btn bgh bsm" style="flex:1;justify-content:center" onclick="openEditEmp('${e.id}')">✏️</button>
          <button class="btn bsm" style="flex:1;justify-content:center;background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openDelEmp('${e.id}')">🗑️</button>
        </div>
      </div>
      <!-- آخر الرواتب -->
      ${lastSals.length?`<div style="background:var(--ink-000);border-radius:8px;padding:8px 10px;margin-bottom:8px">
        <div style="font-size:11px;color:var(--paper-3);font-weight:700;margin-bottom:4px">📋 آخر الرواتب</div>
        ${salRows}
      </div>`:""}
      <!-- السلف المفتوحة -->
      ${openAdvs.length?`<div style="background:var(--wheat-wash);border-radius:8px;padding:8px 10px;border:1px solid var(--wheat-wash)">
        <div style="font-size:11px;color:var(--wheat);font-weight:700;margin-bottom:4px">💸 سلف مفتوحة</div>
        ${advRows}
      </div>`:""}
    </div>`;
  }).join("");
}

/* ── إضافة/تعديل عامل ── */
function openAddEmp(){
  document.getElementById("empModalTitle").textContent="➕ إضافة عامل جديد";
  document.getElementById("empId").value="";
  ["empName","empRole","empBaseSalary"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
  document.getElementById("empPayType").value="monthly";
  document.getElementById("empActive").checked=true;
  document.getElementById("mEmp").classList.add("active");
}
function openEditEmp(id){
  const e=EMP_LIST.find(x=>x.id===id);if(!e)return;
  document.getElementById("empModalTitle").textContent="✏️ تعديل بيانات العامل";
  document.getElementById("empId").value=id;
  document.getElementById("empName").value=e.name||"";
  document.getElementById("empRole").value=e.role||"";
  document.getElementById("empPayType").value=e.payType||"monthly";
  setNumIn("empBaseSalary",e.baseSalary||"");
  document.getElementById("empActive").checked=e.active!==false;
  document.getElementById("mEmp").classList.add("active");
}
function saveEmpForm(){
  const id=document.getElementById("empId").value||genId();
  const name=document.getElementById("empName").value.trim();
  const role=document.getElementById("empRole").value.trim();
  const payType=document.getElementById("empPayType").value;
  const baseSalary=numIn("empBaseSalary")||0;
  const active=document.getElementById("empActive").checked;
  if(!name){showToast("⚠ أدخل اسم العامل");return;}
  if(!baseSalary){showToast("⚠ أدخل الراتب الأساسي");return;}
  saveEmp({id,name,role,payType,baseSalary,active,createdAt:nowStr(),createdBy:S.cu.name});
  closeM();renderEmpList();showToast("✅ تم حفظ بيانات العامل");
}
let _delEmpId=null;
function openDelEmp(id){
  _delEmpId=id;
  const e=EMP_LIST.find(x=>x.id===id);if(!e)return;
  document.getElementById("delEmpTxt").innerHTML=`حذف العامل <strong>${esc(e.name)}</strong> وكل سجلاته؟`;
  document.getElementById("mDelEmp").classList.add("active");
}
function confirmDelEmp(){
  if(!_delEmpId)return;
  delEmp(_delEmpId);_delEmpId=null;closeM();renderEmpList();showToast("🗑️ تم الحذف");
}

/* ══ إضافة راتب شهري ══ */
let _salEmpId=null;
function openAddSal(empId){
  _salEmpId=empId;
  const e=EMP_LIST.find(x=>x.id===empId);if(!e)return;
  document.getElementById("salEmpName").textContent=e.name+" — "+fIQD(e.baseSalary)+" أساسي";
  document.getElementById("salId").value="";
  document.getElementById("salMonth").value=toDay().slice(0,7);
  setNumIn("salBase",e.baseSalary||"");
  document.getElementById("salBonus").value="";
  document.getElementById("salDeduct").value="";
  document.getElementById("salAbsentDays").value="";
  document.getElementById("salNote").value="";
  calcSalNet();
  document.getElementById("mAddSal").classList.add("active");
}
function calcSalNet(){
  const base=numIn("salBase")||0;
  const month=document.getElementById("salMonth")?.value||"";
  const e=EMP_LIST.find(x=>x.id===_salEmpId);
  // حوافز وخصومات وغيابات مسجلة لهذا الشهر
  const txns=EMP_TXNS.filter(t=>t.empId===_salEmpId&&t.dk&&t.dk.slice(0,7)===month);
  const autoBonus=txns.filter(t=>t.type==="bonus").reduce((s,t)=>s+(t.amount||0),0);
  const autoDeduct=txns.filter(t=>t.type==="deduct").reduce((s,t)=>s+(t.amount||0),0);
  const autoAbsent=txns.filter(t=>t.type==="absent").reduce((s,t)=>s+(t.amount||0),0);
  const bonus=(numIn("salBonus")||0)+autoBonus;
  const deduct=(numIn("salDeduct")||0)+autoDeduct;
  const absentDays=parseFloat(document.getElementById("salAbsentDays")?.value)||0;
  const dailyRate=e?(e.baseSalary/30):0;
  const absentDeduct=absentDays*dailyRate+autoAbsent;
  const pendingAdv=ADV_RECS.filter(a=>a.empId===_salEmpId&&!a.paid).reduce((s,a)=>s+getRemaining(a),0);
  const net=base+bonus-deduct-absentDeduct;
  const afterAdv=net-pendingAdv;
  const el=document.getElementById("salNetPreview");
  if(el)el.innerHTML=`
    <div style="background:var(--ink-050);border-radius:8px;padding:10px;font-size:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--paper-2)">الراتب الأساسي</span><span style="color:var(--wheat-hi)">${fIQD(base)}</span></div>
      ${bonus?`<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--paper-2)">الحوافز${autoBonus?` (منها ${fIQD(autoBonus)} مسجل)`:""}</span><span style="color:var(--settled)">+ ${fIQD(bonus)}</span></div>`:""}
      ${deduct?`<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--paper-2)">الخصومات${autoDeduct?` (منها ${fIQD(autoDeduct)} مسجل)`:""}</span><span style="color:var(--owing)">- ${fIQD(deduct)}</span></div>`:""}
      ${absentDeduct?`<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--paper-2)">الغياب${absentDays?` (${absentDays} يوم × ${fIQD(dailyRate)})`:""}</span><span style="color:var(--owing)">- ${fIQD(absentDeduct)}</span></div>`:""}
      ${pendingAdv?`<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--paper-2)">استقطاع السلف</span><span style="color:var(--wheat)">- ${fIQD(pendingAdv)}</span></div>`:""}
      ${txns.length?`<div style="font-size:10px;color:var(--paper-4);margin-bottom:4px;padding:4px;background:var(--ink-100);border-radius:6px">
        📌 مسجل هذا الشهر: ${txns.map(t=>`${t.type==="bonus"?"🎁":t.type==="deduct"?"✂️":"🚫"} ${esc(t.note)} ${fIQD(t.amount)}`).join(" | ")}
      </div>`:""}
      <div style="display:flex;justify-content:space-between;border-top:1px dashed var(--ink-300);padding-top:6px;margin-top:4px">
        <span style="color:var(--paper);font-weight:700">صافي الراتب</span>
        <span style="color:${net>=0?'var(--settled)':'var(--owing)'};font-weight:700;font-size:14px">${fIQD(net)}</span>
      </div>
      ${pendingAdv?`<div style="display:flex;justify-content:space-between;margin-top:4px"><span style="color:var(--paper-2)">بعد استقطاع السلف</span><span style="color:${afterAdv>=0?'var(--steel)':'var(--owing)'};font-weight:700">${fIQD(afterAdv)}</span></div>`:""}
    </div>`;
}
function saveSalForm(){
  const e=EMP_LIST.find(x=>x.id===_salEmpId);if(!e)return;
  const month=document.getElementById("salMonth").value;
  const base=numIn("salBase")||0;
  const manualBonus=numIn("salBonus")||0;
  const manualDeduct=numIn("salDeduct")||0;
  const absentDays=parseFloat(document.getElementById("salAbsentDays").value)||0;
  const note=document.getElementById("salNote").value.trim();
  if(!month){showToast("⚠ حدد الشهر");return;}
  // جلب الحوافز/الخصومات/الغيابات المسجلة لهذا الشهر
  const txns=EMP_TXNS.filter(t=>t.empId===_salEmpId&&t.dk&&t.dk.slice(0,7)===month);
  const autoBonus=txns.filter(t=>t.type==="bonus").reduce((s,t)=>s+(t.amount||0),0);
  const autoDeduct=txns.filter(t=>t.type==="deduct").reduce((s,t)=>s+(t.amount||0),0);
  const autoAbsent=txns.filter(t=>t.type==="absent").reduce((s,t)=>s+(t.amount||0),0);
  const bonus=manualBonus+autoBonus;
  const deduct=manualDeduct+autoDeduct;
  const dailyRate=e.baseSalary/30;
  const absentDeduct=(absentDays*dailyRate)+autoAbsent;
  // استقطاع السلف
  const pendingAdvs=ADV_RECS.filter(a=>a.empId===_salEmpId&&!a.paid);
  const pendingAdv=pendingAdvs.reduce((s,a)=>s+getRemaining(a),0);
  const net=base+bonus-deduct-absentDeduct;
  const finalNet=net-pendingAdv;
  const id=document.getElementById("salId").value||genId();
  const r={id,empId:_salEmpId,empName:e.name,month,
    base,bonus,manualBonus,autoBonus,deduct,manualDeduct,autoDeduct,
    absentDays,absentDeduct,autoAbsent,pendingAdv,net,finalNet,
    txnIds:txns.map(t=>t.id),
    payments:[],paidTotal:0,paid:false,paidAt:null,paidBy:null,
    note,createdAt:nowStr(),createdBy:S.cu.name,dk:toDay()};
  // تسوية السلف تلقائياً
  if(pendingAdv>0){
    pendingAdvs.forEach(a=>{
      const upd={...a,paid:true,paidAt:nowStr(),paidBy:S.cu.name,
        paidTotal:a.amount,payments:[...(a.payments||[]),{amount:getRemaining(a),at:nowStr(),by:S.cu.name+" (استقطاع راتب)"}]};
      saveAdvRec(upd);
    });
  }
  // حذف txns الشهر من EMP_TXNS بعد دمجها مع الراتب
  txns.forEach(t=>{
    EMP_TXNS=EMP_TXNS.filter(x=>x.id!==t.id);
    if(dbRefEmpTxn)dbRefEmpTxn.child(t.id).remove().catch(()=>{});
  });
  try{localStorage.setItem("wShamsEmpTxn",JSON.stringify(EMP_TXNS));}catch(x){}
  saveSalRec(r);closeM();showToast("✅ تم حفظ راتب "+e.name+" — "+fIQD(finalNet));
}

/* ══ السلف ══ */
let _advEmpId=null;
function openAddAdv(empId){
  _advEmpId=empId;
  const e=EMP_LIST.find(x=>x.id===empId);if(!e)return;
  document.getElementById("advEmpName").textContent=e.name;
  document.getElementById("advAmount").value="";
  document.getElementById("advNote").value="";
  document.getElementById("mAddAdv").classList.add("active");
}
function saveAdvForm(){
  const e=EMP_LIST.find(x=>x.id===_advEmpId);if(!e)return;
  const amount=numIn("advAmount")||0;
  const note=document.getElementById("advNote").value.trim();
  if(!amount){showToast("⚠ أدخل مبلغ السلفة");return;}
  const r={id:genId(),empId:_advEmpId,empName:e.name,amount,note,
    payments:[],paidTotal:0,paid:false,paidAt:null,paidBy:null,
    createdAt:nowStr(),createdBy:S.cu.name,dk:toDay()};
  saveAdvRec(r);closeM();renderEmpList();renderAdvSummary();showToast("💸 تم تسجيل سلفة "+fIQD(amount)+" لـ "+e.name);
}

/* ── الحوافز ── */
let _bonusEmpId=null;
function openAddBonus(empId){
  _bonusEmpId=empId;
  const e=EMP_LIST.find(x=>x.id===empId);if(!e)return;
  document.getElementById("bonusEmpName").textContent=e.name;
  document.getElementById("bonusAmount").value="";
  document.getElementById("bonusNote").value="";
  document.getElementById("bonusDate").value=toDay();
  document.getElementById("mAddBonus").classList.add("active");
}
function saveBonusForm(){
  const e=EMP_LIST.find(x=>x.id===_bonusEmpId);if(!e)return;
  const amount=numIn("bonusAmount")||0;
  const note=document.getElementById("bonusNote").value.trim()||"حافز";
  const dk=document.getElementById("bonusDate").value||toDay();
  if(!amount){showToast("⚠ أدخل مبلغ الحافز");return;}
  const r={id:genId(),empId:_bonusEmpId,empName:e.name,type:"bonus",amount,note,
    createdAt:nowStr(),createdBy:S.cu.name,dk};
  saveEmpTxn(r);closeM();showToast("🎁 تم تسجيل حافز "+fIQD(amount)+" لـ "+e.name);
}

/* ── الخصومات ── */
let _deductEmpId=null;
function openAddDeduct(empId){
  _deductEmpId=empId;
  const e=EMP_LIST.find(x=>x.id===empId);if(!e)return;
  document.getElementById("deductEmpName").textContent=e.name;
  document.getElementById("deductAmount").value="";
  document.getElementById("deductNote").value="";
  document.getElementById("deductDate").value=toDay();
  document.getElementById("mAddDeduct").classList.add("active");
}
function saveDeductForm(){
  const e=EMP_LIST.find(x=>x.id===_deductEmpId);if(!e)return;
  const amount=numIn("deductAmount")||0;
  const note=document.getElementById("deductNote").value.trim()||"خصم";
  const dk=document.getElementById("deductDate").value||toDay();
  if(!amount){showToast("⚠ أدخل مبلغ الخصم");return;}
  const r={id:genId(),empId:_deductEmpId,empName:e.name,type:"deduct",amount,note,
    createdAt:nowStr(),createdBy:S.cu.name,dk};
  saveEmpTxn(r);closeM();showToast("✂️ تم تسجيل خصم "+fIQD(amount)+" من "+e.name);
}

/* ── الغيابات ── */
let _absentEmpId=null;
function openAddAbsent(empId){
  _absentEmpId=empId;
  const e=EMP_LIST.find(x=>x.id===empId);if(!e)return;
  document.getElementById("absentEmpName").textContent=e.name+" (يومي: "+fIQD(e.baseSalary/30)+")";
  document.getElementById("absentDays").value="";
  document.getElementById("absentNote").value="";
  document.getElementById("absentDate").value=toDay();
  document.getElementById("absentPreview").textContent="";
  document.getElementById("mAddAbsent").classList.add("active");
}
function calcAbsent(){
  const e=EMP_LIST.find(x=>x.id===_absentEmpId);if(!e)return;
  const days=parseFloat(document.getElementById("absentDays").value)||0;
  const daily=e.baseSalary/30;
  const deduct=days*daily;
  document.getElementById("absentPreview").textContent=days>0?`الخصم: ${fIQD(deduct)} (${AR(days)} يوم × ${fIQD(daily)})`:"";
}
function saveAbsentForm(){
  const e=EMP_LIST.find(x=>x.id===_absentEmpId);if(!e)return;
  const days=parseFloat(document.getElementById("absentDays").value)||0;
  const note=document.getElementById("absentNote").value.trim()||"غياب";
  const dk=document.getElementById("absentDate").value||toDay();
  if(!days){showToast("⚠ أدخل عدد أيام الغياب");return;}
  const daily=e.baseSalary/30;
  const amount=days*daily;
  const r={id:genId(),empId:_absentEmpId,empName:e.name,type:"absent",days,amount,note,
    createdAt:nowStr(),createdBy:S.cu.name,dk};
  saveEmpTxn(r);closeM();showToast("🚫 تم تسجيل غياب "+AR(days)+" يوم لـ "+e.name);
}

/* ── حفظ معاملة (حافز/خصم/غياب) ── */
let EMP_TXNS=[];
let dbRefEmpTxn=null;
function loadEmpTxnCache(){
  try{const t=localStorage.getItem("wShamsEmpTxn");if(t)EMP_TXNS=JSON.parse(t);}catch(x){}
}
function saveEmpTxn(r){
  _fbWrite("emp_txns",r.id,r,safe=>{
    const idx=EMP_TXNS.findIndex(x=>x.id===r.id);
    if(idx>=0)EMP_TXNS[idx]=safe; else EMP_TXNS.unshift(safe);
    try{localStorage.setItem("wShamsEmpTxn",JSON.stringify(EMP_TXNS));}catch(x){}
  });
  renderEmpTxnList(r.empId);
  renderEmpList();
}
function renderEmpTxnList(empId){
  // تُحدّث معاينة حوافز/خصومات في راتب الشهر إذا كان مفتوحاً
  if(_salEmpId===empId)calcSalNet();
}

/* ── معاينة حوافز+خصومات+غيابات في مودال الراتب ── */

/* ══ سجل الرواتب ══ */
function renderSalRecs(){
  if(!S.cu)return;
  const srch=(document.getElementById("sfSearch2")?.value||"").toLowerCase();
  const ef=document.getElementById("sfEmp")?.value||"all";
  const mf=document.getElementById("sfMonth2")?.value||"";
  const pf=document.getElementById("sfPaid2")?.value||"all";
  let f=SAL_RECS.filter(r=>{
    if(ef!=="all"&&r.empId!==ef)return false;
    if(mf&&r.month!==mf)return false;
    if(pf==="paid"&&!r.paid)return false;
    if(pf==="unpaid"&&r.paid)return false;
    if(pf==="partial"&&!(getPaidTotal(r)>0&&!r.paid))return false;
    if(srch&&!smartMatch(r.empName,srch))return false;
    return true;
  });
  const tF=f.reduce((s,r)=>s+(r.finalNet||0),0);
  const paidAmt=f.reduce((s,r)=>s+getPaidTotal(r),0);
  document.getElementById("salFSm").innerHTML=
    `<span>السجلات: <strong>${AR(f.length)}</strong></span>
     <span>الإجمالي: <strong style="color:var(--settled)">${fIQD(tF)}</strong></span>
     <span>المدفوع: <strong style="color:var(--steel)">${fIQD(paidAmt)}</strong></span>
     <span>الباقي: <strong style="color:var(--owing)">${fIQD(tF-paidAmt)}</strong></span>`;
  const list=document.getElementById("salRL");
  if(!f.length){list.innerHTML=`<div style="text-align:center;color:var(--ink-300);padding:35px;font-size:14px">📭 لا توجد سجلات رواتب</div>`;return;}
  list.innerHTML=f.map(r=>`
    <div class="rc" data-rid="${r.id}">
      <div class="rt">
        <div class="rtl">
          <span class="rpl" style="color:var(--settled)">👷 ${esc(r.empName)}</span>
          <span class="rdr" style="color:var(--paper-2)">${esc(r.month)}</span>
          ${r.edited?`<span class="badge" style="background:rgba(234,179,8,.15);color:var(--wheat)">✏️ معدّل</span>`:""}
        </div>
        <div style="text-align:left">
          <div style="font-size:18px;font-weight:700;color:var(--settled)">${fIQD(r.finalNet)}</div>
          ${r.net!==r.finalNet?`<div style="font-size:10px;color:var(--paper-2)">قبل السلف: ${fIQD(r.net)}</div>`:""}
        </div>
      </div>
      <div style="background:var(--ink-050);border-radius:8px;padding:8px 10px;margin:4px 0;font-size:11px">
        <div style="display:flex;flex-wrap:wrap;gap:12px">
          <span>📌 أساسي: <strong style="color:var(--wheat-hi)">${fIQD(r.base)}</strong></span>
          ${r.bonus?`<span>➕ حوافز: <strong style="color:var(--settled)">${fIQD(r.bonus)}</strong>${r.autoBonus?` <span style="color:var(--paper-4)">(${fIQD(r.autoBonus)} مسجل)</span>`:""}</span>`:""}
          ${r.deduct?`<span>➖ خصومات: <strong style="color:var(--owing)">${fIQD(r.deduct)}</strong>${r.autoDeduct?` <span style="color:var(--paper-4)">(${fIQD(r.autoDeduct)} مسجل)</span>`:""}</span>`:""}
          ${r.absentDays||r.autoAbsent?`<span>🚫 غياب: <strong style="color:var(--owing)">${fIQD(r.absentDeduct)}</strong>${r.absentDays?` ${AR(r.absentDays)} يوم`:""}</span>`:""}
          ${r.pendingAdv?`<span>💸 سلف مستقطعة: <strong style="color:var(--wheat)">${fIQD(r.pendingAdv)}</strong></span>`:""}
        </div>
      </div>
      ${payBarMiniHTML({...r,amount:r.finalNet})}
      ${r.note?`<div style="font-size:11px;color:var(--paper-2);padding:2px 0">📝 ${esc(r.note)}</div>`:""}
      <div class="rmt">
        <span>📅 ${tAr(r.createdAt)}</span><span>👤 ${esc(r.createdBy)}</span>
        ${r.paidAt?`<span style="color:var(--settled)">💰 ${tAr(r.paidAt)} — ${esc(r.paidBy)}</span>`:""}
      </div>
      <div class="rac">
        ${payBtnHTMLSal(r)}
        <button class="btn bgh bsm" onclick="openEditSal('${r.id}')">✏️</button>
        <button class="btn bg bsm" onclick="openSalPrint('${r.id}')">🖨️ وصل</button>
        <button class="btn bsm" style="background:rgba(239,68,68,.1);color:var(--owing);border:1px solid rgba(239,68,68,.2)" onclick="openDelSal('${r.id}')">🗑️</button>
      </div>
    </div>`).join("");
}

/* زر دفع الراتب */
function payBtnHTMLSal(r){
  const tot=r.finalNet||0;
  const paid=getPaidTotal(r);
  const pct=tot>0?Math.min(100,Math.round(paid/tot*100)):0;
  const full=paid>=tot;
  if(full)return`<button class="btn bsm" style="background:rgba(16,185,129,.15);color:var(--settled);border:1px solid var(--settled)" onclick="openPartialPaySal('${r.id}')">✅ مدفوع كامل</button>`;
  if(paid>0)return`<button class="btn bsm" style="background:rgba(251,191,36,.12);color:var(--wheat-hi);border:1px solid var(--wheat-hi)" onclick="openPartialPaySal('${r.id}')">💰 ${pct}% — جزئي</button>`;
  return`<button class="btn bsm" style="background:rgba(52,211,153,.12);color:var(--settled);border:1px solid var(--settled)" onclick="openPartialPaySal('${r.id}')">⏳ صرف الراتب</button>`;
}

/* ── دفع جزئي للراتب ── */
function openPartialPaySal(id){
  const r=SAL_RECS.find(x=>x.id===id);if(!r)return;
  _ppId=id;_ppType='sal';
  const tot=r.finalNet||0;
  const paid=getPaidTotal(r);
  const remaining=Math.max(0,tot-paid);
  const pct=tot>0?Math.min(100,Math.round(paid/tot*100)):0;
  const payments=r.payments||[];
  const histHTML=payments.length?`<div class="pay-hist">${payments.map((p,i)=>`
    <div class="pay-hist-row">
      <span style="color:var(--paper-2)">💳 ${tAr(p.at)} — ${esc(p.by)}${p.note?`<br><span style="color:var(--wheat);font-size:9px">📝 ${esc(p.note)}</span>`:""}</span>
      <div style="display:flex;align-items:center;gap:6px">
        <span style="color:var(--settled);font-weight:700">${fIQD(p.amount)}</span>
        <button onclick="removePaymentSal('${id}',${i})" style="background:rgba(239,68,68,.15);color:var(--owing);border:none;border-radius:4px;padding:2px 6px;font-size:10px;cursor:pointer">✕</button>
      </div>
    </div>`).join("")}</div>`:'<div style="font-size:11px;color:var(--paper-4);margin-top:4px">لا توجد دفعات</div>';
  const el=document.getElementById("mPartialPay");
  el.innerHTML=`
    <div class="mhd"></div>
    <div class="mtit" style="color:var(--settled)">💰 صرف راتب — ${esc(r.empName)} (${esc(r.month)})</div>
    <div class="pay-bar-wrap">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px">
        <span style="color:var(--paper-2)">الراتب الصافي: <strong style="color:var(--wheat-hi)">${fIQD(tot)}</strong></span>
        <span style="color:var(--wheat-hi);font-weight:700">${pct}% مصروف</span>
      </div>
      <div class="pay-bar-track"><div class="pay-bar-fill" style="width:${pct}%"></div></div>
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px">
        <span style="color:var(--settled);font-weight:700">✅ مصروف: ${fIQD(paid)}</span>
        <span style="${remaining>0?"color:var(--owing)":"color:var(--settled)"};font-weight:700">${remaining>0?"⏳ متبقي: "+fIQD(remaining):"✅ مكتمل"}</span>
      </div>
      ${histHTML}
    </div>
    ${remaining>0?`
    <div class="fi-g" style="margin-top:12px">
      <label class="fl">مبلغ الدفعة (د.ع) — الحد الأقصى: ${fIQD(remaining)}</label>
      <input class="fi" id="ppAmount" type="text" inputmode="numeric" autocomplete="off" placeholder="0" dir="ltr" style="text-align:right" oninput="fmtPayInput(this,${remaining})" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div class="fi-g" style="margin-top:8px">
      <label class="fl">ملاحظة (اختياري)</label>
      <input class="fi" id="ppNote" type="text" placeholder="أي تفاصيل عن الدفعة" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
    </div>
    <div style="display:flex;gap:8px;margin-top:6px">
      <button class="btn bgn" style="flex:1;justify-content:center" onclick="addPaymentSal()">+ تسجيل دفعة</button>
      <button class="btn" style="flex:1;justify-content:center;background:var(--settled-wash);color:var(--settled);border:1px solid var(--settled-wash)" onclick="payFullSal()">✅ صرف الكل (${fIQD(remaining)})</button>
    </div>`:`
    <div style="background:var(--settled-wash);border:1px solid var(--settled);border-radius:8px;padding:10px;text-align:center;color:var(--settled);font-weight:700;margin-top:10px">✅ تم صرف الراتب كاملاً</div>`}
    <div class="mbtns" style="margin-top:12px">
      <button class="btn bgh" style="width:100%;justify-content:center" onclick="closeM()">إغلاق</button>
    </div>`;
  document.getElementById("mPartialPay-ov").classList.add("on");
}
function addPaymentSal(){
  const amount=payAmt("ppAmount");
  const note=(document.getElementById("ppNote")?.value||"").trim();
  if(!amount||amount<=0){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  applyPaymentSal(amount,note);
}
function payFullSal(){
  const r=SAL_RECS.find(x=>x.id===_ppId);if(!r)return;
  const rem=Math.max(0,(r.finalNet||0)-getPaidTotal(r));
  if(rem<=0)return;
  const note=(document.getElementById("ppNote")?.value||"").trim();
  applyPaymentSal(rem,note);
}
function applyPaymentSal(amount,note){
  const r=SAL_RECS.find(x=>x.id===_ppId);if(!r)return;
  const _rem=Math.max(0,(r.finalNet||0)-getPaidTotal(r));
  if(_rem<=0){showToast("✅ الراتب مصروف بالكامل");return;}
  if(amount>_rem){showToast("⚠ المبلغ أكبر من المتبقي — تم ضبطه على "+fIQD(_rem));amount=_rem;}
  const payments=[...(r.payments||[]),{amount,at:nowStr(),by:S.cu.name,note:(note||"").trim()||null}];
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const fullyPaid=paidTotal>=(r.finalNet||0);
  saveSalRec({...r,payments,paidTotal,paid:fullyPaid,paidAt:fullyPaid?(r.paidAt||nowStr()):null,paidBy:fullyPaid?(r.paidBy||S.cu.name):null});
  showToast("✅ تم صرف "+fIQD(amount));
  openPartialPaySal(_ppId);
}
function removePaymentSal(id,idx){
  const r=SAL_RECS.find(x=>x.id===id);if(!r)return;
  const payments=(r.payments||[]).filter((_,i)=>i!==idx);
  const paidTotal=payments.reduce((s,p)=>s+(p.amount||0),0);
  const fullyPaid=paidTotal>=(r.finalNet||0);
  saveSalRec({...r,payments,paidTotal,paid:fullyPaid,paidAt:fullyPaid?(r.paidAt||nowStr()):null,paidBy:fullyPaid?(r.paidBy||S.cu.name):null});
  showToast("↩️ تم إلغاء الدفعة");
  openPartialPaySal(id);
}

/* ── تعديل راتب ── */
function openEditSal(id){
  const r=SAL_RECS.find(x=>x.id===id);if(!r)return;
  _salEmpId=r.empId;
  document.getElementById("salEmpName").textContent=r.empName;
  document.getElementById("salId").value=id;
  document.getElementById("salMonth").value=r.month||"";
  setNumIn("salBase",r.base||"");
  setNumIn("salBonus",r.bonus||"");
  setNumIn("salDeduct",r.deduct||"");
  document.getElementById("salAbsentDays").value=r.absentDays||"";
  document.getElementById("salNote").value=r.note||"";
  calcSalNet();
  document.getElementById("mAddSal").classList.add("active");
}

/* ── حذف راتب ── */
let _delSalId=null;
function openDelSal(id){
  _delSalId=id;
  const r=SAL_RECS.find(x=>x.id===id);if(!r)return;
  document.getElementById("delSalTxt").innerHTML=`حذف راتب <strong>${esc(r.empName)}</strong> — شهر ${esc(r.month)}؟`;
  document.getElementById("mDelSal").classList.add("active");
}
function confirmDelSal(){
  if(!_delSalId)return;
  delSalRec(_delSalId);_delSalId=null;closeM();renderSalRecs();showToast("🗑️ تم الحذف");
}

/* ── وصل الراتب ── */
function openSalPrint(id){
  const r=SAL_RECS.find(x=>x.id===id);if(!r)return;
  _printHTML=buildSalReceipt(r);_isCollScreen=false;
  document.getElementById("pactTitle").textContent=`👷 راتب ${esc(r.empName)} — ${esc(r.month)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function buildSalReceipt(r){
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  const e=EMP_LIST.find(x=>x.id===r.empId)||{};
  let b=sec("بيانات الراتب");
  b+=row("العامل",r.empName);
  b+=row("المنصب",e.role||"—");
  b+=row("الشهر",r.month);
  b+=sec("تفاصيل الراتب");
  b+=row("الراتب الأساسي",fIQD(r.base));
  if(r.bonus){
    b+=row("الحوافز الإجمالية","+ "+fIQD(r.bonus));
    if(r.manualBonus)b+=row("  — يدوي","+ "+fIQD(r.manualBonus));
    if(r.autoBonus)b+=row("  — مسجل تلقائياً","+ "+fIQD(r.autoBonus));
  }
  if(r.deduct){
    b+=row("الخصومات الإجمالية","- "+fIQD(r.deduct));
    if(r.manualDeduct)b+=row("  — يدوي","- "+fIQD(r.manualDeduct));
    if(r.autoDeduct)b+=row("  — مسجل تلقائياً","- "+fIQD(r.autoDeduct));
  }
  if(r.absentDeduct)b+=row("خصم الغياب"+(r.absentDays?` (${AR(r.absentDays)} يوم)`:""),"- "+fIQD(r.absentDeduct));
  b+=row("الصافي قبل السلف",fIQD(r.net));
  if(r.pendingAdv)b+=row("استقطاع السلف","- "+fIQD(r.pendingAdv));
  if(r.note)b+=row("ملاحظة",r.note);
  b+=sec("حالة الصرف");
  b+=row("الحالة",r.paid?"✅ مصروف كامل":(getPaidTotal(r)>0?"💰 جزئي — متبقي: "+fIQD(getRemaining({...r,amount:r.finalNet})):"⏳ لم يُصرف بعد"));
  const paySection=buildPaymentsSection({...r,amount:r.finalNet});
  const paidBanner=r.paid?`<div style="background:#EAF2EB;border:1.5px solid #3F7A4C;border-radius:5px;padding:5px 12px;margin:5px 0;text-align:center;color:#3F7A4C;font-weight:900;font-size:11px;">✅ تم الصرف كاملاً — ${r.paidBy||""} | ${tAr(r.paidAt||"")}</div>`:"";
  const tot=`${paidBanner}${paySection}<div class="prtot"><span class="pk">صافي الراتب</span><span class="pv" style="color:#4E8A5A">${fIQD(r.finalNet)}</span></div>`;
  return`${COHEAD}
    <div class="prh" style="background:#2B5334">
      <div class="prhtl">وصل راتب</div>
      <div class="prhmt">${esc(r.month)}<br/>${p2(d.getHours())+":"+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${b}</div>${tot}${COFTR}`;
}

/* ══ محصلة الرواتب ══ */
let _curSalCollTab=1;
function renderSalCollTab(){showSalCollTab(_curSalCollTab||1);}
function showSalCollTab(n){
  _curSalCollTab=n;
  [1,2].forEach(i=>{
    const el=document.getElementById("scct"+i);if(el)el.style.display=i===n?"block":"none";
    const btn=document.getElementById("scctb"+i);
    if(btn){btn.style.background=i===n?"var(--settled-rule)":"transparent";btn.style.color=i===n?"#fff":"var(--paper-3)";}
  });
  if(n===2)buildSalHistoryLists();
}
function getSalCollData(month){
  return SAL_RECS.filter(r=>!month||r.month===month);
}
function buildSalCollHTML(data,monthLabel){
  const tF=data.reduce((s,r)=>s+(r.finalNet||0),0);
  const paidAmt=data.reduce((s,r)=>s+getPaidTotal(r),0);
  const rows=data.map((r,i)=>`<tr>
    <td style="text-align:center">${AR(i+1)}</td>
    <td>${esc(r.empName)}</td>
    <td>${esc(r.month)}</td>
    <td style="text-align:center">${fIQD(r.base)}</td>
    <td style="text-align:center;color:#4E8A5A">${r.bonus?fIQD(r.bonus):"—"}</td>
    <td style="text-align:center;color:#A8453A">${r.deduct||r.absentDays?fIQD((r.deduct||0)+(r.absentDeduct||0)):"—"}</td>
    <td style="text-align:center;color:#A8701C">${r.pendingAdv?fIQD(r.pendingAdv):"—"}</td>
    <td style="text-align:center;font-weight:700;color:#4E8A5A">${fIQD(r.finalNet)}</td>
    <td style="text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C;font-weight:700">✅</span>':getPaidTotal(r)>0?`<span style="color:#8A6218;font-weight:700">💰 ${fIQD(getPaidTotal(r))}</span>`:'<span style="color:#943A31">⏳</span>'}</td>
  </tr>`).join("");
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#2B5334;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#8FB893">محصلة رواتب العمال${monthLabel?" — "+esc(monthLabel):""}</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${AR(data.length)} سجل</div>
    </div>
    ${!data.length?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد رواتب</div>`:`
    <table class="coltbl" style="width:100%;font-size:9px">
      <thead><tr><th>#</th><th>العامل</th><th>الشهر</th><th>الأساسي</th><th>إضافات</th><th>خصومات</th><th>سلف</th><th>الصافي</th><th>المدفوع</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr class="ctot">
        <td colspan="7" style="padding:5px 4px;font-weight:700">المجموع</td>
        <td style="text-align:center;font-weight:700;color:#4E8A5A">${fIQD(tF)}</td>
        <td style="text-align:center;font-size:8px">${fIQD(paidAmt)}</td>
      </tr></tfoot>
    </table>
    <div style="background:#1A1714;padding:12px 14px;margin-top:4px;page-break-before:always">
      <div style="display:flex;gap:0;flex-wrap:wrap">
        ${[["عدد السجلات",AR(data.length),"#8FB893"],["الإجمالي",fIQD(tF),"#4E8A5A"],["المصروف",fIQD(paidAmt),"#4A5A68"],["الباقي",fIQD(tF-paidAmt),"#A8453A"]].map(([k,v,c])=>`<div style="flex:1;min-width:90px;text-align:center;border-left:1px solid #2E2822;padding:8px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
      </div>
    </div>`}
    ${COFTR}
  </div>`;
}
function openSalColl(month){
  const data=getSalCollData(month);
  _printHTML=buildSalCollHTML(data,month||"");
  _isCollScreen=true;_currentCollPeriod="monthly";_currentCollWH="sal";
  document.getElementById("pactTitle").textContent=`👷 رواتب${month?" — "+month:""}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("👷 "+AR(data.length)+" سجل راتب");
}
function buildSalHistoryLists(){
  const months=[...new Set(SAL_RECS.map(r=>r.month).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  ["salHistMonthList","salHistMonthList2"].forEach(elId=>{
    const el=document.getElementById(elId);if(!el)return;
    el.innerHTML=!months.length?`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات</span>`:
      months.map(m=>{const cnt=SAL_RECS.filter(r=>r.month===m).length;
        return`<button onclick="openSalColl('${m}')" style="padding:8px 12px;border-radius:8px;border:1px solid var(--settled-rule);background:var(--settled-wash);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:90px"><span style="font-size:11px;color:var(--settled);font-weight:700">${m}</span><span style="font-size:9px;color:var(--paper-3)">${AR(cnt)} راتب</span></button>`;}).join("");
  });
}
function updateEmpSelect(){
  const sel=document.getElementById("sfEmp");if(!sel)return;
  const cur=sel.value;
  sel.innerHTML=`<option value="all">الكل</option>`+EMP_LIST.map(e=>`<option value="${e.id}" ${cur===e.id?"selected":""}>${esc(e.name)}</option>`).join("");
}
function renderAdvSummary(){
  const el=document.getElementById("advSummary");if(!el)return;
  const open=ADV_RECS.filter(a=>!a.paid);
  if(!open.length){el.innerHTML="";return;}
  el.innerHTML=`<div style="background:var(--wheat-wash);border:1px solid var(--wheat);border-radius:10px;padding:12px;margin-bottom:8px">
    <div style="font-size:12px;font-weight:700;color:var(--wheat);margin-bottom:8px">سلف غير مسددة (${AR(open.length)})</div>
    ${open.map(a=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--wheat-wash);font-size:12px">
      <span style="color:var(--paper)">${esc(a.empName)}</span>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="color:var(--wheat);font-weight:700">${fIQD(getRemaining(a))}</span>
        <button class="btn bsm" style="background:rgba(249,115,22,.15);color:var(--wheat);border:1px solid var(--wheat)" onclick="openPartialPay('${a.id}','adv')">💰 دفع</button>
      </div>
    </div>`).join("")}
  </div>`;
}

