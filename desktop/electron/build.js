/* يحزم نسخة ويندوز المستقلة من التطبيق.
 *
 *   npm install
 *   npm run package:win
 *
 * الناتج: dist/NasaemAlKhair-win32-x64/NasaemAlKhair.exe
 *
 * ملاحظة للبناء من لينكس: ثنائيات Electron تُجلب من GitHub افتراضياً،
 * وإن كان محجوباً تُضبط ELECTRON_MIRROR على مرآة. ضبط أيقونة الـ exe
 * يمرّ عبر rcedit وهو برنامج ويندوز، فيحتاج wine على لينكس — وبدونه
 * يُبنى التطبيق سليماً بأيقونة Electron الافتراضية.
 */
const packager = require('@electron/packager');
const fs = require('node:fs');
const path = require('node:path');

const HERE = __dirname;
const APP_HTML = path.resolve(HERE, '../../wheelmanagement_v17_promax_43.html');
const ICON_DIR = path.resolve(HERE, '../launcher');

for (const [src, dest] of [
  [APP_HTML, 'app.html'],
  [path.join(ICON_DIR, 'icon.ico'), 'icon.ico'],
  [path.join(ICON_DIR, 'icon.png'), 'icon.png'],
]) {
  if (!fs.existsSync(src)) throw new Error('ملف مفقود: ' + src);
  fs.copyFileSync(src, path.join(HERE, dest));
}

packager({
  dir: HERE,
  out: path.join(HERE, 'dist'),
  platform: 'win32',
  arch: 'x64',
  name: 'NasaemAlKhair',
  icon: path.join(HERE, 'icon.ico'),
  overwrite: true,
  asar: true,
  prune: true,
  ignore: [/^\/dist($|\/)/, /^\/build\.js$/, /^\/node_modules($|\/)/],
  win32metadata: {
    CompanyName: 'Nasaem Al-Khair',
    ProductName: 'Nasaem Al-Khair',
    FileDescription: 'Nasaem Al-Khair — Weighbridge Management',
    OriginalFilename: 'NasaemAlKhair.exe',
  },
}).then(paths => {
  console.log('✅ تم البناء:', paths.join(', '));
}).catch(err => {
  console.error('‼ فشل البناء:', err.message);
  process.exit(1);
});
