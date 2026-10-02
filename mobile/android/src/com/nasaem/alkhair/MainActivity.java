package com.nasaem.alkhair;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/*
 * ══════════════════════════════════════════════════════════════
 *  نسائم الخير — النافذة الرئيسية
 *  ──────────────────────────────────────────────────────────────
 *  الصفحة تُحمَّل من داخل التطبيق لا من الشبكة، لكن تحت عنوان
 *  https حقيقي (APP_ORIGIN). ولذلك ثلاث فوائد:
 *    ① تعمل بلا إنترنت كما كان التطبيق السابق.
 *    ② سياقٌ آمن (https) — شرطٌ لمصادقة فايربيس وللتخزين المحلي.
 *    ③ نفس الأصل الذي يعمل عليه الموقع في المتصفح، فإن كان مفتاح
 *       فايربيس مقيَّداً بالنطاق مرّ كما يمرّ هناك.
 *  أي طلب لهذا العنوان يُجاب من الملف المضمَّن ولا يصل الشبكة.
 * ══════════════════════════════════════════════════════════════
 */
public class MainActivity extends Activity {

    static final String APP_HOST   = "alsmas.netlify.app";
    static final String APP_ORIGIN = "https://" + APP_HOST + "/";

    private static final int REQ_FILE = 7001;

    WebView web;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#14110E"));
        w.setNavigationBarColor(Color.parseColor("#14110E"));

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#14110E"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage — الكاش والطابور
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);           // لا وصول لملفات الجهاز من الصفحة
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportMultipleWindows(false);    // target=_blank يمرّ من shouldOverrideUrlLoading
        s.setTextZoom(100);                    // حجم خط النظام لا يكسر تنسيق الوصولات

        web.addJavascriptInterface(new Bridge(this), "JSBridge");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        Bridge.cleanShareCache(this);

        if (state != null) web.restoreState(state);
        else web.loadUrl(APP_ORIGIN);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    /* زرّ الرجوع: الصفحة تُسأل أولاً عبر window.onAndroidBackPressed
       (تُغلق النافذة المفتوحة أو شاشة الوصل) — وإلّا خرج التطبيق كله
       ونافذةٌ مفتوحة. ثم سجلّ التصفّح، ثم الخروج. */
    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript(
            "(function(){try{return !!(window.onAndroidBackPressed&&window.onAndroidBackPressed());}"
          + "catch(e){return false;}})()",
            v -> {
                if ("true".equals(v)) return;
                if (web.canGoBack()) web.goBack();
                else finish();
            });
    }

    @Override
    protected void onDestroy() {
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }

    /* ══ الصفحة المضمَّنة + الروابط الخارجية ══ */
    /* ليست private: الفئة الداخلية الخاصة تجعل javac يولّد صنفاً تركيبياً فارغاً
       (MainActivity$1) يُسقط d8 بخطأ داخلي. */
    class Client extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!APP_HOST.equalsIgnoreCase(u.getHost())) return null;   // الشبكة كالمعتاد
            String p = u.getPath();
            if (p == null || p.equals("/") || p.equals("/index.html") || p.equals("/app.html")) {
                try {
                    InputStream in = getAssets().open("app.html");
                    WebResourceResponse r = new WebResourceResponse("text/html", "utf-8", in);
                    Map<String, String> h = new HashMap<>();
                    h.put("Cache-Control", "no-store");
                    r.setResponseHeaders(h);
                    return r;
                } catch (IOException e) {
                    return notFound();
                }
            }
            return notFound();     // لا ملفات أخرى — الصفحة ملف واحد
        }

        private WebResourceResponse notFound() {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            return route(req.getUrl());
        }

        /* ما ليس الصفحة نفسها يُفتح خارجها: المتصفح، الهاتف، واتساب…
           ومخطَّط intent: يُفتح دائماً عبر قائمة الاختيار لا مباشرةً،
           وإلّا ذهب إلى «التطبيق الافتراضي» بلا سؤال. */
        private boolean route(Uri u) {
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            if (("https".equals(scheme) || "http".equals(scheme))
                    && APP_HOST.equalsIgnoreCase(u.getHost())) return false;
            try {
                if ("intent".equals(scheme)) {
                    Intent in = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                    in.addCategory(Intent.CATEGORY_BROWSABLE);
                    in.setComponent(null);
                    in.setSelector(null);
                    if (Intent.ACTION_SEND.equals(in.getAction()))
                        startActivity(Intent.createChooser(in, "مشاركة"));
                    else
                        startActivity(in);
                    return true;
                }
                startActivity(new Intent(Intent.ACTION_VIEW, u));
            } catch (ActivityNotFoundException e) {
                Bridge.toast(MainActivity.this, "لا يوجد تطبيق يفتح هذا الرابط");
            } catch (Exception e) {
                Bridge.toast(MainActivity.this, "تعذّر فتح الرابط");
            }
            return true;
        }
    }

    /* ══ اختيار ملف (استعادة نسخة احتياطية) ══
       بلا هذا لا يفعل <input type=file> شيئاً داخل WebView. */
    class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = cb;
            Intent pick;
            try { pick = p.createIntent(); }
            catch (Exception e) {
                pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
            }
            try {
                startActivityForResult(pick, REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    /* يُستعمل من الجسر لتشغيل ما يلزم خيط الواجهة */
    void ui(Runnable r) { runOnUiThread(r); }
}
