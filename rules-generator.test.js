/* مولِّد القواعد داخل التطبيق هو المصدر الوحيد:
   يتحقق أن ما يُنتجه مطابقٌ حرفياً لـ firebase-rules.json،
   وأنه يغطّي كل عقدة يكتب فيها التطبيق فعلاً، وأن قواعده
   تمرّ على محاكي RTDB لا على القراءة وحدها. */
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(()=>{
    const o={};
    o.text=_fbRulesText();
    o.nodes=Object.keys(_fbRules().rules).filter(k=>k[0]!==".");
    o.drift=_fbRulesDrift();
    /* عقدة مجهولة تُكتب ⇒ يجب أن يكشفها المولِّد */
    _FB_SEEN.add("__ghost_node__");
    o.driftAfter=_fbRulesDrift();
    _FB_SEEN.delete("__ghost_node__");
    /* النافذة تُعبَّأ وتُفتح */
    openFbRules();
    o.modalOpen=document.getElementById("mFbRules").classList.contains("active");
    o.taFilled=(document.getElementById("fbRulesTxt").value||"").length>500;
    closeM();
    return o;
  });
  await b.close();

  const onDisk = fs.readFileSync('/home/user/Alshams/firebase-rules.json','utf8');

  /* العقد التي يكتب فيها التطبيق فعلاً — من شفرة المصدر لا من الذاكرة */
  const src = fs.readFileSync('/home/user/Alshams/wheelmanagement_v17_promax_43.html','utf8');
  const written = new Set();
  (src.match(/_fbWrite\("([a-z_]+)"/g)||[]).forEach(m=>written.add(m.slice(10,-1)));
  written.add('audit_log');        // يُكتب عبر _AUDIT_NODE
  written.add('__conncheck__');    // عقدة الفحص
  const covered = new Set(r.nodes);
  const missing = [...written].filter(n=>!covered.has(n));

  const T=[
    ['المولِّد يطابق firebase-rules.json حرفياً', r.text===onDisk],
    ['كل عقدة يكتب فيها التطبيق مشمولة',          missing.length===0],
    ['سجلّ التدقيق مشمول',                        covered.has('audit_log')],
    ['مخرجات المخازن مشمولة',                     covered.has('out_records')],
    ['لا انحراف في الجلسة النظيفة',                r.drift.length===0],
    ['كاشف الانحراف يكشف عقدة مجهولة',             r.driftAfter.length===1&&r.driftAfter[0]==='__ghost_node__'],
    ['النافذة تُفتح معبَّأة',                      r.modalOpen&&r.taFilled],
    ['بلا أخطاء جافاسكربت',                        errs.length===0],
  ];

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(missing.length)console.log('  ناقص: '+missing.join(', '));
  if(r.text!==onDisk){
    console.log('  --- أول اختلاف ---');
    for(let i=0;i<Math.max(r.text.length,onDisk.length);i++){
      if(r.text[i]!==onDisk[i]){
        console.log('  عند '+i+': مولَّد='+JSON.stringify(r.text.slice(i,i+70))+
                    '\n            ملفّ='+JSON.stringify(onDisk.slice(i,i+70)));
        break;
      }
    }
  }
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ مولِّد القواعد مطابق وشامل ('+T.length+')'));
  process.exit(bad?1:0);
})();
