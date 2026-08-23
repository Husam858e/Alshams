/* ════════════════════════════════════════════
   COLLECTION REPORTS
════════════════════════════════════════════ */
/* ════════════════════════════════════════════
   COLLECTION FUNCTIONS
════════════════════════════════════════════ */
function getCollData(period, baseDate){
  const base = baseDate || toDay();
  const bd = _D(base);
  return S.recs.filter(r=>{
    if(!r.dk || r.status!=="weighed") return false;
    if(period==="daily")  return r.dk === base;
    if(period==="weekly"){
      const rd=_D(r.dk);
      const dayOfWeek = bd.getDay();
      const startOfWeek = _D(bd);
      startOfWeek.setDate(bd.getDate() - ((dayOfWeek+6)%7));
      const endOfWeek = _D(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return rd >= startOfWeek && rd <= endOfWeek;
    }
    if(period==="monthly") return r.dk.slice(0,7) === base.slice(0,7);
    return false;
  });
}
/* v17: حُذفت getPickerDate/openCollDate/doShareCollDate — كود ميت يشير لعناصر غير موجودة */
function buildWhSec(wRecs,wh){
  if(!wRecs.length)return"";
  const wNet=wRecs.reduce((s,r)=>s+r.net,0);
  const wFin=wRecs.reduce((s,r)=>s+r.final,0);
  const paidCount=wRecs.filter(r=>r.paid).length;
  const unpaidCount=wRecs.length-paidCount;
  const paidAmount=wRecs.reduce((s,r)=>s+getPaidTotal(r),0);
  const remaining=wFin-paidAmount;
  const avgTon=wNet>0?Math.round(wFin/(wNet/1000)):0;
  // إجمالي الكبسات لهذا المخزن
  const totalKabs=wRecs.reduce((s,r)=>s+(r.kOn?(r.kC||0):0),0);
  const rows=wRecs.map((r,i)=>`<tr>
    <td style="width:18px;text-align:center">${AR(i+1)}</td>
    <td style="width:60px">${tAr(r.dk)}</td>
    <td style="width:48px">${esc(r.plate)}</td>
    <td style="width:52px">${esc(r.driver)}</td>
    <td style="width:44px">${MAT[r.mat]?.label||r.mat}</td>
    <td style="width:38px;text-align:center;color:#5E6E7C;font-weight:700">${r.kOn&&r.kC>0?AR(r.kC)+'<span style="font-size:7px;color:#5E6E7C"> كبس</span>':'—'}</td>
    <td style="width:52px;text-align:center;font-weight:700">${fKG(r.net)}</td>
    <td style="width:50px;text-align:center;color:#3E4D5A">${r.ppkg?fIQD(r.ppkg):"—"}</td>
    <td style="width:62px;text-align:center;font-weight:700;color:#8A6218">${fIQD(r.final)}</td>
    <td style="width:60px;text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C;font-weight:700">✅ مكتمل</span>':getPaidTotal(r)>0?'<span style="color:#8A6218;font-weight:700">💰 '+fIQD(getPaidTotal(r))+'</span>':'<span style="color:#943A31">⏳</span>'}</td>
  </tr>`).join("");
  return`
    <div>
    <div class="col-wh-title">${whFull(wh)} — ${AR(wRecs.length)} وصل | مدفوع: ${AR(paidCount)} | غير مدفوع: ${AR(unpaidCount)}${totalKabs>0?` | 🔧 ${AR(totalKabs)} كبسة`:''}</div>
    </div>
    <div style="padding:0 6px 5px">
      <table class="coltbl" style="width:100%;table-layout:auto;font-size:9px">
        <thead><tr>
          <th style="width:18px">#</th><th style="width:60px">التاريخ</th><th style="width:48px">اللوحة</th>
          <th style="width:52px">الفلاح</th><th style="width:44px">المادة</th>
          <th style="width:38px;color:#8A9AA8">كبسات</th>
          <th style="width:52px">الصافي</th><th style="width:50px">سعر الكغم</th><th style="width:62px">المبلغ</th><th style="width:60px">المدفوع</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot">
          <td colspan="5" style="font-weight:700;padding:5px 4px">مجموع ${whTitle(wh)}</td>
          <td style="text-align:center;color:#8A9AA8">${totalKabs>0?AR(totalKabs)+'<span style="font-size:7px"> كبسة</span>':'—'}</td>
          <td style="text-align:center">${fKG(wNet)}</td>
          <td></td>
          <td style="text-align:center;font-weight:700">${fIQD(wFin)}</td>
          <td style="text-align:center;font-size:8px">${AR(paidCount)}/${AR(wRecs.length)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div class="col-wh-sum">
      ${[["المجموع",fIQD(wFin),"#B37D14"],["المدفوعات",fIQD(paidAmount),"#4E8A5A"],["الباقي",fIQD(remaining),"#A8453A"],["الصافي",fKG(wNet),"#6B6151"],["عدد الكبسات",totalKabs>0?AR(totalKabs)+" كبسة":"—","#5E6E7C"],["سعر الطن",fIQD(avgTon),"#4A5A68"]].map(([k,v,c])=>`<div><span class="ck">${k}</span><span class="cv" style="color:${c}">${v}</span></div>`).join("")}
    </div>`;
}
function buildCollHTML(data,period,wh,dateLabel){
  const PL={daily:"اليومية",weekly:"الأسبوعية",monthly:"الشهرية",range:"بنطاق مخصص"};
  const dl=dateLabel||tAr(toDay());
  const tNet=data.reduce((s,r)=>s+(r.net||0),0);
  const tFin=data.reduce((s,r)=>s+(r.final||0),0);
  const paidTotal=data.filter(r=>r.paid).length;
  const paidAmount=data.reduce((s,r)=>s+getPaidTotal(r),0);
  const remaining=tFin-paidAmount;
  const avgTon=tNet>0?Math.round(tFin/(tNet/1000)):0;
  const tKabs=data.reduce((s,r)=>s+(r.kOn?(r.kC||0):0),0);
  const whLabel=wh==="all"?"الساحة وجميع المخازن":whTitle(wh);
  const whsToShow=wh==="all"?WHS:[wh];
  const secs=whsToShow.map(w=>buildWhSec(data.filter(r=>r.wh===w),w)).join("");
  const grand=`<div class="grand" style="background:#1A1714;padding:12px 14px;margin-top:4px;page-break-before:always">
    <div style="color:#6B6151;font-size:11px;font-weight:700;margin-bottom:9px;text-align:center">📊 الإجمالي الشامل — ${whLabel}</div>
    <div style="display:flex;gap:0;flex-wrap:wrap">
      ${[["الوزن الصافي الكلي",fKG(tNet),"#B37D14"],["المجموع الكلي",fIQD(tFin),"#B37D14"],["المدفوعات",fIQD(paidAmount),"#4E8A5A"],["الباقي",fIQD(remaining),"#A8453A"],["إجمالي الكبسات",tKabs>0?AR(tKabs)+" كبسة":"—","#5E6E7C"],["معدل سعر الطن",fIQD(avgTon),"#4A5A68"]].map(([k,v,c])=>`<div style="flex:1;min-width:90px;text-align:center;border-left:1px solid #2E2822;padding:8px 5px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:4px">${k}</div><div style="font-size:13px;font-weight:700;color:${c}">${v}</div></div>`).join("")}
    </div>
    <div style="margin-top:8px;text-align:center;font-size:10px;color:#6B6151">
      ${AR(data.length)} وصل مكتمل | مدفوع: ${AR(paidTotal)} | غير مدفوع: ${AR(data.length-paidTotal)}
    </div>
  </div>`;
  return`<div style="background:#fff;font-family:Arial,Helvetica,sans-serif;direction:rtl">
    ${COHEAD}
    <div style="background:#2E2822;color:#fff;padding:9px 14px;text-align:center">
      <div style="font-size:14px;font-weight:700;color:#B37D14">المحصلة ${PL[period]||period} — ${whLabel}</div>
      <div style="font-size:10px;opacity:.8;margin-top:3px">${dl} | ${AR(data.length)} وصل مكتمل</div>
    </div>
    ${data.length===0?`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد وصلات مكتملة في هذه الفترة</div>`:`${secs}${grand}`}
    ${COFTR}
  </div>`;
}
function openColl(period,wh){
  wh=wh||"all";
  const base=toDay();
  const all=getCollData(period,base);
  const data=wh==="all"?all:all.filter(r=>r.wh===wh);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  _printHTML=buildCollHTML(data,period,wh,tAr(base));
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH=wh;
  document.getElementById("pactTitle").textContent=`💼 محصلة ${PL[period]||period} — ${wh==="all"?"الكل":wh}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("💼 "+AR(data.length)+" وصل مكتمل");
}
function doShareColl(period,wh){
  wh=wh||"all";
  const base=toDay();
  const data=getCollData(period,base).filter(r=>wh==="all"||r.wh===wh);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const html=buildCollHTML(data,period,wh,tAr(base));
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,`محصلة_${PL[period]}_${wh==="all"?"الكل":wh}_${base}.html`);
}
function doMakePDF_single(id){
  const r=S.recs.find(x=>x.id===id);if(!r)return;
  const html=buildReceipt(r);
  const fname=`وصل_${esc(r.plate)}_${r.dk||toDay()}.html`;
  const fullHTML=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`;
  // محاولة Bridge
  const br=getBridge();
  if(br){
    try{
      if(br.shareHtml){ br.shareHtml(fullHTML,fname); showToast("📤 جاري المشاركة..."); return; }
      if(br.shareText){ br.shareText(html,"ميزان الشمس - "+r.plate); showToast("📤 جاري المشاركة..."); return; }
    }catch(e){}
  }
  // محاولة Web Share
  try{
    if(navigator.share){
      navigator.share({title:"ميزان الشمس",text:"وصل "+r.plate+" — "+tAr(r.dk||toDay())})
        .then(function(){showToast("✅ تم الإرسال");})
        .catch(function(){_downloadHTML(fullHTML,fname);});
      return;
    }
  }catch(e){}
  _downloadHTML(fullHTML,fname);
}
function renderWhCollGrid(){
  const grid=document.getElementById("whCollGrid");
  if(!grid)return;
  /* الساحة أولاً كقسم مستقل، ثم المخازن الثلاثة */
  const box=wh=>`
    <div style="background:var(--ink-200);border-radius:12px;padding:13px;border:1px solid var(--rule)">
      <div style="font-size:14px;font-weight:700;color:var(--paper);margin-bottom:10px">${whFull(wh)}</div>
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:var(--wheat);font-weight:700;margin-bottom:5px">📅 يومية</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="date" id="wh_day_${wh}" style="flex:1;min-width:130px;padding:7px 9px;border-radius:8px;border:2px solid var(--rule);background:var(--ink-100);color:var(--paper);font-size:12px;outline:none" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
          <button class="btn bg bsm" onclick="openCollWH('daily','${wh}')">👁</button>
          <button class="btn bbl bsm" onclick="shareCollWH('daily','${wh}')">📤</button>
        </div>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:var(--wheat);font-weight:700;margin-bottom:5px">📅 أسبوعية</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="date" id="wh_week_${wh}" style="flex:1;min-width:130px;padding:7px 9px;border-radius:8px;border:2px solid var(--rule);background:var(--ink-100);color:var(--paper);font-size:12px;outline:none" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
          <button class="btn bor bsm" onclick="openCollWH('weekly','${wh}')">👁</button>
          <button class="btn bbl bsm" onclick="shareCollWH('weekly','${wh}')">📤</button>
        </div>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:var(--settled);font-weight:700;margin-bottom:5px">📅 شهرية</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <input type="month" id="wh_month_${wh}" style="flex:1;min-width:130px;padding:7px 9px;border-radius:8px;border:2px solid var(--rule);background:var(--ink-100);color:var(--paper);font-size:12px;outline:none" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
          <button class="btn bgn bsm" onclick="openCollWH('monthly','${wh}')">👁</button>
          <button class="btn bbl bsm" onclick="shareCollWH('monthly','${wh}')">📤</button>
        </div>
      </div>
      <div style="border-top:1px solid var(--rule);margin-top:9px;padding-top:9px">
        <div style="font-size:10px;color:var(--steel);font-weight:700;margin-bottom:6px">📆 نطاق تاريخ مخصص</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <div style="flex:1;min-width:110px">
            <label style="font-size:9px;color:var(--paper-3);font-weight:700;display:block;margin-bottom:3px">من تاريخ</label>
            <input type="date" id="wh_range_from_${wh}" style="width:100%;padding:7px 9px;border-radius:8px;border:2px solid #5b21b655;background:var(--ink-100);color:var(--paper);font-size:12px;outline:none" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
          </div>
          <div style="flex:1;min-width:110px">
            <label style="font-size:9px;color:var(--paper-3);font-weight:700;display:block;margin-bottom:3px">إلى تاريخ</label>
            <input type="date" id="wh_range_to_${wh}" style="width:100%;padding:7px 9px;border-radius:8px;border:2px solid #5b21b655;background:var(--ink-100);color:var(--paper);font-size:12px;outline:none" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
          <button class="btn bsm" style="background:var(--ink-300);color:var(--paper-2);font-size:10px" onclick="setWhRangePreset('${wh}','week')">أسبوع</button>
          <button class="btn bsm" style="background:var(--ink-300);color:var(--paper-2);font-size:10px" onclick="setWhRangePreset('${wh}','month')">شهر</button>
          <button class="btn bsm" style="background:var(--ink-300);color:var(--paper-2);font-size:10px" onclick="setWhRangePreset('${wh}','30')">٣٠ يوم</button>
          <button class="btn bsm bgh" onclick="clearWhRange('${wh}')">× مسح</button>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn bsm" style="background:var(--steel-rule);color:#fff;flex:1;justify-content:center;font-weight:700" onclick="openCollWHRange('${wh}')">👁 عرض النطاق</button>
          <button class="btn bbl bsm" onclick="shareCollWHRange('${wh}')">📤</button>
        </div>
        <div id="wh_range_result_${wh}" style="margin-top:6px;font-size:10px;color:var(--paper-3)"></div>
      </div>
    </div>`;
  const hdr=t=>`<div style="font-size:11px;font-weight:700;color:var(--paper-2);letter-spacing:.8px;padding:2px 2px 0">${t}</div>`;
  grid.innerHTML=hdr("🏟️ الساحة")+box(YARD)+hdr("🏭 المخازن")+WH_ONLY.map(box).join("");
}
function setWhRangePreset(wh,preset){
  const today=toDay();
  const d=_D(today);
  let from='',to=today;
  if(preset==='week'){const s=_D(d);s.setDate(d.getDate()-6);from=_ds(s);}
  else if(preset==='month'){const s=_D(d);s.setDate(1);from=_ds(s);}
  else if(preset==='30'){const s=_D(d);s.setDate(d.getDate()-29);from=_ds(s);}
  const fEl=document.getElementById('wh_range_from_'+wh);
  const tEl=document.getElementById('wh_range_to_'+wh);
  if(fEl)fEl.value=from;if(tEl)tEl.value=to;
}
function clearWhRange(wh){
  const fEl=document.getElementById('wh_range_from_'+wh);
  const tEl=document.getElementById('wh_range_to_'+wh);
  const rEl=document.getElementById('wh_range_result_'+wh);
  if(fEl)fEl.value='';if(tEl)tEl.value='';if(rEl)rEl.textContent='';
}
function _getWhRangeData(wh){
  const from=document.getElementById('wh_range_from_'+wh)?.value||'';
  const to=document.getElementById('wh_range_to_'+wh)?.value||'';
  const all=(S.recs||[]).filter(r=>r.status==="weighed"&&r.wh===wh);
  const data=filterByRange(all,from,to);
  return{from,to,data};
}
function openCollWHRange(wh){
  const{from,to,data}=_getWhRangeData(wh);
  if(!from&&!to){showToast('⚠ اختر تاريخ البداية أو النهاية');return;}
  const label=(from?tAr(from):'البداية')+' → '+(to?tAr(to):'النهاية');
  _printHTML=buildCollHTML(data,'range',wh,label);
  _isCollScreen=true;_currentCollPeriod='range';_currentCollWH=wh;
  document.getElementById("pactTitle").textContent=`💼 ${wh} — نطاق مخصص — ${label}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  const r=document.getElementById('wh_range_result_'+wh);
  if(r)r.textContent=`✅ ${AR(data.length)} وصل في هذه الفترة`;
  showToast('💼 '+wh+' — '+AR(data.length)+' وصل');
}
function shareCollWHRange(wh){
  const{from,to,data}=_getWhRangeData(wh);
  if(!from&&!to){showToast('⚠ اختر تاريخ البداية أو النهاية');return;}
  const label=(from?tAr(from):'البداية')+' → '+(to?tAr(to):'النهاية');
  const html=buildCollHTML(data,'range',wh,label);
  const fname=`محصلة_${wh}_نطاق_${from||'البداية'}_${to||'النهاية'}.html`;
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,fname);
  const r=document.getElementById('wh_range_result_'+wh);
  if(r)r.textContent=`✅ ${AR(data.length)} وصل في هذه الفترة`;
}
function openCollWH(period,wh){
  let base;
  if(period==="daily")   base=document.getElementById(`wh_day_${wh}`)?.value||toDay();
  if(period==="weekly")  base=document.getElementById(`wh_week_${wh}`)?.value||toDay();
  if(period==="monthly"){const v=document.getElementById(`wh_month_${wh}`)?.value;base=v?v+"-01":toDay();}
  const data=getCollData(period,base).filter(r=>r.wh===wh);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const dl=tAr(base);
  _printHTML=buildCollHTML(data,period,wh,dl);
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH=wh;
  document.getElementById("pactTitle").textContent=`💼 ${wh} — ${PL[period]} — ${dl}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("💼 "+wh+" — "+AR(data.length)+" وصل");
}
function shareCollWH(period,wh){
  let base;
  if(period==="daily")   base=document.getElementById(`wh_day_${wh}`)?.value||toDay();
  if(period==="weekly")  base=document.getElementById(`wh_week_${wh}`)?.value||toDay();
  if(period==="monthly"){const v=document.getElementById(`wh_month_${wh}`)?.value;base=v?v+"-01":toDay();}
  const data=getCollData(period,base).filter(r=>r.wh===wh);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const dl=tAr(base);
  const html=buildCollHTML(data,period,wh,dl);
  const fname=`محصلة_${wh}_${PL[period]}_${base}.html`;
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,fname);
}
/* ════════════════════════════════════════════
   سجل تاريخي — تبويبات المحصلة
════════════════════════════════════════════ */

