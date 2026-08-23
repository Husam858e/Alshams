/* ════════════════════════════════════════════
   PRINT TEMPLATES
════════════════════════════════════════════ */
const COHEAD=`
<div style="background:#fff;padding:4px 14px 2px;text-align:center;border-bottom:2px solid var(--ink-050);font-family:Tahoma,Arial,sans-serif">
  <table style="margin:0 auto 4px;border-collapse:collapse;direction:ltr">
    <tr>
      <td style="padding:0 8px 0 0;vertical-align:middle">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="7" fill="var(--wheat)"/>
          <line x1="16" y1="1" x2="16" y2="5" stroke="var(--wheat)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="16" y1="27" x2="16" y2="31" stroke="var(--wheat)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="1" y1="16" x2="5" y2="16" stroke="var(--wheat)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="27" y1="16" x2="31" y2="16" stroke="var(--wheat)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="5.05" y1="5.05" x2="7.88" y2="7.88" stroke="var(--wheat)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="24.12" y1="24.12" x2="26.95" y2="26.95" stroke="var(--wheat)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="26.95" y1="5.05" x2="24.12" y2="7.88" stroke="var(--wheat)" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="7.88" y1="24.12" x2="5.05" y2="26.95" stroke="var(--wheat)" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </td>
      <td style="padding:0;vertical-align:middle;direction:rtl">
        <span style="font-size:26px;font-weight:900;color:var(--ink-050);font-family:Arial,Helvetica,sans-serif;white-space:nowrap">ميزان الشمس</span>
      </td>
    </tr>
  </table>
  <div style="font-size:10px;color:var(--paper-4);margin-top:0;font-weight:600;line-height:1.3;font-family:Arial,Helvetica,sans-serif;direction:rtl">لوزن كافة الشاحنات الخفيفة والثقيلة بدقة عالية &mdash; بدقة ١ كغم</div>
  <div style="display:inline-block;background:var(--wheat);color:#fff;font-size:9px;font-weight:700;padding:3px 12px;border-radius:20px;margin-top:2px;font-family:Arial,Helvetica,sans-serif;direction:rtl">حاصل على شهادة الجهاز المركزي لتقييس والسيطرة النوعية</div>
</div>
<div style="height:2px;background:var(--wheat)"></div>`;

const COFTR=`
<div style="background:var(--paper);border-top:1px solid var(--paper);padding:3px 12px;text-align:center;font-family:Arial,Helvetica,sans-serif;direction:rtl">
  <div style="font-size:11px;font-weight:700;color:var(--ink-050);margin-bottom:1px;font-family:Tahoma,Arial,sans-serif">بإدارة أبو إبراهيم &mdash; ميزان الشمس</div>
  <div style="font-size:10px;color:var(--paper-4);line-height:1.4;font-family:Tahoma,Arial,sans-serif">
    بغداد &mdash; أبي غريب &mdash; منطقة الزيدان<br/>
    أبو إبراهيم: ٠٧٥٠٢٨٣١٢٠٠ &mdash; ٠٧٧٢٤٢٥٦٦٣٢<br/>
    بركات: ٠٧٨١٥٥٧٧٥٩٥ &mdash; ٠٧٥٠٠٨٧٣٧٣٢
  </div>
  <div style="font-size:9px;color:var(--paper-2);margin-top:1px;font-style:italic;font-family:Tahoma,Arial,sans-serif">ملاحظة: حاصل على شهادة الجهاز المركزي لتقييس والسيطرة النوعية</div>
</div>`;

