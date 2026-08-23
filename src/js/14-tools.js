/* ══════════════════════════════════════════════════════
   v17 PRO MAX — مركز الأدوات
   نسخة احتياطية · استعادة · بحث شامل · فحص سلامة
   سلة المحذوفات · تصدير Excel شامل · حالة النظام
══════════════════════════════════════════════════════ */

/* سجل موحّد لكل مجموعات البيانات في التطبيق */
const _DATASETS=[
  {k:"buy",  node:"records",      label:"وصولات الشراء",  icon:"🛒", cache:"wShamsCache",
   get:()=>S.recs||[],      set:v=>{S.recs=v;},      save:r=>saveRec(r),
   fields:["driver","plate","note","transporter","wh"], amount:r=>r.final||0, who:r=>r.driver,
   /* v17.37 — «الناقل» حقل سياقي: وجود اسمه لا يعني أن مبلغ الوصل ماله */
   ctx:["transporter"],
   ctxCovered:r=>!!r.nOn&&getNaqlEntries(r).some(en=>(en.naqlFee||0)>0)},
  {k:"sell", node:"sell_records", label:"وصولات البيع",   icon:"💰", cache:"wShamsSellCache",
   get:()=>SELL_RECS||[],   set:v=>{SELL_RECS=v;},   save:r=>saveSellRec(r),
   fields:["driver","plate","receiver","dest","note","transporter"], amount:r=>r.final||0, who:r=>r.driver,
   ctx:["transporter"],
   ctxCovered:r=>!!r.nOn&&(r.naqlFee||0)>0},
  {k:"dam",  node:"dam_records",  label:"الضمانات",       icon:"🤝", cache:"wShamsDamCache",
   get:()=>DAM_RECS||[],    set:v=>{DAM_RECS=v;},    save:r=>saveDamRec(r),
   fields:["damin","madmun","note"], amount:r=>r.price||0, who:r=>r.madmun},
  {k:"srf",  node:"srf_records",  label:"الصرفيات",       icon:"🧾", cache:"wShamsSrfCache",
   get:()=>SRF_RECS||[],    set:v=>{SRF_RECS=v;},    save:r=>saveSrfRec(r),
   fields:["recv","purp","note"], amount:r=>r.amount||0, who:r=>r.recv},
  {k:"wrk",  node:"wrk_records",  label:"أجور الأعمال",   icon:"🔧", cache:"wShamsWrkCache",
   get:()=>WRK_RECS||[],    set:v=>{WRK_RECS=v;},    save:r=>saveWrkRec(r),
   fields:["provider","service","note"], amount:r=>r.amount||0, who:r=>r.provider},
  {k:"mnl",  node:"mnl_records",  label:"وصولات النقل",   icon:"🚚", cache:"wShamsMnlCache",
   get:()=>MNL_RECS||[],    set:v=>{MNL_RECS=v;},    save:r=>saveMnlRec(r),
   fields:["transporter","farmer","plate","note"], amount:r=>r.naqlFee||0, who:r=>r.transporter,
   /* دفعات النقل اليدوي في naqlPayments لا payments */
   paid:r=>getNaqlPaidTotal_mnl(r),
   /* ══ v17.35 — إصلاح التكرار في البحث الشامل ══
      هذه المجموعة مغطّاة بالكامل داخل المجموعة الافتراضية "naql"
      (وصولات النقل اليدوية هي مصدرها الرابع، بنفس المعرّف ونفس المبلغ).
      كانت الاثنتان تُعرضان معاً فيظهر كل وصل نقل يدوي مرتين:
      مرة تحت «وصولات النقل» ومرة تحت «أجور النقل» — ويتضاعف مبلغه
      في مجموع البحث. العلامة أدناه تستبعدها من البحث وفحص الأسماء
      فقط، وتبقى مجموعةً حقيقية للنسخ الاحتياطي والاستعادة والسلة. */
   dupIn:"naql"},
  {k:"arb",  node:"arb_records",  label:"مخزن أربيل",     icon:"🏬", cache:"wShamsArbCache",
   get:()=>ARB_RECS||[],    set:v=>{ARB_RECS=v;},    save:r=>saveArbRec(r),
   fields:["farmer","note"], amount:()=>0, who:r=>r.farmer},
  {k:"emp",  node:"emp_list",     label:"العمال",         icon:"👷", cache:"wShamsEmp",
   get:()=>EMP_LIST||[],    set:v=>{EMP_LIST=v;},    save:r=>saveEmp(r),
   fields:["name","role"], amount:r=>r.salary||0, who:r=>r.name},
  {k:"sal",  node:"sal_records",  label:"الرواتب",        icon:"📋", cache:"wShamsSal",
   get:()=>SAL_RECS||[],    set:v=>{SAL_RECS=v;},    save:r=>saveSalRec(r),
   fields:["empName","month","note"], amount:r=>r.finalNet||0, who:r=>r.empName},
  {k:"adv",  node:"adv_records",  label:"السلف",          icon:"💵", cache:"wShamsAdv",
   get:()=>ADV_RECS||[],    set:v=>{ADV_RECS=v;},    save:r=>saveAdvRec(r),
   fields:["empName","note"], amount:r=>r.amount||0, who:r=>r.empName},
  {k:"etx",  node:"emp_txns",     label:"حركات العمال",   icon:"📑", cache:"wShamsEmpTxn",
   get:()=>EMP_TXNS||[],    set:v=>{EMP_TXNS=v;},    save:r=>saveEmpTxn(r),
   fields:["empName","note","type"], amount:r=>r.amount||0, who:r=>r.empName},

  /* ══════════════════════════════════════════════════════
     أجور النقل — v17.33
     ──────────────────────────────────────────────────────
     مجموعة افتراضية (لا تُحفظ في فايربيس) تجمع أجور النقل
     من مصادرها الأربعة: الشراء بتعدّد ناقليه · البيع ·
     الوصولات الفرعية للضمانات · النقل اليدوي.
     كانت مفقودة من البحث الشامل: المجموعة "mnl" تغطّي
     اليدوي فقط، و"buy"/"sell" تحسب مبلغ الوصل لا أجرة
     النقل، ودفعات النقل في naqlPayments لا payments.
  ══════════════════════════════════════════════════════ */
  {k:"naql", node:null, label:"أجور النقل", icon:"🚚", cache:null, virtual:true,
   get:()=>_allNaqlFees(),  set:()=>{},  save:()=>{},
   fields:["transporter","farmer","plate","note","src"],
   /* v17.37 — لا تُكرّر اسم الناقل في كل سطر وأنت تبحث عنه أصلاً:
      اعرض مصدر الحمولة والفلاح واللوحة — هذه ما يحتاجه لمطابقة حسابه */
   rowLabel:r=>[r.src?("["+r.src+"]"):"",r.farmer,r.plate].filter(Boolean).join(" · ")||r.transporter||"—",
   amount:r=>r.naqlFee||0, who:r=>r.transporter,
   /* v17.37 — والعكس صحيح: «الفلاح» حقل سياقي هنا. أجرة النقل مال
      الناقل لا مال الفلاح، ووصل الفلاح نفسه ظاهر في قسمه بمبلغه.
      يُستثنى النقل اليدوي: لا قسم آخر يعرضه، فلا نُخفيه. */
   ctx:["farmer"],
   ctxCovered:r=>r._kind!=="mnl",
   paid:r=>r.naqlPaid||0},
];

