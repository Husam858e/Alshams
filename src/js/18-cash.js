/* ══════════════════════════════════════════════════════════════
   الخزينة — v17.52
   ──────────────────────────────────────────────────────────────
   النسخة الأولى (v17.50) أجابت «كم يجب أن يكون في الدرج؟» لكنها
   كانت ناقصة في ثلاثة أمور تمنع أي صندوق من أن يُطابِق فعلاً:

   ① لم يكن للنقد باب إلا الوصولات. والواقع فيه إيداع في البنك،
     وسحب منه، ومصروف نثري، وسحب المالك، وإدخال رأس مال. وبلا
     هذه الأبواب يبقى الفرق قائماً مهما عددتَ.
   ② النقد ليس في مكان واحد: صندوق الساحة شيء والبنك شيء آخر.
   ③ وأخطرها: خطّ الأساس. كان المتوقّع يُحسب من الرصيد الافتتاحي
     دائماً — فنقصٌ حدث قبل شهر يظلّ يلاحقك كل يوم إلى الأبد،
     ويختلط بنقص اليوم فلا تعرف أيّهما.
     الآن كل جرد يُعتمد يصير خطّ أساس جديد: ما قبله أُغلق
     وسُوِّي، والحساب يبدأ منه. وهذا ما يفعله أي صندوق منظّم.

   ⚠️ اصطلاح التواريخ — مقصود وموحّد:
     خطّ الأساس يحمل fromDk = أول يوم تُحسب حركاته.
     · الرصيد الافتتاحي: fromDk = تاريخه نفسه (رصيد بداية اليوم).
     · الجرد المعتمد ليوم D: رصيد نهاية D ⇒ fromDk = D+1.
     أي خلط هنا يُزيح الحساب يوماً كاملاً.
══════════════════════════════════════════════════════════════ */
let CASH_BOXES=[];
let CASH_MOVES=[];
let CASH_COUNTS=[];
let _cashBoxId="main";
let _cashChartMode="balance";

const _CASH_DIR_DEFAULT={sell:1,buy:-1,dam:-1,srf:-1,wrk:-1,naql:-1,sal:-1};
let CASHBOX={dirs:{..._CASH_DIR_DEFAULT}};

/* أنواع الحركة اليدوية — الاتجاه ملازم للنوع فلا يُدخله المستخدم خطأً */
const _CASH_TYPES={
  cap_in   :{label:"إدخال رأس مال",   icon:"📥", dir: 1},
  other_in :{label:"وارد آخر",         icon:"➕", dir: 1},
  owner_out:{label:"سحب المالك",       icon:"📤", dir:-1},
  petty    :{label:"مصروف نثري",       icon:"🧾", dir:-1},
  other_out:{label:"صادر آخر",         icon:"➖", dir:-1},
  xfer_in  :{label:"تحويل وارد",       icon:"🔄", dir: 1},
  xfer_out :{label:"تحويل صادر",       icon:"🔄", dir:-1},
  adjust   :{label:"قيد تسوية",        icon:"⚖️", dir: 0},
};

function _defaultBoxes(){
  return [
    {id:"main",name:"صندوق الساحة",kind:"cash",opening:0,openingDk:toDay(),main:true,active:true},
    {id:"bank",name:"البنك",        kind:"bank",opening:0,openingDk:toDay(),main:false,active:true},
  ];
}
function _loadCashbox(){
  try{const c=localStorage.getItem("wShamsCashbox");
      if(c)CASHBOX={...CASHBOX,...JSON.parse(c)};}catch(e){}
  if(!CASHBOX.dirs)CASHBOX.dirs={..._CASH_DIR_DEFAULT};
  try{const b=localStorage.getItem("wShamsCashBoxes");if(b)CASH_BOXES=JSON.parse(b)||[];}catch(e){}
  if(!CASH_BOXES.length)CASH_BOXES=_defaultBoxes();
  try{const m=localStorage.getItem("wShamsCashMoves");if(m)CASH_MOVES=JSON.parse(m)||[];}catch(e){CASH_MOVES=[];}
  try{const k=localStorage.getItem("wShamsCashCounts");if(k)CASH_COUNTS=JSON.parse(k)||[];}catch(e){CASH_COUNTS=[];}
  /* توافق مع v17.50: الافتتاحي كان حقلاً واحداً بلا صناديق */
  if(CASHBOX.opening!==undefined&&CASHBOX.opening!==null){
    const mb=_mainBox();
    if(mb&&!mb.opening&&CASHBOX.opening){
      mb.opening=CASHBOX.opening; mb.openingDk=CASHBOX.openingDk||toDay();
    }
    delete CASHBOX.opening; delete CASHBOX.openingDk;
  }
  CASH_COUNTS.forEach(c=>{if(!c.boxId)c.boxId="main";});
}
function _saveCashbox(){
  try{localStorage.setItem("wShamsCashbox",JSON.stringify(CASHBOX));}catch(e){}
  _fbWrite("cashbox","main",CASHBOX);
}
function _saveBoxes(){
  try{localStorage.setItem("wShamsCashBoxes",JSON.stringify(CASH_BOXES));}catch(e){}
  CASH_BOXES.forEach(b=>_fbWrite("cash_boxes",b.id,b));
}
function _saveMoves(){try{localStorage.setItem("wShamsCashMoves",JSON.stringify(CASH_MOVES.slice(0,3000)));}catch(e){}}
function _saveCounts(){try{localStorage.setItem("wShamsCashCounts",JSON.stringify(CASH_COUNTS.slice(0,600)));}catch(e){}}