function buildReceipt(r){
  const isW=r.status!=="weighed";
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;
  const matInfo=MAT[r.mat]||{label:r.mat||"—",icon:"📦"};
  let b=sec("معلومات الوصل");
  b+=row("📅 التاريخ",tAr(r.dk));
  b+=row("الحالة",SL[r.status]||r.status);
  if(r.paid) b+=row("حالة الدفع","✅ مدفوع كامل");
  else if((r.paidTotal||0)>0) b+=row("حالة الدفع","💰 جزئي — مدفوع: "+fIQD(r.paidTotal)+" | متبقي: "+fIQD(getRemaining(r)));
  if(!r.paid&&!(r.paidTotal>0)&&r.status==="weighed") b+=row("حالة الدفع","⏳ غير مدفوع");
  b+=row(whFieldLbl(r.wh),whIcon(r.wh)+" "+whName(r.wh));
  if(r.edited) b+=row("ملاحظة","✏️ تم تعديل هذا الوصل");
  if(r.note) b+=row("📝 ملاحظة",r.note);
  b+=sec("بيانات السيارة");
  b+=row("الفلاح / رقم العجلة",r.driver+" — "+r.plate);
  b+=prRowRaw("نوع الحمولة",matInfo.icon+" "+esc(matInfo.label));
  b+=sec("مراحل الوزن");
  b+=row("① الوزن الكلي (محمل)",fKG(r.gross));
  b+=row("② الوزن الفارغ",isW?"— في الانتظار —":fKG(r.empty));
  b+=row("③ الوزن الصافي",isW?"— في الانتظار —":fKG(r.net));
  b+=sec("الأجور والمبالغ");
  b+=row("سعر الكغم",r.ppkg?fIQD(r.ppkg):"— لم يُحدد بعد —");
  if(!isW){
    b+=row("أجور الوزن",fIQD(r.wFee));
    if(r.kOn){b+=row("نوع الكبس / عدد الكبسات",(r.kType||"")+" / "+AR(r.kC)+" كبسة");b+=row("أجور الكبس (مطروحة)","− "+fIQD(r.kabsFee));}
    if(r.nOn){
      const naqlEntries=getNaqlEntries(r);
      if(naqlEntries.length>1){
        naqlEntries.forEach((en,idx)=>{
          if(en.transporter)b+=row("الناقل #"+(idx+1),en.transporter);
          b+=row("نقل/كبسة #"+(idx+1)+(r.nDeduct===false?" (لحساب الناقل فقط)":""),AR(en.nC)+" كبسة × "+fIQD(en.nUP));
        });
      }else if(naqlEntries.length===1){
        const en=naqlEntries[0];
        if(en.transporter)b+=row("الناقل",en.transporter);
        b+=row("نقل/كبسة"+(r.nDeduct===false?" (لحساب الناقل فقط)":""),AR(en.nC)+" كبسة × "+fIQD(en.nUP));
      }
    }
    if(r.wOn)b+=row("سعر الوصل (مطروح)",fIQD(r.wPrice));
  }else{
    if(r.kOn){b+=row("نوع الكبس / عدد الكبسات",(r.kType||"")+" / "+AR(r.kC)+" كبسة");b+=row("أجور الكبس",fIQD(r.kabsFee));}
    if(r.nOn){
      const naqlEntries=getNaqlEntries(r);
      if(naqlEntries.length>1){
        naqlEntries.forEach((en,idx)=>{
          if(en.transporter)b+=row("الناقل #"+(idx+1),en.transporter);
          b+=row("نقل/كبسة #"+(idx+1),AR(en.nC)+" كبسة × "+fIQD(en.nUP));
        });
      }else if(naqlEntries.length===1){
        const en=naqlEntries[0];
        if(en.transporter)b+=row("الناقل",en.transporter);
        b+=row("نقل/كبسة"+(r.nDeduct===false?" (لحساب الناقل فقط)":""),AR(en.nC)+" كبسة × "+fIQD(en.nUP));
      }
    }
    if(r.wOn)b+=row("سعر الوصل (مطروح)",fIQD(r.wPrice));
  }
  const paidBanner=r.paid&&!isW?`<div style="background:#EAF2EB;border:1.5px solid #3F7A4C;border-radius:5px;padding:5px 12px;margin:5px 0;text-align:center;color:#3F7A4C;font-weight:900;font-size:11px;">✅ تم استلام الدفع — ${r.paidBy||""}</div>`:"";
  const paySection=!isW?buildPaymentsSection(r):"";
  const tot=!isW?`${paidBanner}${paySection}<div class="prtot"><span class="pk">المبلغ النهائي</span><span class="pv">${fIQD(r.final)}</span></div>`:"";
  const wb2=isW?`<div class="prwb">⏳ ${r.status==="waiting"?"بانتظار تأكيد المخزن":"بانتظار الوزن الفارغ"}</div>`:"";
  const d=new Date();const p2=x=>String(x).padStart(2,"0");
  return`${COHEAD}
    <div class="prh">
      <div class="prhtl">وصل شراء</div>
      <div class="prhmt">${tAr(toDay())}<br/>${tAr(p2(d.getHours())+":"+p2(d.getMinutes()))}</div>
    </div>
    ${wb2}<div class="prb">${b}</div>${tot}${COFTR}`;
}

function openPrint(id){
  const r=S.recs.find(x=>x.id===id);if(!r)return;
  _printHTML=buildReceipt(r);
  _currentRecId=id;
  _isCollScreen=false;
  const label=`🚛 ${esc(r.plate)} — ${tAr(r.dk||toDay())}`;
  document.getElementById("pactTitle").textContent=label;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  // push history state حتى يعمل Back button بشكل صحيح
  try{history.pushState({page:"app"},"","");}catch(e){}
}
function closePrint(){
  document.getElementById("PS").classList.remove("active");
  hideLoader();
  _isCollScreen=false;
  _currentCollBase=null;      // v17.48 — لا يتسرّب تاريخ شاشة سابقة إلى تصدير لاحق
}