/* يبني قائمة موحّدة بكل أجور النقل من مصادرها الأربعة */
function _allNaqlFees(){
  const out=[];
  (S.recs||[]).forEach(r=>{
    if(!r.nOn)return;
    getNaqlEntries(r).forEach(en=>{
      if(!en.naqlFee||en.naqlFee<=0)return;
      out.push({id:_naqlCompositeId(r.id,en._entryId), dk:r.dk,
        transporter:en.transporter||"", farmer:r.driver||"", plate:r.plate||"",
        note:r.note||"", src:"شراء", naqlFee:en.naqlFee,
        naqlPaid:getNaqlPaidTotal(en), _kind:"buy", _recId:r.id});
    });
  });
  (SELL_RECS||[]).forEach(r=>{
    if(!r.nOn||!r.naqlFee||r.naqlFee<=0)return;
    out.push({id:r.id, dk:r.dk, transporter:r.transporter||"",
      farmer:r.driver||"", plate:r.plate||"", note:r.note||"", src:"بيع",
      naqlFee:r.naqlFee, naqlPaid:getNaqlPaidTotal(r), _kind:"sell", _recId:r.id});
  });
  (DAM_RECS||[]).forEach(dam=>{
    const subs=dam.subRecs?Object.values(dam.subRecs):[];
    subs.forEach(sub=>{
      if(!sub.trans||sub.trans<=0)return;
      out.push({id:sub.id, dk:sub.dk||dam.dk, transporter:sub.transporter||"",
        farmer:sub.driver||sub.desc||"", plate:sub.plate||"", note:sub.note||"",
        src:"ضمانة", naqlFee:sub.trans, naqlPaid:getDamSubNaqlPaid(sub),
        _kind:"dam", _recId:dam.id});
    });
  });
  (MNL_RECS||[]).forEach(r=>{
    if(!r.naqlFee||r.naqlFee<=0)return;
    out.push({id:r.id, dk:r.dk||(r.createdAt?r.createdAt.slice(0,10):""),
      transporter:r.transporter||"", farmer:r.farmer||"", plate:r.plate||"",
      note:r.note||"", src:"نقل يدوي", naqlFee:r.naqlFee,
      naqlPaid:getNaqlPaidTotal_mnl(r), _kind:"mnl", _recId:r.id});
  });
  out.sort((a,b)=>String(b.dk||"").localeCompare(String(a.dk||"")));
  return out;
}
const _DS=k=>_DATASETS.find(d=>d.k===k);
/* v17.33 — المجموعات الحقيقية فقط: النسخ الاحتياطي والاستعادة
   وفحص السلامة تتعامل مع فايربيس، والمجموعة الافتراضية "naql"
   مشتقّة من غيرها فلا تُنسخ ولا تُستعاد ولا تُفحص مستقلة. */
