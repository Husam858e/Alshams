/* ══════════════════════════════════════════════════════════════
   تقارير الأداء — v17.62
   ──────────────────────────────────────────────────────────────
   التطبيق كان يعرف «كم لكل فلاح» و«كم في الصندوق»، ولا يعرف
   «هل ربحنا هذا الشهر، وكم مقارنةً بالذي قبله، ومن أكثر من
   نتعامل معه». هذه أسئلة القرار لا التشغيل.

   ⚠️ نموذج الربح — مكتوب صراحةً كي لا يُساء فهم الرقم:
     الإيراد  = وصولات البيع المكتملة (المستحقّ، لا المقبوض)
     التكاليف = الشراء + الصرفيات + أجور الأعمال + الرواتب
                + أجور النقل + الضمانات
     الربح    = الإيراد − التكاليف
   أي أنه ربح **استحقاق** لا ربح **نقد**: الوصل يُحتسب يوم
   تاريخه سواء قُبض أم لا. وهذا هو الصحيح لقياس الأداء —
   أما النقد فمكانه الخزينة.
   الأقسام المستبعَدة: مخزن أربيل (أوزان بلا مبالغ) والسلف
   وحركات العمال (ليست مصروفاً بل حركة على العامل).
══════════════════════════════════════════════════════════════ */
const _PERF_COST=["buy","srf","wrk","sal","naql","dam"];
const _PERF_REV =["sell"];

function _perfAmount(kind,r){
  if(kind==="naql")return r.naqlFee||0;
  if(kind==="sal") return r.finalNet||0;
  if(kind==="dam") return r.price||0;
  return r.final!=null?r.final:(r.amount||r.price||0);
}
function _perfRows(kind){
  if(kind==="naql")return _allNaqlFees();
  const d=(_DATASETS||[]).find(x=>x.k===kind);
  return d?(d.get()||[]):[];
}
/* هل يُحتسب هذا السجل؟ الشراء والبيع بعد اكتمال الوزن فقط */
function _perfCounts(kind,r){
  if(kind==="buy"||kind==="sell")return r.status==="weighed";
  return true;
}

/* مجاميع فترة واحدة */
function perfTotals(from,to){
  const inR=dk=>{const d=String(dk||"").slice(0,10);
    if(!d)return false; if(from&&d<from)return false; if(to&&d>to)return false; return true;};
  const out={rev:0,cost:0,profit:0,by:{},count:0,netKg:0};
  [..._PERF_REV,..._PERF_COST].forEach(k=>{
    let sum=0,n=0;
    _perfRows(k).forEach(r=>{
      if(!r||!inR(r.dk)||!_perfCounts(k,r))return;
      const a=_perfAmount(k,r); if(!a)return;
      sum+=a; n++;
      if(k==="sell"&&r.net)out.netKg+=r.net;
    });
    out.by[k]={sum,n};
    out.count+=n;
    if(_PERF_REV.includes(k))out.rev+=sum; else out.cost+=sum;
  });
  out.profit=out.rev-out.cost;
  out.margin=out.rev>0?(out.profit/out.rev*100):0;
  return out;
}

/* أكثر المتعاملين — لأي قسم، مجموعين بمفتاح الاسم القانوني */
function perfTop(kind,from,to,limit){
  const d=(_DATASETS||[]).find(x=>x.k===kind);
  const who=r=>(kind==="naql"?r.transporter:(d&&d.who?d.who(r):""))||"";
  const inR=dk=>{const x=String(dk||"").slice(0,10);
    if(!x)return false; if(from&&x<from)return false; if(to&&x>to)return false; return true;};
  const map={};
  _perfRows(kind).forEach(r=>{
    if(!r||!inR(r.dk)||!_perfCounts(kind,r))return;
    const nm=who(r); if(!nm)return;
    const k=nameKey(nm)||nm;
    const m=map[k]||(map[k]={name:nm,n:0,amt:0,kg:0,paid:0});
    m.n++; m.amt+=_perfAmount(kind,r);
    m.kg+=r.net||0;
    m.paid+=(kind==="naql")?(r.naqlPaid||0):getPaidTotal(r);
  });
  return Object.values(map).sort((a,b)=>b.amt-a.amt).slice(0,limit||10);
}