/* ══════════════════════════════════════════════════════
   سجل جامع — محصلة موحّدة لكل شخص، منفصلة لكل قسم
   ─────────────────────────────────────────
   كل قسم (شراء/بيع/ضمانات) له سجله الجامع الخاص به فقط
   يُجمّع نفس الشخص إذا تكرر بنفس القسم (بحث ذكي يتجاهل
   فروقات الكتابة البسيطة) مع جمع عدد وصولاته وأوزانه ومبالغه
══════════════════════════════════════════════════════ */
const _jamiPeriod={buy:"daily",sell:"daily",dam:"daily",arb:"daily"};
const _jamiTitle={buy:"الشراء",sell:"البيع",dam:"الضمانات"};
const _jamiColor={buy:"var(--wheat)",sell:"var(--settled)",dam:"var(--steel)"};
const _jamiNameLabel={buy:"اسم الفلاح",sell:"اسم الفلاح",dam:"اسم المضمون"};
const _jamiPersonLabel={buy:"الفلاحين",sell:"الفلاحين",dam:"المضمونين"};

function _jamiInPeriod(dk,period,base){
  if(!dk)return false;
  if(period==="daily")return dk===base;
  if(period==="weekly"){
    // v17.6 — كان rd=new Date(dk) يُفسَّر UTC بينما sow/eow محليان،
    // فيقع الأحد بعد نهاية الأسبوع بفارق المنطقة ويسقط من الحساب.
    const bd=_D(base), rd=_D(dk);
    const sow=_D(bd);sow.setDate(bd.getDate()-((bd.getDay()+6)%7));
    const eow=_D(sow);eow.setDate(sow.getDate()+6);
    return rd>=sow&&rd<=eow;
  }
  if(period==="monthly")return dk.slice(0,7)===base.slice(0,7);
  return false;
}

function _jamiInRange(dk,from,to){
  if(!dk)return false;
  if(!from&&!to)return true;
  if(from&&dk<from)return false;
  if(to&&dk>to)return false;
  return true;
}

/* إذا كان الاسم يحتوي على "+" نأخذ فقط الجزء الذي قبله
   مثال: "علاءحسين+ابو فهد" ← "علاءحسين" — لضمان تجميع كل الأسماء المتشابهة معاً */
/* ══════════════════════════════════════════════════════
   تنظيف اسم السجل الجامع — v17.8
   الوصولات المشتركة تُكتب بصيغ شتّى:
     "مرتضى سعد+ابو عباس"  ·  "ابو خطاب الى سفان"
     "حمدان / محمود"       ·  "علي & حسن"
   نأخذ الاسم الأول فقط قبل أول فاصل.
   الفواصل الكلمية تُطابَق ككلمة مستقلة لا كجزء من اسم،
   وإلا لانقطع اسم مثل "عبد العالى" عند "الى" داخله.
══════════════════════════════════════════════════════ */
const _JAMI_SYMS=/[+\/\\&|،,؛;]/;
const _JAMI_WORDS=/(^|\s)(الى|إلى|إلي|مع|و\/|أو)(\s|$)/;
function _jamiCleanName(name){
  if(!name)return name;
  const t=String(name);
  let cut=-1;
  const mS=t.search(_JAMI_SYMS);
  if(mS!==-1)cut=mS;
  const mW=_JAMI_WORDS.exec(t);
  if(mW){
    // موضع الكلمة الفاصلة نفسها (بعد المسافة السابقة إن وُجدت)
    const at=mW.index+(mW[1]?mW[1].length:0);
    if(cut===-1||at<cut)cut=at;
  }
  if(cut===-1)return t.trim();
  const before=t.slice(0,cut).trim();
  if(before)return before;
  // بدأ الاسم بفاصل — خذ ما بعده بدل ترك الخانة فارغة
  return t.slice(cut).replace(_JAMI_SYMS,"").replace(_JAMI_WORDS,"").trim()||t.trim();
}

/* يجمع الإدخالات مع مرجع كل وصل، ويسجّل المستبعدات وسببها
   حتى لا يختفي أي وصل بصمت — هذا أساس لوحة التدقيق. */