const _REAL_DATASETS=()=>_DATASETS.filter(d=>!d.virtual);
/* v17.35 — مجموعات بلا تكرار: تُستعمل حيث يُجمع مبلغ أو يُعدّ سجل
   (البحث الشامل · فحص الأسماء). تستبعد كل مجموعة معلَّمة بـ dupIn
   لأن مجموعة أخرى تحتويها بالكامل، فلا يُحسب السجل الواحد مرتين. */
const _UNIQ_DATASETS=()=>_DATASETS.filter(d=>!d.dupIn);

/* ─────────────────────────────────────────
   ١) نسخة احتياطية كاملة
───────────────────────────────────────── */
function toolsBackup(){
  const payload={
    app:"ميزان الشمس",
    version:17,
    build:"17.64",
    createdAt:nowStr(),
    createdBy:S.cu?.name||"—",
    counts:{},
    data:{}
  };
  _REAL_DATASETS().forEach(d=>{
    const arr=d.get();
    payload.data[d.k]=arr;
    payload.counts[d.k]=arr.length;
  });
  const total=Object.values(payload.counts).reduce((a,b)=>a+b,0);
  const json=JSON.stringify(payload,null,1);
  const blob=new Blob([json],{type:"application/json;charset=utf-8"});
  const fname=`نسخة_احتياطية_ميزان_الشمس_${toDay()}.json`;
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=fname;
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);
  try{localStorage.setItem("wShamsLastBackup",nowStr());}catch(e){}
  showToast("📦 تم حفظ نسخة احتياطية — "+AR(total)+" سجل");
  renderToolsStatus();
}

