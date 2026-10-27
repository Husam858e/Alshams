package com.alshams.bigpack1290;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Locale;

/**
 * يعرض تطبيق الويب المضمّن في assets/www داخل WebView.
 * الملفات تُخدَم من نطاق https خاص بالتطبيق حتى تعمل وحدات JavaScript وIndexedDB وlocalStorage كما في المتصفح،
 * دون أي اتصال بالشبكة. اختيار الملفات وحفظها يمرّان بنوافذ النظام.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/index.html";
    private static final int REQ_OPEN = 1;
    private static final int REQ_SAVE = 2;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingSave;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setSupportZoom(false);

        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
                String mime = mimeOf(path);
                try {
                    InputStream in = getAssets().open("www" + path);
                    return new WebResourceResponse(mime, mime.startsWith("text/") || mime.endsWith("json") ? "utf-8" : null, in);
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (ActivityNotFoundException ignored) {
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(pick, null), REQ_OPEN);
                } catch (ActivityNotFoundException e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, R.string.no_picker, Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
        });

        if (state == null || web.restoreState(state) == null) web.loadUrl(HOME);
    }

    /** يستدعيه saveFile() في الصفحة: البيانات base64، ثم يختار المستخدم مكان الحفظ */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String base64) {
            final byte[] data;
            try {
                data = Base64.decode(base64, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingSave = data;
                    String type = mime == null ? "" : mime.split(";")[0].trim();
                    if (!(type.startsWith("text/") || type.equals("application/json"))) type = "application/octet-stream";
                    Intent save = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    save.addCategory(Intent.CATEGORY_OPENABLE);
                    save.setType(type);
                    save.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(save, REQ_SAVE);
                    } catch (ActivityNotFoundException e) {
                        pendingSave = null;
                        Toast.makeText(MainActivity.this, R.string.no_picker, Toast.LENGTH_LONG).show();
                    }
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == REQ_OPEN) {
            if (fileCallback == null) return;
            Uri[] picked = null;
            if (result == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    picked = new Uri[clip.getItemCount()];
                    for (int i = 0; i < picked.length; i++) picked[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    picked = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(picked);
            fileCallback = null;
        } else if (request == REQ_SAVE) {
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (result != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out == null) throw new IOException("no stream");
                out.write(bytes);
                Toast.makeText(this, R.string.saved, Toast.LENGTH_SHORT).show();
            } catch (IOException e) {
                Toast.makeText(this, R.string.save_failed, Toast.LENGTH_LONG).show();
            }
        } else {
            super.onActivityResult(request, result, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase(Locale.ROOT);
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }
}