function _jamiCollectEntries(type,dateMatcher,audit){
  let entries=[];
  const skip=(r,why,who)=>{if(audit)audit.skipped.push({id:r.id,dk:r.dk||"",who:who||"",why});};
  const add=(r,name,net,amount,paid,kind)=>{
    entries.push({name:_jamiCleanName(name)||"(بدون اسم)",rawName:(name||"").trim(),
      net:net||0,amount:amount||0,paid:paid||0,
      id:r.id,dk:r.dk||"",kind:kind||type,plate:r.plate||"",ref:r});
  };

  if(type==="buy"){
    (S.recs||[]).forEach(r=>{
      if(r.status!=="weighed"){skip(r,"لم يُستكمل وزنه",r.driver);return;}
      if(!dateMatcher(r.dk)){return;}
      add(r,r.driver,r.net,r.final,getPaidTotal(r),"buy");
    });
  }else if(type==="sell"){
    (SELL_RECS||[]).forEach(r=>{
      if(r.status!=="weighed"){skip(r,"لم يُستكمل وزنه",r.driver);return;}
      if(!dateMatcher(r.dk)){return;}
      add(r,r.driver,r.net,r.final,getPaidTotal(r),"sell");
    });
  }else if(type==="dam"){
    (DAM_RECS||[]).forEach(dam=>{
      if(dateMatcher(dam.dk)) add(dam,dam.madmun,0,dam.price,getPaidTotal(dam),"dam");
      // الوصولات الفرعية ذمم على المضمون نفسه وتُدفع منفصلة —
      // كانت غائبة كلياً عن السجل الجامع قبل v17.6
      const subs=dam.subRecs?Object.values(dam.subRecs):[];
      subs.forEach(sub=>{
        const sdk=sub.dk||dam.dk;
        if(!dateMatcher(sdk))return;
        entries.push({name:_jamiCleanName(dam.madmun)||"(بدون اسم)",rawName:(dam.madmun||"").trim(),
          net:0,amount:sub.amount||0,paid:getPaidTotal(sub),
          id:sub.id,dk:sdk,kind:"dam-sub",plate:sub.plate||"",ref:sub,parentId:dam.id});
      });
    });
  }
  return entries;
}

function _jamiAggregate(entries){
  // التجميع حسب مفتاح الاسم القانوني، مع حفظ الوصولات والصيغ للتدقيق
  const map={};
  entries.forEach(e=>{
    const key=nameKey(e.name)||"_بدون_اسم_";
    if(!map[key])map[key]={key,variants:{},rawVariants:{},items:[],count:0,net:0,amount:0,paid:0};
    const m=map[key];
    // v17.7 — الاسم المعروض يُختار من الصيغ المنظّفة (ما قبل "+" فقط).
    // كان يُختار من rawName فيظهر "مرتضى سعد+ابو عباس" في السجل.
    m.variants[e.name]=(m.variants[e.name]||0)+1;
    if(e.rawName)m.rawVariants[e.rawName]=(m.rawVariants[e.rawName]||0)+1;
    m.items.push(e);
    m.count++;m.net+=e.net;m.amount+=e.amount;m.paid+=e.paid;
  });

  const result=Object.values(map).map(m=>{
    let bestName="",bestCount=-1;
    Object.entries(m.variants).forEach(([nm,c])=>{if(c>bestCount){bestCount=c;bestName=nm;}});
    const remaining=Math.max(0,m.amount-m.paid);
    const avgTon=m.net>0?Math.round(m.amount/(m.net/1000)):0;
    return{key:m.key,name:bestName||"(بدون اسم)",count:m.count,net:m.net,amount:m.amount,
      paid:m.paid,remaining,avgTon,
      variants:Object.keys(m.variants),
      rawVariants:Object.keys(m.rawVariants),
      items:m.items.slice().sort((a,b)=>(a.dk||"").localeCompare(b.dk||""))};
  });
  // v17.8 — الترتيب من الأعلى وزناً إلى الأقل. الضمانات بلا وزن فتُرتَّب بالمبلغ.
  result.sort((a,b)=>(b.net-a.net)||(b.amount-a.amount));
  return result;
}

function getJamiData(type,period,baseDate,audit){
  const base=baseDate||toDay();
  const entries=_jamiCollectEntries(type,dk=>_jamiInPeriod(dk,period,base),audit);
  if(audit)audit.entries=entries;
  return _jamiAggregate(entries);
}

function getJamiDataRange(type,from,to){
  const entries=_jamiCollectEntries(type,dk=>_jamiInRange(dk,from,to));
  return _jamiAggregate(entries);
}

function sJamiPeriod(type,p,btn){
  _jamiPeriod[type]=p;
  document.querySelectorAll(`#tc-jami-${type} .ptb`).forEach(b=>b.classList.remove("active"));
  btn.classList.add("active");
  renderJami(type);
}

// ── محصلة نطاق التاريخ المخصص للسجل الجامع ──
function openJamiRange(type){
  const{from,to}=getDRP("jami_"+type);
  if(!from&&!to){showToast("⚠ اختر تاريخ البداية أو النهاية");return;}
  const srch=(document.getElementById(`jamiSearch_${type}`)?.value||"").trim();
  let data=getJamiDataRange(type,from,to);
  if(srch)data=data.filter(x=>smartMatch(x.name,srch));
  const label=(from?tAr(from):"البداية")+" → "+(to?tAr(to):"النهاية");
  const html=buildJamiHTML(type,data,"بنطاق مخصص",label);
  _printHTML=html;_isCollScreen=true;_currentCollPeriod="range";_currentCollWH="jami-"+type;
  document.getElementById("pactTitle").textContent=`📒 سجل جامع ${_jamiTitle[type]||""} — ${label}`;
  document.getElementById("PC").innerHTML=html;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  const r=document.getElementById("drp_result_jami_"+type);
  if(r)r.textContent=`✅ ${AR(data.length)} شخص في هذه الفترة`;
}