/* ─────────────────────────────────────────
   ٢) استعادة من نسخة احتياطية
───────────────────────────────────────── */
let _restorePayload=null;
function toolsPickRestore(){document.getElementById("toolsRestoreFile")?.click();}
function toolsReadRestore(input){
  const f=input.files&&input.files[0];
  if(!f)return;
  const rd=new FileReader();
  rd.onload=()=>{
    try{
      const obj=JSON.parse(rd.result);
      if(!obj||!obj.data)throw new Error("ملف غير صالح");
      _restorePayload=obj;
      const rows=_REAL_DATASETS().map(d=>{
        const inc=Array.isArray(obj.data[d.k])?obj.data[d.k].length:0;
        const cur=d.get().length;
        return`<div style="display:flex;justify-content:space-between;padding:5px 9px;border-bottom:1px solid var(--rule);font-size:11px">
          <span style="color:var(--paper-2)">${d.icon} ${d.label}</span>
          <span><strong style="color:var(--wheat-hi)">${AR(inc)}</strong> <span style="color:var(--paper-4)">في الملف</span> · <span style="color:var(--paper-3)">${AR(cur)} حالياً</span></span>
        </div>`;}).join("");
      document.getElementById("toolsRestoreBox").innerHTML=`
        <div style="background:var(--ink-100);border:1px solid var(--rule);border-radius:10px;overflow:hidden;margin-top:8px">
          <div style="background:var(--ink-200);padding:7px 10px;font-size:11px;color:var(--paper-2)">
            📄 ${esc(f.name)} · أُنشئت: ${tAr(esc(obj.createdAt||"—"))} · بواسطة: ${esc(obj.createdBy||"—")}
          </div>
          ${rows}
        </div>
        <div style="background:var(--wheat-wash);border:1px solid var(--wheat);border-radius:9px;padding:9px;margin-top:8px;font-size:11px;color:var(--wheat-hi);line-height:1.6">
          <strong>دمج</strong>: يضيف السجلات الناقصة ولا يمسّ الموجود.<br>
          <strong>استبدال</strong>: يكتب محتوى الملف فوق الموجود، ويحذف كل سجل
          غير موجود في الملف — والمحذوف يُنقل إلى سلة المحذوفات فيبقى قابلاً للاسترجاع.
          الأقسام التي لا يذكرها الملف لا تُمسّ.
        </div>
        <div style="display:flex;gap:7px;margin-top:8px">
          <button class="btn bgn" style="flex:1;justify-content:center" onclick="toolsRestore('merge')">🔀 دمج (آمن)</button>
          <button class="btn" style="flex:1;justify-content:center;background:var(--owing-rule);color:var(--owing)" onclick="toolsRestore('replace')">♻️ استبدال كامل</button>
        </div>`;
      showToast("📄 تمت قراءة الملف — اختر طريقة الاستعادة");
    }catch(e){
      showToast("⚠ الملف غير صالح: "+(e.message||""));
      document.getElementById("toolsRestoreBox").innerHTML="";
    }
    input.value="";
  };
  rd.onerror=()=>{showToast("⚠ تعذّرت قراءة الملف");input.value="";};
  rd.readAsText(f,"utf-8");
}
/* ══════════════════════════════════════════════════════
   حذف سجل من أي مجموعة — v17.43
   يعمل بنفس مسار الحفظ: طابور دون اتصال + كاش محلي.
══════════════════════════════════════════════════════ */
function _dsDelete(d,id){
  if(!d||!d.node||!id)return;
  _fbWrite(d.node,id,null,()=>{
    d.set((d.get()||[]).filter(x=>!x||x.id!==id));
    if(d.cache){try{localStorage.setItem(d.cache,JSON.stringify(d.get()));}catch(e){}}
  });
}

