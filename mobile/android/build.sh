#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
#  بناء NasaemAlKhair.apk — بأدوات أندرويد الخام، بلا Gradle
#  ──────────────────────────────────────────────────────────────
#  ثلاث فئات Java وملف HTML واحد لا تحتاج نظام بناء كاملاً:
#    aapt2 (الموارد) ← javac ← d8 (dex) ← zipalign ← apksigner
#
#  المتطلبات:
#    ANDROID_SDK   مجلد SDK فيه platforms/android-34 و build-tools/36.1.0
#    KEYSTORE      ملف مفتاح التوقيع (.jks)
#    KS_PASS       كلمة سرّه
#
#  ⚠️ المفتاح لا يُرفع إلى المستودع (المستودع عام). احتفظ به:
#     تحديث التطبيق لاحقاً يجب أن يُوقَّع بالمفتاح نفسه، وإلّا رفض
#     أندرويد التثبيت فوقه وأُجبرت على حذف القديم.
# ══════════════════════════════════════════════════════════════
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
: "${ANDROID_SDK:?اضبط ANDROID_SDK}"
: "${KEYSTORE:?اضبط KEYSTORE — مسار ملف المفتاح}"
: "${KS_PASS:?اضبط KS_PASS}"
KS_ALIAS="${KS_ALIAS:-nasaem}"

# ⚠️ ٣٦٫١ أو أحدث: d8 في ٣٤٫٠ ينهار على ملفات javac 21 — يكتب javac
#    مدخلاً بلا اسم للمعامل الضمني في مُنشئ الفئة الداخلية، وd8 القديم
#    يقرأ الاسم فيجده فارغاً (NullPointerException داخلي).
BT="$ANDROID_SDK/build-tools/${BT_VER:-36.1.0}"
JAR="$ANDROID_SDK/platforms/android-34/android.jar"
OUT="$HERE/build"
rm -rf "$OUT"; mkdir -p "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex" "$OUT/assets"

# ① الصفحة نفسها تُضمَّن في التطبيق
cp "$ROOT/wheelmanagement_v17_promax_43.html" "$OUT/assets/app.html"

# ② الموارد
"$BT/aapt2" compile --dir "$HERE/res" -o "$OUT/res/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" \
  -I "$JAR" \
  --manifest "$HERE/AndroidManifest.xml" \
  -A "$OUT/assets" \
  --java "$OUT/gen" \
  --min-sdk-version 24 --target-sdk-version 34 \
  "$OUT/res/res.zip"

# ③ الشيفرة
find "$HERE/src" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -encoding UTF-8 --release 8 -nowarn -Xlint:-options \
  -classpath "$JAR" -d "$OUT/classes" @"$OUT/sources.txt" 2>&1 | grep -v "^Note:" || true
[ -f "$OUT/classes/com/nasaem/alkhair/MainActivity.class" ] || { echo "✗ فشل javac"; exit 1; }

"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT/dex" \
  $(find "$OUT/classes" -name '*.class')

# ④ التجميع والمحاذاة والتوقيع
cp "$OUT/base.apk" "$OUT/unsigned.apk"
( cd "$OUT/dex" && zip -q -j "$OUT/unsigned.apk" classes.dex )
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --v4-signing-enabled false \
  --out "$HERE/NasaemAlKhair.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$HERE/NasaemAlKhair.apk"

SIZE=$(du -h "$HERE/NasaemAlKhair.apk" | cut -f1)
echo "✅ NasaemAlKhair.apk — $SIZE"
