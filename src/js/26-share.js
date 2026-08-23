/* ════════════════════════════════════════════
   تنزيل / مشاركة الوصل — HTML و PDF
════════════════════════════════════════════ */
let _dlRecId = null;

function openDownloadModal(id){
  const r=S.recs.find(x=>x.id===id);
  if(!r) return;
  _dlRecId = id;
  document.getElementById("dlRecInfo").innerHTML=
    `<strong>${esc(r.plate)}</strong> — ${esc(r.driver)}<br>
     <span style="color:var(--paper-2);font-size:11px">${tAr(r.dk||toDay())}</span>`;
  document.getElementById("mDownload").classList.add("active");
}

async function dlRec(format, action){
  const r = S.recs.find(x=>x.id===_dlRecId);
  if(!r){ closeM(); return; }
  const html = buildReceipt(r);
  const fname = `وصل_${esc(r.plate)}_${r.dk||toDay()}`;
  const fullHTML = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<style>${getPDFCss()}</style></head><body>${html}</body></html>`;

  closeM();

  if(format === "html"){
    if(action === "share"){
      // محاولة Web Share
      try{
        if(navigator.share){
          const b64 = btoa(unescape(encodeURIComponent(fullHTML)));
          const a = document.createElement("a");
          a.href="data:text/html;charset=utf-8;base64,"+b64;
          a.download=fname+".html";
          a.click();
          showToast("💾 تم حفظ HTML");
          return;
        }
      }catch(e){}
    }
    // حفظ HTML مباشرة
    _doSaveHTML(fullHTML, fname+".html");

  } else {
    // طباعة مباشرة
    closeM();
    _printViaIframe(fullHTML, fname);
  }
}

function _doSaveHTML(html, fname){
  try{
    const br=getBridge();
    if(br){
      if(br.saveFile){ br.saveFile(fname,html); showToast("💾 تم الحفظ"); return; }
    }
    const b64 = btoa(unescape(encodeURIComponent(html)));
    const a = document.createElement("a");
    a.href = "data:text/html;charset=utf-8;base64,"+b64;
    a.download = fname;
    a.style.display="none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){try{document.body.removeChild(a);}catch(e){}},2000);
    showToast("💾 تم حفظ "+fname+" في التنزيلات");
  }catch(e){
    showToast("⚠ تعذّر الحفظ");
  }
}

/* ════════════════════════════════════════════
   WAREHOUSES / STATS / REPORTS
════════════════════════════════════════════ */
function renderWH(){
  if(!S.cu)return;
  /* الساحة تُرسم في شبكتها الخاصة، والمخازن في شبكتها — كيانان منفصلان */
  const card=wh=>{
    const all=S.recs.filter(r=>r.wh===wh);
    const dn=all.filter(r=>r.final!=null);
    const ip=all.filter(r=>r.status!=="weighed");
    return `<div class="whc">
      <div class="whn">${whIcon(wh)} ${whName(wh)}</div>
      <div class="whst">
        <div class="whs"><span class="whsk">الإجمالي</span><span class="whsv">${AR(all.length)}</span></div>
        <div class="whs"><span class="whsk">مكتملة</span><span class="whsv" style="color:var(--settled)">${AR(dn.length)}</span></div>
        <div class="whs"><span class="whsk">جارية</span><span class="whsv" style="color:var(--wheat)">${AR(ip.length)}</span></div>
        <div class="whs"><span class="whsk">الصافي</span><span class="whsv">${fKG(dn.reduce((s,r)=>s+r.net,0))}</span></div>
        <div class="whs"><span class="whsk">المجموع</span><span class="whsv" style="color:var(--wheat-hi)">${fIQD(dn.reduce((s,r)=>s+r.final,0))}</span></div>
      </div>
    </div>`;
  };
  const yg=document.getElementById("YRDG");
  if(yg)yg.innerHTML=card(YARD);
  document.getElementById("WHG").innerHTML=WH_ONLY.map(card).join("");
}

function renderStats(){
  if(!S.cu)return;
  const recs=S.recs,dn=recs.filter(r=>r.final!=null);
  const st=[
    {l:"إجمالي الوصولات",v:AR(recs.length),i:"📋",c:"var(--steel)"},
    {l:"انتظار تأكيد",v:AR(recs.filter(r=>r.status==="waiting").length),i:"⏳",c:"var(--wheat)"},
    {l:"انتظار وزن فارغ",v:AR(recs.filter(r=>r.status==="confirmed").length),i:"🏭",c:"var(--wheat)"},
    {l:"مكتملة",v:AR(dn.length),i:"✅",c:"var(--settled)"},
    {l:"الوزن الصافي الكلي",v:fKG(dn.reduce((s,r)=>s+r.net,0)),i:"⚖️",c:"var(--wheat)"},
    {l:"أجور الوزن",v:fIQD(dn.reduce((s,r)=>s+r.wFee,0)),i:"💰",c:"var(--settled)"},
    {l:"أجور الكبس (مطروحة)",v:fIQD(dn.filter(r=>r.kOn).reduce((s,r)=>s+(r.kabsFee||0),0)),i:"🔧",c:"var(--steel)"},
    {l:"أجور النقل (مطروحة)",v:fIQD(dn.filter(r=>r.nOn&&r.nDeduct!==false).reduce((s,r)=>s+(r.naqlFee||0),0)),i:"🚛",c:"var(--wheat)"},
    {l:"أجور النقل (لحساب الناقل فقط)",v:fIQD(dn.filter(r=>r.nOn&&r.nDeduct===false).reduce((s,r)=>s+(r.naqlFee||0),0)),i:"📒",c:"var(--steel)"},
    {l:"أجور الوصل (مطروحة)",v:fIQD(dn.filter(r=>r.wOn).reduce((s,r)=>s+(r.waslFee||0),0)),i:"📄",c:"var(--steel)"},
    {l:"المجموع النهائي",v:fIQD(dn.reduce((s,r)=>s+r.final,0)),i:"💎",c:"var(--wheat)"},
  ];
  document.getElementById("SG").innerHTML=st.map(s=>`
    <div class="sc" style="border-top-color:${s.c}">
      <span class="si">${s.i}</span><span class="sv">${s.v}</span><span class="sl">${s.l}</span>
    </div>`).join("");
}

function sRpt(p,btn){S.rptP=p;document.querySelectorAll(".ptb").forEach(b=>b.classList.remove("active"));btn.classList.add("active");renderRpt();}
function getRptData(){
  const base=document.getElementById("rDt")?.value||toDay();
  const bd=_D(base);
  return S.recs.filter(r=>{
    if(!r.dk)return false;
    if(S.rptP==="daily")return r.dk===base;
    if(S.rptP==="weekly"){const d=(bd-_D(r.dk))/(864e5);return d>=0&&d<7;}
    if(S.rptP==="monthly")return r.dk.slice(0,7)===base.slice(0,7);
    return true;
  });
}
function renderRpt(){
  if(!S.cu)return;
  const data=getRptData();
  const wrap=document.getElementById("RW");
  if(!data.length){wrap.innerHTML=`<div style="text-align:center;color:var(--paper-3);padding:28px">لا توجد بيانات</div>`;return;}
  const dn=data.filter(r=>r.final!=null);
  const tN=dn.reduce((s,r)=>s+r.net,0);
  const tF=dn.reduce((s,r)=>s+r.final,0);
  const rows=data.map(r=>`<tr>
    <td>${tAr(r.dk)}</td><td>${esc(r.plate)}</td><td>${esc(r.driver)}</td>
    <td>${MAT[r.mat]?.label}</td><td>${esc(whName(r.wh))}</td>
    <td>${r.net?fKG(r.net):"—"}</td>
    <td style="font-weight:900">${fIQD(r.final)||"—"}</td>
    <td><span class="badge ${SB[r.status]||""}">${SL[r.status]||r.status}</span></td>
  </tr>`).join("");
  wrap.innerHTML=`<table class="rtbl"><thead><tr>
    <th>التاريخ</th><th>اللوحة</th><th>الفلاح</th><th>المادة</th><th>المخزن</th>
    <th>الصافي</th><th>المبلغ</th><th>الحالة</th>
  </tr></thead><tbody>${rows}</tbody>
  <tfoot><tr class="tot">
    <td colspan="5">الإجمالي (${AR(data.length)} وصل)</td>
    <td>${fKG(tN)}</td><td>${fIQD(tF)}</td><td>—</td>
  </tr></tfoot></table>`;
}

