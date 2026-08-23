// أدوات مشتركة بين split.js و build.js — لا تعتمد على أي حزمة خارجية
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "build", "manifest.json");

function loadManifest() {
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (!Array.isArray(m.parts) || !m.parts.length) throw new Error("manifest: parts فارغة");
  if (m.parts[0].anchor !== null) throw new Error("manifest: أول جزء يجب أن يكون anchor:null");
  return m;
}

// يحوّل المراسي إلى أرقام أسطر (0-based) داخل الملف الواحد.
// يشترط أن يكون كل سطر مرساة فريداً تماماً — وإلا فالقطع غامض ونتوقّف.
function cutPoints(lines, parts) {
  const cuts = [0];
  let prev = 0;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const hits = [];
    for (let j = 0; j < lines.length; j++) if (lines[j] === p.anchor) hits.push(j);
    if (hits.length === 0) throw new Error(`المرساة غير موجودة لـ ${p.file}:\n  ${p.anchor}`);
    if (hits.length > 1) throw new Error(`المرساة غير فريدة (${hits.length}) لـ ${p.file}:\n  ${p.anchor}`);
    const cut = hits[0] - (p.back || 0);
    if (cut <= prev) throw new Error(`ترتيب المراسي غير تصاعدي عند ${p.file}`);
    cuts.push(cut);
    prev = cut;
  }
  cuts.push(lines.length);
  return cuts;
}

// نصّ كل جزء كما سيُكتب على القرص:
// كل الأجزاء تنتهي بسطر جديد، والأخير يتبع manifest.trailingNewline.
function partTexts(raw, m) {
  const lines = raw.split("\n");
  const cuts = cutPoints(lines, m.parts);
  return m.parts.map((p, i) => {
    const body = lines.slice(cuts[i], cuts[i + 1]).join("\n");
    const last = i === m.parts.length - 1;
    return { file: p.file, text: last && !m.trailingNewline ? body : body + "\n" };
  });
}

// يعيد تركيب الملف الواحد من الأجزاء — بالبايت، بلا أي تحويل
function assemble(m) {
  return m.parts
    .map((p, i) => {
      const f = path.join(ROOT, p.file);
      if (!fs.existsSync(f)) throw new Error("جزء مفقود: " + p.file + " — شغّل npm run split");
      const t = fs.readFileSync(f, "utf8");
      const last = i === m.parts.length - 1;
      if (last) return t;                                   // الأخير كما هو بالضبط
      if (!t.endsWith("\n")) throw new Error("جزء بلا سطر أخير: " + p.file);
      return t.slice(0, -1);                                // نُسقط الفاصل الذي يعيده join
    })
    .join("\n");
}

module.exports = { ROOT, loadManifest, cutPoints, partTexts, assemble };
