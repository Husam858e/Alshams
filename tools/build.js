#!/usr/bin/env node
// يجمع src/ في الملف الواحد القابل للنشر.
//   node tools/build.js          → يتحقّق فقط (لا يكتب)
//   node tools/build.js --write  → يكتب الملف الواحد
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ROOT, loadManifest, assemble } = require("./parts");

const write = process.argv.includes("--write");
const m = loadManifest();
const target = path.join(ROOT, m.target);
const out = assemble(m);
const cur = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
const h = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);

if (cur === out) {
  console.log("✓ " + m.target + " مطابق لـ src/  (sha " + h(out) + "، " + out.split("\n").length + " سطراً)");
  process.exit(0);
}

if (!write) {
  console.error("✗ " + m.target + " لا يطابق src/");
  if (cur !== null) {
    const a = cur.split("\n"), b = out.split("\n");
    console.error("  الحالي: " + a.length + " سطراً (sha " + h(cur) + ")");
    console.error("  المبني: " + b.length + " سطراً (sha " + h(out) + ")");
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i] !== b[i]) { console.error("  أول اختلاف عند السطر " + (i + 1)); break; }
    }
  }
  console.error("  للكتابة: npm run build -- --write   |   لإعادة التقسيم: npm run split");
  process.exit(1);
}

fs.writeFileSync(target, out);
console.log("✓ كُتب " + m.target + "  (sha " + h(out) + "، " + out.split("\n").length + " سطراً)");
