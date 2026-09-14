#!/usr/bin/env bash
# يبني اختبارات المشغّل ويشغّلها تحت wine.
# المتطلبات: mingw-w64 و wine64
set -euo pipefail

cd "$(dirname "$0")"
WINE="${WINE:-$(command -v wine || command -v wine64 || echo /usr/lib/wine/wine64)}"

x86_64-w64-mingw32-gcc -O1 -municode -o test_launcher.exe \
  test_launcher.c -lshell32 -lole32 -luser32

export WINEPREFIX="${WINEPREFIX:-/tmp/mizan-wine}" WINEDEBUG=-all
"$WINE" test_launcher.exe