/* الأشهر الاثنا عشر الأخيرة — للمقارنة والمنحنى */
function perfMonths(n){
  n=n||12;
  const out=[],base=_D(toDay());
  for(let i=n-1;i>=0;i--){
    const d=new Date(base.getFullYear(),base.getMonth()-i,1);
    const from=_ds(d), to=_ds(new Date(d.getFullYear(),d.getMonth()+1,0));
    const t=perfTotals(from,to);
    out.push({mk:from.slice(0,7),label:_AR_MONTHS[d.getMonth()]+" "+AR(d.getFullYear()),
              from,to,...t});
  }
  return out;
}

/* ── منحنى الربح الشهري — سلسلة واحدة، لا وسيلة إيضاح ── */
function _perfChart(months){
  const pts=months.map(m=>m.profit);
  if(pts.length<2)return "";
  const W=560,H=140,PX=10,PY=16;
  const min=Math.min(...pts,0), max=Math.max(...pts,0);
  const span=(max-min)||1;
  const x=i=>PX+(i*(W-2*PX))/(pts.length-1);
  const y=v=>PY+(H-2*PY)*(1-(v-min)/span);
  const zeroY=(min<0&&max>0)?y(0):null;
  /* أعمدة رفيعة بفاصل سطحٍ بينها، ولونها يتبع الإشارة لا الترتيب */
  const bw=Math.max(4,Math.min(26,(W-2*PX)/pts.length-4));
  const bars=pts.map((v,i)=>{
    const y0=zeroY!==null?zeroY:y(min), y1=y(v);
    const top=Math.min(y0,y1), h=Math.max(1.5,Math.abs(y1-y0));
    return `<rect x="${(x(i)-bw/2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}"
      height="${h.toFixed(1)}" rx="3" fill="${v>=0?"var(--wheat)":"var(--owing)"}"><title>${
      esc(months[i].label)} — ${fIQD(v)}</title></rect>`;}).join("");
  return `<div style="background:var(--ink-100);border:1px solid var(--rule);border-radius:10px;
      padding:9px 10px 6px;margin-bottom:10px;overflow-x:auto">
    <div style="font-size:11px;font-weight:700;color:var(--paper-2);margin-bottom:5px">
      📊 الربح شهراً بشهر — آخر ${AR(pts.length)} أشهر</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none"
         role="img" aria-label="الربح الشهري">
      ${zeroY!==null?`<line x1="${PX}" y1="${zeroY.toFixed(1)}" x2="${W-PX}" y2="${zeroY.toFixed(1)}"
        stroke="var(--rule-hi)" stroke-width="1"/>`:""}
      ${bars}
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--paper-3)">
      <span>${esc(months[0].label)}</span><span>${esc(months[months.length-1].label)}</span>
    </div>
  </div>`;
}

let _perfRange={from:"",to:""};
function perfSetRange(kind){
  const t=_D(toDay());
  const set=(f,x)=>{_perfRange.from=f;_perfRange.to=x;
    const a=document.getElementById("perfFrom"),b=document.getElementById("perfTo");
    if(a)a.value=f; if(b)b.value=x;};
  if(kind==="month")set(_ds(new Date(t.getFullYear(),t.getMonth(),1)),toDay());
  else if(kind==="prev"){const d=new Date(t.getFullYear(),t.getMonth()-1,1);
    set(_ds(d),_ds(new Date(d.getFullYear(),d.getMonth()+1,0)));}
  else if(kind==="year")set(_ds(new Date(t.getFullYear(),0,1)),toDay());
  else if(kind==="all")set("",toDay());
  renderPerfTab();
}
function perfReadRange(){
  _perfRange.from=document.getElementById("perfFrom")?.value||"";
  _perfRange.to=document.getElementById("perfTo")?.value||toDay();
  renderPerfTab();
}