/* ══════════════════════════════════════════════════════
   الاستعادة — v17.43
   ──────────────────────────────────────────────────────
   ⚠️ كان «استبدال كامل» لا يستبدل شيئاً.
   الوضعان كانا ينفّذان نفس الحلقة تماماً، والفرق الوحيد
   أن «دمج» يتخطّى المعرّفات الموجودة و«استبدال» يكتب
   فوقها. أي سجل موجود في النظام وغير موجود في الملف كان
   يبقى في مكانه — بينما المستخدم قرأ «يمسح كل شيء ويضع
   محتوى الملف مكانه · لا تراجع» وأكّد على ذلك.
   والنتيجة عكس المقصود بالضبط: من استعاد نسخة نظيفة
   ليتخلّص من سجلات خاطئة، بقيت السجلات الخاطئة عنده
   وظنّ أنها ذهبت.
   الآن «استبدال» يحذف فعلاً ما ليس في الملف — وكل
   محذوف يمرّ عبر سلة المحذوفات أولاً فيبقى قابلاً
   للاسترجاع، ويُعرض عدد المحذوف في التأكيد قبل التنفيذ.
   ملاحظة مقصودة: القسم الذي لا يذكره الملف إطلاقاً
   لا يُمسّ — فملف جزئي لا يمحو أقساماً لا يعرفها.
══════════════════════════════════════════════════════ */
function toolsRestore(mode){
  if(!_restorePayload){showToast("⚠ اختر ملف النسخة أولاً");return;}

  // احسب أثر العملية قبل تنفيذها — ثم اعرضه في التأكيد
  const plan=[];
  _REAL_DATASETS().forEach(d=>{
    const incoming=_restorePayload.data[d.k];
    if(!Array.isArray(incoming))return;
    const haveIds=new Set((d.get()||[]).map(x=>x&&x.id).filter(Boolean));
    const incIds=new Set(incoming.map(r=>r&&r.id).filter(Boolean));
    const toRemove=mode==="replace"?[...haveIds].filter(id=>!incIds.has(id)):[];
    plan.push({d,incoming,haveIds,toRemove});
  });
  const willRemove=plan.reduce((s,p)=>s+p.toRemove.length,0);

  if(mode==="replace"){
    const msg=willRemove
      ? `سيُحذف ${willRemove} سجلاً غير موجود في الملف، ويُكتب محتوى الملف فوق الباقي.\n`
        +`المحذوف يُنقل إلى سلة المحذوفات على هذا الجهاز.\n\nهل أنت متأكد؟`
      : `لا يوجد سجل زائد للحذف — سيُكتب محتوى الملف فوق الموجود فقط.\n\nهل أنت متأكد؟`;
    if(!confirm(msg))return;
  }

  let added=0,updated=0,skipped=0,removed=0;
  plan.forEach(({d,incoming,haveIds,toRemove})=>{
    // ① احذف ما ليس في الملف (مع نسخة للسلة)
    toRemove.forEach(id=>{
      const rec=(d.get()||[]).find(x=>x&&x.id===id);
      if(rec)_toTrash(d.k,rec);
      _dsDelete(d,id);
      removed++;
    });
    // ② اكتب محتوى الملف
    incoming.forEach(rec=>{
      if(!rec||!rec.id)return;
      if(mode==="merge"&&haveIds.has(rec.id)){skipped++;return;}
      if(haveIds.has(rec.id))updated++; else added++;
      d.save(rec);
    });
  });

  showToast(mode==="replace"
    ? `♻️ استبدال — أُضيف ${AR(added)} · حُدّث ${AR(updated)} · حُذف ${AR(removed)}`
    : `🔀 دمج — أُضيف ${AR(added)} · تُخطّي ${AR(skipped)}`,4200);
  document.getElementById("toolsRestoreBox").innerHTML="";
  _restorePayload=null;
  renderToolsStatus();
  renderTrash();
}

