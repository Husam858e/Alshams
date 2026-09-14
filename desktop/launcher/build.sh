#!/usr/bin/env bash
# يبني MizanAlShams.exe — مشغّل ويندوز صغير يحمل التطبيق بداخله.
#
# المتطلبات (لينكس):  apt-get install mingw-w64 && pip install pillow
# التشغيل:            ./build.sh
set -euo pipefail

cd "$(dirname "$0")"
APP_HTML="../../wheelmanagement_v17_promax_43.html"
OUT="MizanAlShams.exe"

[ -f "$APP_HTML" ] || { echo "لم يُعثر على ملف التطبيق: $APP_HTML" >&2; exit 1; }

# المورد يُقرأ باسم app.html بجانب ملف .rc
cp "$APP_HTML" app.html
[ -f icon.ico ] || python3 make_icon.py

x86_64-w64-mingw32-windres launcher.rc -O coff -o launcher.res
x86_64-w64-mingw32-gcc -O2 -municode -mwindows -s \
  launcher.c launcher.res -o "$OUT" \
  -lshell32 -lole32 -luser32

rm -f app.html launcher.res
echo "✅ $OUT — $(du -h "$OUT" | cut -f1)"
