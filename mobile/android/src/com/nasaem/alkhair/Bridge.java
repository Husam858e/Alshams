package com.nasaem.alkhair;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/*
 * ══════════════════════════════════════════════════════════════
 *  الجسر — window.JSBridge
 *  ──────────────────────────────────────────────────────────────
 *  الصفحة تبحث عن هذه الأسماء بعينها (shareFile · saveBase64 ·
 *  saveFile · shareText · printHtml) وتستعملها إن وجدتها، وإلّا
 *  رجعت لطرق المتصفح. فالعقد بين الطرفين هو الأسماء وترتيب
 *  الوسائط، ومُختبَرٌ من جهة الصفحة في share-apk.test.js.
 *
 *  قاعدة: كل خطأ هنا يُرمى ولا يُبتلع. الاستثناء في دالةٍ
 *  @JavascriptInterface يصل الصفحة خطأً، فتنتقل للطريق التالي
 *  بدل أن تظنّ أن الملف أُرسل.
 * ══════════════════════════════════════════════════════════════
 */
public class Bridge {

    static final String AUTHORITY = "com.nasaem.alkhair.share";

    private final MainActivity act;
    /* يُبقى مرجعاً للعارض حتى تنتهي الطباعة — وإلّا جُمع وانقطعت */
    private WebView printView;

    Bridge(MainActivity a) { act = a; }

    /* ══ المشاركة: ملفٌ حقيقي عبر قائمة الاختيار ══
       createChooser تُظهر القائمة دائماً — لا تقفز إلى تطبيقٍ
       افتراضي كما فعل إرسال النصّ المباشر (فتح Kimi وحده). */
    @JavascriptInterface
    public void shareFile(String name, String b64, String mime) throws IOException {
        final File f = writeShareFile(name, Base64.decode(b64, Base64.DEFAULT));
        final Uri uri = ShareProvider.uriFor(f);
        final String type = (mime == null || mime.isEmpty()) ? ShareProvider.mimeOf(f.getName()) : mime;
        act.ui(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(type);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, stripExt(f.getName()));
            /* ClipData يحمل الإذن عبر قائمة الاختيار إلى التطبيق المختار */
            send.setClipData(ClipData.newRawUri(f.getName(), uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, "مشاركة " + stripExt(f.getName()));
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            act.startActivity(chooser);
        });
    }

    @JavascriptInterface
    public void shareText(String text, String title) {
        act.ui(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, text);
            if (title != null) send.putExtra(Intent.EXTRA_SUBJECT, title);
            act.startActivity(Intent.createChooser(send, title == null ? "مشاركة" : title));
        });
    }

    /* ══ الحفظ في «التنزيلات» ══ */
    @JavascriptInterface
    public void saveBase64(String name, String b64, String mime) throws IOException {
        saveBytes(name, Base64.decode(b64, Base64.DEFAULT), mime);
    }

    /* نصٌّ (HTML غالباً) — تستعمله الصفحة لحفظ نسخة الوصل */
    @JavascriptInterface
    public void saveFile(String name, String text) throws IOException {
        saveBytes(name, text.getBytes(StandardCharsets.UTF_8), ShareProvider.mimeOf(name));
    }

    /* ══ الطباعة ══
       window.print() لا يفعل شيئاً داخل WebView. فالصفحة تُرسل
       الوصل جاهزاً، ويُرسم في عارضٍ مستقل يُسلَّم لخدمة الطباعة
       في أندرويد — ومنها لتطبيق الطابعة الحرارية. */
    @JavascriptInterface
    public void printHtml(String html, String jobName) {
        final String job = (jobName == null || jobName.isEmpty()) ? "وصل نسائم الخير" : jobName;
        act.ui(() -> {
            final WebView pv = new WebView(act);
            printView = pv;
            pv.getSettings().setJavaScriptEnabled(false);
            pv.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView v, String url) {
                    PrintManager pm = (PrintManager) act.getSystemService(Context.PRINT_SERVICE);
                    PrintDocumentAdapter ad = v.createPrintDocumentAdapter(job);
                    pm.print(job, ad, new PrintAttributes.Builder().build());
                }
            });
            pv.loadDataWithBaseURL(MainActivity.APP_ORIGIN, html, "text/html", "utf-8", null);
        });
    }

    /* للتشخيص في «فحص المشاركة» */
    @JavascriptInterface
    public String appVersion() {
        try {
            return act.getPackageManager().getPackageInfo(act.getPackageName(), 0).versionName;
        } catch (Exception e) { return "?"; }
    }

    /* ─────────────────────────────── داخلي ─────────────────────────────── */

    private File writeShareFile(String name, byte[] data) throws IOException {
        File dir = new File(act.getCacheDir(), ShareProvider.DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("cache dir");
        File f = new File(dir, safeName(name));
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(data); }
        return f;
    }

    private void saveBytes(String name, byte[] data, String mime) throws IOException {
        String n = safeName(name);
        String type = (mime == null || mime.isEmpty()) ? ShareProvider.mimeOf(n) : mime;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = act.getContentResolver();
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, n);
            cv.put(MediaStore.Downloads.MIME_TYPE, type);
            cv.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) throw new IOException("MediaStore insert");
            try (OutputStream o = cr.openOutputStream(uri)) {
                if (o == null) throw new IOException("open");
                o.write(data);
            }
            cv.clear();
            cv.put(MediaStore.Downloads.IS_PENDING, 0);
            cr.update(uri, cv, null, null);
        } else {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("downloads dir");
            try (FileOutputStream o = new FileOutputStream(new File(dir, n))) { o.write(data); }
        }
        toast(act, "💾 حُفظ في التنزيلات: " + n);
    }

    /* اسمٌ آمن: آخر جزءٍ فقط، بلا فواصل مسارات ولا ما يكسر نظام الملفات */
    static String safeName(String name) {
        String n = name == null ? "" : name;
        n = n.substring(Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\')) + 1);
        n = n.replaceAll("[\\x00-\\x1f:*?\"<>|]", "_").trim();
        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = "ملف";
        return n.length() > 120 ? n.substring(n.length() - 120) : n;
    }

    private static String stripExt(String n) {
        int i = n.lastIndexOf('.');
        return i > 0 ? n.substring(0, i) : n;
    }

    /* ملفات المشاركة مؤقتة — تُحذف عند كل تشغيل */
    static void cleanShareCache(Context c) {
        File dir = new File(c.getCacheDir(), ShareProvider.DIR);
        File[] fs = dir.listFiles();
        if (fs != null) for (File f : fs) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    static void toast(Context c, String msg) {
        if (c instanceof MainActivity)
            ((MainActivity) c).ui(() -> Toast.makeText(c, msg, Toast.LENGTH_LONG).show());
    }
}