const _box     = id=>CASH_BOXES.find(b=>b.id===(id||_cashBoxId))||CASH_BOXES[0]||null;
const _mainBox = ()=>CASH_BOXES.find(b=>b.main)||CASH_BOXES[0]||null;
const _cashDir = src=>{
  const d=CASHBOX.dirs||_CASH_DIR_DEFAULT;
  return d[src]===undefined?(_CASH_DIR_DEFAULT[src]||0):d[src];
};

/* ── خطّ الأساس: آخر جرد معتمد، وإلا الرصيد الافتتاحي ── */
function cashBaseline(boxId){
  const b=_box(boxId); if(!b)return{amount:0,fromDk:"",src:"—"};
  const settled=CASH_COUNTS
    .filter(c=>c&&c.boxId===b.id&&c.settled)
    .sort((x,y)=>String(y.dk||"").localeCompare(String(x.dk||""))||String(y.at||"").localeCompare(String(x.at||"")))[0];
  if(settled)return{amount:settled.amount||0,fromDk:_ds(_addDays(settled.dk,1)),
                    src:"جرد معتمد "+tAr(settled.dk),at:settled.at};
  return{amount:b.opening||0,fromDk:b.openingDk||"",src:"الرصيد الافتتاحي"};
}

/* ── حركات مشتقّة من الوصولات (للصندوق الرئيسي وحده) ── */
function _derivedMoves(boxId,from,to){
  const b=_box(boxId); if(!b||!b.main)return[];
  return (collectAllPayments()||[]).map(x=>{
    const dk=x.dk||String(x.at||"").slice(0,10);
    const dir=_cashDir(x.src);
    return{id:"d:"+x.src+":"+(x.recId||"")+":"+(x.at||"")+":"+x.amount,
           boxId:b.id,dk,at:x.at||"",by:x.by||"—",dir,amount:x.amount||0,
           type:x.src,derived:true,who:x.who||"",ref:x.ref||"",note:x.note||""};
  }).filter(m=>m.dk&&m.dir!==0&&(!from||m.dk>=from)&&(!to||m.dk<=to));
}
/* ── كل الحركات: مشتقّة + يدوية ── */
function cashLedger(boxId,from,to){
  const b=_box(boxId); if(!b)return[];
  const man=CASH_MOVES.filter(m=>m&&m.boxId===b.id&&m.dk&&(!from||m.dk>=from)&&(!to||m.dk<=to));
  return [..._derivedMoves(b.id,from,to),...man]
    .sort((x,y)=>String(x.dk).localeCompare(String(y.dk))
               ||String(x.at||"").localeCompare(String(y.at||"")));
}
/* ── الرصيد المتوقّع حتى تاريخ ── */
function cashExpected(upto,boxId){
  const base=cashBaseline(boxId);
  const moves=cashLedger(boxId,base.fromDk,upto||"");
  return base.amount+moves.reduce((s,m)=>s+m.dir*(m.amount||0),0);
}


/* ══ العمليات ══════════════════════════════════════════════ */

function _cashCommitMove(mv){
  CASH_MOVES.unshift(mv); _saveMoves();
  _fbWrite("cash_moves",mv.id,mv);
  const T=_CASH_TYPES[mv.type]||{label:mv.type};
  _auditWrite({id:genId()+"-"+Date.now().toString(36),at:nowStr(),
    by:(S.cu&&S.cu.name)||"—",kind:"cash",node:"cash_moves",recId:mv.id,
    subject:(_box(mv.boxId)||{}).name+" — "+T.label,action:"create",dk:mv.dk,
    changes:[{f:"amount",from:0,to:mv.dir*mv.amount,money:true}]});
}