// ── تبديل التبويبات الرئيسية ─────────────────
let _curCollTab = 1;
function showCollTab(n){
  _curCollTab = n;
  [1,2,3].forEach(i=>{
    const el = document.getElementById("ct"+i);
    if(el) el.style.display = i===n ? "block" : "none";
    const btn = document.getElementById("ctb"+i);
    if(btn){
      btn.style.background = i===n ? "var(--wheat)" : "transparent";
      btn.style.color      = i===n ? "#000"    : "var(--paper-3)";
    }
  });
  if(n===2) buildHistoryLists();
  if(n===3) renderWhCollGrid();
}

// ── نوع الفترة في السجل التاريخي ─────────────
let _histPeriod = "daily";
function setHistPeriod(p){
  _histPeriod = p;
  ["daily","weekly","monthly"].forEach(x=>{
    const panel = document.getElementById("hp"+x.charAt(0).toUpperCase()+x.slice(1));
    if(panel) panel.style.display = x===p ? "block" : "none";
  });
  const map={daily:1,weekly:2,monthly:3};
  [1,2,3].forEach(i=>{
    const btn = document.getElementById("hpb"+i);
    if(!btn) return;
    btn.style.background = i===map[p] ? "var(--wheat)" : "transparent";
    btn.style.color      = i===map[p] ? "#000"    : "var(--paper-3)";
  });
}

