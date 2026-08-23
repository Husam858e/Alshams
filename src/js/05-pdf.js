/* ════════════════════════════════════════════
   PDF ENGINE — html2canvas + jsPDF
   ─────────────────────────────────────────
   1. html2canvas يرسم الوصل على canvas
   2. jsPDF يحوّله لملف PDF حقيقي
   3. Web Share API يفتح قائمة التطبيقات (واتساب إلخ)
   4. download link يحفظه في مجلد التنزيلات
════════════════════════════════════════════ */

let _currentRecId   = null;
let _currentCollPeriod = null;
let _currentCollBase   = null;   // v17.48 — تاريخ الأساس الذي فُتحت به شاشة المحصلة
let _currentCollWH  = null;
let _isCollScreen   = false;

function showLoader(txt){
  const l=document.getElementById("pdfLoader");
  const t=document.getElementById("loaderTxt");
  if(t)t.textContent=txt||"جاري إنشاء PDF...";
  if(l)l.classList.add("active");
}
function hideLoader(){document.getElementById("pdfLoader")?.classList.remove("active");}

/* ══════════════════════════════════════════════════════
   PDF ENGINE — iframe + print dialog
   الحل الصحيح: نضع HTML في iframe خفي ونطبعه
   يضمن التقاط كامل الجدول بأي عرض
══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   ألوان المستند المُصدَّر — v17.43
   ──────────────────────────────────────────────────────
   الوصولات والسجلات المُصدَّرة تستعمل var(--wheat) و
   var(--paper) و var(--settled)… لكن هذه المتغيّرات كانت
   مُعرَّفة في <style> الصفحة وحدها. الملف المُصدَّر
   (iframe الطباعة · ملف HTML المُنزَّل · المُشارَك عبر
   واتساب) مستند مستقل لا يرث شيئاً منها، فكان كل
   var(--x) فيه بلا قيمة: الترويسة تفقد لونها، وشريط
   الدفع يفقد الأخضر والأحمر، ونص المجاميع يخرج بلون
   موروث عشوائي.
   نُثبّت هنا لوحة الوضع الفاتح داخل المستند المُصدَّر —
   فالوصل يُطبع على ورق أبيض دائماً مهما كان وضع الهاتف.
   (لهذا لا نُدرج كتلة الوضع الداكن: وصل أسود على ورق
   أبيض يستهلك الحبر ويخرج غير مقروء.)
══════════════════════════════════════════════════════ */
const _PDF_TOKENS=`
:root{
  --ink-000:#FFFFFF; --ink-050:#FFFFFF; --ink-100:#FFFFFF;
  --ink-200:#F1F3F5; --ink-300:#E9ECEF;
  --rule:#DDE1E6; --rule-hi:#C3CAD1;
  --paper:#16191D; --paper-2:#42474E; --paper-3:#6C737D; --paper-4:#9AA0A6;
  --wheat:#0F7B4F; --wheat-hi:#0B6440; --wheat-dim:#8FBFA8; --wheat-wash:#E7F3ED;
  --on-accent:#FFFFFF;
  --settled:#1B8A5A; --settled-wash:#E6F4EC; --settled-rule:#A7D5BE;
  --owing:#C6362E;   --owing-wash:#FCEBEA;   --owing-rule:#EDB6B2;
  --pending:#B7791F; --pending-wash:#FBF2E1; --pending-rule:#E3C68C;
  --steel:#2563EB;   --steel-wash:#E8EFFD;   --steel-rule:#B4CBF7;
}
html,body{background:#fff;color:#16191D;}
`;
// CSS مشترك للـ PDF (يُضاف داخل الـ iframe)
function getPDFCss(){
  return _PDF_TOKENS+`/* ══ إصلاح الطابعة الحرارية: تنسيق 80 ملم ══ */
.pcn{font-size:16px!important;font-weight:900!important;line-height:1.1!important;}
.pctag{font-size:8px!important;font-weight:700!important;line-height:1.2!important;margin-top:0!important;}
.pcbadge{font-size:7px!important;font-weight:800!important;padding:1px 4px!important;margin-top:1px!important;}
.pgbar{height:2px!important;margin-bottom:2px!important;}
.pct{padding:3px 5px 2px!important;}
.prh{padding:3px 6px!important;}
.prhtl{font-size:14px!important;}
.prhmt{font-size:10px!important;line-height:1.2!important;}
.prb{padding:2px 6px!important;}
.psec{padding:2px 6px!important;margin:1px 0!important;font-size:12px!important;}
.prr{padding:2px 6px!important;}
.prk{font-size:14px!important;line-height:1.2!important;}
.prv{font-size:16px!important;line-height:1.2!important;}
.prtot{padding:4px 6px!important;}
.prtot .pk{font-size:14px!important;}
.prtot .pv{font-size:16px!important;}
.prwb{padding:3px 6px!important;margin:2px 6px!important;font-size:12px!important;}
.prf{padding:3px 6px!important;}
.prft{font-size:14px!important;}
.prfi{font-size:12px!important;line-height:1.4!important;}
.prfn{font-size:8px!important;}
.coltbl th{padding:2px 3px!important;font-size:10px!important;}
.coltbl td{padding:2px 3px!important;font-size:10px!important;}
.col-wh-title{padding:3px 6px!important;font-size:11px!important;}
.col-wh-sum div{padding:3px 2px!important;}
.col-wh-sum .cv{font-size:12px!important;}
.col-wh-sum .ck{font-size:9px!important;}
.pay-bar-wrap{padding:4px 6px!important;}
.pay-bar-track{height:6px!important;}
.pay-bar-lbl{font-size:11px!important;}
.pay-hist-row{font-size:11px!important;padding:2px 0!important;}

/* ══ الأنماط الأصلية (للشاشة فقط) ══ */
.pct{background:#fff;padding:6px 10px 4px;text-align:center;border-bottom:2px solid #1A1714;font-family:Arial,Helvetica,sans-serif;}
.pcn{font-size:22px;font-weight:900;color:#000;letter-spacing:.5px;line-height:1.1;display:block;font-family:Arial,Helvetica,sans-serif;}
.pctag{font-size:10px;color:#57503F;margin-top:1px;font-weight:600;line-height:1.3;display:block;}
.pcbadge{display:inline-block;background:#B37D14;color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:20px;margin-top:2px;}
.pgbar{height:3px;background:#B37D14;margin-bottom:3px;}
.prh{background:#1A1714;color:#fff;padding:5px 10px;display:flex;justify-content:space-between;align-items:center;}
.prhtl{font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;}
.prhmt{font-size:9px;opacity:.6;text-align:left;line-height:1.4;}
.prb{padding:3px 10px;}
.psec{background:#F2EFE8;padding:2px 8px;font-size:9px;font-weight:700;color:#6B6151;text-transform:uppercase;border-top:1px solid #DED8CB;border-bottom:1px solid #DED8CB;margin:1px 0;}
.prr{display:flex;justify-content:space-between;align-items:center;padding:1px 8px;border-bottom:1px solid #FAF8F3;}
.prk{color:#57503F;font-size:14px;font-weight:600;}
.prv{color:#1A1714;font-size:16px;font-weight:700;}
.mat-ico-jet,.mat-ico-gravel,.mat-ico-straw{width:14px;height:14px;object-fit:contain;vertical-align:-3px;display:inline-block;}
.prtot{display:flex;justify-content:space-between;padding:6px 10px;background:#1A1714;}
.prtot .pk{font-size:14px;font-weight:700;color:#fff;}
.prtot .pv{font-size:16px;font-weight:700;color:#B37D14;}
.prwb{background:#FDF6E7;border:2px dashed #A8701C;border-radius:6px;padding:4px;margin:3px 10px;text-align:center;color:#8A5A14;font-weight:700;font-size:12px;}
.prf{background:#FAF8F3;border-top:2px solid #DED8CB;padding:4px 10px;text-align:center;}
.prft{font-size:14px;font-weight:700;color:#1A1714;margin-bottom:2px;}
.prfi{font-size:12px;color:#57503F;line-height:1.6;}
.prfn{font-size:8px;color:#6B6151;margin-top:1px;font-style:italic;}
.coltbl{width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed;}
.coltbl th{background:#2E2822;color:#DED8CB;padding:4px 3px;text-align:right;font-weight:700;border-bottom:2px solid #57503F;word-break:break-word;}
.coltbl td{padding:3px 3px;border-bottom:1px solid #F2EFE8;color:#1A1714;word-break:break-word;}
.coltbl tr:nth-child(even) td{background:#FAF8F3;}
.coltbl .ctot td{background:#1A1714!important;color:#B37D14!important;font-weight:700;}
.col-wh-title{background:#1A1714;color:#fff;padding:4px 10px;font-size:11px;font-weight:700;border-top:2px solid #B37D14;}
.col-wh-sum{display:flex;border-top:1px solid #DED8CB;flex-wrap:wrap;}
.col-wh-sum div{flex:1;min-width:80px;padding:4px 2px;text-align:center;border-left:1px solid #DED8CB;}
.col-wh-sum .ck{font-size:9px;color:#6B6151;font-weight:700;display:block;}
.col-wh-sum .cv{font-size:12px;font-weight:700;}

@media print{
  @page{size:80mm auto;margin:2mm;}
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact;width:74mm;margin:0 auto;padding:0;background:#fff!important;color:#000!important;font-size:16px!important;font-family:Arial,Helvetica,sans-serif!important;font-weight:700!important;direction:rtl!important;}
  *{max-width:74mm !important;box-sizing:border-box !important;font-family:Arial,Helvetica,sans-serif !important;background:transparent !important;color:#000 !important;border-color:#000 !important;text-shadow:none !important;box-shadow:none !important;}
  #aiBtn,#aiPanel,#aiPanelHd,#aiMsgs,#aiInputRow,#syncBar,#toast,#pdfLoader,.pact,.pbk-btn,.pshare-btn,button,input,select,textarea{display:none !important;visibility:hidden !important;}
  #PS{position:static!important;display:block!important;background:#fff !important;}
  .pc{width:100%!important;max-width:74mm!important;margin:0!important;padding:0!important;background:#fff !important;}
  table{page-break-inside:auto;width:100% !important;table-layout:fixed !important;border-collapse:collapse !important;}
  tr{page-break-inside:avoid;page-break-after:auto;}
  /* جذري: table-row-group بدل table-header-group يمنع تكرار رأس الجدول (thead) في كل صفحة عند الطباعة — يظهر مرة واحدة فقط في أول صفحة، طبيعياً قبل أول صف بيانات */
  thead{display:table-row-group;}
  /* جذري: table-row-group بدل table-footer-group يمنع تكرار صف "المجموع" في كل صفحة عند الطباعة — يظهر مرة واحدة فقط، طبيعياً في آخر صفحة بعد آخر صف بيانات */
  tfoot{display:table-row-group;}
  .pct{background:#fff !important;border-bottom:1px solid #000 !important;padding:1px 4px !important;}
  .pcn{font-size:16px !important;font-weight:900 !important;color:#000 !important;line-height:1.1 !important;margin-bottom:0 !important;}
  .pctag{font-size:9px !important;font-weight:700 !important;color:#2E2822 !important;line-height:1.2 !important;margin-top:0 !important;display:block !important;}
  .pgbar{background:#000 !important;height:2px !important;background-image:none !important;margin-bottom:2px !important;}
  .prh,.prtot,.col-wh-title,.prwb{background:#fff !important;color:#000 !important;border:1px solid #000 !important;box-shadow:none !important;}
  .prh{padding:2px 4px !important;border-bottom:1px solid #000 !important;}
  .prhtl{color:#000 !important;font-weight:900 !important;font-size:14px !important;}
  .prhmt{color:#2E2822 !important;font-size:10px !important;font-weight:700 !important;line-height:1.2 !important;}
  .prb{padding:0px 4px !important;}
  .psec{background:#F2EFE8 !important;color:#000 !important;border-top:1px solid #000 !important;border-bottom:1px solid #000 !important;font-size:12px !important;padding:1px 4px !important;margin:0 !important;font-weight:900 !important;letter-spacing:0 !important;}
  .prr{padding:1px 4px !important;border-bottom:1px solid #C9C1B1 !important;}
  .prk{font-size:14px !important;font-weight:700 !important;line-height:1.2 !important;color:#2E2822 !important;}
  .prv{font-size:16px !important;font-weight:900 !important;line-height:1.2 !important;color:#000 !important;}
  .prtot{padding:1px 4px !important;border:1px solid #000 !important;margin-top:0px !important;}
  .prtot .pk{color:#000 !important;font-weight:900 !important;font-size:14px !important;}
  .prtot .pv{color:#000 !important;font-weight:900 !important;font-size:16px !important;}
  .prwb{background:#fff !important;border:1px dashed #000 !important;color:#000 !important;font-weight:700 !important;font-size:12px !important;padding:2px !important;margin:1px 4px !important;}
  .coltbl{font-size:10px !important;border-collapse:collapse !important;}
  .coltbl th{background:#DED8CB !important;color:#000 !important;border:1px solid #000 !important;padding:2px 3px !important;font-size:10px !important;font-weight:900 !important;}
  .coltbl td{padding:2px 3px !important;font-size:10px !important;font-weight:700 !important;border-bottom:1px solid #C9C1B1 !important;color:#000 !important;}
  .coltbl .ctot td{background:#DED8CB !important;color:#000 !important;border-top:1px solid #000 !important;font-size:11px !important;font-weight:900 !important;}
  .col-wh-title{background:#DED8CB !important;color:#000 !important;padding:2px 4px !important;font-size:11px !important;font-weight:700 !important;border-top:1px solid #000 !important;}
  .col-wh-sum{background:#fff !important;border:1px solid #000 !important;}
  .col-wh-sum .cv{color:#000 !important;font-size:12px !important;font-weight:900 !important;}
  .col-wh-sum .ck{font-size:9px !important;font-weight:700 !important;color:#2E2822 !important;}
  .pcbadge{background:#fff !important;color:#000 !important;border:1px solid #000 !important;font-size:7px !important;font-weight:800 !important;padding:1px 3px !important;margin-top:1px !important;}
  .prf{padding:1px 4px !important;border-top:1px solid #000 !important;margin-top:0px !important;}
  .prft{font-size:14px !important;font-weight:900 !important;color:#000 !important;}
  .prfi{font-size:12px !important;font-weight:700 !important;line-height:1.3 !important;color:#2E2822 !important;}
  .prfn{font-size:8px !important;color:#57503F !important;margin-top:1px !important;font-style:italic !important;}
  .mat-ico-jet,.mat-ico-gravel,.mat-ico-straw{width:10px !important;height:10px !important;vertical-align:-2px !important;}
  .pay-bar-track{background:#C9C1B1 !important;}
  .pay-bar-fill{background:#000 !important;}

  /* ══ الحل الجذري: المجموع النهائي يبدأ في صفحة جديدة دائماً ══ */
  .grand{
    page-break-before: always !important;
    break-before: page !important;
  }

  /* ══ منع تكرار العناصر عبر الصفحات ══ */
  .rc{page-break-inside:avoid !important;}
  .fbar{page-break-after:avoid !important;}
}
  .col-wh-title,.col-wh-sum,.pct,.prf,.prtot{page-break-inside:avoid !important;}
  div{page-break-inside:auto !important;}
  /* ══ إخفاء المجموع في جميع الصفحات ما عدا الأخيرة ══ */
  .rc{page-break-inside:avoid !important;}
  .fbar{page-break-after:avoid !important;}
  .fsum{page-break-inside:avoid !important;}
  .grand{page-break-inside:avoid !important;}
}
`;
}



