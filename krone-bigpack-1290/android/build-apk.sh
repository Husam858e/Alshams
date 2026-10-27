#!/usr/bin/env bash
# يبني APK للتطبيق بأدوات Android SDK مباشرة (بدون Gradle).
# المتطلبات: JDK 17 أو أحدث، و Android SDK فيه platforms;android-36 و build-tools;36.0.0.
#   ANDROID_HOME=/path/to/sdk ./build-apk.sh
# التوقيع: KEYSTORE (افتراضياً build/release.keystore ويُنشأ إن لم يوجد)، KS_PASS، KS_ALIAS.
# احتفظ بملف المفتاح نفسه لكل الإصدارات، وإلا فلن يُثبَّت التحديث فوق النسخة السابقة.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
[ -n "$SDK" ] || { echo "ANDROID_HOME is not set" >&2; exit 1; }
BT="$SDK/build-tools/${BUILD_TOOLS:-36.0.0}"
JAR="$SDK/platforms/${PLATFORM:-android-36}/android.jar"
VERSION_CODE="${VERSION_CODE:-1}"
VERSION_NAME="${VERSION_NAME:-1.0}"
OUT="$HERE/build"
KEYSTORE="${KEYSTORE:-$OUT/release.keystore}"
KS_PASS="${KS_PASS:-bigpack1290}"
KS_ALIAS="${KS_ALIAS:-bigpack}"
APK="$OUT/BiGPack1290-$VERSION_NAME.apk"

rm -rf "$OUT/www" "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex" "$OUT"/*.apk
mkdir -p "$OUT/assets" "$OUT/res" "$OUT/gen" "$OUT/classes" "$OUT/dex" "$OUT/cache"

echo "• web assets"
python3 "$HERE/tools/prepare_www.py" "$HERE/../index.html" "$OUT/assets/www" "$OUT/cache"

echo "• resources"
"$BT/aapt2" compile --dir "$HERE/res" -o "$OUT/res/res.zip"
"$BT/aapt2" link -o "$OUT/unsigned.apk" -I "$JAR" \
  --manifest "$HERE/AndroidManifest.xml" "$OUT/res/res.zip" -A "$OUT/assets" \
  --java "$OUT/gen" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" -0 wasm

echo "• java"
find "$HERE/java" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -source 8 -target 8 -bootclasspath "$JAR" -Xlint:-options -encoding UTF-8 \
  -d "$OUT/classes" @"$OUT/sources.txt"
find "$OUT/classes" -name '*.class' > "$OUT/classes.txt"
"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT/dex" @"$OUT/classes.txt"
(cd "$OUT/dex" && zip -q -X "$OUT/unsigned.apk" classes.dex)

echo "• align and sign"
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias "$KS_ALIAS" \
    -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=BiG Pack 1290, O=Alshams" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias "$KS_ALIAS" \
  --out "$APK" "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs "$APK" | head -3
rm -f "$OUT/unsigned.apk" "$OUT/aligned.apk" "$APK.idsig"
"$BT/aapt2" dump badging "$APK" | grep -E "^package|^sdkVersion|^targetSdkVersion|^application-label:"
ls -l "$APK"