/* ─────────────────────────────────────────
   ٣) تصدير Excel شامل (كل الأقسام في ملف واحد)
───────────────────────────────────────── */
async function toolsExportXL(){
  try{await _ensureLib("xlsx");}catch(e){return;}   // v17.10 — تُحمَّل عند الطلب
  try{
    const wb=XLSX.utils.book_new();
    let sheets=0;
    _REAL_DATASETS().forEach(d=>{
      const arr=d.get();
      if(!arr.length)return;
      const rows=arr.map(r=>{
        const o={"التاريخ":r.dk||"","المعرّف":r.id||""};
        d.fields.forEach(f=>{if(r[f]!=null&&r[f]!=="")o[f]=r[f];});
        if(r.net!=null)o["الصافي (كغم)"]=r.net;
        const amt=d.amount(r);
        if(amt)o["المبلغ (د.ع)"]=amt;
        const paid=(r.payments||[]).reduce((s,p)=>s+(p.amount||0),0)||r.paidTotal||0;
        if(paid)o["المدفوع"]=paid;
        if(amt)o["المتبقي"]=Math.max(0,amt-paid);
        if(r.status)o["الحالة"]=r.status;
        return o;
      });
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),d.label.slice(0,30));
      sheets++;
    });
    if(!sheets){showToast("⚠ لا توجد بيانات للتصدير");return;}
    XLSX.writeFile(wb,`ميزان_الشمس_كل_البيانات_${toDay()}.xlsx`);
    showToast("📊 تم تصدير "+AR(sheets)+" ورقة");
  }catch(e){showToast("⚠ فشل التصدير: "+(e.message||""));}
}

/* ─────────────────────────────────────────
   ٤) بحث شامل في كل الأقسام دفعة واحدة
───────────────────────────────────────── */
/* ══════════════════════════════════════════════════════
   المطابقة السياقية — v17.37
   ──────────────────────────────────────────────────────
   المشكلة: البحث كان يُلصق مبلغاً بكل نتيجة دون النظر
   *لماذا* طابقت. وصل الشراء يطابق اسم «سعد» لأنه ناقله،
   فيُعرض بمبلغه الكامل — وهو مال الفلاح لا مال سعد —
   ويُضاف إلى المجموع، فيصير رقم بحث الناقل بالملايين
   بينما حسابه الحقيقي مئات الألوف، ولا تُعرف ذمّته.
   والحمولة نفسها محسوبة أصلاً وبشكل صحيح في «أجور النقل».
   الحل: الحقل السياقي (ctx) يُبقي السجل قابلاً للإيجاد،
   لكن إن كان هو *وحده* سبب المطابقة وكانت أجرته محسوبة
   في «أجور النقل»، نستبعده من قسمه كي لا يتضخّم المجموع.
   وإن لم تكن له أجرة (فلا يظهر في «أجور النقل») يبقى
   كما هو حتى لا يختفي سجل من البحث.
══════════════════════════════════════════════════════ */
function _isCtxOnlyHit(d,r,q){
  if(!d.ctx||!d.ctx.length)return false;
  const hit=f=>r[f]&&smartMatch(String(r[f]),q);
  // طابق حقلاً أصيلاً (فلاح/لوحة/مستلم…)؟ إذن السجل يخصّه فعلاً
  if(d.fields.some(f=>!d.ctx.includes(f)&&hit(f)))return false;
  // طابق الحقل السياقي وحده
  return d.ctxCovered?!!d.ctxCovered(r):true;
}

/* v17.31 — نواة البحث الشامل: تُرجع النتائج مرشَّحة بالنص والمدة،
   ويستعملها العرضُ والطباعةُ معاً فلا يختلفان أبداً. */