function _getJamiFiltered(type){
  const base=document.getElementById(`jamiDt_${type}`)?.value||toDay();
  const srch=(document.getElementById(`jamiSearch_${type}`)?.value||"").trim();
  const audit={skipped:[],entries:[]};
  let data=getJamiData(type,_jamiPeriod[type],base,audit);
  const all=data;
  if(srch)data=data.filter(x=>smartMatch(x.name,srch));
  return{data,base,audit,all,filtered:!!srch};
}

function renderJami(type){
  if(!S.cu)return;
  const{data,audit,all,filtered}=_getJamiFiltered(type);
  window._jamiLast=window._jamiLast||{};
  window._jamiLast[type]={data,audit,all,filtered};
  const fEl=document.getElementById(`jamiFSm_${type}`);
  const tEl=document.getElementById(`jamiTable_${type}`);
  if(!tEl)return;
  const nameLbl=_jamiNameLabel[type]||"اسم الفلاح";
  const hasWeight=type!=="dam";
  if(!data.length){
    tEl.innerHTML=`<div style="text-align:center;color:var(--paper-3);padding:28px;font-size:13px">📭 لا توجد بيانات لهذه الفترة</div>`;
    if(fEl)fEl.innerHTML="";
    return;
  }
  const tCount=data.reduce((s,x)=>s+x.count,0);
  const tNet=data.reduce((s,x)=>s+x.net,0);
  const tAmount=data.reduce((s,x)=>s+x.amount,0);
  const tPaid=data.reduce((s,x)=>s+x.paid,0);
  const tRem=tAmount-tPaid;
  if(fEl)fEl.innerHTML=
    `<span>عدد الأشخاص: <strong>${AR(data.length)}</strong></span>
     <span>إجمالي الوصولات: <strong>${AR(tCount)}</strong></span>
     ${hasWeight?`<span>الوزن الصافي: <strong>${fKG(tNet)}</strong></span>`:""}
     <span>المجموع: <strong>${fIQD(tAmount)}</strong></span>
     <span style="color:var(--settled)">المدفوع: <strong>${fIQD(tPaid)}</strong></span>
     <span style="color:var(--owing)">المتبقي: <strong>${fIQD(tRem)}</strong></span>`;
  const nCols=hasWeight?8:6;
  const rows=data.map((x,i)=>{
    const multi=(x.variants||[]).length>1;
    return`<tr onclick="toggleJamiRow('${type}',${i})" style="cursor:pointer">
    <td>${AR(i+1)}</td>
    <td style="font-weight:700">${esc(x.name)}${multi?` <span title="دُمجت ${AR(x.variants.length)} صيغة للاسم" style="color:var(--pending);font-size:10px">⚯${AR(x.variants.length)}</span>`:""} <span id="jchev_${type}_${i}" style="color:var(--paper-4);font-size:9px">▾</span></td>
    <td>${AR(x.count)}</td>
    ${hasWeight?`<td>${fKG(x.net)}</td>`:""}
    <td style="font-weight:900;color:var(--wheat-hi)">${fIQD(x.amount)}</td>
    <td style="color:var(--settled)">${fIQD(x.paid)}</td>
    <td style="color:${x.remaining>0?"var(--owing)":"var(--settled)"}">${fIQD(x.remaining)}</td>
    ${hasWeight?`<td>${fIQD(x.avgTon)}</td>`:""}
  </tr>
  <tr id="jdet_${type}_${i}" style="display:none"><td colspan="${nCols}" style="padding:0;background:var(--ink-200)"></td></tr>`;}).join("");
  tEl.innerHTML=`<table class="rtbl"><thead><tr>
    <th>#</th><th>${nameLbl}</th><th>عدد الوصولات</th>${hasWeight?"<th>الوزن الصافي</th>":""}
    <th>المبلغ الكلي</th><th>المدفوع</th><th>المتبقي</th>${hasWeight?"<th>معدل سعر الطن</th>":""}
  </tr></thead><tbody>${rows}</tbody>
  <tfoot><tr class="tot">
    <td colspan="2">الإجمالي (${AR(data.length)} شخص)</td>
    <td>${AR(tCount)}</td>${hasWeight?`<td>${fKG(tNet)}</td>`:""}<td>${fIQD(tAmount)}</td>
    <td>${fIQD(tPaid)}</td><td>${fIQD(tRem)}</td>${hasWeight?"<td>—</td>":""}
  </tr></tfoot></table>`+_jamiAuditHTML(type);
}

