/* ══════════════════════════════════════════════════════
   ميزان الشمس — مشغّل ويندوز
   ──────────────────────────────────────────────────────
   ملف exe صغير يحمل التطبيق (HTML) بداخله كمورد. عند
   التشغيل يفكّه إلى مجلد المستخدم ثم يفتحه بنافذة مستقلة
   بلا شريط عنوان المتصفح (وضع --app) مستعملاً Edge أو
   Chrome الموجود أصلاً في الجهاز.

   لماذا مجلد بيانات مستقل (--user-data-dir):
   بيانات التطبيق المحلية (localStorage) تُحفظ في ملف
   المتصفح. لو استعملنا ملف المستخدم العادي لضاعت البيانات
   إن مسح المستخدم تاريخ التصفح، ولاختلطت بجلساته. المجلد
   المستقل يجعل بيانات التطبيق ملكه وحده وتبقى بين التشغيلات.

   البناء: انظر build.sh
══════════════════════════════════════════════════════ */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shlobj.h>
#include <shellapi.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>

#define RES_APP_HTML 101
#define APP_DIR_NAME L"MizanAlShams"
#define APP_HTML_NAME L"app.html"
#define APP_TITLE L"ميزان الشمس"

/* ── المتصفحات المدعومة، بالترتيب المفضّل ── */
static const wchar_t *BROWSER_RELPATHS[] = {
    L"\\Microsoft\\Edge\\Application\\msedge.exe",
    L"\\Google\\Chrome\\Application\\chrome.exe",
    L"\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
};
static const wchar_t *PROGRAM_DIR_VARS[] = {
    L"ProgramFiles(x86)", L"ProgramFiles", L"ProgramW6432", L"LocalAppData",
};

static void die(const wchar_t *msg)
{
    MessageBoxW(NULL, msg, APP_TITLE, MB_ICONERROR | MB_OK);
}

/* يبني مساراً داخل %LOCALAPPDATA%\MizanAlShams ويُنشئ المجلد */
static BOOL app_path(wchar_t *out, size_t cap, const wchar_t *leaf)
{
    wchar_t base[MAX_PATH];
    if (FAILED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base)))
        return FALSE;
    if (_snwprintf(out, cap, L"%s\\%s", base, APP_DIR_NAME) < 0)
        return FALSE;
    CreateDirectoryW(out, NULL);
    if (leaf && *leaf) {
        size_t n = wcslen(out);
        if (_snwprintf(out + n, cap - n, L"\\%s", leaf) < 0)
            return FALSE;
    }
    return TRUE;
}

/* يكتب التطبيق المضمَّن إلى القرص — يُعاد في كل تشغيل ليأخذ أي تحديث */
static BOOL extract_html(const wchar_t *path)
{
    HRSRC res = FindResourceW(NULL, MAKEINTRESOURCEW(RES_APP_HTML), RT_RCDATA);
    if (!res) return FALSE;
    HGLOBAL blob = LoadResource(NULL, res);
    if (!blob) return FALSE;
    const void *data = LockResource(blob);
    DWORD size = SizeofResource(NULL, res);
    if (!data || !size) return FALSE;

    HANDLE f = CreateFileW(path, GENERIC_WRITE, 0, NULL,
                           CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) return FALSE;
    DWORD written = 0;
    BOOL ok = WriteFile(f, data, size, &written, NULL) && written == size;
    CloseHandle(f);
    return ok;
}

/* ── عنوان file:// مرمَّز ──
   اسم المستخدم في ويندوز قد يكون عربياً أو فيه مسافات، وكلاهما يكسر
   العنوان إن مُرّر كما هو. نحوّل المسار إلى UTF-8 ثم نرمّز كل بايت
   خارج المحارف الآمنة بصيغة %XX. */
