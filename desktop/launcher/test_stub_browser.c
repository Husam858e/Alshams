/* متصفح وهمي للاختبار: يكتب سطر الأوامر الذي وصله إلى ملف بدل أن
   يفتح نافذة، فنتحقق أن المشغّل يمرّر --app و--user-data-dir صحيحين. */
#include <windows.h>
#include <stdio.h>

int WINAPI wWinMain(HINSTANCE hi, HINSTANCE prev, PWSTR cmd, int show)
{
    (void)hi; (void)prev; (void)cmd; (void)show;
    const wchar_t *line = GetCommandLineW();
    char utf8[32768];
    int n = WideCharToMultiByte(CP_UTF8, 0, line, -1, utf8, sizeof utf8, NULL, NULL);
    HANDLE f = CreateFileW(L"C:\\stub_args.txt", GENERIC_WRITE, 0, NULL,
                           CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f != INVALID_HANDLE_VALUE) {
        DWORD w;
        WriteFile(f, utf8, n > 0 ? n - 1 : 0, &w, NULL);
        CloseHandle(f);
    }
    return 0;
}