/* ══════════════════════════════════════════════════════
   لوحة التدقيق — v17.6
   تُعيد حساب المجاميع من الوصولات الخام مباشرة وتقارنها
   بما يعرضه الجدول. أي فرق يظهر بالأحمر فوراً.
══════════════════════════════════════════════════════ */
function _jamiAuditHTML(type){
  const L=(window._jamiLast||{})[type];
  if(!L)return"";
  const {audit,all,filtered}=L;
  const src=audit.entries||[];
  // إعادة حساب مستقلة من الإدخالات الخام
  const rawCount=src.length;
  const rawAmount=src.reduce((s,e)=>s+(e.amount||0),0);
  const rawPaid=src.reduce((s,e)=>s+(e.paid||0),0);
  const rawNet=src.reduce((s,e)=>s+(e.net||0),0);
  // ما يعرضه الجدول (كل الأشخاص قبل بحث الاسم)
  const aggCount=all.reduce((s,x)=>s+x.count,0);
  const aggAmount=all.reduce((s,x)=>s+x.amount,0);
  const aggPaid=all.reduce((s,x)=>s+x.paid,0);
  const aggNet=all.reduce((s,x)=>s+x.net,0);
  const ok=(a,b)=>a===b;
  const line=(lbl,a,b,fmt)=>{
    const good=ok(a,b);
    return`<div style="display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--rule);font-size:11px">
      <span style="color:var(--paper-3)">${lbl}</span>
      <span style="color:${good?"var(--settled)":"var(--owing)"};font-weight:700">
        ${fmt(a)} ${good?"✅":"≠ "+fmt(b)+" ❌"}
      </span></div>`;};
  const allOK=ok(rawCount,aggCount)&&ok(rawAmount,aggAmount)&&ok(rawPaid,aggPaid)&&ok(rawNet,aggNet);
  const merged=all.filter(x=>(x.variants||[]).length>1);
  // وصولات كُتب اسمها بصيغة مشتركة "فلان+فلان" وحُسبت على الأول
  const joint=all.filter(x=>(x.rawVariants||[]).some(v=>v.indexOf("+")!==-1));
  const skipped=audit.skipped||[];

  return`
  <div style="margin-top:12px;background:var(--ink-100);border:1px solid ${allOK?"var(--settled-rule)":"var(--owing)"};border-radius:var(--r-lg);overflow:hidden">
    <div onclick="toggleJamiAudit('${type}')" style="cursor:pointer;padding:10px 13px;background:${allOK?"var(--settled-wash)":"var(--owing-wash)"};display:flex;justify-content:space-between;align-items:center;gap:8px">
      <strong style="font-size:12px;color:${allOK?"var(--settled)":"var(--owing)"}">
        ${allOK?"✅ تدقيق مطابق — المجاميع تساوي مجموع الوصولات":"❌ تحذير: المجاميع لا تطابق المصدر"}
      </strong>
      <span id="jaudchev_${type}" style="font-size:12px;color:var(--paper-3)">▾</span>
    </div>
    <div id="jaud_${type}" style="display:none;padding:11px 13px">
      <div style="font-size:10px;color:var(--paper-3);margin-bottom:7px;line-height:1.7">
        تُعاد الحسبة من الوصولات الخام مستقلةً عن الجدول، ثم تُقارَن. التطابق يعني أن لا وصل ضاع أو تكرّر في التجميع.
      </div>
      ${line("عدد الوصولات",rawCount,aggCount,AR)}
      ${type!=="dam"?line("الوزن الصافي",rawNet,aggNet,fKG):""}
      ${line("المبلغ الكلي",rawAmount,aggAmount,fIQD)}
      ${line("المدفوع",rawPaid,aggPaid,fIQD)}
      <div style="display:flex;justify-content:space-between;padding:5px 0;font-size:11px">
        <span style="color:var(--paper-3)">عدد الأشخاص بعد الدمج</span>
        <span style="color:var(--paper);font-weight:700">${AR(all.length)}</span>
      </div>
      ${filtered?`<div style="font-size:10px;color:var(--pending);margin-top:5px">⚠ الجدول مُرشَّح ببحث اسم — التدقيق يحسب كل الأشخاص لا المعروضين فقط.</div>`:""}

      ${joint.length?`<div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--rule)">
        <div style="font-size:11px;font-weight:700;color:var(--steel);margin-bottom:5px">➕ وصولات مشتركة (${AR(joint.length)})</div>
        <div style="font-size:10px;color:var(--paper-3);margin-bottom:6px">تُحسب على الاسم الأول قبل علامة "+" — وهذه صيغها الأصلية:</div>
        ${joint.slice(0,25).map(x=>`<div style="font-size:10px;color:var(--paper-2);padding:3px 0;border-bottom:1px solid var(--rule)">
          <strong style="color:var(--paper)">${esc(x.name)}</strong> ← ${esc(x.rawVariants.filter(v=>v.indexOf("+")!==-1).join("  ·  "))}</div>`).join("")}
      </div>`:""}

      ${merged.length?`<div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--rule)">
        <div style="font-size:11px;font-weight:700;color:var(--pending);margin-bottom:5px">⚯ أسماء دُمجت (${AR(merged.length)})</div>
        <div style="font-size:10px;color:var(--paper-3);margin-bottom:6px">تأكّد أنها فعلاً نفس الشخص:</div>
        ${merged.slice(0,25).map(x=>`<div style="font-size:10px;color:var(--paper-2);padding:3px 0;border-bottom:1px solid var(--rule)">${esc(x.variants.join("  ⟷  "))}</div>`).join("")}
      </div>`:""}

      ${skipped.length?`<div style="margin-top:10px;padding-top:9px;border-top:1px solid var(--rule)">
        <div style="font-size:11px;font-weight:700;color:var(--pending);margin-bottom:5px">⏳ وصولات مستبعدة (${AR(skipped.length)})</div>
        <div style="font-size:10px;color:var(--paper-3);margin-bottom:6px">غير مكتملة فلا تدخل الحساب — لا تختفي بصمت:</div>
        ${skipped.slice(0,25).map(x=>`<div style="font-size:10px;color:var(--paper-2);padding:3px 0;border-bottom:1px solid var(--rule);display:flex;justify-content:space-between;gap:6px">
          <span>${esc(x.who||"—")} · ${tAr(x.dk||"—")}</span><span style="color:var(--pending)">${esc(x.why)}</span></div>`).join("")}
      </div>`:""}
    </div>
  </div>`;
}