const _PERF_LBL={buy:"🛒 الشراء",sell:"💰 البيع",dam:"🤝 الضمانات",srf:"🧾 الصرفيات",
                 wrk:"🔧 أجور الأعمال",sal:"📋 الرواتب",naql:"🚚 أجور النقل"};

function renderPerfTab(){
  const box=document.getElementById("perfRes");
  if(!box)return;
  const from=_perfRange.from, to=_perfRange.to||toDay();
  const T=perfTotals(from,to);
  const months=perfMonths(12);
  const cur=months[months.length-1], prev=months[months.length-2];
  const delta=prev&&prev.profit!==0?((cur.profit-prev.profit)/Math.abs(prev.profit)*100):null;

  const costRows=_PERF_COST.map(k=>{
    const b=T.by[k]||{sum:0,n:0};
    const pct=T.cost>0?Math.round(b.sum/T.cost*100):0;
    return `<tr><td>${_PERF_LBL[k]}</td>
      <td style="text-align:center;color:var(--paper-3)">${AR(b.n)}</td>
      <td style="text-align:left;font-weight:700">${_cashNum(b.sum)}</td>
      <td style="text-align:left;color:var(--paper-3)">${AR(pct)}٪</td></tr>`;}).join("");

  box.innerHTML=`
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:9px">
      ${[["month","هذا الشهر"],["prev","الشهر الماضي"],["year","هذه السنة"],["all","من البداية"]]
        .map(([k,l])=>`<button class="btn bsm bgh" style="font-size:10px" onclick="perfSetRange('${k}')">${l}</button>`).join("")}
    </div>

    <div style="background:linear-gradient(180deg,var(--ink-200),var(--ink-100));
        border:1px solid ${T.profit<0?"var(--owing)":"var(--wheat)"};border-radius:12px;padding:12px;margin-bottom:10px">
      <div style="font-size:12px;color:var(--paper-2);margin-bottom:3px">
        ${T.profit<0?"📉 خسارة الفترة":"📈 ربح الفترة"}</div>
      <div style="font-size:26px;font-weight:800;color:${T.profit<0?"var(--owing)":"var(--wheat-hi)"}">${fIQD(T.profit)}</div>
      <div style="font-size:11px;color:var(--paper-3);margin-top:4px">
        الإيراد ${fIQD(T.rev)} − التكاليف ${fIQD(T.cost)}
        ${T.rev>0?` · هامش ${AR(Math.round(T.margin))}٪`:""}</div>
      ${delta!==null?`<div style="font-size:11px;margin-top:5px;color:${delta>=0?"var(--settled)":"var(--owing)"};font-weight:700">
        ${delta>=0?"▲":"▼"} ${AR(Math.abs(Math.round(delta)))}٪ مقارنةً بالشهر الماضي
        <span style="color:var(--paper-3);font-weight:400">(${fIQD(prev.profit)} ← ${fIQD(cur.profit)})</span></div>`:""}
    </div>

    ${_perfChart(months)}

    <div style="font-size:12px;font-weight:700;color:var(--paper-2);margin:11px 0 6px">🧾 تفصيل التكاليف</div>
    <div class="rtwrap"><table class="rtbl" style="width:100%;font-size:11px">
      <thead><tr><th>القسم</th><th>عدد</th>
        <th style="text-align:left">المبلغ</th><th style="text-align:left">النسبة</th></tr></thead>
      <tbody>${costRows}</tbody>
      <tfoot><tr style="font-weight:800;background:var(--ink-200)">
        <td>الإيراد (البيع)</td>
        <td style="text-align:center">${AR((T.by.sell||{}).n||0)}</td>
        <td style="text-align:left;color:var(--settled)">${_cashNum(T.rev)}</td><td></td>
      </tr></tfoot>
    </table></div>
    <div style="font-size:10px;color:var(--paper-4);margin-top:5px;line-height:1.6">
      ربح استحقاق لا نقد: الوصل يُحتسب بتاريخه سواء قُبض أم لا. للنقد انظر 💰 الخزينة.
    </div>

    ${["buy","sell","naql"].map(k=>{
      const top=perfTop(k,from,to,8);
      if(!top.length)return "";
      const mx=top[0].amt||1;
      return `<div style="font-size:12px;font-weight:700;color:var(--paper-2);margin:12px 0 6px">
          🏆 أكثر المتعاملين — ${_PERF_LBL[k]}</div>
        ${top.map((t,i)=>`<div style="margin-bottom:5px">
          <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px">
            <span style="color:var(--paper);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${AR(i+1)}. ${esc(t.name)} <span style="color:var(--paper-3)">· ${AR(t.n)}</span></span>
            <span style="font-weight:700;color:var(--wheat-hi);white-space:nowrap">${_cashNum(t.amt)}</span>
          </div>
          <div style="background:var(--ink-300);border-radius:3px;height:5px;margin-top:2px;overflow:hidden">
            <div style="width:${Math.max(2,Math.round(t.amt/mx*100))}%;height:100%;background:var(--wheat)"></div>
          </div>
        </div>`).join("")}`;}).join("")}`;
}

