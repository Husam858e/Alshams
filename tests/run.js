#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   مُشغّل الاختبارات — ميزان الشمس
   ──────────────────────────────────────────────────────────────
   يشغّل كل مجموعة في عملية مستقلة (كي لا تُلوّث واحدة الأخرى)
   ويجمع النتائج. يُرجع رمز خروج غير صفري إن أخفق شيء، فيصلح
   للاستعمال في أي فحص آلي.

     node tests/run.js            كل المجموعات
     node tests/run.js t_pay tz   مجموعات بعينها
══════════════════════════════════════════════════════════════ */
const {execFileSync}=require("child_process");
const fs=require("fs"), path=require("path");

const DIR=__dirname;
const SKIP=new Set(["run.js","lib.js"]);
const pick=process.argv.slice(2);
let files=fs.readdirSync(DIR).filter(f=>f.endsWith(".js")&&!SKIP.has(f)).sort();
if(pick.length)files=files.filter(f=>pick.some(p=>f===p||f===p+".js"));

if(!files.length){console.error("لا مجموعات مطابقة");process.exit(2);}

const FAIL=/^FAIL|✗ |ISSUES REMAIN|VISIBLE-MARKUP|\*\*\* /m;
let bad=0, ran=0;
const t0=Date.now();
console.log("تشغيل "+files.length+" مجموعة…\n");

for(const f of files){
  let out="", code=0;
  try{
    out=execFileSync(process.execPath,[path.join(DIR,f)],
      {encoding:"utf8",timeout:180000,stdio:["ignore","pipe","pipe"]});
  }catch(e){
    out=(e.stdout||"")+(e.stderr||""); code=e.status==null?1:e.status;
  }
  ran++;
  const failed=FAIL.test(out)||code>1;
  const score=(out.match(/نجح [0-9٠-٩]+ \/ [0-9٠-٩]+/)||[])[0]
           || (out.match(/ALL (CHECKS )?PASSED|SWEEP CLEAN|no over-escaping|DROPPED: \(none\)/)||["ok"])[0];
  if(failed){
    bad++;
    console.log("✗ "+f.padEnd(14)+score);
    out.split("\n").filter(l=>/✗|FAIL/.test(l)).slice(0,6).forEach(l=>console.log("    "+l.trim()));
  } else console.log("✓ "+f.padEnd(14)+score);
}
const secs=Math.round((Date.now()-t0)/1000);
console.log("\n"+"─".repeat(46));
console.log(bad? `✗ أخفقت ${bad} من ${ran} مجموعة  (${secs}ث)`
               : `✓ نجحت كل المجموعات — ${ran} مجموعة  (${secs}ث)`);
process.exit(bad?1:0);