function toggleJamiAudit(type){
  const b=document.getElementById("jaud_"+type),c=document.getElementById("jaudchev_"+type);
  if(!b)return;
  const open=b.style.display!=="none";
  b.style.display=open?"none":"block";
  if(c)c.textContent=open?"▾":"▴";
}

/* فتح صف شخص: كل وصولاته التي كوّنت المجموع */
function toggleJamiRow(type,i){
  const L=(window._jamiLast||{})[type];
  if(!L)return;
  const x=L.data[i];
  const tr=document.getElementById(`jdet_${type}_${i}`);
  const chev=document.getElementById(`jchev_${type}_${i}`);
  if(!tr||!x)return;
  const open=tr.style.display!=="none";
  if(open){tr.style.display="none";if(chev)chev.textContent="▾";return;}
  const KIND={buy:"شراء",sell:"بيع",dam:"ضمانة","dam-sub":"وصل ضمانة"};
  const sum=x.items.reduce((s,e)=>s+e.amount,0);
  const rowsHTML=x.items.map(e=>`
    <div onclick="event.stopPropagation();gotoRecord('${e.kind==="dam-sub"?"dam":e.kind}','${e.kind==="dam-sub"?e.parentId:e.id}')"
      style="display:flex;justify-content:space-between;gap:8px;padding:6px 9px;border-bottom:1px solid var(--rule);font-size:10px;cursor:pointer">
      <span style="color:var(--paper-2);flex:1;min-width:0">
        ${tAr(e.dk||"—")} · ${esc(KIND[e.kind]||e.kind)}${e.plate?" · "+esc(e.plate):""}
        ${e.rawName&&e.rawName!==x.name?`<span style="color:var(--pending)"> (${esc(e.rawName)})</span>`:""}
      </span>
      <span style="white-space:nowrap">
        <span style="color:var(--paper);font-weight:700">${fIQD(e.amount)}</span>
        <span style="color:var(--settled)"> ${fIQD(e.paid)}</span>
      </span>
    </div>`).join("");
  tr.firstElementChild.innerHTML=`
    <div style="padding:8px 10px">
      <div style="font-size:10px;color:var(--paper-3);margin-bottom:5px">
        ${AR(x.items.length)} وصل${(x.variants||[]).length>1?` · دُمجت الصيغ: ${esc(x.variants.join(" ⟷ "))}`:""}
      </div>
      ${rowsHTML}
      <div style="display:flex;justify-content:space-between;padding:7px 9px;font-size:11px;font-weight:700;
           border-top:2px solid var(--wheat)">
        <span style="color:var(--paper-3)">مجموع البنود</span>
        <span style="color:${sum===x.amount?"var(--settled)":"var(--owing)"}">
          ${fIQD(sum)} ${sum===x.amount?"✅ يطابق":"❌ لا يطابق "+fIQD(x.amount)}
        </span>
      </div>
    </div>`;
  tr.style.display="table-row";
  if(chev)chev.textContent="▴";
}