function _toolsSearchData(){
  const q=(document.getElementById("toolsSearchInp")?.value||"").trim();
  const from=(document.getElementById("toolsSrchFrom")?.value||"").trim();
  const to=(document.getElementById("toolsSrchTo")?.value||"").trim();
  const inRange=dk=>{
    if(!from&&!to)return true;
    if(!dk)return false;
    if(from&&dk<from)return false;
    if(to&&dk>to)return false;
    return true;
  };
  const groups=[];
  let totalHits=0,totalAmt=0,totalPaid=0;
  if(q){
    _UNIQ_DATASETS().forEach(d=>{
      const hits=d.get().filter(r=>
        inRange(r.dk)&&d.fields.some(f=>r[f]&&smartMatch(String(r[f]),q))
        &&!_isCtxOnlyHit(d,r,q));
      if(!hits.length)return;
      hits.sort((a,b)=>String(b.dk||"").localeCompare(String(a.dk||"")));
      const amt=hits.reduce((s,r)=>s+d.amount(r),0);
      const _pd=r=>d.paid?d.paid(r):getPaidTotal(r);   // v17.33 — النقل يقرأ naqlPayments
      const paid=hits.reduce((s,r)=>s+_pd(r),0);
      totalHits+=hits.length;totalAmt+=amt;totalPaid+=paid;
      groups.push({d,hits,amt,paid,rem:Math.max(0,amt-paid)});
    });
  }
  return{q,from,to,groups,totalHits,totalAmt,totalPaid,
         totalRem:Math.max(0,totalAmt-totalPaid)};
}
function toolsSrchSetRange(kind){
  const f=document.getElementById("toolsSrchFrom"),t=document.getElementById("toolsSrchTo");
  if(!f||!t)return;
  const today=_D(toDay());
  if(kind==="all"){f.value="";t.value="";}
  else if(kind==="week"){f.value=_ds(_weekStart(today));t.value=toDay();}
  else if(kind==="month"){f.value=_ds(new Date(today.getFullYear(),today.getMonth(),1));t.value=toDay();}
  else if(kind==="30"){f.value=_ds(_addDays(today,-29));t.value=toDay();}
  toolsGlobalSearch();
}

