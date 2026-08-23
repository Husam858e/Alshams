/* ══════════════════════════════════════════════════════════════
   t_build — حارس التقسيم
   ──────────────────────────────────────────────────────────────
   الملف الواحد هو ما يُنشر فعلاً. التقسيم إلى src/ للقراءة
   والمراجعة فقط، ولا يُسمح له بأن يغيّر بايتاً واحداً.

   هذه المجموعة تثبت أربعة أشياء:
     ١) كل مرساة في build/manifest.json موجودة وفريدة
     ٢) تجميع src/ يُعيد الملف الواحد بايتاً ببايت
     ٣) إعادة التقسيم من الملف الواحد تُعطي نفس الأجزاء الحالية
        (أي أن src/ ليست متأخّرة عن الملف)
     ٤) كل جزء JS صالح نحوياً وحده — دليل أن القطع وقع في
        مستوى أعلى، لا داخل دالة أو نصّ
══════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { ROOT, loadManifest, cutPoints, partTexts, assemble } = require("../tools/parts");

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  ✗ " + m)); };

const m = loadManifest();
const target = path.join(ROOT, m.target);
const raw = fs.readFileSync(target, "utf8");
const lines = raw.split("\n");

/* ١) المراسي */
let cuts = null;
try {
  cuts = cutPoints(lines, m.parts);
  pass++;
} catch (e) {
  fail++; console.log("  ✗ المراسي: " + e.message);
}
if (cuts) {
  ok(cuts.length === m.parts.length + 1, "عدد نقاط القطع لا يطابق عدد الأجزاء");
  let asc = true;
  for (let i = 1; i < cuts.length; i++) if (cuts[i] <= cuts[i - 1]) asc = false;
  ok(asc, "نقاط القطع ليست تصاعدية");
}

/* ٢) التجميع يطابق الملف الواحد */
let built = null;
try { built = assemble(m); pass++; } catch (e) { fail++; console.log("  ✗ التجميع: " + e.message); }
if (built !== null) {
  ok(built === raw, "الملف المبني من src/ لا يطابق " + m.target);
  if (built !== raw) {
    const a = raw.split("\n"), b = built.split("\n");
    for (let i = 0; i < Math.max(a.length, b.length); i++)
      if (a[i] !== b[i]) { console.log("    أول اختلاف عند السطر " + (i + 1)); break; }
  }
}

/* ٣) src/ ليست متأخّرة عن الملف الواحد */
let stale = 0;
for (const p of partTexts(raw, m)) {
  const f = path.join(ROOT, p.file);
  if (!fs.existsSync(f)) { stale++; console.log("    مفقود: " + p.file); continue; }
  if (fs.readFileSync(f, "utf8") !== p.text) { stale++; console.log("    متأخّر: " + p.file); }
}
ok(stale === 0, stale + " جزءاً في src/ لا يطابق الملف الواحد — شغّل npm run split");

/* ٤) كل جزء JS صالح نحوياً وحده */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "alshams-parts-"));
let jsParts = 0, jsBad = 0;
for (const p of m.parts) {
  if (!p.file.endsWith(".js")) continue;
  jsParts++;
  const f = path.join(tmp, path.basename(p.file));
  fs.writeFileSync(f, fs.readFileSync(path.join(ROOT, p.file), "utf8"));
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { jsBad++; console.log("    نحو مكسور: " + p.file + " — " + String(e.stderr).split("\n")[1]); }
}
fs.rmSync(tmp, { recursive: true, force: true });
ok(jsParts >= 20, "عدد أجزاء JS أقل من المتوقّع: " + jsParts);
ok(jsBad === 0, jsBad + " من أجزاء JS لا يصلح وحده — القطع وقع داخل بنية");

/* الملف كله يبقى صالحاً */
const tmp2 = path.join(os.tmpdir(), "alshams-all-" + process.pid + ".js");
const A = lines.findIndex(l => l.trim() === "<script>");
const B = lines.findIndex(l => l.trim() === "</script>");
ok(A > 0 && B > A, "لم يُعثر على وسم <script> في الملف");
if (A > 0 && B > A) {
  fs.writeFileSync(tmp2, lines.slice(A + 1, B).join("\n"));
  try { execFileSync(process.execPath, ["--check", tmp2], { stdio: "pipe" }); pass++; }
  catch (e) { fail++; console.log("  ✗ نصّ <script> الكامل لا يصلح نحوياً"); }
  fs.rmSync(tmp2, { force: true });
}

console.log(`\nنجح ${pass} / ${pass + fail}`);
console.log(fail ? "FAIL" : "ALL CHECKS PASSED");
process.exit(fail ? 1 : 0);
