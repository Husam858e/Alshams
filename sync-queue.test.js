/* يحاكي الحالة الفعلية: قيود تدقيق وصلت السيرفر ثم عَلِقت في الطابور
   لأن إعادة إرسالها مرفوضة بقاعدة «الإضافة فقط».

   ويغطّي ما أسقط التسوية الأولى فبقي ١٣٠ قيداً عالقاً:
   فايربيس لا يحفظ null ولا الفارغ، والمصفوفة تعود كائناً مفهرساً،
   وقيدُ «الإضافة فقط» الموجود لا سبيل لإعادة كتابته أبداً. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(async ()=>{
    const out=[];
    /* سيرفر وهمي يتصرّف كفايربيس: يرفض إعادة كتابة قيدٍ موجود في
       عقدة «الإضافة فقط»، ويُسقط null والكائن الفارغ عند الحفظ،
       ويُعيد المصفوفة كائناً بمفاتيح "0","1". */
    const drop=v=>{
      if(v===null||v===undefined)return undefined;
      if(typeof v!=="object")return v;
      const o={};let n=0;
      Object.keys(v).forEach(k=>{const x=drop(v[k]);if(x===undefined)return;o[k]=x;n++;});
      return n?o:undefined;
    };
    const server={audit_log:{},records:{}};
    for(let i=0;i<5;i++) server.audit_log['E'+i]={id:'E'+i,at:'t',by:'حسام',dk:'2026-09-21',mk:'2026-09'};
    let denied=0;
    db={ ref:(node)=>({ child:(id)=>({
      set:(val)=>{
        const cur=(server[node]||{})[id];
        if(node==='audit_log'&&cur!==undefined){denied++;return Promise.reject({code:'PERMISSION_DENIED'});}
        const st=drop(val);
        if(st===undefined){if(server[node])delete server[node][id];}
        else (server[node]=server[node]||{})[id]=st;
        return Promise.resolve();
      },
      remove:()=>{ if(server[node])delete server[node][id]; return Promise.resolve(); },
      once:()=>Promise.resolve({ exists:()=> (server[node]||{})[id]!==undefined,
                                 val:()=> (server[node]||{})[id] }),
    })})};

    // طابور فيه ٥ واصلة فعلاً + واحدة لم تصل
    _writeQueue=[];
    for(let i=0;i<5;i++) _writeQueue.push({node:'audit_log',id:'E'+i,
      data:{id:'E'+i,at:'t',by:'حسام',dk:'2026-09-21',mk:'2026-09'},op:'set',at:Date.now()});
    _writeQueue.push({node:'audit_log',id:'E9',
      data:{id:'E9',at:'t',by:'حسام',dk:'2026-09-21',mk:'2026-09'},op:'set',at:Date.now()});
    out.push(`الطابور قبل التسوية: ${_writeQueue.length}`);

    await toolsReconcileQueue();
    await new Promise(r=>setTimeout(r,300));
    out.push(`بعد التسوية: ${_writeQueue.length}`);
    out.push(`المتبقّي هو القيد الذي لم يصل: ${_writeQueue.length===1 && _writeQueue[0].id==='E9'}`);

    // إعادة الإرسال تُنجح الباقي
    _flushQueue();
    await new Promise(r=>setTimeout(r,300));
    out.push(`بعد إعادة الإرسال: ${_writeQueue.length}`);
    out.push(`وصل القيد الناقص للسيرفر: ${server.audit_log['E9']!==undefined}`);

    /* ══ ما أسقط التسوية الأولى ══ */

    /* ① قيد «إضافة فقط» موجود بقيمةٍ غير مطابقة: لا سبيل أبداً
       لإعادة كتابته، فإبقاؤه في الطابور حَبسٌ أبدي. الوجود يكفي. */
    _writeQueue=[{node:'audit_log',id:'E0',data:{id:'E0',at:'مختلف'},op:'set',at:Date.now()}];
    const appendOnly=await _reconcileQueued(_writeQueue[0]);
    out.push(`قيد التدقيق الموجود يُزال وإن اختلفت قيمته: ${appendOnly===true&&_writeQueue.length===0}`);

    /* ② عقدة عادية بقيمة مختلفة: لا تُزال — إعادة الإرسال ممكنة */
    server.records['R1']={id:'R1',net:100};
    _writeQueue=[{node:'records',id:'R1',data:{id:'R1',net:999},op:'set',at:Date.now()}];
    const differs=await _reconcileQueued(_writeQueue[0]);
    out.push(`عقدة عادية بقيمة مختلفة لا تُزال: ${differs===false&&_writeQueue.length===1}`);

    /* ③ فايربيس أسقط null والفارغ، فالعائد أقلّ حقولاً — ومع ذلك واصل */
    server.records['R2']=drop({id:'R2',net:50,note:null,payments:[],extra:{}});
    _writeQueue=[{node:'records',id:'R2',
      data:{id:'R2',net:50,note:null,payments:[],extra:{}},op:'set',at:Date.now()}];
    const dropped=await _reconcileQueued(_writeQueue[0]);
    out.push(`إسقاط فايربيس لـ null والفارغ لا يُفسد المطابقة: ${dropped===true}`);

    /* ④ المصفوفة تعود كائناً مفهرساً — نفس القيمة بتمثيل آخر */
    server.records['R3']={id:'R3',changes:{"0":{f:"a"},"1":{f:"b"}}};
    _writeQueue=[{node:'records',id:'R3',
      data:{id:'R3',changes:[{f:"a"},{f:"b"}]},op:'set',at:Date.now()}];
    const arr=await _reconcileQueued(_writeQueue[0]);
    out.push(`المصفوفة ككائن مفهرس تُطابق: ${arr===true}`);

    /* ⑤ ترتيب المفاتيح لا يمنع المطابقة */
    _writeQueue=[{node:'audit_log',id:'E1',
      data:{mk:'2026-09',dk:'2026-09-21',by:'حسام',at:'t',id:'E1'},op:'set',at:Date.now()}];
    const reordered=await _reconcileQueued(_writeQueue[0]);
    out.push(`ترتيب المفاتيح لا يُفسد المقارنة: ${reordered===true}`);

    /* ⑥ إنذار «مرفوض» يُمحى عند أول نجاح — وإلّا بقي بعد الإصلاح */
    _fbDenied.set('audit_log',{label:'📜 سجلّ التدقيق',node:'audit_log',count:80,at:'t'});
    _writeQueue=[];
    _fbWriteOk('audit_log','E0');
    out.push(`نجاح الكتابة يمحو إنذار الرفض: ${_fbDenied.size===0}`);

    /* ⑦ المسار الكامل: ١٣٠ قيداً واصلاً تُرفض إعادتها ⇒ يفرغ الطابور وحده */
    _writeQueue=[];
    for(let i=0;i<130;i++){
      server.audit_log['Q'+i]={id:'Q'+i,at:'t',by:'حسام'};
      _writeQueue.push({node:'audit_log',id:'Q'+i,
        data:{id:'Q'+i,at:'t',by:'حسام',note:null,changes:[]},op:'set',at:Date.now()});
    }
    _fbDenied.clear();
    _flushQueue();
    await new Promise(r=>setTimeout(r,1200));
    out.push(`١٣٠ قيداً عالقاً يفرغها الطابور تلقائياً: ${_writeQueue.length===0}`);
    out.push(`ولا يُعلن رفضاً كاذباً: ${_fbDenied.size===0}`);
    return out;
  });

  const exp=[/: 6$/,/: 1$/,/true$/,/: 0$/,/true$/,
             /true$/,/true$/,/true$/,/true$/,/true$/,/true$/,/true$/,/true$/];
  let fail=0;
  r.forEach((line,i)=>{ const ok=exp[i]&&exp[i].test(line); if(!ok)fail++;
    console.log(` ${ok?'PASS':'FAIL'} ${line}`); });
  console.log(fail?`\n‼ فشل ${fail}`:`\n✅ تسوية الطابور تعمل (${r.length})`);
  console.log('pageerrors:', errs.length?errs.join(' | '):'none');
  await b.close(); process.exit(fail?1:0);
})();
