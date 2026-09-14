/* اختبار دخان لغلاف Electron: يشغّل main.js فعلياً ثم يتحقق أن
 * النافذة فُتحت، وأن التطبيق حُمِّل بلا أخطاء، وأن القسم الجديد
 * موجود داخلها. يُشغَّل بـ run_tests.sh
 */
const { app, BrowserWindow } = require('electron');

const problems = [];
const say = m => process.stdout.write(m + '\n');

require('./main.js');

app.whenReady().then(async () => {
  // نمهل النافذة لحظة كي تُنشأ ويكتمل التحميل
  await new Promise(r => setTimeout(r, 1500));

  const wins = BrowserWindow.getAllWindows();
  say(wins.length === 1 ? 'PASS نافذة واحدة أُنشئت' : `FAIL عدد النوافذ = ${wins.length}`);
  if (wins.length !== 1) problems.push('windows');

  const win = wins[0];
  const wc = win.webContents;
  wc.on('console-message', (_e, level, message) => {
    if (level >= 2) problems.push('console: ' + message);
  });

  await new Promise(r => (wc.isLoading() ? wc.once('did-finish-load', r) : r()));
  await new Promise(r => setTimeout(r, 1500));

  const checks = await wc.executeJavaScript(`(() => ({
    title: document.title,
    outNew: !!document.getElementById('tc-out-new'),
    outRecs: !!document.getElementById('tc-out-recs'),
    outJami: !!document.getElementById('tc-out-jami'),
    outFns: ['submitOutRec','renderOutRecs','renderOutJami','outNetByWh']
              .every(f => typeof window[f] === 'function'),
    tabs: document.querySelectorAll('.tbb').length,
    localStorage: (() => { try { localStorage.setItem('_t','1');
        return localStorage.getItem('_t') === '1'; } catch (e) { return false; } })(),
  }))()`);

  for (const [k, v] of Object.entries(checks)) {
    const ok = k === 'title' ? v === 'ميزان الشمس' : (k === 'tabs' ? v > 40 : v === true);
    say(`${ok ? 'PASS' : 'FAIL'} ${k} = ${v}`);
    if (!ok) problems.push(k);
  }

  say(problems.length ? `\n‼ مشاكل: ${problems.join(' | ')}` : '\n✅ غلاف Electron سليم');
  app.exit(problems.length ? 1 : 0);
});
