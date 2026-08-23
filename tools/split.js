#!/usr/bin/env node
// يقسّم الملف الواحد إلى src/ حسب build/manifest.json
// الملف الواحد هو المصدر الرسمي — هذا يُحدّث الأجزاء منه.
const fs = require("fs");
const path = require("path");
const { ROOT, loadManifest, partTexts, assemble } = require("./parts");

const m = loadManifest();
const target = path.join(ROOT, m.target);
const raw = fs.readFileSync(target, "utf8");

const parts = partTexts(raw, m);
for (const p of parts) {
  const f = path.join(ROOT, p.file);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, p.text);
}

// تحقّق فوري: إعادة التركيب يجب أن تطابق الأصل بايتاً ببايت
const back = assemble(m);
if (back !== raw) {
  console.error("✗ إعادة التركيب لا تطابق الأصل — لم يُعتمد التقسيم");
  process.exit(1);
}

console.log("✓ قُسّم " + m.target + " إلى " + parts.length + " جزءاً");
for (const p of parts) {
  console.log("  " + String(p.text.split("\n").length - 1).padStart(6) + "  " + p.file);
}
console.log("✓ إعادة التركيب مطابقة للأصل بايتاً ببايت");