static BOOL file_url(const wchar_t *win_path, wchar_t *out, size_t cap)
{
    char utf8[MAX_PATH * 4];
    int n = WideCharToMultiByte(CP_UTF8, 0, win_path, -1, utf8, sizeof utf8, NULL, NULL);
    if (n <= 0) return FALSE;

    static const char *SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
                              "abcdefghijklmnopqrstuvwxyz"
                              "0123456789-._~/:";
    char enc[MAX_PATH * 12];
    size_t k = 0;
    enc[k++] = 'f'; enc[k++] = 'i'; enc[k++] = 'l'; enc[k++] = 'e';
    enc[k++] = ':'; enc[k++] = '/'; enc[k++] = '/'; enc[k++] = '/';
    for (int i = 0; utf8[i] && k + 4 < sizeof enc; i++) {
        unsigned char c = (unsigned char)utf8[i];
        if (c == '\\') { enc[k++] = '/'; continue; }
        if (c < 0x80 && strchr(SAFE, c)) { enc[k++] = (char)c; continue; }
        static const char HEX[] = "0123456789ABCDEF";
        enc[k++] = '%';
        enc[k++] = HEX[c >> 4];
        enc[k++] = HEX[c & 0xF];
    }
    enc[k] = '\0';
    return MultiByteToWideChar(CP_UTF8, 0, enc, -1, out, (int)cap) > 0;
}

/* يبحث عن أول متصفح مبني على Chromium في أماكن التثبيت المعتادة */
static BOOL find_browser(wchar_t *out, size_t cap)
{
    for (size_t b = 0; b < sizeof BROWSER_RELPATHS / sizeof *BROWSER_RELPATHS; b++) {
        for (size_t v = 0; v < sizeof PROGRAM_DIR_VARS / sizeof *PROGRAM_DIR_VARS; v++) {
            wchar_t root[MAX_PATH];
            if (!GetEnvironmentVariableW(PROGRAM_DIR_VARS[v], root, MAX_PATH))
                continue;
            wchar_t path[MAX_PATH];
            if (_snwprintf(path, MAX_PATH, L"%s%s", root, BROWSER_RELPATHS[b]) < 0)
                continue;
            DWORD attr = GetFileAttributesW(path);
            if (attr != INVALID_FILE_ATTRIBUTES && !(attr & FILE_ATTRIBUTE_DIRECTORY)) {
                wcsncpy(out, path, cap);
                out[cap - 1] = L'\0';
                return TRUE;
            }
        }
    }
    return FALSE;
}

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE prev, PWSTR cmd, int show)
{
    (void)hi; (void)prev; (void)cmd; (void)show;

    wchar_t html[MAX_PATH], profile[MAX_PATH];
    if (!app_path(html, MAX_PATH, APP_HTML_NAME) ||
        !app_path(profile, MAX_PATH, L"browser")) {
        die(L"تعذّر تحديد مجلد بيانات التطبيق.");
        return 1;
    }
    if (!extract_html(html)) {
        die(L"تعذّر تجهيز ملف التطبيق.\nتأكد من صلاحية الكتابة في مجلد المستخدم.");
        return 1;
    }

    wchar_t url[MAX_PATH * 12];
    if (!file_url(html, url, MAX_PATH * 12)) {
        die(L"تعذّر تكوين عنوان التطبيق.");
        return 1;
    }

    wchar_t browser[MAX_PATH];
    if (!find_browser(browser, MAX_PATH)) {
        /* لا متصفح Chromium: افتحه بالمتصفح الافتراضي بدل أن نفشل */
        if ((INT_PTR)ShellExecuteW(NULL, L"open", html, NULL, NULL, SW_SHOWNORMAL) > 32)
            return 0;
        die(L"لم يُعثر على متصفح لتشغيل التطبيق.\n"
            L"ثبّت Microsoft Edge أو Google Chrome ثم أعد المحاولة.");
        return 1;
    }

    wchar_t cmdline[MAX_PATH * 14];
    if (_snwprintf(cmdline, MAX_PATH * 14,
                   L"\"%s\" --app=\"%s\" --user-data-dir=\"%s\" "
                   L"--window-size=1280,900 --no-first-run --no-default-browser-check "
                   L"--disable-features=Translate,AutofillServerCommunication",
                   browser, url, profile) < 0) {
        die(L"تعذّر تكوين أمر التشغيل.");
        return 1;
    }

    STARTUPINFOW si = { .cb = sizeof si };
    PROCESS_INFORMATION pi = { 0 };
    if (!CreateProcessW(NULL, cmdline, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
        die(L"تعذّر تشغيل المتصفح.");
        return 1;
    }
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}
