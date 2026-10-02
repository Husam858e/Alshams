package com.nasaem.alkhair;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/*
 * ══════════════════════════════════════════════════════════════
 *  مُقدِّم الملف المُشارَك
 *  ──────────────────────────────────────────────────────────────
 *  منذ أندرويد ٧ لا يجوز تمرير مسار ملف (file://) لتطبيقٍ آخر.
 *  الطريق الصحيح عنوانٌ content:// يقرؤه التطبيق المستقبِل بإذنٍ
 *  مؤقت. وهذا المُقدِّم يفعل ذلك لملفات مجلد المشاركة وحده:
 *    · غير مُصدَّر — لا يصله أحد إلا بإذنٍ مُنح لعنوانٍ بعينه.
 *    · قراءة فقط، ومن مجلد واحد، وباسم ملفٍ واحد بلا مسارات.
 *  ويُجيب عن الاسم والحجم: واتساب وجيميل يسألان عنهما قبل الإرسال،
 *  وبدونهما يظهر الملف بلا اسم أو يُرفض.
 * ══════════════════════════════════════════════════════════════
 */
public class ShareProvider extends ContentProvider {

    static final String DIR = "share";

    static Uri uriFor(File f) {
        return new Uri.Builder().scheme("content").authority(Bridge.AUTHORITY)
                .appendPath(f.getName()).build();
    }

    static String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".pdf"))  return "application/pdf";
        if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html";
        if (n.endsWith(".png"))  return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".json")) return "application/json";
        if (n.endsWith(".txt"))  return "text/plain";
        return "application/octet-stream";
    }

    /* الملف المقصود — من مجلد المشاركة وحده مهما كان العنوان */
    private File fileOf(Uri uri) throws FileNotFoundException {
        String seg = uri.getLastPathSegment();
        if (seg == null) throw new FileNotFoundException();
        File dir = new File(getContext().getCacheDir(), DIR);
        File f = new File(dir, Bridge.safeName(seg));
        try {
            if (!f.getCanonicalPath().startsWith(dir.getCanonicalPath() + File.separator))
                throw new FileNotFoundException();
        } catch (IOException e) { throw new FileNotFoundException(); }
        if (!f.isFile()) throw new FileNotFoundException(seg);
        return f;
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (mode != null && mode.contains("w")) throw new FileNotFoundException("read-only");
        return ParcelFileDescriptor.open(fileOf(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public String getType(Uri uri) {
        String seg = uri.getLastPathSegment();
        return seg == null ? null : mimeOf(seg);
    }

    @Override
    public Cursor query(Uri uri, String[] proj, String sel, String[] args, String sort) {
        File f;
        try { f = fileOf(uri); } catch (FileNotFoundException e) { return null; }
        String[] cols = proj != null ? proj
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor c = new MatrixCursor(cols, 1);
        Object[] row = new Object[cols.length];
        for (int i = 0; i < cols.length; i++) {
            if (OpenableColumns.DISPLAY_NAME.equals(cols[i])) row[i] = f.getName();
            else if (OpenableColumns.SIZE.equals(cols[i]))     row[i] = f.length();
        }
        c.addRow(row);
        return c;
    }

    @Override public Uri insert(Uri u, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri u, String s, String[] a) { throw new UnsupportedOperationException(); }
}