let _gPayLastQ=null;
function toolsGlobalSearch(){
  const box=document.getElementById("toolsSearchRes");
  if(!box)return;
  const R=_toolsSearchData();
  const q=R.q;
  /* v17.55 — تغيّر البحث يُلغي اختيار الشخص السابق، فلا يُدفع
     لشخصٍ اختير في بحثٍ آخر */
  if(_gPayLastQ!==null&&_gPayLastQ!==q)_gPayOwner=null;
  _gPayLastQ=q;
  if(!q){
    box.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:22px;font-size:12px">🔎 اكتب اسماً أو رقم لوحة أو ملاحظة للبحث في كل الأقسام</div>`;
    renderGlobalPayPreview();     // v17.44 — لوحة الدفع الشامل تتبع البحث دائماً
    return;
  }
  let totalHits=R.totalHits,totalAmt=R.totalAmt,totalRem=R.totalRem;
  /* ══ v17.37 — بطاقة «حساب الناقل» ══
     حين يطابق البحث ناقلاً، هذا هو الرقم الذي يريده فعلاً:
     ما له وما قبضه وما بقي — من «أجور النقل» وحدها. */
  const gN=R.groups.find(g=>g.d.k==="naql");
  let acct="";
  if(gN){
    const names=[...new Set(gN.hits.map(r=>(r.transporter||"").trim()).filter(Boolean))];
    const who=names.length===1?names[0]:(names.length?`${AR(names.length)} ناقلين`:q);
    acct=`<div style="background:linear-gradient(180deg,var(--ink-200),var(--ink-100));border:1px solid var(--wheat);border-radius:12px;padding:11px;margin-bottom:11px">
      <div style="font-size:12px;font-weight:700;color:var(--wheat);margin-bottom:8px">🚚 حساب الناقل — ${esc(who)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;font-size:11px">
        <span style="color:var(--paper-2)">الحمولات: <strong style="color:var(--paper)">${AR(gN.hits.length)}</strong></span>
        <span style="color:var(--paper-2)">له: <strong style="color:var(--wheat-hi)">${fIQD(gN.amt)}</strong></span>
        <span style="color:var(--paper-2)">قبض: <strong style="color:var(--settled)">${fIQD(gN.paid)}</strong></span>
        <span style="color:var(--paper-2)">المتبقي: <strong style="color:${gN.rem>0?"var(--owing)":"var(--settled)"}">${gN.rem>0?fIQD(gN.rem):"مسدَّد ✓"}</strong></span>
      </div>
      <button class="btn bsm" style="background:var(--wheat);color:#fff;width:100%;margin-top:8px;justify-content:center"
        onclick="openNaqlAcctFrom('${esc(String(q)).replace(/'/g,"\\'")}')">📊 افتح حسابه كاملاً مع الدفع</button>
    </div>`;
  }
  const blocks=R.groups.map(g=>{
    const d=g.d, hits=g.hits;
    const secAmt=g.amt;
    const rows=hits.slice(0,40).map(r=>{
      const amt=d.amount(r);
      const paid=d.paid?d.paid(r):getPaidTotal(r);
      const rem=Math.max(0,amt-paid);
      const label=d.rowLabel?d.rowLabel(r):d.fields.map(f=>r[f]).filter(Boolean).slice(0,3).join(" · ");
      return`<div onclick="gotoRecord('${d.k}','${String(r.id).replace(/'/g,"\\'")}')"
        style="display:flex;justify-content:space-between;gap:8px;padding:6px 9px;border-bottom:1px solid var(--ink-200);font-size:11px;cursor:pointer">
        <span style="color:var(--paper-2);flex:1;min-width:0">📅 ${tAr(r.dk||"—")} — ${esc(label)}</span>
        ${amt?`<span style="white-space:nowrap"><span style="color:var(--wheat-hi)">${fIQD(amt)}</span>${rem>0?` <span style="color:var(--owing)">(متبقي ${fIQD(rem)})</span>`:` <span style="color:var(--settled)">✓</span>`}</span>`
             :(r.net!=null?`<span style="color:var(--wheat);white-space:nowrap">${fKG(r.net)}</span>`:"")}
      </div>`;}).join("");
    return`<div style="margin-bottom:10px;background:var(--ink-100);border:1px solid var(--rule);border-radius:10px;overflow:hidden">
      <div style="background:var(--ink-200);padding:7px 10px;display:flex;justify-content:space-between;font-size:12px">
        <strong style="color:var(--paper)">${d.icon} ${d.label}</strong>
        <span style="color:var(--paper-2)">${AR(hits.length)} نتيجة${secAmt?` · <strong style="color:var(--wheat-hi)">${fIQD(secAmt)}</strong>`:""}</span>
      </div>${rows}
      ${hits.length>40?`<div style="padding:6px 9px;font-size:10px;color:var(--paper-3)">…و ${AR(hits.length-40)} نتيجة أخرى</div>`:""}
    </div>`;}).join("");
  box.innerHTML=acct+(blocks||`<div style="text-align:center;color:var(--paper-4);padding:22px;font-size:12px">❌ لا نتائج لـ "${esc(q)}"</div>`)
    +(totalHits?`<div style="background:var(--ink-200);border-radius:10px;padding:9px 11px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;font-size:12px">
      <span style="color:var(--paper-2)">الإجمالي: <strong style="color:var(--wheat-hi)">${AR(totalHits)}</strong> نتيجة</span>
      <span style="color:var(--paper-2)">المبالغ: <strong style="color:var(--wheat-hi)">${fIQD(totalAmt)}</strong></span>
      <span style="color:var(--paper-2)">المتبقي: <strong style="color:var(--owing)">${fIQD(totalRem)}</strong></span>
    </div>`:"");
  renderGlobalPayPreview();       // v17.44 — لوحة الدفع الشامل تتبع البحث دائماً
}
function toolsSearchKey(e){if(e.key==="Enter")toolsGlobalSearch();}