/* ════════════════════════════════════════════
   SHARE / PDF / DOWNLOAD — Website To App
   ─────────────────────────────────────────
   تطبيق "Website To App" يوفر bridge:
   window.JSBridge أو window.Android
   للمشاركة والحفظ
════════════════════════════════════════════ */

// اكتشاف الـ Bridge المتاح
function getBridge(){
  if(window.JSBridge)  return window.JSBridge;
  if(window.Android)   return window.Android;
  if(window.webkit && window.webkit.messageHandlers) return null; // iOS
  return null;
}

// مشاركة نص عبر Intent
function shareViaIntent(text, title){
  const br=getBridge();
  if(br){
    try{
      if(br.shareText)  { br.shareText(text,title||"ميزان الشمس"); return true; }
      if(br.share)      { br.share(title||"ميزان الشمس",text);     return true; }
    }catch(e){}
  }
  // fallback: Web Share API
  if(navigator.share){
    navigator.share({title:title||"ميزان الشمس",text:text}).catch(()=>{});
    return true;
  }
  return false;
}

// فتح نافذة PDF / مشاركة — متوافق مع Website To App
async function doMakePDF(action){
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const fname = _isCollScreen
    ? `محصلة_${PL[_currentCollPeriod]||_currentCollPeriod}_${_currentCollWH==="all"?"الكل":_currentCollWH}_${toDay()}`
    : `وصل_ميزان_الشمس_${toDay()}`;

  const fullHTML = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${fname}</title><style>${getPDFCss()}</style></head>
<body style="margin:0;padding:0">${_printHTML}</body></html>`;

  if(action === "share"){
    showLoader("جاري إنشاء PDF...");
    try{
      // ── توليد PDF حقيقي بـ jsPDF + html2canvas ──
      const pdfBlob = await _generatePDFBlob(fullHTML, fname);
      hideLoader();
      if(pdfBlob){
        // ── Web Share API مع ملف PDF ──
        try{
          if(navigator.share && navigator.canShare){
            const file = new File([pdfBlob], fname+".pdf", {type:"application/pdf"});
            if(navigator.canShare({files:[file]})){
              await navigator.share({files:[file], title:"ميزان الشمس", text:fname});
              showToast("✅ تم إرسال PDF");
              return;
            }
          }
        }catch(e){ if(e && e.name==="AbortError") return; }

        // ── fallback: تنزيل PDF مباشرة ──
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url; a.download = fname+".pdf";
        a.style.display="none";
        document.body.appendChild(a); a.click();
        setTimeout(()=>{ URL.revokeObjectURL(url); document.body.removeChild(a); },3000);
        showToast("💾 تم حفظ PDF في التنزيلات");
        return;
      }
    }catch(e){ hideLoader(); console.error("PDF error:",e); }

    // ── Fallback الأخير: HTML ──
    showLoader("جاري تجهيز الملف...");
    hideLoader();
    try{
      if(navigator.share){
        const blob = new Blob([fullHTML],{type:"text/html;charset=utf-8"});
        const file = new File([blob], fname+".html", {type:"text/html"});
        if(navigator.canShare && navigator.canShare({files:[file]})){
          await navigator.share({files:[file], title:"ميزان الشمس"});
          showToast("✅ تم الإرسال (HTML)");
          return;
        }
        const url = URL.createObjectURL(blob);
        await navigator.share({title:"ميزان الشمس", text:fname, url});
        URL.revokeObjectURL(url);
      }
    }catch(e){ if(e && e.name==="AbortError") return; }
    showToast("⚠ المشاركة غير متاحة — استخدم زر حفظ PDF");

  } else {
    // ── حفظ PDF ──
    showLoader("جاري إنشاء PDF...");
    try{
      const pdfBlob = await _generatePDFBlob(fullHTML, fname);
      hideLoader();
      if(pdfBlob){
        const url = URL.createObjectURL(pdfBlob);
        const a = document.createElement("a");
        a.href = url; a.download = fname+".pdf";
        a.style.display="none";
        document.body.appendChild(a); a.click();
        setTimeout(()=>{ URL.revokeObjectURL(url); document.body.removeChild(a); },3000);
        showToast("💾 تم حفظ PDF في التنزيلات");
        return;
      }
    }catch(e){ hideLoader(); console.error("PDF save error:",e); }
    // fallback: iframe print
    _printViaIframe(fullHTML, fname+".pdf");
  }
}

// توليد PDF حقيقي باستخدام iframe مخفي + html2canvas + jsPDF
async function _generatePDFBlob(fullHTML, fname){
  return new Promise((resolve)=>{
    try{
      // إنشاء iframe مخفي لعرض المحتوى
      const fr = document.createElement("iframe");
      fr.style.cssText="position:fixed;top:0;left:-9999px;width:794px;height:1123px;border:none;opacity:0;z-index:-1;";
      document.body.appendChild(fr);
      const doc = fr.contentDocument || fr.contentWindow.document;
      doc.open(); doc.write(fullHTML); doc.close();

      // انتظر تحميل كامل
      setTimeout(async ()=>{
        try{
          await _ensurePdfLibs();   // v17.10 — تُحمَّل عند الطلب
          const body = doc.body;
          const totalH = Math.max(body.scrollHeight, body.offsetHeight, 1123);
          const totalW = 794;

          // html2canvas
          const canvas = await html2canvas(body,{
            scale:2,
            useCORS:true,
            allowTaint:true,
            backgroundColor:"#ffffff",
            width:totalW,
            height:totalH,
            windowWidth:totalW,
            windowHeight:totalH,
            scrollX:0, scrollY:0,
            logging:false,
          });

          // jsPDF — A4
          const { jsPDF } = window.jspdf;
          const pageW=210, pageH=297; // mm
          const canvW=canvas.width, canvH=canvas.height;
          const ratio=pageW/canvW * (canvas.width/canvas.width);
          const imgH=(canvH/canvW)*pageW;
          const pdf = new jsPDF({orientation:imgH>pageH?"portrait":"portrait",unit:"mm",format:"a4"});
          const imgData = canvas.toDataURL("image/jpeg",0.92);

          if(imgH <= pageH){
            // صفحة واحدة
            pdf.addImage(imgData,"JPEG",0,0,pageW,imgH);
          } else {
            // صفحات متعددة
            let yOffset=0;
            const pageHpx=(canvH/imgH)*pageH;
            while(yOffset < canvH){
              const sliceH=Math.min(pageHpx, canvH-yOffset);
              const pageCanvas=document.createElement("canvas");
              pageCanvas.width=canvW; pageCanvas.height=Math.ceil(sliceH);
              const ctx=pageCanvas.getContext("2d");
              ctx.drawImage(canvas, 0, yOffset, canvW, sliceH, 0, 0, canvW, sliceH);
              const pageImg=pageCanvas.toDataURL("image/jpeg",0.92);
              const sliceHmm=(sliceH/canvH)*imgH;
              pdf.addImage(pageImg,"JPEG",0,0,pageW,sliceHmm);
              yOffset+=sliceH;
              if(yOffset<canvH) pdf.addPage();
            }
          }

          const blob = pdf.output("blob");
          document.body.removeChild(fr);
          resolve(blob);
        }catch(err){
          console.error("html2canvas/jsPDF error:",err);
          try{document.body.removeChild(fr);}catch(e){}
          resolve(null);
        }
      }, 1200);
    }catch(e){
      console.error("_generatePDFBlob error:",e);
      resolve(null);
    }
  });
}

// طباعة عبر iframe — يفتح حوار "حفظ كـ PDF"
function _printViaIframe(html, fname){
  try{
    const aiBtn = document.getElementById("aiBtn");
    const aiPanel = document.getElementById("aiPanel");
    if(aiBtn) aiBtn.style.display = "none";
    if(aiPanel) aiPanel.style.display = "none";

    const fr = document.createElement("iframe");
    fr.setAttribute("id","__pdfFrame__");
    fr.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:80mm;height:1px;border:none;opacity:0;z-index:-1;";
    document.body.appendChild(fr);

    const doc = fr.contentDocument || fr.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(function(){
      try{
        const body = doc.body;
        if(!body) return;

        // ═══════════════════════════════════════════════
        // الحل الجذري: إخفاء كل المجاميع ثم إظهار الأخير فقط
        // ═══════════════════════════════════════════════

        // 1. أخفِ كل المجاميع النهائية (grand) ما عدا الأخير
        const allGrand = body.querySelectorAll('.grand');
        for(var i=0; i<allGrand.length-1; i++){
          allGrand[i].style.display = 'none';
        }
        if(allGrand.length > 0){
          var lastGrand = allGrand[allGrand.length-1];
          lastGrand.style.display = '';
          lastGrand.style.pageBreakBefore = 'always';
          lastGrand.style.breakBefore = 'page';
        }

        // 2. أخفِ كل المجاميع الفرعية (col-wh-sum) ما عدا الأخير
        const allColWh = body.querySelectorAll('.col-wh-sum');
        for(var i=0; i<allColWh.length-1; i++){
          allColWh[i].style.display = 'none';
        }
        if(allColWh.length > 0){
          allColWh[allColWh.length-1].style.display = '';
        }

        // 3. أخفِ كل صفوف المجموع داخل الجداول (ctot) ما عدا الأخيرة
        const allCtot = body.querySelectorAll('.ctot');
        for(var i=0; i<allCtot.length-1; i++){
          allCtot[i].style.display = 'none';
        }

        // 4. أخفِ كل fsum ما عدا الأخير
        const allFsum = body.querySelectorAll('.fsum');
        for(var i=0; i<allFsum.length-1; i++){
          allFsum[i].style.display = 'none';
        }
        if(allFsum.length > 0){
          allFsum[allFsum.length-1].style.display = '';
        }

        // 5. إزالة أشرطة الفلتر المكررة
        const fbars = body.querySelectorAll('.fbar');
        for(var i=0; i<fbars.length-1; i++){
          if(fbars[i] && fbars[i].parentNode){
            fbars[i].parentNode.removeChild(fbars[i]);
          }
        }

        // 6. طباعة
        fr.contentWindow.focus();
        fr.contentWindow.print();

      }catch(err){
        console.error("Print iframe error:", err);
      }

      setTimeout(function(){ 
        try{ 
          var oldFr = document.getElementById("__pdfFrame__");
          if(oldFr && oldFr.parentNode) oldFr.parentNode.removeChild(oldFr);
        }catch(e){} 
        if(aiBtn) aiBtn.style.display = "";
        if(aiPanel) aiPanel.style.display = "";
      }, 8000);

    }, 1500);

  }catch(e){
    _downloadHTML(html, fname);
  }
}
function _downloadHTML(html, fname){
  try{
    // محاولة bridge أولاً
    const br=getBridge();
    if(br && br.downloadFile){ br.downloadFile(fname, html); showToast("💾 تم الحفظ"); return; }
    if(br && br.saveFile)    { br.saveFile(fname, html);     showToast("💾 تم الحفظ"); return; }

    // data URI (يعمل في معظم WebViews)
    const b64 = btoa(unescape(encodeURIComponent(html)));
    const a = document.createElement("a");
    a.href = "data:text/html;charset=utf-8;base64," + b64;
    a.download = fname;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ try{document.body.removeChild(a);}catch(e){} }, 3000);
    showToast("💾 تم الحفظ في التنزيلات");
  }catch(e){
    showToast("⚠ تعذّر الحفظ");
  }
}

/* ── طباعة مباشرة من شاشة الوصل ── */
function doPrint(){
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const fname = _isCollScreen
    ? `محصلة_${PL[_currentCollPeriod]||_currentCollPeriod}_${_currentCollWH==="all"?"الكل":_currentCollWH}_${toDay()}`
    : `وصل_ميزان_الشمس_${toDay()}`;
  const fullHTML = `<!DOCTYPE html><html lang="ar" dir="rtl"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${fname}</title><style>${getPDFCss()}</style></head>
<body style="margin:0;padding:0">${_printHTML}</body></html>`;
  _printViaIframe(fullHTML, fname);
}

/* ── Excel من شاشة الوصل ─────────────────────────────────── */
function doShareXLFromPrint(){
  doShareXL(_isCollScreen?(_currentCollPeriod||S.rptP):S.rptP,
            _isCollScreen?(_currentCollWH||"all"):"all");
}

/* ── مشاركة Excel ────────────────────────────────────────── */
async function doShareXL(period,wh){
  wh=wh||"all";
  const data=getXLData(period||S.rptP,wh,_currentCollBase||toDay());
  if(!data.length){showToast("⚠ لا بيانات");return;}
  try{await _ensureLib("xlsx");}catch(e){return;}   // v17.10 — تُحمَّل عند الطلب
  const PL={daily:"اليوم",weekly:"الأسبوع",monthly:"الشهر"};
  const fname=`ميزان_الشمس_${PL[period||S.rptP]||period}${wh==="all"?"":"_"+wh}_${toDay()}.xlsx`;
  try{
    const arr = makeXLBlob(data, wh==="all"?"وصلات":whTitle(wh).replace(/ /g,"_"));

    // محاولة Bridge
    const br=getBridge();
    if(br){
      try{
        const b64=btoa(String.fromCharCode.apply(null,new Uint8Array(arr)));
        if(br.saveExcel){ br.saveExcel(fname,b64); showToast("✅ تم حفظ Excel"); return; }
        if(br.shareFile){ br.shareFile(fname,b64,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); showToast("✅ تم"); return; }
      }catch(e){}
    }

    // Web Share API
    try{
      const blob=new Blob([arr],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      const file=new File([blob],fname,{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
      if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
        navigator.share({files:[file],title:"ميزان الشمس",text:"تقرير Excel"})
          .then(function(){showToast("✅ تم إرسال Excel");})
          .catch(function(e){if(e.name!=="AbortError")_xlSave(arr,fname);});
        return;
      }
    }catch(e){}

    _xlSave(arr,fname);
  }catch(e){showToast("⚠ خطأ في Excel: "+e.message);}
}
function _xlSave(arr,fname){
  try{
    // data URI للـ Excel
    const b64=btoa(String.fromCharCode.apply(null,new Uint8Array(arr)));
    const a=document.createElement("a");
    a.href="data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,"+b64;
    a.download=fname; a.style.display="none";
    document.body.appendChild(a); a.click();
    setTimeout(function(){try{document.body.removeChild(a);}catch(e){}},3000);
    showToast("📥 تم حفظ Excel");
  }catch(e){showToast("⚠ تعذّر حفظ Excel");}
}

/* v17: حُذف تعريف doShareColl المكرر هنا — كان يُلغى دائماً بالتعريف اللاحق */

/* ── زر الرجوع الفيزيائي Android ────────────────────────── */
window.onAndroidBackPressed = function(){
  if(document.getElementById("PS").classList.contains("active")){closePrint();return true;}
  const m=document.querySelector(".mo.active");if(m){closeM();return true;}
  return false;
};
try{history.pushState({page:"app"},"","");}catch(e){}
window.addEventListener("popstate",function(){
  try{
    if(document.getElementById("PS").classList.contains("active")){
      closePrint();return;
    }
    const m=document.querySelector(".mo.active");
    if(m){closeM();return;}
  }catch(e){}
});


