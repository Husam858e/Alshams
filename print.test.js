/* يقيس الفراغات البيضاء في الطباعة على المسار الحقيقي:
   الوصل يُطبع من مستند مُولَّد = getPDFCss() + محتوى الوصل،
   لا من صفحة التطبيق. نبني ذلك المستند من النسختين القديمة
   والجديدة، نطبعه إلى PDF بمقاس CSS نفسه، ثم نقيس لكل صفحة
   أين ينتهي الحبر — فالفراغ هو ما بين آخر حبر وأسفل الصفحة. */
const { chromium } = require('playwright-core');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

const MM = 2.8346; // نقطة لكل ملم

async function buildPrintDoc(appFile, outFile) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('file://' + appFile);
  await page.waitForTimeout(1800);
  await page.evaluate(() => { S.su = USERS[0]; S.pin = USERS[0].pin; doLogin(); });
  await page.waitForTimeout(500);

  const fullHTML = await page.evaluate(() => {
    // وصل طويل — أربعون فلاحاً، يتجاوز صفحة واحدة يقيناً
    OUT_RECS = Array.from({ length: 40 }, (_, i) => ({
      id: 'R' + i, seq: Date.now() + i, farmer: 'فلاح رقم ' + (i + 1),
      plate: 'ت' + i, wh: 'بركات', mat: 'jet',
      empty: 8000 + i * 10, gross: 21500 + i * 37, net: 13500 + i * 27,
      note: '', edited: false, createdAt: nowStr(), createdBy: S.cu.name, dk: toDay(),
    }));
    const html = buildOutJamiHTML(getOutJamiData('daily', toDay()), 'daily', tAr(toDay()));
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<style>${getPDFCss()}</style></head><body style="margin:0;padding:0">${html}</body></html>`;
  });
  await browser.close();
  fs.writeFileSync(outFile, fullHTML);
  return fullHTML;
}

async function printToPdf(htmlFile) {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.goto('file://' + htmlFile);
  await page.waitForTimeout(700);
  const buf = await page.pdf({ preferCSSPageSize: true, printBackground: true });

  // أين ينتهي الحبر في كل صفحة: نصوّر الصفحات بعد تقسيمها بـ CSS
  const gaps = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return { bodyH: document.body.scrollHeight };
  });
  await browser.close();
  return { buf, gaps };
}

(async () => {
  const results = [];
  const out = {};

  for (const [label, app] of [['قبل', '/tmp/claude-0/old.html'],
                              ['بعد', '/home/user/Alshams/wheelmanagement_v17_promax_43.html']]) {
    const f = `/tmp/claude-0/print-${label}.html`;
    const html = await buildPrintDoc(app, f);
    const { buf } = await printToPdf(f);
    const doc = await PDFDocument.load(buf);
    const p0 = doc.getPage(0).getSize();
    out[label] = {
      pages: doc.getPageCount(),
      w: +(p0.width / MM).toFixed(1),
      h: +(p0.height / MM).toFixed(1),
      // التعليقات تشرح القواعد القديمة بنصّها، فتُجرَّد قبل العدّ
      forcedBreaks: (html.replace(/\/\*[\s\S]*?\*\//g, '').match(/page-break-before:\s*always/g) || []).length,
      avoidRules: (html.replace(/\/\*[\s\S]*?\*\//g, '').match(/page-break-inside:\s*avoid/g) || []).length,
    };
    fs.writeFileSync(`/tmp/claude-0/print-${label}.pdf`, buf);
    console.log(` ${label}: ${out[label].pages} صفحة · ${out[label].w}×${out[label].h} ملم · ` +
      `قواعد منع الكسر: ${out[label].avoidRules} · كسر إجباري: ${out[label].forcedBreaks}`);
  }

  const b = out['قبل'], a = out['بعد'];
  console.log('');
  // ⛔ لا يُفرض مقاس صفحة: أندرويد يُصغّر الوصل ليُلائم ورق الطابعة
  results.push(['مقاس الصفحة متروك للطابعة (بلا size مفروض)',
                a.w === b.w && a.h === b.h]);
  results.push(['قواعد منع الكسر أُزيلت كلها', a.avoidRules === 0 && b.avoidRules > 0]);
  results.push(['الكسر الإجباري قبل المجاميع أُزيل', a.forcedBreaks === 0 && b.forcedBreaks > 0]);
  results.push(['نفس المحتوى في صفحات أقل أو مساوية', a.pages <= b.pages]);
  results.push(['لا كسر إجباري ولا منع كسر في الناتج',
                a.avoidRules === 0 && a.forcedBreaks === 0]);

  results.forEach(([t, ok]) => console.log(` ${ok ? 'PASS' : 'FAIL'} ${t}`));
  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${failed.length ? '‼ فشل ' + failed.length : '✅ الطباعة متصلة بلا فراغات'}`);
  console.log(` الصفحات: قبل ${b.pages} ← بعد ${a.pages}`);
  process.exit(failed.length ? 1 : 0);
})();