function buildJamiHTML(type,data,period,dateLabel){
  const PL={daily:"اليومي",weekly:"الأسبوعي",monthly:"الشهري"};
  const col=_jamiColor[type]||"#B37D14";
  const nameLbl=_jamiNameLabel[type]||"اسم الفلاح";
  const personLbl=_jamiPersonLabel[type]||"الفلاحين";
  const hasWeight=type!=="dam";
  const tCount=data.reduce((s,x)=>s+x.count,0);
  const tNet=data.reduce((s,x)=>s+x.net,0);
  const tAmount=data.reduce((s,x)=>s+x.amount,0);
  const tPaid=data.reduce((s,x)=>s+x.paid,0);
  const tRem=tAmount-tPaid;
  const rows=data.map((x,i)=>`<tr>
    <td style="width:20px;text-align:center">${AR(i+1)}</td>
    <td style="width:95px;font-weight:700">${esc(x.name)}</td>
    <td style="width:48px;text-align:center">${AR(x.count)}</td>
    ${hasWeight?`<td style="width:62px;text-align:center">${fKG(x.net)}</td>`:""}
    <td style="width:75px;text-align:center;font-weight:700;color:#8A6218">${fIQD(x.amount)}</td>
    <td style="width:68px;text-align:center;color:#3F7A4C">${fIQD(x.paid)}</td>
    <td style="width:68px;text-align:center;color:#943A31">${fIQD(x.remaining)}</td>
    ${hasWeight?`<td style="width:62px;text-align:center">${fIQD(x.avgTon)}</td>`:""}
  </tr>`).join("");
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#2E2822;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:${col}">📒 سجل جامع ${_jamiTitle[type]||""} ${PL[period]||period} — محصلة ${personLbl}</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${dateLabel} | ${AR(data.length)} شخص</div>
    </div>
    ${!data.length?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد بيانات في هذه الفترة</div>`:`
    <div style="padding:0 6px 5px">
      <table class="coltbl" style="width:100%;table-layout:auto;font-size:9px">
        <thead><tr>
          <th style="width:20px">#</th><th style="width:95px">${nameLbl}</th><th style="width:48px">الوصولات</th>
          ${hasWeight?'<th style="width:62px">الصافي</th>':""}<th style="width:75px">المبلغ</th>
          <th style="width:68px">المدفوع</th><th style="width:68px">المتبقي</th>${hasWeight?'<th style="width:62px">سعر الطن</th>':""}
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot">
          <td colspan="2" style="font-weight:700;padding:5px 4px">المجموع</td>
          <td style="text-align:center">${AR(tCount)}</td>
          ${hasWeight?`<td style="text-align:center">${fKG(tNet)}</td>`:""}
          <td style="text-align:center;font-weight:700">${fIQD(tAmount)}</td>
          <td style="text-align:center">${fIQD(tPaid)}</td>
          <td style="text-align:center">${fIQD(tRem)}</td>
          ${hasWeight?"<td></td>":""}
        </tr></tfoot>
      </table>
    </div>
    <div style="background:#1A1714;padding:12px 14px;margin-top:4px">
      <div style="display:flex;gap:0;flex-wrap:wrap">
        ${(hasWeight?[["عدد الأشخاص",AR(data.length),col],["إجمالي الوصولات",AR(tCount),"#B37D14"],["الوزن الصافي",fKG(tNet),"#6B6151"],["المجموع",fIQD(tAmount),"#B37D14"],["المدفوع",fIQD(tPaid),"#4E8A5A"],["المتبقي",fIQD(tRem),"#A8453A"]]:[["عدد الأشخاص",AR(data.length),col],["إجمالي الوصولات",AR(tCount),"#B37D14"],["المجموع",fIQD(tAmount),"#B37D14"],["المدفوع",fIQD(tPaid),"#4E8A5A"],["المتبقي",fIQD(tRem),"#A8453A"]]).map(([k,v,c])=>`<div style="flex:1;min-width:85px;text-align:center;border-left:1px solid #2E2822;padding:8px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
      </div>
    </div>`}
    ${COFTR}
  </div>`;
}

function openJamiPrint(type){
  const{data,base}=_getJamiFiltered(type);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildJamiHTML(type,data,_jamiPeriod[type],tAr(base));
  _isCollScreen=true;_currentCollPeriod=_jamiPeriod[type];_currentCollWH="jami-"+type;
  document.getElementById("pactTitle").textContent=`📒 سجل جامع ${_jamiTitle[type]||""} ${PL[_jamiPeriod[type]]} — ${tAr(base)}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("📒 "+AR(data.length)+" شخص");
}
function doShareJami(type){
  const{data,base}=_getJamiFiltered(type);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const html=buildJamiHTML(type,data,_jamiPeriod[type],tAr(base));
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,`سجل_جامع_${_jamiTitle[type]||type}_${PL[_jamiPeriod[type]]}_${base}.html`);
}