/* طباعة تقرير الأداء */
function openPerfPrint(){
  const from=_perfRange.from, to=_perfRange.to||toDay();
  const T=perfTotals(from,to);
  const months=perfMonths(6);
  const costRows=_PERF_COST.map(k=>{const b=T.by[k]||{sum:0,n:0};
    return `<tr><td>${esc(_PERF_LBL[k])}</td><td>${AR(b.n)}</td><td>${fIQD(b.sum)}</td></tr>`;}).join("");
  const mRows=months.map(m=>`<tr><td>${esc(m.label)}</td><td>${fIQD(m.rev)}</td>
    <td>${fIQD(m.cost)}</td><td>${fIQD(m.profit)}</td></tr>`).join("");
  _printHTML=`${COHEAD}
    <div class="prh"><div class="prhtl">📈 تقرير الأداء</div>
      <div class="prhmt">${tAr(from||"البداية")} ← ${tAr(to)}<br>${tAr(nowStr())}</div></div>
    <div class="prb">
      <div class="prr"><span class="prk">الإيراد (البيع)</span><span class="prv">${fIQD(T.rev)}</span></div>
      <div class="prr"><span class="prk">إجمالي التكاليف</span><span class="prv">${fIQD(T.cost)}</span></div>
    </div>
    <div class="prtot"><span class="pk">${T.profit<0?"الخسارة":"الربح"}</span><span class="pv">${fIQD(T.profit)}</span></div>
    <div class="psec">تفصيل التكاليف</div>
    <table class="coltbl"><thead><tr><th>القسم</th><th>عدد</th><th>المبلغ</th></tr></thead>
      <tbody>${costRows}</tbody></table>
    <div class="psec">آخر ٦ أشهر</div>
    <table class="coltbl"><thead><tr><th>الشهر</th><th>إيراد</th><th>تكاليف</th><th>الربح</th></tr></thead>
      <tbody>${mRows}</tbody></table>
    <div class="prb" style="margin-top:12px">
      <div class="prr"><span class="prk">المحاسب</span><span class="prv">........................</span></div>
      <div class="prr"><span class="prk">المدير</span><span class="prv">........................</span></div>
    </div>
    ${COFTR}`;
  _isCollScreen=false;_currentCollBase=null;
  document.getElementById("pactTitle").textContent="📈 تقرير الأداء";
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
}

function renderToolsTab(){
  renderAuthBox();
  renderBackupNudge();
  renderSnapshots();
  renderToolsStatus();
  renderTrash();
  toolsGlobalSearch();
}

