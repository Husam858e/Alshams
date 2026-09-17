/* يولّد PDF من المسار الحقيقي (_generatePDFBlob) ويفحص مقاسه */
const { chromium } = require('playwright-core');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const MM = 2.8346;

(async () => {
  const b = await chromium.launch({
    executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox','--ignore-certificate-errors'],
  });
  const p = await b.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(2000);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  for (const n of [5, 40]) {
    const b64 = await p.evaluate(async (count)=>{
      S.recs = Array.from({length:count},(_,i)=>({
        id:'B'+i, dk:'2026-09-0'+((i%9)+1), driver:'فلاح '+(i+1), plate:'جلاب',
        mat:'jet', wh:'بركات', status:'weighed', gross:30000, empty:8000, net:22000,
        ppkg:250, final:5500000, wFee:0, payments:[],
        nOn:true, transporter:'فنر', nC:88, nUP:300, naqlFee:26400, naqlPayments:[],
        createdAt:nowStr(), createdBy:'محمد',
      }));
      const recs=_getCustRecs('naql','فنر');
      const html=_buildCustPrintHTML('naql','فنر','daily',toDay(),recs);
      const full=`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<style>${getPDFCss()}</style></head><body style="margin:0;padding:0">${html}</body></html>`;
      const blob = await _generatePDFBlob(full, 'test');
      if(!blob) return null;
      const buf = await blob.arrayBuffer();
      let s=''; const u=new Uint8Array(buf);
      for(let i=0;i<u.length;i++) s+=String.fromCharCode(u[i]);
      return btoa(s);
    }, n);

    if(!b64){ console.log(` ${n} سجلاً → فشل توليد PDF (لم تُحمَّل المكتبات؟)`); continue; }
    const buf = Buffer.from(b64,'base64');
    const d = await PDFDocument.load(buf);
    const s = d.getPage(0).getSize();
    fs.writeFileSync(`/tmp/claude-0/receipt-${n}.pdf`, buf);
    console.log(` ${String(n).padStart(2)} سجلاً → ${d.getPageCount()} صفحة · ` +
      `${(s.width/MM).toFixed(0)}×${(s.height/MM).toFixed(0)} ملم · ${(buf.length/1024).toFixed(0)} كيلو`);
  }
  console.log('pageerrors:', errs.length?errs.join(' | '):'none');
  await b.close();
})();
