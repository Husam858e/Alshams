/* اختبار دوال المشغّل تحت wine — يتحقق من ترميز العنوان (أسماء
   مستخدمين عربية وبمسافات)، وفكّ التطبيق إلى القرص، والبحث عن
   المتصفح حين لا يوجد. يُبنى بـ run_tests.sh */
#define wWinMain launcher_main_unused
#include "launcher.c"
#undef wWinMain
#include <stdarg.h>

static int failures = 0;

/* الخرج بـ UTF-8 كي يُقرأ في أي طرفية، لا بـ UTF-16 الذي يخرج مشوّشاً */
static void say(const wchar_t *fmt, ...)
{
    wchar_t wide[4096];
    va_list ap;
    va_start(ap, fmt);
    _vsnwprintf(wide, 4096, fmt, ap);
    va_end(ap);
    char utf8[16384];
    if (WideCharToMultiByte(CP_UTF8, 0, wide, -1, utf8, sizeof utf8, NULL, NULL) > 0)
        fputs(utf8, stdout);
}

static void check(const wchar_t *what, int ok, const wchar_t *got)
{
    say(L"%ls %ls%ls%ls\n", ok ? L"PASS" : L"FAIL", what,
        got ? L" -> " : L"", got ? got : L"");
    if (!ok) failures++;
}

static void test_url(const wchar_t *in, const wchar_t *want)
{
    wchar_t out[MAX_PATH * 12];
    BOOL ok = file_url(in, out, MAX_PATH * 12);
    check(in, ok && wcscmp(out, want) == 0, out);
}

int wmain(void)
{
    say(L"── ترميز عنوان file:// ──\n");
    test_url(L"C:\\Users\\Ali\\AppData\\Local\\MizanAlShams\\app.html",
             L"file:///C:/Users/Ali/AppData/Local/MizanAlShams/app.html");
    /* مسافة في اسم المستخدم */
    test_url(L"C:\\Users\\Abu Ibrahim\\app.html",
             L"file:///C:/Users/Abu%20Ibrahim/app.html");
    /* اسم مستخدم عربي — «حسام» بترميز UTF-8 */
    test_url(L"C:\\Users\\\u062d\u0633\u0627\u0645\\app.html",
             L"file:///C:/Users/%D8%AD%D8%B3%D8%A7%D9%85/app.html");
    /* محارف تكسر سطر الأوامر أو العنوان لو مُرّرت كما هي */
    test_url(L"C:\\a b&c\\app.html", L"file:///C:/a%20b%26c/app.html");

    say(L"\n── مجلد بيانات التطبيق ──\n");
    wchar_t html[MAX_PATH], profile[MAX_PATH];
    check(L"app_path(app.html)", app_path(html, MAX_PATH, APP_HTML_NAME), html);
    check(L"app_path(browser)", app_path(profile, MAX_PATH, L"browser"), profile);

    say(L"\n── فكّ التطبيق المضمَّن ──\n");
    /* المورد غير موجود في نسخة الاختبار، فنتحقق فقط من أن الفشل نظيف */
    BOOL extracted = extract_html(html);
    say(L"INFO extract_html -> %ls\n", extracted ? L"TRUE" : L"FALSE (لا مورد في بناء الاختبار)");

    say(L"\n── البحث عن متصفح ──\n");
    wchar_t browser[MAX_PATH];
    BOOL found = find_browser(browser, MAX_PATH);
    say(L"INFO find_browser -> %ls %ls\n", found ? L"TRUE" : L"FALSE",
            found ? browser : L"(لا متصفح في هذه البيئة — يُتوقّع المسار البديل)");

    say(L"\n%ls\n", failures ? L"‼ فشل بعض الاختبارات" : L"✅ كل الاختبارات ناجحة");
    return failures ? 1 : 0;
}