/* حركة يدوية */
function cashAddMove(){
  const type=document.getElementById("cashMvType")?.value||"other_out";
  const T=_CASH_TYPES[type]; if(!T){showToast("⚠ اختر نوع الحركة");return;}
  const amt=payAmt("cashMvAmt");
  const dk=document.getElementById("cashMvDk")?.value||toDay();
  const note=(document.getElementById("cashMvNote")?.value||"").trim();
  if(!(amt>0)){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  if(isMonthClosed(_monthOf(dk))){showToast("🔒 "+_closureLabel(_monthOf(dk))+" مغلق");return;}
  _cashCommitMove({id:genId(),boxId:_cashBoxId,dk,at:nowStr(),by:(S.cu&&S.cu.name)||"—",
                   dir:T.dir,amount:amt,type,note:note||null,mk:dk.slice(0,7)});
  ["cashMvAmt","cashMvNote"].forEach(id=>{const e=document.getElementById(id);if(e)e.value="";});
  showToast("✅ سُجّلت الحركة — "+T.label+" "+fIQD(amt));
  renderCashTab();
}

/* تحويل بين صندوقين — قيدان مترابطان لا واحد */
function cashTransfer(){
  const fromId=document.getElementById("cashXfFrom")?.value;
  const toId  =document.getElementById("cashXfTo")?.value;
  const amt=payAmt("cashXfAmt");
  const dk=document.getElementById("cashXfDk")?.value||toDay();
  const note=(document.getElementById("cashXfNote")?.value||"").trim();
  if(!fromId||!toId){showToast("⚠ اختر الصندوقين");return;}
  if(fromId===toId){showToast("⚠ لا يمكن التحويل إلى نفس الصندوق");return;}
  if(!(amt>0)){showToast("⚠ أدخل مبلغاً صحيحاً");return;}
  if(isMonthClosed(_monthOf(dk))){showToast("🔒 "+_closureLabel(_monthOf(dk))+" مغلق");return;}
  const avail=cashExpected(dk,fromId);
  if(amt>avail&&!confirm(
`المبلغ ${Math.round(amt).toLocaleString("en")} أكبر من رصيد ${_box(fromId).name} المتوقّع (${Math.round(avail).toLocaleString("en")}).

سيصبح رصيده سالباً. هل تريد المتابعة؟`))return;
  const xferId=genId();
  const at=nowStr(), by=(S.cu&&S.cu.name)||"—";
  const nm=id=>(_box(id)||{}).name||"";
  _cashCommitMove({id:genId(),boxId:fromId,dk,at,by,dir:-1,amount:amt,type:"xfer_out",
    note:("تحويل إلى "+nm(toId))+(note?" — "+note:""),xferId,mk:dk.slice(0,7)});
  _cashCommitMove({id:genId(),boxId:toId,dk,at,by,dir:1,amount:amt,type:"xfer_in",
    note:("تحويل من "+nm(fromId))+(note?" — "+note:""),xferId,mk:dk.slice(0,7)});
  const a=document.getElementById("cashXfAmt");if(a)a.value="";
  const n=document.getElementById("cashXfNote");if(n)n.value="";
  showToast("🔄 حُوّل "+fIQD(amt)+" — "+nm(fromId)+" ← "+nm(toId));
  renderCashTab();
}

/* جرد */
function cashAddCount(){
  const amt=payAmt("cashCountAmt");
  const dk=document.getElementById("cashCountDk")?.value||toDay();
  const note=(document.getElementById("cashCountNote")?.value||"").trim();
  if(document.getElementById("cashCountAmt")?.value.trim()===""){showToast("⚠ أدخل المبلغ المعدود");return;}
  if(isMonthClosed(_monthOf(dk))){showToast("🔒 "+_closureLabel(_monthOf(dk))+" مغلق");return;}
  const exp=cashExpected(dk,_cashBoxId);
  const rec={id:genId(),boxId:_cashBoxId,dk,amount:amt,expected:Math.round(exp),
             diff:Math.round(amt-exp),at:nowStr(),by:(S.cu&&S.cu.name)||"—",
             note:note||null,settled:false,mk:dk.slice(0,7)};
  CASH_COUNTS.unshift(rec); _saveCounts();
  _fbWrite("cash_counts",rec.id,rec);
  _auditWrite({id:genId()+"-"+Date.now().toString(36),at:nowStr(),
    by:(S.cu&&S.cu.name)||"—",kind:"cash",node:"cash_counts",recId:rec.id,
    subject:"جرد "+((_box(_cashBoxId)||{}).name||"")+" "+tAr(dk),action:"create",dk,
    changes:[{f:"amount",from:Math.round(exp),to:amt,money:true}]});
  const el=document.getElementById("cashCountAmt");if(el)el.value="";
  const nt=document.getElementById("cashCountNote");if(nt)nt.value="";
  showToast(rec.diff===0?"✅ الصندوق مطابق تماماً"
    :(rec.diff>0?"⚠ زيادة "+fIQD(rec.diff):"⚠ نقص "+fIQD(-rec.diff)));
  renderCashTab();
}

/* اعتماد الجرد: يُسوّي الفرق بقيد صريح ويصير خطّ الأساس الجديد */
function cashSettleCount(id){
  const c=CASH_COUNTS.find(x=>x&&x.id===id); if(!c)return;
  if(c.settled){showToast("✅ معتمد أصلاً");return;}
  const why=c.diff!==0
    ? prompt(`اعتماد جرد ${tAr(c.dk)}\n\nالفرق ${c.diff>0?"زيادة":"نقص"} ${Math.abs(c.diff).toLocaleString("en")} د.ع.\nسيُسجَّل قيد تسوية بهذا المبلغ، ويصير الجرد خطّ الأساس الجديد.\n\nسبب الفرق (يُسجَّل في التدقيق):`,"")
    : (confirm(`اعتماد جرد ${tAr(c.dk)} — مطابق تماماً.\n\nسيصير خطّ الأساس الجديد. هل تريد المتابعة؟`)?"":null);
  if(why===null)return;
  if(c.diff!==0&&!String(why).trim()){showToast("⚠ اكتب سبب الفرق");return;}
  if(c.diff!==0){
    _cashCommitMove({id:genId(),boxId:c.boxId,dk:c.dk,at:nowStr(),by:(S.cu&&S.cu.name)||"—",
      dir:c.diff>0?1:-1,amount:Math.abs(c.diff),type:"adjust",
      note:"تسوية جرد "+tAr(c.dk)+" — "+String(why).trim(),countId:c.id,mk:String(c.dk).slice(0,7)});
  }
  c.settled=true; c.settleNote=String(why||"").trim()||null; c.settledBy=(S.cu&&S.cu.name)||"—";
  c.settledAt=nowStr();
  _saveCounts(); _fbWrite("cash_counts",c.id,c);
  _auditWrite({id:genId()+"-"+Date.now().toString(36),at:nowStr(),
    by:(S.cu&&S.cu.name)||"—",kind:"cash",node:"cash_counts",recId:c.id,
    subject:"اعتماد جرد "+tAr(c.dk),action:"edit",dk:c.dk,
    changes:[{f:"settled",from:"لا",to:"نعم"},{f:"note",from:"—",to:String(why||"مطابق")}]});
  showToast("🔐 اعتُمد الجرد — صار خطّ الأساس");
  renderCashTab();
}

/* الصناديق */
function cashSaveOpening(){
  const b=_box(); if(!b)return;
  b.opening=payAmt("cashOpenAmt");
  b.openingDk=document.getElementById("cashOpenDk")?.value||toDay();
  _saveBoxes(); showToast("✅ حُفظ الرصيد الافتتاحي لـ"+b.name); renderCashTab();
}
function cashAddBox(){
  const name=(prompt("اسم الصندوق الجديد:","")||"").trim();
  if(!name)return;
  const kind=confirm("هل هو حساب بنكي؟\n\nموافق = بنك · إلغاء = صندوق نقدي")?"bank":"cash";
  const b={id:genId(),name,kind,opening:0,openingDk:toDay(),main:false,active:true};
  CASH_BOXES.push(b); _saveBoxes();
  _cashBoxId=b.id; showToast("✅ أُضيف "+name); renderCashTab();
}
function cashPickBox(id){_cashBoxId=id;renderCashTab();}
function cashSetDir(src,v){
  CASHBOX.dirs={...(CASHBOX.dirs||_CASH_DIR_DEFAULT),[src]:Number(v)};
  _saveCashbox(); renderCashTab();
}
function cashSetRange(kind){
  const f=document.getElementById("cashFrom"),t=document.getElementById("cashTo");
  if(!f||!t)return;
  const today=_D(toDay());
  if(kind==="base"){f.value=cashBaseline(_cashBoxId).fromDk||"";t.value=toDay();}
  else if(kind==="day"){f.value=toDay();t.value=toDay();}
  else if(kind==="week"){f.value=_ds(_weekStart(today));t.value=toDay();}
  else if(kind==="month"){f.value=_ds(new Date(today.getFullYear(),today.getMonth(),1));t.value=toDay();}
  renderCashTab();
}


/* ══ الرسم ══════════════════════════════════════════════════ */

/* رقم مختصر للجداول — «د.ع» تُذكر في العنوان مرة لا في كل خانة،
   فتتّسع ثلاثة أرقام لشاشة الهاتف بلا تمرير أفقي */
const _cashNum=v=>AR(Math.round(v||0).toLocaleString("en"));
const _cashSrcLabel=t=>{
  if(_PAYSRC[t])return _PAYSRC[t].icon+" "+_PAYSRC[t].label;
  const T=_CASH_TYPES[t]; return T?T.icon+" "+T.label:t;
};

/* منحنى الرصيد اليومي — سلسلة واحدة، بلا وسيلة إيضاح (العنوان يسمّيها) */
function _cashSparkline(rows,base){
  if(rows.length<2)return "";
  const byDay={};
  let run=base;
  rows.forEach(m=>{run+=m.dir*(m.amount||0);byDay[m.dk]=run;});
  const days=Object.keys(byDay).sort();
  if(days.length<2)return "";
  const pts=days.map(d=>byDay[d]);
  const W=560,H=120,PX=10,PY=14;
  const min=Math.min(...pts,0), max=Math.max(...pts,0);
  const span=(max-min)||1;
  const x=i=>PX+(i*(W-2*PX))/(days.length-1);
  const y=v=>PY+(H-2*PY)*(1-(v-min)/span);
  const path=pts.map((v,i)=>(i?"L":"M")+x(i).toFixed(1)+" "+y(v).toFixed(1)).join(" ");
  const zeroY=(min<0&&max>0)?y(0):null;
  const last=pts[pts.length-1];
  return `<div style="background:var(--ink-100);border:1px solid var(--rule);border-radius:10px;
      padding:9px 10px 6px;margin-bottom:9px;overflow-x:auto">
    <div style="font-size:11px;font-weight:700;color:var(--paper-2);margin-bottom:5px">
      📈 رصيد ${esc((_box()||{}).name||"")} يوماً بيوم</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"
         role="img" aria-label="منحنى الرصيد اليومي">
      ${zeroY!==null?`<line x1="${PX}" y1="${zeroY.toFixed(1)}" x2="${W-PX}" y2="${zeroY.toFixed(1)}"
        stroke="var(--rule-hi)" stroke-width="1" stroke-dasharray="3 3"/>`:""}
      <path d="${path}" fill="none" stroke="${last>=0?"var(--wheat)":"var(--owing)"}"
            stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(pts.length-1).toFixed(1)}" cy="${y(last).toFixed(1)}" r="4"
              fill="${last>=0?"var(--wheat)":"var(--owing)"}" stroke="var(--ink-100)" stroke-width="2"/>
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--paper-3);margin-top:2px">
      <span>${tAr(days[0])}</span>
      <span style="color:var(--paper-2);font-weight:700">${fIQD(last)}</span>
      <span>${tAr(days[days.length-1])}</span>
    </div>
  </div>`;
}

function renderCashTab(){
  const box=document.getElementById("cashRes");
  if(!box)return;
  const b=_box(); if(!b){box.innerHTML="";return;}
  const base=cashBaseline(b.id);
  const from=document.getElementById("cashFrom")?.value||base.fromDk||"";
  const to  =document.getElementById("cashTo")?.value||toDay();

  const oa=document.getElementById("cashOpenAmt");
  if(oa)oa.value=b.opening?fmtThousands(String(b.opening)):"";
  const od=document.getElementById("cashOpenDk");
  if(od)od.value=b.openingDk||toDay();

  const rows=cashLedger(b.id,base.fromDk,to);          // من خطّ الأساس للحساب
  const shown=cashLedger(b.id,from,to);                 // ما يُعرض
  const expNow=base.amount+rows.reduce((s,m)=>s+m.dir*(m.amount||0),0);
  const tIn =shown.reduce((s,m)=>s+(m.dir>0?m.amount:0),0);
  const tOut=shown.reduce((s,m)=>s+(m.dir<0?m.amount:0),0);
  const counts=CASH_COUNTS.filter(c=>c&&c.boxId===b.id);
  const lastCount=counts[0];
  const pending=counts.filter(c=>!c.settled).length;

  /* أشرطة الصناديق */
  const tabs=CASH_BOXES.filter(x=>x.active!==false).map(x=>{
    const on=x.id===b.id;
    const bal=cashExpected(toDay(),x.id);
    return `<button onclick="cashPickBox('${esc(x.id)}')" style="flex:1;min-width:120px;
      padding:8px 9px;border-radius:9px;cursor:pointer;text-align:right;
      border:1px solid ${on?"var(--wheat)":"var(--rule)"};
      background:${on?"var(--wheat-wash)":"var(--ink-100)"}">
      <div style="font-size:11px;font-weight:700;color:${on?"var(--wheat-hi)":"var(--paper-2)"}">
        ${x.kind==="bank"?"🏦":"💵"} ${esc(x.name)}</div>
      <div style="font-size:13px;font-weight:800;color:${bal<0?"var(--owing)":"var(--paper)"}">${fIQD(bal)}</div>
    </button>`;}).join("");

  /* بطاقة الرصيد */
  const diffLine=lastCount?`
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--rule);font-size:11px">
      آخر جرد ${tAr(esc(lastCount.dk))}: <strong>${fIQD(lastCount.amount)}</strong>
      <span style="font-weight:700;color:${lastCount.diff===0?"var(--settled)":"var(--owing)"}">
        ${lastCount.diff===0?" ✅ مطابق":(lastCount.diff>0?" ⬆ زيادة "+fIQD(lastCount.diff):" ⬇ نقص "+fIQD(-lastCount.diff))}</span>
      ${lastCount.settled?' <span style="color:var(--settled)">🔐 معتمد</span>'
        :` <button class="btn bsm" style="background:var(--wheat);color:#fff;padding:2px 8px;font-size:10px"
             onclick="cashSettleCount('${esc(lastCount.id)}')">اعتماد</button>`}
    </div>`:"";

  const head=`
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px">${tabs}
      <button class="btn bsm bgh" style="font-size:10px" onclick="cashAddBox()">＋ صندوق</button></div>

    <div style="background:linear-gradient(180deg,var(--ink-200),var(--ink-100));
        border:1px solid ${expNow<0?"var(--owing)":"var(--wheat)"};border-radius:12px;padding:12px;margin-bottom:9px">
      <div style="font-size:12px;color:var(--paper-2);margin-bottom:4px">
        💰 المتوقّع في ${esc(b.name)} الآن</div>
      <div style="font-size:26px;font-weight:800;color:${expNow<0?"var(--owing)":"var(--wheat-hi)"}">${fIQD(expNow)}</div>
      ${expNow<0?`<div style="font-size:11px;color:var(--owing);font-weight:700;margin-top:3px">
        ⚠️ رصيد سالب — خرج أكثر مما دخل منذ خطّ الأساس</div>`:""}
      <div style="font-size:10px;color:var(--paper-3);margin-top:5px">
        خطّ الأساس: ${esc(base.src)} — ${fIQD(base.amount)}${base.fromDk?" · من "+tAr(base.fromDk):""}
      </div>
      ${diffLine}
      ${pending?`<div style="margin-top:6px;font-size:10px;color:var(--pending)">
        ⏳ ${AR(pending)} جرد بانتظار الاعتماد — الفروق تبقى محمولة حتى تُعتمد</div>`:""}
    </div>`;

  /* المنحنى */
  const chart=_cashSparkline(rows,base.amount);

  /* كشف الحركة برصيد متحرك */
  let run=base.amount;
  const preShown=cashLedger(b.id,base.fromDk,from?_ds(_addDays(from,-1)):"");
  run+=preShown.reduce((s,m)=>s+m.dir*(m.amount||0),0);
  const ledgerRows=shown.map(m=>{
    run+=m.dir*(m.amount||0);
    const who=m.who||m.note||"";
    /* v17.52 — البيان والتفصيل في خانة واحدة على سطرين.
       بخمس خانات بدل ستّ يظهر عمود «الرصيد» — وهو أهمّ رقم في
       الكشف — داخل شاشة الهاتف بلا تمرير أفقي. */
    return `<tr>
      <td style="white-space:nowrap;vertical-align:top">${tAr(esc(m.dk))}</td>
      <td style="vertical-align:top">
        <div style="white-space:nowrap">${_cashSrcLabel(m.type)}${m.derived?"":' <span style="color:var(--paper-4);font-size:9px">يدوي</span>'}</div>
        ${who?`<div style="font-size:9px;color:var(--paper-3);max-width:120px;overflow:hidden;
              text-overflow:ellipsis;white-space:nowrap">${esc(String(who).slice(0,50))}</div>`:""}
      </td>
      <td style="text-align:left;vertical-align:top;font-weight:700;white-space:nowrap;
          color:${m.dir>0?"var(--settled)":"var(--owing)"}">${m.dir>0?"+":"−"}${_cashNum(m.amount)}</td>
      <td style="text-align:left;vertical-align:top;font-weight:800;white-space:nowrap;color:${run<0?"var(--owing)":"var(--paper)"}">${_cashNum(run)}</td>
    </tr>`;}).join("");

  const ledger=`
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;
        background:var(--ink-200);border-radius:9px;padding:8px 11px;font-size:11px;margin-bottom:7px">
      <span style="color:var(--paper-2)">الحركات: <strong style="color:var(--paper)">${AR(shown.length)}</strong> <span style="color:var(--paper-4);font-size:10px">(المبالغ بالدينار)</span></span>
      <span style="color:var(--paper-2)">داخل: <strong style="color:var(--settled)">${fIQD(tIn)}</strong></span>
      <span style="color:var(--paper-2)">خارج: <strong style="color:var(--owing)">${fIQD(tOut)}</strong></span>
      <span style="color:var(--paper-2)">الصافي: <strong style="color:var(--wheat-hi)">${fIQD(tIn-tOut)}</strong></span>
    </div>
    ${shown.length?`<div class="rtwrap"><table class="rtbl" style="width:100%;font-size:11px">
      <thead><tr><th>التاريخ</th><th>البيان</th>
        <th style="text-align:left">الحركة</th>
        <th style="text-align:left">الرصيد</th></tr></thead>
      <tbody>${ledgerRows}</tbody></table></div>`
    :`<div style="text-align:center;color:var(--paper-4);padding:18px;font-size:12px">لا حركات في هذه المدة</div>`}`;

  /* سجلّ الجرد */
  const countList=counts.length?`
    <div style="font-size:12px;font-weight:700;color:var(--paper-2);margin:11px 0 6px">🧮 سجلّ الجرد</div>
    ${counts.slice(0,20).map(c=>`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;
          background:var(--ink-100);border:1px solid ${c.settled?"var(--settled-rule)":"var(--rule)"};
          border-radius:8px;padding:6px 9px;margin-bottom:4px;font-size:11px">
        <div style="flex:1;min-width:0">
          <div style="color:var(--paper)">📅 ${tAr(esc(c.dk))} — معدود <strong>${fIQD(c.amount)}</strong>
            ${c.settled?'<span style="color:var(--settled)"> 🔐 معتمد</span>':""}</div>
          <div style="color:var(--paper-3);font-size:10px">متوقّع ${fIQD(c.expected)} · ${esc(c.by||"—")}${c.note?" · "+esc(c.note):""}${c.settleNote?" · سبب: "+esc(c.settleNote):""}</div>
        </div>
        <div style="text-align:left;white-space:nowrap">
          <div style="font-weight:800;color:${c.diff===0?"var(--settled)":"var(--owing)"}">
            ${c.diff===0?"✅ مطابق":(c.diff>0?"⬆ "+fIQD(c.diff):"⬇ "+fIQD(-c.diff))}</div>
          ${c.settled?"":`<button class="btn bsm" style="background:var(--wheat);color:#fff;padding:2px 8px;font-size:10px;margin-top:3px"
             onclick="cashSettleCount('${esc(c.id)}')">اعتماد</button>`}
        </div>
      </div>`).join("")}`:"";

  /* اتجاهات الأقسام — للصندوق الرئيسي وحده */
  const dirBox=b.main?`
    <details style="margin-top:11px"><summary style="cursor:pointer;font-size:11px;color:var(--paper-3);padding:5px 0">
      ⚙️ اتجاه كل قسم (داخل / خارج)</summary>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">
        ${Object.keys(_PAYSRC).map(src=>`
          <span style="display:flex;align-items:center;gap:4px;background:var(--ink-100);
              border:1px solid var(--rule);border-radius:7px;padding:3px 6px;font-size:10px">
            ${_PAYSRC[src].icon} ${esc(_PAYSRC[src].label)}
            <select class="fs2" style="font-size:10px;padding:1px 3px" onchange="cashSetDir('${src}',this.value)">
              <option value="1"  ${_cashDir(src)>0?"selected":""}>داخل +</option>
              <option value="-1" ${_cashDir(src)<0?"selected":""}>خارج −</option>
              <option value="0"  ${_cashDir(src)===0?"selected":""}>تجاهل</option>
            </select></span>`).join("")}
      </div>
      <div style="font-size:10px;color:var(--paper-4);margin-top:5px;line-height:1.6">
        الافتراضي: البيع داخل والباقي خارج. الضمانات تختلف من ساحة لأخرى — اضبطها كما يناسب عملك.</div>
    </details>`:"";

  box.innerHTML=head+chart+ledger+countList+dirBox;
}

/* يُهيّئ الشاشة عند فتحها: تواريخ اليوم وقوائم الصناديق */
function _cashOpenTab(){
  ["cashCountDk","cashMvDk","cashXfDk"].forEach(id=>{
    const e=document.getElementById(id); if(e&&!e.value)e.value=toDay();
  });
  const opts=CASH_BOXES.filter(b=>b.active!==false)
    .map(b=>`<option value="${esc(b.id)}">${b.kind==="bank"?"🏦":"💵"} ${esc(b.name)}</option>`).join("");
  const f=document.getElementById("cashXfFrom"), t=document.getElementById("cashXfTo");
  if(f){const v=f.value;f.innerHTML=opts;f.value=v||_cashBoxId;}
  if(t){const v=t.value;t.innerHTML=opts;
        t.value=v||(CASH_BOXES.find(b=>b.id!==_cashBoxId)||{}).id||"";}
  renderCashTab();
}

/* ══ طباعة كشف الخزينة ══ */
function openCashPrint(){
  const b=_box(); if(!b){showToast("⚠ لا صندوق");return;}
  const base=cashBaseline(b.id);
  const from=document.getElementById("cashFrom")?.value||base.fromDk||"";
  const to  =document.getElementById("cashTo")?.value||toDay();
  const shown=cashLedger(b.id,from,to);
  if(!shown.length){showToast("⚠ لا حركات في هذه المدة");return;}
  let run=base.amount+cashLedger(b.id,base.fromDk,from?_ds(_addDays(from,-1)):"")
                       .reduce((s,m)=>s+m.dir*(m.amount||0),0);
  const opening=run;
  const body=shown.map(m=>{
    run+=m.dir*(m.amount||0);
    return `<tr><td>${tAr(esc(m.dk))}</td><td>${esc(_cashSrcLabel(m.type))}</td>
      <td>${esc(String(m.who||m.note||"").slice(0,60))}</td>
      <td>${m.dir>0?fIQD(m.amount):"—"}</td><td>${m.dir<0?fIQD(m.amount):"—"}</td>
      <td>${fIQD(run)}</td></tr>`;}).join("");
  const tIn =shown.reduce((s,m)=>s+(m.dir>0?m.amount:0),0);
  const tOut=shown.reduce((s,m)=>s+(m.dir<0?m.amount:0),0);
  const lastCount=CASH_COUNTS.filter(c=>c&&c.boxId===b.id)[0];
  _printHTML=`${COHEAD}
    <div class="prh"><div class="prhtl">💰 كشف الخزينة — ${esc(b.name)}</div>
      <div class="prhmt">${tAr(from||"البداية")} ← ${tAr(to)}<br>${tAr(nowStr())}</div></div>
    <div class="prb">
      <div class="prr"><span class="prk">رصيد أول المدة</span><span class="prv">${fIQD(opening)}</span></div>
      <div class="prr"><span class="prk">إجمالي الوارد</span><span class="prv">${fIQD(tIn)}</span></div>
      <div class="prr"><span class="prk">إجمالي الصادر</span><span class="prv">${fIQD(tOut)}</span></div>
    </div>
    <table class="coltbl"><thead><tr><th>التاريخ</th><th>البيان</th><th>التفصيل</th>
      <th>وارد</th><th>صادر</th><th>الرصيد</th></tr></thead><tbody>${body}</tbody></table>
    <div class="prtot"><span class="pk">الرصيد آخر المدة</span><span class="pv">${fIQD(run)}</span></div>
    ${lastCount?`<div class="prb"><div class="prr">
      <span class="prk">آخر جرد فعلي — ${tAr(lastCount.dk)}</span>
      <span class="prv">${fIQD(lastCount.amount)} ${lastCount.diff===0?"(مطابق)"
        :(lastCount.diff>0?"(زيادة "+fIQD(lastCount.diff)+")":"(نقص "+fIQD(-lastCount.diff)+")")}</span>
    </div></div>`:""}
    <div class="prb" style="margin-top:14px">
      <div class="prr"><span class="prk">أمين الصندوق</span><span class="prv">............................</span></div>
      <div class="prr"><span class="prk">المدير</span><span class="prv">............................</span></div>
    </div>
    ${COFTR}`;
  _isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent="💰 كشف الخزينة — "+b.name;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}



