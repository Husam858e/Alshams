/* ══════════════════════════════════════════════════════
   ميزان الشمس — غلاف Electron
   ──────────────────────────────────────────────────────
   نسخة سطح مكتب مستقلة تماماً: تحمل متصفحها بداخلها فلا
   تعتمد على أي برنامج في الجهاز. التطبيق نفسه (app.html)
   يُحمَّل من داخل الحزمة.

   بيانات التطبيق المحلية (localStorage) تُحفظ في مجلد
   المستخدم الخاص بالتطبيق، فتبقى بين التشغيلات ولا تتأثر
   بمسح تاريخ تصفح المستخدم.
══════════════════════════════════════════════════════ */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');

const APP_HTML = path.join(__dirname, 'app.html');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 380,
    backgroundColor: '#1A1714',
    title: 'ميزان الشمس',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    webPreferences: {
      // التطبيق صفحة ويب خالصة لا تحتاج Node — نُبقي العزل قائماً
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(APP_HTML);

  // أي رابط خارجي يُفتح في متصفح النظام لا داخل نافذة التطبيق
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

/* قائمة مختصرة بالعربية — الافتراضية إنجليزية ومليئة بما لا يلزم */
function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'ملف',
      submenu: [
        { label: 'طباعة', accelerator: 'CmdOrCtrl+P',
          click: (_i, win) => win && win.webContents.print({}) },
        { type: 'separator' },
        { label: 'خروج', role: 'quit' },
      ],
    },
    {
      label: 'تحرير',
      submenu: [
        { label: 'تراجع', role: 'undo' },
        { label: 'إعادة', role: 'redo' },
        { type: 'separator' },
        { label: 'قص', role: 'cut' },
        { label: 'نسخ', role: 'copy' },
        { label: 'لصق', role: 'paste' },
        { label: 'تحديد الكل', role: 'selectAll' },
      ],
    },
    {
      label: 'عرض',
      submenu: [
        { label: 'إعادة تحميل', role: 'reload' },
        { label: 'ملء الشاشة', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'تكبير', role: 'zoomIn' },
        { label: 'تصغير', role: 'zoomOut' },
        { label: 'الحجم الأصلي', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'أدوات المطوّر', role: 'toggleDevTools' },
      ],
    },
  ]));
}

// نسخة واحدة فقط: تشغيل ثانٍ يُنشّط النافذة القائمة بدل أن يفتح غيرها
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  // فشل التحميل يجب أن يُقال بوضوح لا أن يترك نافذة بيضاء
  app.on('render-process-gone', (_e, _wc, details) => {
    dialog.showErrorBox('ميزان الشمس', 'توقّف التطبيق: ' + details.reason);
  });
}