// ── بناء قوائم الأيام/الأسابيع/الأشهر المتاحة ─
function buildHistoryLists(){
  const done = S.recs.filter(r=>r.status==="weighed" && r.dk);

  // ─ أيام ─
  const days = [...new Set(done.map(r=>r.dk))].sort((a,b)=>b.localeCompare(a));
  const dayEl = document.getElementById("histDayList");
  if(dayEl){
    if(!days.length){
      dayEl.innerHTML=`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات بعد</span>`;
    } else {
      dayEl.innerHTML = days.map(d=>{
        const dayRecs = done.filter(r=>r.dk===d);
        const cnt = dayRecs.length;
        const st = _custPayState('buy',dayRecs);          // v17.40
        return `<button onclick="quickOpenDay('${d}')" title="${_payTitle(st)}"
          style="padding:6px 10px;border-radius:8px;border:1px solid ${st==="settled"?'var(--settled)':'var(--rule)'};background:${st==="settled"?'rgba(78,138,90,.12)':'var(--ink-100)'};color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px">
          <span style="font-size:10px;color:var(--wheat);font-weight:700">${tAr(d)}${_payMark(st)}</span>
          <span style="font-size:9px;color:var(--paper-3)">${AR(cnt)} وصل</span>
        </button>`;
      }).join("");
    }
  }

  // ─ أسابيع ─
  const weekMap = {};
  done.forEach(r=>{
    const bd = _D(r.dk);
    const dow = bd.getDay();
    const mon = _D(bd); mon.setDate(bd.getDate()-((dow+6)%7));
    const key = _ds(mon);
    weekMap[key] = (weekMap[key]||0)+1;
  });
  const weeks = Object.keys(weekMap).sort((a,b)=>b.localeCompare(a));
  const weekEl = document.getElementById("histWeekList");
  if(weekEl){
    if(!weeks.length){
      weekEl.innerHTML=`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات بعد</span>`;
    } else {
      weekEl.innerHTML = weeks.map(w=>{
        const endD = _D(w); endD.setDate(endD.getDate()+6);
        const endS = _ds(endD);
        return `<button onclick="quickOpenWeek('${w}')"
          style="padding:6px 10px;border-radius:8px;border:1px solid var(--rule);background:var(--ink-100);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:110px">
          <span style="font-size:10px;color:var(--wheat);font-weight:700">${tAr(w)} ← ${tAr(endS)}</span>
          <span style="font-size:9px;color:var(--paper-3)">${AR(weekMap[w])} وصل</span>
        </button>`;
      }).join("");
    }
  }

  // ─ أشهر ─
  const monthMap = {};
  done.forEach(r=>{
    const key = r.dk.slice(0,7);
    monthMap[key] = (monthMap[key]||0)+1;
  });
  const months = Object.keys(monthMap).sort((a,b)=>b.localeCompare(a));
  const monthEl = document.getElementById("histMonthList");
  if(monthEl){
    if(!months.length){
      monthEl.innerHTML=`<span style="color:var(--paper-4);font-size:11px">لا توجد بيانات بعد</span>`;
    } else {
      const mNames=["","يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
      monthEl.innerHTML = months.map(m=>{
        const [yr,mn] = m.split("-");
        return `<button onclick="quickOpenMonth('${m}')"
          style="padding:8px 12px;border-radius:8px;border:1px solid var(--rule);background:var(--ink-100);color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:90px">
          <span style="font-size:11px;color:var(--settled);font-weight:700">${mNames[+mn]||mn} ${tAr(yr)}</span>
          <span style="font-size:9px;color:var(--paper-3)">${AR(monthMap[m])} وصل</span>
        </button>`;
      }).join("");
    }
  }
}

// ── فتح محصلة سريع بالضغط على زر ─────────────
function quickOpenDay(date){
  document.getElementById("histDayPicker").value = date;
  openHistColl("daily");
}
function quickOpenWeek(startDate){
  document.getElementById("histWeekPicker").value = startDate;
  openHistColl("weekly");
}
function quickOpenMonth(ym){
  document.getElementById("histMonthPicker").value = ym;
  openHistColl("monthly");
}

// ── فتح / مشاركة المحصلة التاريخية ───────────
function _getHistBase(period){
  if(period==="daily"){
    const v=document.getElementById("histDayPicker")?.value;
    return v||toDay();
  }
  if(period==="weekly"){
    const v=document.getElementById("histWeekPicker")?.value;
    return v||toDay();
  }
  if(period==="monthly"){
    const v=document.getElementById("histMonthPicker")?.value;
    return v?v+"-01":toDay();
  }
  return toDay();
}
function openHistColl(period){
  const base=_getHistBase(period);
  const data=getCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const dl=tAr(base);
  _printHTML=buildCollHTML(data,period,"all",dl);
  _isCollScreen=true;_currentCollBase=(typeof base!=="undefined"&&base)?base:toDay();_currentCollPeriod=period;_currentCollWH="all";
  document.getElementById("pactTitle").textContent=`💼 محصلة ${PL[period]} — ${dl}`;
  document.getElementById("PC").innerHTML=_printHTML;
  document.getElementById("PS").classList.add("active");
  try{history.pushState({page:"app"},"","");}catch(e){}
  showToast("💼 "+AR(data.length)+" وصل — "+dl);
}
function shareHistColl(period){
  const base=_getHistBase(period);
  const data=getCollData(period,base);
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const dl=tAr(base);
  const html=buildCollHTML(data,period,"all",dl);
  const fname=`محصلة_${PL[period]}_${base}.html`;
  _downloadHTML(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>${getPDFCss()}</style></head><body>${html}</body></html>`,fname);
}

// ── تحديث القوائم عند تحميل البيانات ──────────
const _origSyncBar = syncBar;
// نعيد بناء القوائم كلما تُحدِّثت البيانات
function refreshHistIfOpen(){
  if(_curCollTab===2) buildHistoryLists();
}
function renderSellCollTab(){
  showSellCollTab(_curSellCollTab||1);
}

/* ════════════════════════════════════════════
   فلتر نطاق التاريخ (من → إلى) — مشترك لكل المحصلات
════════════════════════════════════════════ */

// فلتر سجلات بنطاق تاريخ
function filterByRange(recs,from,to){
  if(!from&&!to)return recs;
  return recs.filter(r=>{
    const dk=r.dk||'';if(!dk)return false;
    if(from&&dk<from)return false;
    if(to&&dk>to)return false;
    return true;
  });
}

// بناء HTML بطاقة نطاق التاريخ — قابلة للإدراج في أي تبويب
function dateRangePickerHTML(id,onApply,color){
  color=color||'var(--wheat)';
  return`<div id="drp_${id}" style="background:var(--ink-050);border:1px solid ${color}33;border-radius:12px;padding:11px 12px;margin-bottom:10px">
    <div style="font-size:11px;color:${color};font-weight:700;margin-bottom:8px">📅 تحديد نطاق تاريخ</div>
    <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
      <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px">
        <label style="font-size:9px;color:var(--paper-3);font-weight:700">من تاريخ</label>
        <input type="date" id="drp_from_${id}" style="padding:8px 10px;border-radius:8px;border:1px solid ${color}66;background:var(--ink-100);color:var(--paper);font-size:13px;outline:none;width:100%" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
      </div>
      <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:120px">
        <label style="font-size:9px;color:var(--paper-3);font-weight:700">إلى تاريخ</label>
        <input type="date" id="drp_to_${id}" style="padding:8px 10px;border-radius:8px;border:1px solid ${color}66;background:var(--ink-100);color:var(--paper);font-size:13px;outline:none;width:100%" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" data-form-type="other" data-lpignore="true" data-1p-ignore="true">
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="btn bsm" style="background:${color};color:#000;flex:1;justify-content:center;font-weight:700" onclick="${onApply}">👁 عرض النطاق</button>
      <button class="btn bsm bgh" style="flex:none" onclick="clearDRP('${id}')">× مسح</button>
      <!-- اختصارات سريعة -->
      <button class="btn bsm" style="background:var(--ink-300);color:var(--paper-2);font-size:10px" onclick="setDRPPreset('${id}','week')">أسبوع</button>
      <button class="btn bsm" style="background:var(--ink-300);color:var(--paper-2);font-size:10px" onclick="setDRPPreset('${id}','month')">شهر</button>
      <button class="btn bsm" style="background:var(--ink-300);color:var(--paper-2);font-size:10px" onclick="setDRPPreset('${id}','30')">٣٠ يوم</button>
    </div>
    <div id="drp_result_${id}" style="margin-top:6px;font-size:10px;color:var(--paper-3)"></div>
  </div>`;
}

function clearDRP(id){
  const f=document.getElementById('drp_from_'+id);
  const t=document.getElementById('drp_to_'+id);
  const r=document.getElementById('drp_result_'+id);
  if(f)f.value='';if(t)t.value='';if(r)r.textContent='';
}

function setDRPPreset(id,preset){
  const today=toDay();
  const d=_D(today);
  let from='',to=today;
  if(preset==='week'){const s=_D(d);s.setDate(d.getDate()-6);from=_ds(s);}
  else if(preset==='month'){const s=_D(d);s.setDate(1);from=_ds(s);}
  else if(preset==='30'){const s=_D(d);s.setDate(d.getDate()-29);from=_ds(s);}
  const fEl=document.getElementById('drp_from_'+id);
  const tEl=document.getElementById('drp_to_'+id);
  if(fEl)fEl.value=from;if(tEl)tEl.value=to;
}

function getDRP(id){
  return{
    from:document.getElementById('drp_from_'+id)?.value||'',
    to:document.getElementById('drp_to_'+id)?.value||''
  };
}

// ── محصلة نطاق التاريخ للشراء ──
function openBuyRange(){
  const{from,to}=getDRP('buy');
  if(!from&&!to){showToast('⚠ اختر تاريخ البداية أو النهاية');return;}
  const all=(S.recs||[]).filter(r=>r.status==='weighed');
  const recs=filterByRange(all,from,to);
  const label=(from?tAr(from):'البداية')+' → '+(to?tAr(to):'النهاية');
  const html=buildCollHTML(recs,'range','all',label);
  _printHTML=html;_isCollScreen=false;
  document.getElementById('pactTitle').textContent=`💼 محصلة نطاق — ${label}`;
  document.getElementById('PC').innerHTML=html;
  document.getElementById('PS').classList.add('active');
  try{history.pushState({page:'app'},'','');}catch(e){}
  const r=document.getElementById('drp_result_buy');
  if(r)r.textContent=`✅ ${AR(recs.length)} وصل في هذه الفترة`;
}

// ── محصلة نطاق البيع ──
function openSellRange(){
  const{from,to}=getDRP('sell');
  if(!from&&!to){showToast('⚠ اختر تاريخاً');return;}
  const recs=filterByRange(SELL_RECS.filter(r=>r.status==='weighed'),from,to);
  const label=(from?tAr(from):'البداية')+' → '+(to?tAr(to):'النهاية');
  const tF=recs.filter(r=>r.final!=null).reduce((s,r)=>s+(r.final||0),0);
  const tN=recs.filter(r=>r.net!=null).reduce((s,r)=>s+(r.net||0),0);
  const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
  // نفس buildSellCollHTML
  const html=buildSellRangeHTML(recs,label);
  _printHTML=html;_isCollScreen=false;
  document.getElementById('pactTitle').textContent=`💰 محصلة بيع نطاق — ${label}`;
  document.getElementById('PC').innerHTML=html;
  document.getElementById('PS').classList.add('active');
  try{history.pushState({page:'app'},'','');}catch(e){}
  const r=document.getElementById('drp_result_sell');
  if(r)r.textContent=`✅ ${AR(recs.length)} وصل | ${fIQD(tF)} | مدفوع: ${fIQD(paid)}`;
}

function buildSellRangeHTML(recs,label){
  const tF=recs.filter(r=>r.final!=null).reduce((s,r)=>s+(r.final||0),0);
  const tN=recs.filter(r=>r.net!=null).reduce((s,r)=>s+(r.net||0),0);
  const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
  const avgTon=tN>0?Math.round(tF/(tN/1000)):0;
  const rows=recs.map((r,i)=>`<tr>
    <td style="text-align:center">${AR(i+1)}</td>
    <td>${tAr(r.dk)}</td><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td>
    <td>${esc(r.receiver||'—')}</td><td>${esc(r.dest||'—')}</td>
    <td style="text-align:center">${r.net!=null?fKG(r.net):'—'}</td>
    <td style="text-align:center;color:#3E4D5A">${r.ppkg?fIQD(r.ppkg):'—'}</td>
    <td style="text-align:center;font-weight:700;color:#3F7A4C">${r.final!=null?fIQD(r.final):'—'}</td>
    <td style="text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C">✅</span>':getPaidTotal(r)>0?'<span style="color:#8A6218">💰</span>':'<span style="color:#943A31">⏳</span>'}</td>
  </tr>`).join('');
  const d=new Date();const p2=x=>String(x).padStart(2,'0');
  return`${COHEAD}
    <div class="prh" style="background:#3F7A4C">
      <div class="prhtl">محصلة البيع — نطاق تاريخ</div>
      <div class="prhmt">${label}<br/>${p2(d.getHours())+':'+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">
      ${recs.length?`
      <table class="coltbl" style="width:100%;font-size:9px">
        <thead><tr><th>#</th><th>التاريخ</th><th>اللوحة</th><th>الفلاح</th><th>المستلم</th><th>الوجهة</th><th>الصافي</th><th>سعر الكغم</th><th>المبلغ</th><th>الحالة</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="ctot"><td colspan="6" style="font-weight:700;padding:5px 4px">المجموع</td>
          <td style="text-align:center">${fKG(tN)}</td><td></td><td style="text-align:center;font-weight:700">${fIQD(tF)}</td><td></td></tr></tfoot>
      </table>`:'<div style="text-align:center;padding:20px;color:#6B6151">لا توجد وصلات في هذه الفترة</div>'}
    </div>
    <div style="background:#1A1714;padding:10px 14px">
      <div style="display:flex;flex-wrap:wrap;gap:0">
        ${[['الوصولات',AR(recs.length),'#B37D14'],['المجموع',fIQD(tF),'#3F7A4C'],['المدفوع',fIQD(paid),'#4E8A5A'],['الباقي',fIQD(tF-paid),'#A8453A'],['الوزن',fKG(tN),'#6B6151'],['سعر الطن',fIQD(avgTon),'#4A5A68']].map(([k,v,c])=>`<div style="flex:1;min-width:70px;text-align:center;border-left:1px solid #2E2822;padding:7px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:3px">${k}</div><div style="font-size:12px;font-weight:700;color:${c}">${v}</div></div>`).join('')}
      </div>
    </div>${COFTR}`;
}

// ── محصلة نطاق الضمانات ──
function openDamRange(){
  const{from,to}=getDRP('dam');
  if(!from&&!to){showToast('⚠ اختر تاريخاً');return;}
  const recs=filterByRange(DAM_RECS,from,to);
  const label=(from?tAr(from):'البداية')+' → '+(to?tAr(to):'النهاية');
  const html=buildSimpleRangeHTML('dam',recs,label);
  _printHTML=html;_isCollScreen=false;
  document.getElementById('pactTitle').textContent=`🤝 محصلة ضمانات نطاق — ${label}`;
  document.getElementById('PC').innerHTML=html;
  document.getElementById('PS').classList.add('active');
  try{history.pushState({page:'app'},'','');}catch(e){}
  const r=document.getElementById('drp_result_dam');
  if(r)r.textContent=`✅ ${AR(recs.length)} ضمانة في هذه الفترة`;
}

// ── محصلة نطاق الصرفيات ──
function openSrfRange(){
  const{from,to}=getDRP('srf');
  if(!from&&!to){showToast('⚠ اختر تاريخاً');return;}
  const recs=filterByRange(SRF_RECS,from,to);
  const label=(from?tAr(from):'البداية')+' → '+(to?tAr(to):'النهاية');
  const html=buildSimpleRangeHTML('srf',recs,label);
  _printHTML=html;_isCollScreen=false;
  document.getElementById('pactTitle').textContent=`🧾 محصلة صرفيات نطاق — ${label}`;
  document.getElementById('PC').innerHTML=html;
  document.getElementById('PS').classList.add('active');
  try{history.pushState({page:'app'},'','');}catch(e){}
  const r=document.getElementById('drp_result_srf');
  if(r)r.textContent=`✅ ${AR(recs.length)} صرفية في هذه الفترة`;
}

// ── محصلة نطاق الأجور ──
function openWrkRange(){
  const{from,to}=getDRP('wrk');
  if(!from&&!to){showToast('⚠ اختر تاريخاً');return;}
  const recs=filterByRange(WRK_RECS,from,to);
  const label=(from?tAr(from):'البداية')+' → '+(to?tAr(to):'النهاية');
  const html=buildSimpleRangeHTML('wrk',recs,label);
  _printHTML=html;_isCollScreen=false;
  document.getElementById('pactTitle').textContent=`🔧 محصلة أجور نطاق — ${label}`;
  document.getElementById('PC').innerHTML=html;
  document.getElementById('PS').classList.add('active');
  try{history.pushState({page:'app'},'','');}catch(e){}
  const r=document.getElementById('drp_result_wrk');
  if(r)r.textContent=`✅ ${AR(recs.length)} أجر في هذه الفترة`;
}

// ── بناء HTML مشترك للأقسام البسيطة (ضمانات/صرفيات/أجور) ──
function buildSimpleRangeHTML(type,recs,label){
  const configs={
    dam:{icon:'🤝',color:'#4A5A68',title:'محصلة الضمانات'},
    srf:{icon:'🧾',color:'#A8701C',title:'محصلة الصرفيات'},
    wrk:{icon:'🔧',color:'#4A5A68',title:'محصلة أجور العمل'},
  };
  const cfg=configs[type];
  const d=new Date();const p2=x=>String(x).padStart(2,'0');
  let rows='',tA=0,paid=0;
  if(type==='dam'){
    recs.forEach((r,i)=>{
      const sb=r.subRecs?Object.values(r.subRecs):[];
      const amt=sb.length?sb.reduce((s,x)=>s+(x.amount||0),0):(r.price||0);
      const pd=sb.length?sb.reduce((s,x)=>{const p=x.payments||[];return s+p.reduce((ss,pp)=>ss+(pp.amount||0),0);},0):getPaidTotal(r);
      tA+=amt;paid+=pd;
      rows+=`<tr><td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td><td>${esc(r.damin)}</td><td>${esc(r.madmun)}</td><td style="text-align:center;font-weight:700;color:#4A5A68">${fIQD(amt)}</td><td style="text-align:center;font-size:8px">${(sb.length?sb.every(x=>x.paid):r.paid)?'<span style="color:#3F7A4C">✅</span>':pd>0?'<span style="color:#8A6218">💰</span>':'<span style="color:#943A31">⏳</span>'}</td></tr>`;
    });
    const hdrs='<th>#</th><th>التاريخ</th><th>الضامن</th><th>المضمون</th><th>المبلغ</th><th>الحالة</th>';
    return _rangeHTML(cfg,label,recs.length,hdrs,rows,tA,paid,d,p2);
  }
  if(type==='srf'){
    recs.forEach((r,i)=>{tA+=r.amount||0;paid+=getPaidTotal(r);rows+=`<tr><td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td><td>${esc(r.recv||'—')}</td><td>${esc(r.purp||'—')}</td><td style="text-align:center;font-weight:700;color:#A8701C">${fIQD(r.amount)}</td><td style="text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C">✅</span>':getPaidTotal(r)>0?'<span style="color:#8A6218">💰</span>':'<span style="color:#943A31">⏳</span>'}</td></tr>`;});
    return _rangeHTML(cfg,label,recs.length,'<th>#</th><th>التاريخ</th><th>المستفيد</th><th>السبب</th><th>المبلغ</th><th>الحالة</th>',rows,tA,paid,d,p2);
  }
  if(type==='wrk'){
    recs.forEach((r,i)=>{tA+=r.amount||0;paid+=getPaidTotal(r);rows+=`<tr><td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td><td>${esc(r.provider||'—')}</td><td>${esc(r.service||'—')}</td><td style="text-align:center;font-weight:700;color:#4A5A68">${fIQD(r.amount)}</td><td style="text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C">✅</span>':getPaidTotal(r)>0?'<span style="color:#8A6218">💰</span>':'<span style="color:#943A31">⏳</span>'}</td></tr>`;});
    return _rangeHTML(cfg,label,recs.length,'<th>#</th><th>التاريخ</th><th>مقدم الخدمة</th><th>الخدمة</th><th>المبلغ</th><th>الحالة</th>',rows,tA,paid,d,p2);
  }
  return '';
}

function _rangeHTML(cfg,label,cnt,hdrs,rows,tA,paid,d,p2){
  return`${COHEAD}
    <div class="prh" style="background:${cfg.color}">
      <div class="prhtl">${cfg.icon} ${cfg.title} — نطاق تاريخ</div>
      <div class="prhmt">${label}<br/>${p2(d.getHours())+':'+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">
      ${cnt?`<table class="coltbl" style="width:100%;font-size:9px">
        <thead><tr>${hdrs}</tr></thead><tbody>${rows}</tbody>
        <tfoot><tr class="ctot"><td colspan="4" style="font-weight:700;padding:5px 4px">المجموع</td><td style="text-align:center;font-weight:700">${fIQD(tA)}</td><td></td></tr></tfoot>
      </table>`:'<div style="text-align:center;padding:20px;color:#6B6151">لا توجد سجلات في هذه الفترة</div>'}
    </div>
    <div style="background:#1A1714;padding:10px 14px">
      <div style="display:flex;flex-wrap:wrap;gap:0">
        ${[['السجلات',AR(cnt),'#B37D14'],['المجموع',fIQD(tA),cfg.color],['المدفوع',fIQD(paid),'#4E8A5A'],['الباقي',fIQD(tA-paid),'#A8453A']].map(([k,v,c])=>`<div style="flex:1;min-width:70px;text-align:center;border-left:1px solid #2E2822;padding:7px 4px"><div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:3px">${k}</div><div style="font-size:12px;font-weight:700;color:${c}">${v}</div></div>`).join('')}
      </div>
    </div>${COFTR}`;
}

// ── بحث الزبون بنطاق تاريخ ──
function openCustRange(type){
  // v17.9 — كانت تقرأ الاسم من الحالة الداخلية فقط، وهي لا تُملأ إلا
  // بضغط زر البحث. من يكتب الاسم ويضغط "عرض النطاق" مباشرة كان
  // يحصل على تحذير رغم أن الاسم مكتوب. الآن نقرأ الحقل أولاً.
  const typed=(document.getElementById('custSrch_'+type)?.value||'').trim();
  const name=typed||_custState[type].name;
  if(!name){showToast('⚠ اكتب اسم الزبون أولاً');return;}
  _custState[type].name=name;
  const{from,to}=getDRP('cust_'+type);
  if(!from&&!to){showToast('⚠ اختر تاريخاً');return;}
  const allRecs=_getCustRecs(type,name);
  const recs=filterByRange(allRecs,from,to);
  const label=(from?tAr(from):'البداية')+' → '+(to?tAr(to):'النهاية');
  const html=_buildCustPrintHTML(type,name,'range',from||to,recs);
  _printHTML=html;_isCollScreen=false;
  const titles={buy:'🚛 وصولات',sell:'💰 بيع',dam:'🤝 ضمانات',srf:'🧾 صرفيات',wrk:'🔧 أجور',arb:'🏬 أربيل'};
  document.getElementById('pactTitle').textContent=`${titles[type]} — ${name} — ${label}`;
  document.getElementById('PC').innerHTML=html;
  document.getElementById('PS').classList.add('active');
  try{history.pushState({page:'app'},'','');}catch(e){}
  const r=document.getElementById('drp_result_cust_'+type);
  if(r)r.textContent=`✅ ${AR(recs.length)} سجل في هذه الفترة`;
}

/* ════════════════════════════════════════════
   محصلة الزبون — نظام كامل يومي/أسبوعي/شهري
════════════════════════════════════════════ */

// حالة كل تبويب زبون
const _custState={
  buy:{name:'',period:'daily'},
  sell:{name:'',period:'daily'},
  dam:{name:'',period:'daily'},
  srf:{name:'',period:'daily'},
  wrk:{name:'',period:'daily'},
  naql:{name:'',period:'daily'},
  arb:{name:'',period:'daily'},
};

function renderCustTab(type){
  const inEl=document.getElementById('custSrch_'+type);
  if(inEl){inEl.value=_custState[type].name||'';inEl.focus();}
  _setCustPeriod(type,_custState[type].period||'daily',false);
  // استخدم custMsg_ للرسالة الافتراضية إذا وُجد، وإلا custRes_
  const msgEl=document.getElementById('custMsg_'+type)||document.getElementById('custRes_'+type);
  if(_custState[type].name){
    if(msgEl)msgEl.innerHTML='';
    _buildCustCollView(type);
  } else {
    if(msgEl)msgEl.innerHTML=
      `<div style="text-align:center;color:var(--paper-4);padding:30px;font-size:13px">🔍 اكتب اسم الزبون ثم اختر الفترة</div>`;
    // امسح نتائج البحث السابقة
    const resEl=document.getElementById('custRes_'+type);
    if(resEl&&resEl!==msgEl) resEl.innerHTML='';
  }
}

function _setCustPeriod(type,p,rebuild){
  _custState[type].period=p;
  ['daily','weekly','monthly'].forEach(x=>{
    const b=document.getElementById('cpb_'+type+'_'+x);
    if(b){b.style.background=x===p?_custColor(type):'transparent';
          b.style.color=x===p?'#fff':'var(--paper-3)';}
  });
  if(rebuild!==false && _custState[type].name) _buildCustCollView(type);
}

function _custColor(type){
  return{buy:'var(--wheat-dim)',sell:'var(--settled)',dam:'var(--steel)',srf:'var(--wheat-dim)',wrk:'var(--steel)',naql:'var(--wheat)',arb:'var(--steel)'}[type]||'var(--rule-hi)';
}

function doCustSearch(type){
  const srch=(document.getElementById('custSrch_'+type)?.value||'').trim();
  const msgEl=document.getElementById('custMsg_'+type)||document.getElementById('custRes_'+type);
  if(!srch){
    if(msgEl)msgEl.innerHTML=
      `<div style="text-align:center;color:var(--paper-4);padding:30px;font-size:13px">🔍 اكتب اسم الزبون ثم اختر الفترة</div>`;
    const resEl=document.getElementById('custRes_'+type);
    if(resEl&&resEl!==msgEl) resEl.innerHTML='';
    return;
  }
  if(msgEl)msgEl.innerHTML='';
  _custState[type].name=srch;
  _buildCustCollView(type);
}

/* ── منطق المحصلة الفعلي ── */
/* v17.28 — ترتيب وصولات الزبون: الأحدث أولاً.
   المفتاح الثانوي هو التسلسل ثم وقت الإنشاء، كي تبقى
   وصولات اليوم الواحد مرتّبة داخلياً بشكل ثابت. */
function _sortCustRecs(arr){
  return (arr||[]).slice().sort((a,b)=>{
    const d=(b.dk||"").localeCompare(a.dk||"");
    if(d)return d;
    const sq=(b.seq||0)-(a.seq||0);
    if(sq)return sq;
    return String(b.createdAt||b.loadAt||"").localeCompare(String(a.createdAt||a.loadAt||""));
  });
}
function _getCustRecs(type,name){
  return _sortCustRecs(_getCustRecsRaw(type,name));
}
function _getCustRecsRaw(type,name){
  const s=name;
  if(type==='buy')  return (S.recs||[]).filter(r=>r.status==='weighed'&&(smartMatch(r.driver,s)||smartMatch(r.plate,s)));
  if(type==='sell') return SELL_RECS.filter(r=>r.status==='weighed'&&(smartMatch(r.driver,s)||smartMatch(r.plate,s)||smartMatch(r.receiver,s)));
  if(type==='dam')  return DAM_RECS.filter(r=>smartMatch(r.damin,s)||smartMatch(r.madmun,s));
  if(type==='srf')  return SRF_RECS.filter(r=>smartMatch(r.recv,s)||smartMatch(r.purp,s));
  if(type==='wrk')  return WRK_RECS.filter(r=>smartMatch(r.provider,s)||smartMatch(r.service,s));
  if(type==='arb')  return ARB_RECS.filter(r=>smartMatch(r.farmer,s));
  if(type==='naql'){
    // تجميع كل وصولات النقل حسب اسم الناقل
    let all=[];
    (S.recs||[]).forEach(r=>{
      if(!r.nOn)return;
      getNaqlEntries(r).forEach(en=>{
        if(en.naqlFee>0&&smartMatch(en.transporter,s)){
          const compId=_naqlCompositeId(r.id,en._entryId);
          all.push({...en,id:compId,driver:r.driver,plate:r.plate,dk:r.dk,_naqlType:'buy',_naqlDamId:null});
        }
      });
    });
    (SELL_RECS||[]).forEach(r=>{if(r.nOn&&r.naqlFee>0&&smartMatch(r.transporter,s))all.push({...r,_naqlType:'sell',_naqlDamId:null});});
    (DAM_RECS||[]).forEach(dam=>{const subs=dam.subRecs?Object.values(dam.subRecs):[];subs.forEach(sub=>{if(sub.trans>0&&smartMatch(sub.transporter,s))all.push({...sub,dk:sub.dk||dam.dk,_naqlType:'dam-sub',_naqlDamId:dam.id,naqlFee:sub.trans,transporter:sub.transporter||''});});});
    (MNL_RECS||[]).forEach(r=>{if(r.naqlFee>0&&smartMatch(r.transporter,s))all.push({...r,driver:r.farmer||'',_naqlType:'mnl',_naqlDamId:null});});
    return all;
  }
  return [];
}

function _filterByPeriod(recs,period,base){
  const bd=_D(base);
  return recs.filter(r=>{
    const dk=r.dk||'';if(!dk)return false;
    if(period==='daily')  return dk===base;
    if(period==='monthly')return dk.slice(0,7)===base.slice(0,7);
    if(period==='weekly'){
      /* ══════════════════════════════════════════════════════
         الأحد الضائع — v17.47
         ──────────────────────────────────────────────────────
         كان rd=new Date(dk) يُفسَّر توقيتاً عالمياً بينما sow
         وeow مبنيّان محلياً عبر _D. في بغداد (UTC+3) يصير
         تاريخ الوصل الساعةَ ٣ فجراً، فيقع الأحد — آخر أيام
         الأسبوع — بعد eow بثلاث ساعات ويسقط من التصفية.
         النتيجة: كل وصولات الأحد تختفي من العرض الأسبوعي في
         تبويب «زبون»، فيظهر رصيد الزبون أقلّ مما له فعلاً.
         (قِسناه: ٧ أيام تُدخل، ٦ تخرج.)
         هذا نفس العطل الذي أُصلح في _jamiInPeriod بـ v17.6،
         وبقيت هذه نسخته غير المُصلَحة. الحلّ ذاته: _D للطرفين.
      ══════════════════════════════════════════════════════ */
      const rd=_D(dk);
      const dow=bd.getDay();
      const sow=_D(bd);sow.setDate(bd.getDate()-((dow+6)%7));
      const eow=_D(sow);eow.setDate(sow.getDate()+6);
      return rd>=sow&&rd<=eow;
    }
    return false;
  });
}

function _getCustDates(type,name,period){
  const all=_getCustRecs(type,name);
  let keys=[];
  if(period==='daily'){
    keys=[...new Set(all.map(r=>r.dk||'').filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  } else if(period==='weekly'){
    const weeks=new Set();
    all.forEach(r=>{
      if(!r.dk)return;
      const d=_D(r.dk);const dow=d.getDay();
      const sow=_D(d);sow.setDate(d.getDate()-((dow+6)%7));
      weeks.add(_ds(sow));
    });
    keys=[...weeks].sort((a,b)=>b.localeCompare(a));
  } else {
    keys=[...new Set(all.map(r=>(r.dk||'').slice(0,7)).filter(Boolean))].sort((a,b)=>b.localeCompare(a));
  }
  return keys;
}

/* ══════════════════════════════════════════════════════
   حالة الدفع في أزرار الفترات — v17.40
   ──────────────────────────────────────────────────────
   لكل نوع سجل مصدر مبلغه ومصدر دفعاته مختلف، فنجمعهما
   هنا في مكان واحد بدل تكرار المنطق:
     شراء/بيع  → final     · payments
     ضمانات    → price     · payments
     صرفيات/أعمال → amount · payments
     نقل       → naqlFee   · naqlPayments (والفرعية trans)
     أربيل     → أوزان فقط، لا مبالغ ⇒ لا علامة دفع
   وصولات الشراء غير المكتملة (final=null) لم تُحتسب بعد،
   فلا تُعدّ مسدَّدة ولا نضع علامة على يومها.
══════════════════════════════════════════════════════ */
function _custDue(type,r){
  if(type==='naql')return r.naqlFee||0;
  if(type==='dam') return getRecTotal(r);
  return r.final!=null?r.final:(r.amount||r.price||0);
}
function _custPaidOf(type,r){
  if(type==='naql')return r._naqlType==='dam-sub'?getDamSubNaqlPaid(r):getNaqlPaidTotal(r);
  return getPaidTotal(r);
}
/* يُرجع: settled (مسدَّد بالكامل) · partial (دفعة جزئية) · none */
function _custPayState(type,recs){
  if(type==='arb')return null;                       // لا مبالغ أصلاً
  if(!recs||!recs.length)return null;
  if(type==='buy'&&recs.some(r=>r.final==null))return null;  // وصل غير مكتمل
  const due=recs.reduce((s,r)=>s+_custDue(type,r),0);
  if(due<=0)return null;
  const paid=recs.reduce((s,r)=>s+_custPaidOf(type,r),0);
  if(paid>=due)return "settled";
  return paid>0?"partial":"none";
}

/* علامة الحالة الموحّدة — تُستعمل في كل أزرار الفترات */
function _payMark(st){
  return st==="settled"?' <span style="color:var(--settled)">✅</span>'
       : st==="partial"?' <span style="color:var(--wheat-hi)">◐</span>':'';
}
function _payTitle(st){
  return st==="settled"?"مسدَّد بالكامل":st==="partial"?"مدفوع جزئياً":"";
}

function _buildCustCollView(type){
  const name=_custState[type].name;
  const period=_custState[type].period;
  // اكتب النتائج في custData_ إذا وُجد، وإلا custRes_
  const resEl=document.getElementById('custData_'+type)||document.getElementById('custRes_'+type);
  if(!resEl||!name)return;

  const allRecs=_getCustRecs(type,name);
  if(!allRecs.length){
    resEl.innerHTML=`<div style="text-align:center;color:var(--paper-4);padding:30px">📭 لا توجد سجلات لـ "${esc(name)}"</div>`;
    return;
  }

  const dates=_getCustDates(type,name,period);
  const PL={daily:'اليوم',weekly:'الأسبوع',monthly:'الشهر'};
  const col=_custColor(type);

  // ── شريط الإجمالي الكلي (كل الفترات) ──
  const grandTotal=_custGrandBar(type,allRecs,name,col);

  // ── قائمة الفترات السريعة ──
  const quickBtns=dates.length
    ?dates.map(d=>{
        const periodRecs=_filterByPeriod(allRecs,period,d);
        const cnt=periodRecs.length;
        const kabs=type==='buy'?periodRecs.reduce((s,r)=>s+(r.kOn?(r.kC||0):0),0):0;
        const label=period==='monthly'?d.slice(0,7):tAr(d);
        /* v17.40 — علامة الدفع: ✅ مسدَّد بالكامل · ◐ دفعة جزئية */
        const st=_custPayState(type,periodRecs);
        const mark=_payMark(st);
        const brd=st==="settled"?'var(--settled)':col;
        return`<button onclick="openCustCollDate('${type}','${d}')" title="${_payTitle(st)}"
          style="padding:6px 10px;border-radius:8px;border:1px solid ${brd};background:${st==="settled"?'rgba(78,138,90,.12)':'var(--ink-050)'};color:var(--paper);font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;min-width:70px">
          <span style="font-size:10px;color:${col};font-weight:700">${label}${mark}</span>
          <span style="font-size:9px;color:var(--paper-3)">${AR(cnt)} سجل${type==='buy'&&kabs>0?' | 🔧'+AR(kabs):''}</span>
        </button>`;
      }).join('')
    :`<span style="color:var(--paper-4);font-size:11px">لا توجد سجلات في هذه الفترة</span>`;

  resEl.innerHTML=`
    ${grandTotal}
    <div style="margin:10px 0 6px;font-size:11px;color:var(--paper-2);font-weight:700">⚡ ${PL[period]}ات فيها سجلات:</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${quickBtns}</div>
    <!-- عرض اليوم/الأسبوع/الشهر الحالي مباشرة -->
    <button style="width:100%;padding:10px;border-radius:10px;border:1px solid ${col};background:rgba(0,0,0,.2);color:var(--paper);font-size:12px;font-weight:700;cursor:pointer;margin-bottom:4px"
      onclick="openCustCollDate('${type}','${toDay()}')">
      👁 عرض محصلة ${PL[period]} الحالي
    </button>`;
}

function _custGrandBar(type,recs,name,col){
  if(type==='buy'){
    const dn=recs.filter(r=>r.final!=null);
    const tF=dn.reduce((s,r)=>s+(r.final||0),0);
    const tN=dn.reduce((s,r)=>s+(r.net||0),0);
    const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
    const tKabs=recs.reduce((s,r)=>s+(r.kOn?(r.kC||0):0),0);
    const _wp=dn.filter(r=>r.ppkg>0&&r.net>0);
    const _wpNet=_wp.reduce((s,r)=>s+r.net,0);
    const avgTon=_wpNet>0?Math.round(_wp.reduce((s,r)=>s+r.ppkg*1000*r.net,0)/_wpNet):0;
    return _grandBarHTML(name,col,[['الوصولات',AR(recs.length),'var(--wheat-hi)'],['🔧 الكبسات',tKabs>0?AR(tKabs):'—','var(--steel)'],['المجموع',fIQD(tF),'var(--wheat)'],['المدفوع',fIQD(paid),'var(--settled)'],['الباقي',fIQD(tF-paid),'var(--owing)'],['الوزن',fKG(tN),'var(--paper-2)'],['سعر الطن',avgTon>0?fIQD(avgTon):'—','var(--steel)']]);
  }
  if(type==='sell'){
    const dn=recs.filter(r=>r.final!=null);
    const tF=dn.reduce((s,r)=>s+(r.final||0),0);
    const tN=dn.reduce((s,r)=>s+(r.net||0),0);
    const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
    const _wp=dn.filter(r=>r.ppkg>0&&r.net>0);
    const _wpNet=_wp.reduce((s,r)=>s+r.net,0);
    const avgTon=_wpNet>0?Math.round(_wp.reduce((s,r)=>s+r.ppkg*1000*r.net,0)/_wpNet):0;
    return _grandBarHTML(name,col,[['الوصولات',AR(recs.length),'var(--wheat-hi)'],['المجموع',fIQD(tF),'var(--settled)'],['المدفوع',fIQD(paid),'var(--settled)'],['الباقي',fIQD(tF-paid),'var(--owing)'],['الوزن',fKG(tN),'var(--paper-2)'],['سعر الطن',avgTon>0?fIQD(avgTon):'—','var(--steel)']]);
  }
  if(type==='dam'){
    const tA=recs.reduce((s,r)=>s+getRecTotal(r),0);
    const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
    return _grandBarHTML(name,col,[['الضمانات',AR(recs.length),'var(--wheat-hi)'],['المجموع الكلي',fIQD(tA),'var(--steel)'],['المدفوع',fIQD(paid),'var(--settled)'],['الباقي',fIQD(tA-paid),'var(--owing)']]);
  }
  if(type==='arb'){
    const tGross=recs.reduce((s,r)=>s+(r.gross||0),0);
    const tEmpty=recs.reduce((s,r)=>s+(r.empty||0),0);
    const tNet=recs.reduce((s,r)=>s+(r.net||0),0);
    return _grandBarHTML(name,col,[['الوصولات',AR(recs.length),'var(--wheat-hi)'],['الوزن الكلي',fKG(tGross),'var(--paper-2)'],['الوزن الفارغ',fKG(tEmpty),'var(--paper-2)'],['الوزن الصافي',fKG(tNet),'var(--steel)']]);
  }
  const tA=recs.reduce((s,r)=>s+(r.amount||0),0);
  const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
  const icon=type==='srf'?'🧾':'🔧';
  const clr=type==='srf'?'var(--wheat)':'var(--steel)';
  if(type==='naql'){
    const tFee=recs.reduce((s,r)=>s+(r.naqlFee||0),0);
    const tPaid=recs.reduce((s,r)=>s+(r._naqlType==='dam-sub'?getDamSubNaqlPaid(r):getNaqlPaidTotal(r)),0);
    const tKabs=recs.reduce((s,r)=>s+(r.nC||r.nKabs||r.transCount||r.kabs||r.kC||0),0);
    return _grandBarHTML(name,col,[['الوصولات',AR(recs.length),'var(--wheat-hi)'],['إجمالي النقل',fIQD(tFee),'var(--wheat)'],['المدفوع',fIQD(tPaid),'var(--settled)'],['الباقي',fIQD(tFee-tPaid),'var(--owing)'],['الكبسات',AR(tKabs),'var(--steel)']]);
  }
  return _grandBarHTML(name,col,[['السجلات',AR(recs.length),'var(--wheat-hi)'],['المجموع',fIQD(tA),clr],['المدفوع',fIQD(paid),'var(--settled)'],['الباقي',fIQD(tA-paid),'var(--owing)']]);
}

function _grandBarHTML(name,col,items){
  return`<div style="background:#1A1714;border:1px solid ${col};border-radius:12px;padding:10px 12px;margin-bottom:10px">
    <div style="font-size:12px;font-weight:700;color:${col};margin-bottom:8px;text-align:center">📊 إجمالي كل السجلات — ${esc(name)}</div>
    <div style="display:flex;flex-wrap:wrap;gap:0">
      ${items.map(([k,v,c])=>`<div style="flex:1;min-width:70px;text-align:center;border-left:1px solid #2E2822;padding:6px 4px">
        <div style="font-size:9px;color:#6B6151;font-weight:700">${k}</div>
        <div style="font-size:12px;font-weight:700;color:${c}">${v}</div>
      </div>`).join('')}
    </div>
  </div>`;
}

/* ── فتح محصلة فترة محددة وعرضها في شاشة الطباعة ── */
function openCustCollDate(type,base){
  const name=_custState[type].name;
  const period=_custState[type].period;
  if(!name)return;
  const allRecs=_getCustRecs(type,name);
  const recs=_filterByPeriod(allRecs,period,base);
  const PL={daily:'اليومية',weekly:'الأسبوعية',monthly:'الشهرية'};
  const titles={buy:'🚛 وصولات الشراء',sell:'💰 وصلات البيع',dam:'🤝 الضمانات',srf:'🧾 الصرفيات',wrk:'🔧 أجور العمل',arb:'🏬 وصولات أربيل'};
  const html=_buildCustPrintHTML(type,name,period,base,recs);
  _printHTML=html;_isCollScreen=false;
  document.getElementById('pactTitle').textContent=`${titles[type]} — ${name} — ${PL[period]}`;
  document.getElementById('PC').innerHTML=html;
  document.getElementById('PS').classList.add('active');
  try{history.pushState({page:'app'},'','');}catch(e){}
}

/* ── بناء HTML المحصلة للطباعة ── */
/* v17.27 — سعر الطن = السعر المُدخَل في الوصل (سعر الكغم) × ١٠٠٠.
   لا يُحسب من المبلغ النهائي، لأن ذاك يطرح أجور الكبس والنقل
   والوصل فيعطي رقماً أقل من السعر المتفق عليه مع الفلاح. */
function _tonPrice(r){
  if(!r)return null;
  const ppkg=r.ppkg!=null?r.ppkg:null;
  if(ppkg==null||ppkg<=0)return null;
  return Math.round(ppkg*1000);
}
function _buildCustPrintHTML(type,name,period,base,recs){
  const PL={daily:'اليومية',weekly:'الأسبوعية',monthly:'الشهرية'};
  const col=_custColor(type);
  const d=new Date();const p2=x=>String(x).padStart(2,'0');
  const sec=t=>`<div class="psec">${t}</div>`;
  // v17.43 — القيمة تُهرَّب داخل المُساعد نفسه (انظر ملاحظة «تهريب الوصولات»)
  const row=(k,v)=>`<div class="prr"><span class="prk">${k}</span><span class="prv">${esc(v)}</span></div>`;

  let body='';
  let summaryItems=[];

  if(type==='buy'){
    const dn=recs.filter(r=>r.final!=null);
    const tF=dn.reduce((s,r)=>s+(r.final||0),0);
    const tN=dn.reduce((s,r)=>s+(r.net||0),0);
    const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
    // v17.27 — متوسط مرجّح بالوزن للسعر المُدخَل، لا للمبلغ بعد الخصم
    const _wp=dn.filter(r=>r.ppkg>0&&r.net>0);
    const _wpNet=_wp.reduce((s,r)=>s+r.net,0);
    const avgTon=_wpNet>0?Math.round(_wp.reduce((s,r)=>s+r.ppkg*1000*r.net,0)/_wpNet):0;
    const tKabs=recs.reduce((s,r)=>s+(r.kOn?(r.kC||0):0),0);
    if(recs.length){
      body+=sec(`🚛 الوصولات (${AR(recs.length)})${tKabs>0?' | 🔧 إجمالي الكبسات: '+AR(tKabs):''}`);
      body+=`<table class="coltbl" style="width:100%;font-size:9px"><thead><tr>
        <th>#</th><th>التاريخ</th><th>اللوحة</th><th>الفلاح</th><th>المادة</th><th>المخزن</th><th style="color:#8A9AA8">كبسات</th><th>الصافي</th><th>سعر الطن</th><th>المبلغ</th><th>الحالة</th>
      </tr></thead><tbody>`;
      recs.forEach((r,i)=>{
        body+=`<tr>
          <td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td>
          <td>${MAT[r.mat]?.label||r.mat}</td><td>${esc(whName(r.wh))}</td>
          <td style="text-align:center;color:#5E6E7C;font-weight:700">${esc(r.kOn&&r.kC>0?AR(r.kC)+'<span style="font-size:7px;color:#5E6E7C"> '+( r.kType||'')+'</span>':'—')}</td>
          <td style="text-align:center">${r.net!=null?fKG(r.net):'—'}</td>
          <td style="text-align:center;color:#3E4D5A;font-weight:700">${_tonPrice(r)!=null?fIQD(_tonPrice(r)):'—'}</td>
          <td style="text-align:center;font-weight:700;color:#8A6218">${r.final!=null?fIQD(r.final):'⏳'}</td>
          <td style="text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C">✅</span>':getPaidTotal(r)>0?'<span style="color:#8A6218">💰'+fIQD(getPaidTotal(r))+'</span>':'<span style="color:#943A31">⏳</span>'}</td>
        </tr>`;
      });
      body+=`</tbody><tfoot><tr class="ctot">
        <td colspan="6" style="font-weight:700;padding:5px 4px">المجموع</td>
        <td style="text-align:center;color:#5E6E7C;font-weight:700">${tKabs>0?AR(tKabs):'—'}</td>
        <td style="text-align:center">${fKG(tN)}</td>
        <td style="text-align:center;color:#3E4D5A;font-weight:700">${avgTon>0?fIQD(avgTon):'—'}</td>
        <td style="text-align:center;font-weight:700">${fIQD(tF)}</td><td></td>
      </tr></tfoot></table>`;
    }
    summaryItems=[['الوصولات',AR(recs.length),'#B37D14'],['الكبسات',tKabs>0?AR(tKabs):'—','#5E6E7C'],['المجموع',fIQD(tF),'#B37D14'],['المدفوع',fIQD(paid),'#4E8A5A'],['الباقي',fIQD(tF-paid),'#A8453A'],['الوزن',fKG(tN),'#6B6151'],['سعر الطن',fIQD(avgTon),'#4A5A68']];
  }

  else if(type==='sell'){
    const dn=recs.filter(r=>r.final!=null);
    const tF=dn.reduce((s,r)=>s+(r.final||0),0);
    const tN=dn.reduce((s,r)=>s+(r.net||0),0);
    const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
    const _wp=dn.filter(r=>r.ppkg>0&&r.net>0);
    const _wpNet=_wp.reduce((s,r)=>s+r.net,0);
    const avgTon=_wpNet>0?Math.round(_wp.reduce((s,r)=>s+r.ppkg*1000*r.net,0)/_wpNet):0;
    if(recs.length){
      body+=sec(`💰 وصلات البيع (${AR(recs.length)})`);
      body+=`<table class="coltbl" style="width:100%;font-size:9px"><thead><tr>
        <th>#</th><th>التاريخ</th><th>اللوحة</th><th>الفلاح</th><th>المستلم</th><th>الوجهة</th><th>الصافي</th><th>سعر الطن</th><th>المبلغ</th><th>الحالة</th>
      </tr></thead><tbody>`;
      recs.forEach((r,i)=>{
        body+=`<tr>
          <td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td>
          <td>${esc(r.receiver||'—')}</td><td>${esc(r.dest||'—')}</td>
          <td style="text-align:center">${r.net!=null?fKG(r.net):'—'}</td>
          <td style="text-align:center;color:#3E4D5A;font-weight:700">${_tonPrice(r)!=null?fIQD(_tonPrice(r)):'—'}</td>
          <td style="text-align:center;font-weight:700;color:#3F7A4C">${r.final!=null?fIQD(r.final):'⏳'}</td>
          <td style="text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C">✅</span>':getPaidTotal(r)>0?'<span style="color:#8A6218">💰</span>':'<span style="color:#943A31">⏳</span>'}</td>
        </tr>`;
      });
      body+=`</tbody><tfoot><tr class="ctot">
        <td colspan="6" style="font-weight:700;padding:5px 4px">المجموع</td>
        <td style="text-align:center">${fKG(tN)}</td>
        <td style="text-align:center;color:#3E4D5A;font-weight:700">${avgTon>0?fIQD(avgTon):'—'}</td>
        <td style="text-align:center;font-weight:700">${fIQD(tF)}</td><td></td>
      </tr></tfoot></table>`;
    }
    summaryItems=[['الوصولات',AR(recs.length),'#B37D14'],['المجموع',fIQD(tF),'#3F7A4C'],['المدفوع',fIQD(paid),'#4E8A5A'],['الباقي',fIQD(tF-paid),'#A8453A'],['الوزن',fKG(tN),'#6B6151'],['سعر الطن',fIQD(avgTon),'#4A5A68']];
  }

  else if(type==='dam'){
    const tA=recs.reduce((s,r)=>s+getRecTotal(r),0);
    const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
    if(recs.length){
      body+=sec(`🤝 الضمانات (${AR(recs.length)})`);
      recs.forEach((r,i)=>{
        const sb=r.subRecs?Object.values(r.subRecs):[];
        const amt=sb.length?sb.reduce((s,x)=>s+(x.amount||0),0):(r.price||0);
        const pd=sb.length?sb.reduce((s,x)=>{const p=x.payments||[];return s+p.reduce((ss,pp)=>ss+(pp.amount||0),0);},0):getPaidTotal(r);
        body+=`<div style="background:#FAF8F3;border-radius:5px;padding:5px 8px;margin:3px 0;border-right:3px solid #4A5A68">`;
        body+=row(`#${AR(i+1)} ${esc(r.damin)} ← ${esc(r.madmun)}`,fIQD(amt));
        if(sb.length)body+=row('الوصولات الفرعية',AR(sb.length));
        body+=row('المدفوع',fIQD(pd));body+=row('الباقي',fIQD(amt-pd));
        body+=row('التاريخ',tAr(r.dk));
        body+=`</div>`;
      });
    }
    summaryItems=[['الضمانات',AR(recs.length),'#B37D14'],['المجموع',fIQD(tA),'#5E6E7C'],['المدفوع',fIQD(paid),'#4E8A5A'],['الباقي',fIQD(tA-paid),'#A8453A']];
  }

  else if(type==='arb'){
    const tGross=recs.reduce((s,r)=>s+(r.gross||0),0);
    const tEmpty=recs.reduce((s,r)=>s+(r.empty||0),0);
    const tNet=recs.reduce((s,r)=>s+(r.net||0),0);
    if(recs.length){
      body+=sec(`🏬 وصولات أربيل (${AR(recs.length)})`);
      body+=`<table class="coltbl" style="width:100%;font-size:9px"><thead><tr>
        <th>#</th><th>التاريخ</th><th>الكلي</th><th>الفارغ</th><th>الصافي</th><th>ملاحظة</th>
      </tr></thead><tbody>`;
      recs.forEach((r,i)=>{
        body+=`<tr>
          <td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td>
          <td style="text-align:center">${fKG(r.gross)}</td><td style="text-align:center">${fKG(r.empty)}</td>
          <td style="text-align:center;font-weight:700;color:#3E4D5A">${fKG(r.net)}</td><td>${esc(r.note||"—")}</td>
        </tr>`;
      });
      body+=`</tbody><tfoot><tr class="ctot">
        <td colspan="2" style="font-weight:700;padding:5px 4px">المجموع</td>
        <td style="text-align:center">${fKG(tGross)}</td><td style="text-align:center">${fKG(tEmpty)}</td>
        <td style="text-align:center;font-weight:700;color:#3E4D5A">${fKG(tNet)}</td><td></td>
      </tr></tfoot></table>`;
    }
    summaryItems=[['الوصولات',AR(recs.length),'#B37D14'],['الوزن الكلي',fKG(tGross),'#6B6151'],['الوزن الفارغ',fKG(tEmpty),'#6B6151'],['الوزن الصافي',fKG(tNet),'#4A5A68']];
  }

  else if(type==='srf'){
    const tA=recs.reduce((s,r)=>s+(r.amount||0),0);
    const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
    if(recs.length){
      body+=sec(`🧾 الصرفيات (${AR(recs.length)})`);
      body+=`<table class="coltbl" style="width:100%;font-size:9px"><thead><tr>
        <th>#</th><th>التاريخ</th><th>المستفيد</th><th>السبب</th><th>المبلغ</th><th>الحالة</th>
      </tr></thead><tbody>`;
      recs.forEach((r,i)=>{
        body+=`<tr><td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td><td>${esc(r.recv||'—')}</td><td>${esc(r.purp||'—')}</td>
          <td style="text-align:center;font-weight:700;color:#8A5A14">${fIQD(r.amount)}</td>
          <td style="text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C">✅</span>':getPaidTotal(r)>0?'<span style="color:#8A6218">💰</span>':'<span style="color:#943A31">⏳</span>'}</td>
        </tr>`;
      });
      body+=`</tbody><tfoot><tr class="ctot"><td colspan="4" style="font-weight:700;padding:5px 4px">المجموع</td>
        <td style="text-align:center;font-weight:700">${fIQD(tA)}</td><td></td></tr></tfoot></table>`;
    }
    summaryItems=[['السجلات',AR(recs.length),'#B37D14'],['المجموع',fIQD(tA),'#A8701C'],['المدفوع',fIQD(paid),'#4E8A5A'],['الباقي',fIQD(tA-paid),'#A8453A']];
  }

  else if(type==='wrk'){
    const tA=recs.reduce((s,r)=>s+(r.amount||0),0);
    const paid=recs.reduce((s,r)=>s+getPaidTotal(r),0);
    if(recs.length){
      body+=sec(`🔧 أجور العمل (${AR(recs.length)})`);
      body+=`<table class="coltbl" style="width:100%;font-size:9px"><thead><tr>
        <th>#</th><th>التاريخ</th><th>مقدم الخدمة</th><th>الخدمة</th><th>المبلغ</th><th>الحالة</th>
      </tr></thead><tbody>`;
      recs.forEach((r,i)=>{
        body+=`<tr><td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td><td>${esc(r.provider||'—')}</td><td>${esc(r.service||'—')}</td>
          <td style="text-align:center;font-weight:700;color:#3E4D5A">${fIQD(r.amount)}</td>
          <td style="text-align:center;font-size:8px">${r.paid?'<span style="color:#3F7A4C">✅</span>':getPaidTotal(r)>0?'<span style="color:#8A6218">💰</span>':'<span style="color:#943A31">⏳</span>'}</td>
        </tr>`;
      });
      body+=`</tbody><tfoot><tr class="ctot"><td colspan="4" style="font-weight:700;padding:5px 4px">المجموع</td>
        <td style="text-align:center;font-weight:700">${fIQD(tA)}</td><td></td></tr></tfoot></table>`;
    }
    summaryItems=[['السجلات',AR(recs.length),'#B37D14'],['المجموع',fIQD(tA),'#4A5A68'],['المدفوع',fIQD(paid),'#4E8A5A'],['الباقي',fIQD(tA-paid),'#A8453A']];
  }

  else if(type==='naql'){
    const tFee=recs.reduce((s,r)=>s+(r.naqlFee||0),0);
    const tPaid=recs.reduce((s,r)=>s+(r._naqlType==='dam-sub'?getDamSubNaqlPaid(r):r._naqlType==='mnl'?getNaqlPaidTotal_mnl(r):getNaqlPaidTotal(r)),0);
    const tKabs=recs.reduce((s,r)=>s+(r.nC||r.nKabs||r.transCount||r.kabs||r.kC||0),0);
    if(recs.length){
      body+=sec(`🚚 وصولات النقل (${AR(recs.length)})`);
      body+=`<table class="coltbl" style="width:100%;font-size:9px"><thead><tr>
        <th>#</th><th>التاريخ</th><th>النوع</th><th>اسم الفلاح</th><th>اللوحة</th><th>الكبسات</th><th>سعر النقل</th><th>أجور النقل</th><th>الحالة</th>
      </tr></thead><tbody>`;
      recs.forEach((r,i)=>{
        const typeLabel=r._naqlType==='buy'?'شراء':r._naqlType==='sell'?'بيع':r._naqlType==='mnl'?'نقل يدوي':'ضمانة';
        const farmer=r.driver||r.farmer||r.desc||'—';
        const kabs=r.nC||r.nKabs||r.transCount||r.kabs||r.kC||0;
        const priceEach=r.nUP||r.transPpcs||r.pricePerK||(kabs>0?(r.naqlFee||0)/kabs:0);
        const paidR=r._naqlType==='dam-sub'?getDamSubNaqlPaid(r):r._naqlType==='mnl'?getNaqlPaidTotal_mnl(r):getNaqlPaidTotal(r);
        const fullPaid=r._naqlType==='dam-sub'?isDamSubNaqlPaid(r):r._naqlType==='mnl'?(r.naqlPaid||paidR>=(r.naqlFee||0)):isNaqlFullyPaid(r);
        body+=`<tr><td style="text-align:center">${AR(i+1)}</td><td>${tAr(r.dk)}</td>
          <td style="text-align:center">${typeLabel}</td><td>${esc(farmer)}</td><td>${esc(r.plate||'—')}</td>
          <td style="text-align:center;color:#4A5A68">${AR(kabs)}</td>
          <td style="text-align:center;color:#3E4D5A">${priceEach>0?fIQD(priceEach):'—'}</td>
          <td style="text-align:center;font-weight:700;color:#8A6218">${fIQD(r.naqlFee||0)}</td>
          <td style="text-align:center;font-size:8px">${fullPaid?'<span style="color:#3F7A4C">✅</span>':paidR>0?'<span style="color:#8A6218">💰</span>':'<span style="color:#943A31">⏳</span>'}</td>
        </tr>`;
      });
      body+=`</tbody><tfoot><tr class="ctot">
        <td colspan="5" style="font-weight:700;padding:5px 4px">المجموع</td>
        <td style="text-align:center;font-weight:700">${AR(tKabs)}</td>
        <td></td>
        <td style="text-align:center;font-weight:700">${fIQD(tFee)}</td><td></td>
      </tr></tfoot></table>`;
    }
    summaryItems=[['الوصولات',AR(recs.length),'#B37D14'],['إجمالي النقل',fIQD(tFee),'#A8701C'],['المدفوع',fIQD(tPaid),'#4E8A5A'],['الباقي',fIQD(tFee-tPaid),'#A8453A'],['الكبسات',AR(tKabs),'#5E6E7C']];
  }

  if(!recs.length){
    body=`<div style="text-align:center;padding:30px;color:#6B6151;font-size:13px">لا توجد سجلات لـ "${esc(name)}" في هذه الفترة</div>`;
  }

  const summaryBar=`<div style="background:#1A1714;padding:10px 14px;margin-top:4px">
    <div style="display:flex;flex-wrap:wrap;gap:0">
      ${summaryItems.map(([k,v,c])=>`<div style="flex:1;min-width:70px;text-align:center;border-left:1px solid #2E2822;padding:7px 4px">
        <div style="font-size:9px;color:#6B6151;font-weight:700;margin-bottom:3px">${k}</div>
        <div style="font-size:12px;font-weight:700;color:${c}">${v}</div>
      </div>`).join('')}
    </div>
  </div>`;

  const titles={buy:'🚛 الوصولات',sell:'💰 البيع',dam:'🤝 الضمانات',srf:'🧾 الصرفيات',wrk:'🔧 أجور العمل',naql:'🚚 حساب النقال',arb:'🏬 وصولات أربيل'};
  return`${COHEAD}
    <div class="prh" style="background:${col}">
      <div class="prhtl">${titles[type]} — ${esc(name)}</div>
      <div class="prhmt">محصلة ${PL[period]}: ${tAr(base)}<br/>${p2(d.getHours())+':'+p2(d.getMinutes())}</div>
    </div>
    <div class="prb">${body}</div>
    ${summaryBar}${COFTR}`;
}






