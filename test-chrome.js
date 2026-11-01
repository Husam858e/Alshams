/* يجد Chromium المثبّت أيّاً كان إصداره، ويعزل الفحوص عن فايربيس.
   ① المسار يتغيّر بين بيئات التشغيل (chromium-1194/chrome-linux ثم
      chromium-1243/chrome-linux64)، وكان مكتوباً حرفياً في كل فحص.
   ② الفحوص تعمل على بيانات تجريبية دون اتصال (db=null). فإن وصلت
      بيئة التشغيل إلى الإنترنت اتصل التطبيق بقاعدة البيانات الحقيقية:
      فتتذبذب الفحوص (الطابور يُرسَل في منتصفها) — والأخطر أنها قد
      تكتب بياناتٍ تجريبية في حسابات العمل الفعلية. لذلك يُشغَّل
      المتصفح عبر غلافٍ يحجب فايربيس (مكتبته وقاعدة البيانات والمصادقة)
      ويترك مكتبات PDF على cdnjs تعمل — كما كانت البيئة القديمة بلا شبكة. */
const fs = require('fs'), path = require('path'), os = require('os');
/* مكتبة فايربيس نفسها تُحجب أيضاً (gstatic، وبديلها على jsdelivr): إن حُمّلت
   أثناء الفحص أعادت ضبط db بعد أن صفّره الفحص فتسابقه. مكتبات الـPDF من cdnjs. */
const BLOCK = ['*.firebaseio.com', '*.firebasedatabase.app', 'identitytoolkit.googleapis.com',
               'securetoken.googleapis.com', 'firebaseinstallations.googleapis.com',
               'www.gstatic.com', 'cdn.jsdelivr.net'];
function realChrome(){
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = '/opt/pw-browsers';
  const dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d))
    .sort((a, b) => +b.split('-')[1] - +a.split('-')[1]);
  for (const d of dirs) for (const sub of ['chrome-linux64', 'chrome-linux']) {
    const p = path.join(base, d, sub, 'chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chromium غير موجود تحت ' + base);
}
/* حين تمرّ الشبكة بوكيل (HTTPS_PROXY) لا تكفي قواعد DNS: الوكيل هو من
   يحلّ الأسماء. فيُعطى المتصفح ملف PAC يوجّه نطاقات فايربيس إلى منفذٍ
   ميّت ويُمرّر الباقي إلى الوكيل نفسه. */
function pacArg(){
  const px = process.env.HTTPS_PROXY || process.env.https_proxy || '';
  const m = px.match(/^https?:\/\/([^/]+?)\/?$/);
  if (!m) return '';
  const dead = BLOCK.map(h => `shExpMatch(host,"${h}")`).join('||');
  const pac = `function FindProxyForURL(url,host){if(${dead})return "PROXY 127.0.0.1:9";`+
              `if(host=="localhost"||host=="127.0.0.1")return "DIRECT";return "PROXY ${m[1]}";}`;
  return `--proxy-pac-url="data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(pac).toString('base64')}"`;
}
function chromePath(){
  const real = realChrome();
  const rules = BLOCK.map(h => 'MAP ' + h + ' 127.0.0.1').join(', ');
  const w = path.join(os.tmpdir(), 'alshams-test-chrome.sh');
  const body = `#!/bin/sh\nexec "${real}" --host-resolver-rules="${rules}" ${pacArg()} "$@"\n`;
  if (!fs.existsSync(w) || fs.readFileSync(w, 'utf8') !== body) { fs.writeFileSync(w, body); fs.chmodSync(w, 0o755); }
  return w;
}
module.exports = { chromePath, realChrome };
