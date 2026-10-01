/* يحاكي العطل الواقع حرفياً: ثلاثة مفاتيح سليمة، وكتالوج
   المزوّدين تبدّل — OpenRouter حذف نموذجيه، وGoogle حصرت 2.5.
   يتحقق أن المساعد يكتشف الأسماء الحيّة فيعمل، وأنه حين يفشل
   يقول ما قاله كل مزوّد بدل أن يتّهم الحصص. */
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
    const o={};
    const J=(x,st)=>Promise.resolve({ok:(st||200)<400,status:st||200,
      json:()=>Promise.resolve(x), text:()=>Promise.resolve(JSON.stringify(x))});

    /* السيرفرات الوهمية: ما يُرجعه كل مزوّد اليوم فعلاً */
    let live={
      gemini:["gemini-3.8-flash","gemini-3.5-flash-lite","text-embedding-004"],
      groq:["llama-3.3-70b-versatile","whisper-large-v3"],
      openrouter:["google/gemma-4-31b-it:free","meta-llama/llama-3.3-70b-instruct"],
    };
    const calls=[];
    const stub=(behave)=>{ window.fetch=(url,opt)=>{
      url=String(url);
      if(url.indexOf("generativelanguage")>=0&&url.indexOf("/models?")>=0)
        return J({models:live.gemini.map(n=>({name:"models/"+n,supportedGenerationMethods:["generateContent"]}))});
      if(url.indexOf("api.groq.com/openai/v1/models")>=0)
        return J({data:live.groq.map(id=>({id}))});
      if(url.indexOf("openrouter.ai/api/v1/models")>=0)
        return J({data:live.openrouter.map(id=>({id}))});
      if(url.indexOf("api.cerebras.ai/v1/models")>=0)
        return J({data:[{id:"gpt-oss-120b"}]});
      /* نداء محادثة */
      const body=JSON.parse(opt.body);
      const model=body.model||url.split("/models/")[1].split(":")[0];
      const prov=url.indexOf("generativelanguage")>=0?"gemini"
                :url.indexOf("groq")>=0?"groq"
                :url.indexOf("openrouter")>=0?"openrouter":"cerebras";
      calls.push({prov,model});
      const res=behave(prov,model);
      if(res.err)return J({error:{message:res.err,code:res.code}},res.code);
      return prov==="gemini"
        ? J({candidates:[{content:{parts:[{text:res.text}]}}]})
        : J({choices:[{message:{content:res.text}}]});
    };};

    const key=pid=>{const pr=_AI_PROVIDERS.find(x=>x.id===pid);localStorage.setItem(pr.ks,"k");};
    const clearAll=()=>{_AI_PROVIDERS.forEach(pr=>{
      localStorage.removeItem(pr.ks); localStorage.removeItem(_aiMK(pr));
      delete _aiCooldown[pr.id];});};

    /* ══ ① العطل الواقع: الأسماء المكتوبة ماتت ══
       النموذج المكتوب لـ gemini هو 3.5-flash-lite وهو حيّ،
       لكن نجرّب الحالة الأسوأ: المكتوب كله مفقود ⇒ الاكتشاف ينقذ */
    clearAll(); key("openrouter");
    stub((prov,model)=>({text:"تمام"}));
    const or=_AI_PROVIDERS.find(x=>x.id==="openrouter");
    const mods=await _aiModels(or);
    o.orDiscovered=mods;
    o.orPicksFreeOnly=mods.length>0&&mods.every(m=>/:free$/.test(m));
    o.orSkippedDead=mods.indexOf("deepseek/deepseek-chat:free")<0;

    /* ② الاكتشاف يُسقط ما لا يصلح للمحادثة */
    clearAll(); key("groq");
    const gq=await _aiModels(_AI_PROVIDERS.find(x=>x.id==="groq"));
    o.groqNoWhisper=gq.indexOf("whisper-large-v3")<0&&gq.indexOf("llama-3.3-70b-versatile")>=0;
    clearAll(); key("gemini");
    const gm=await _aiModels(_AI_PROVIDERS.find(x=>x.id==="gemini"));
    o.geminiNoEmbed=gm.indexOf("text-embedding-004")<0&&gm.length>0;

    /* ③ المكتوب الحيّ يُقدَّم على المكتشف */
    o.geminiPrefersPinned=gm[0]==="gemini-3.5-flash-lite";

    /* ④ النتيجة تُخزَّن فلا يُسأل المزوّد مع كل رسالة */
    const before=calls.length;
    await _aiModels(_AI_PROVIDERS.find(x=>x.id==="gemini"));
    o.cached=!!_aiCachedModels(_AI_PROVIDERS.find(x=>x.id==="gemini"));

    /* ══ ⑤ الرسالة لا تتّهم الحصص إن لم تكن الحصص ══ */
    clearAll(); key("gemini"); key("openrouter");
    stub((prov,model)=>({err:prov==="gemini"
      ? "models/"+model+" is not found for API version v1beta"
      : "No endpoints found for "+model, code:404}));
    _aiHistory=[];
    document.getElementById("aiMsgs").innerHTML="";
    await _aiRun("كم مجموع الشراء اليوم؟",0);
    const txt=document.getElementById("aiMsgs").textContent;
    o.noFalseQuota = txt.indexOf("امتلأت")<0;
    o.namesProviders = txt.indexOf("Google Gemini")>=0 && txt.indexOf("OpenRouter")>=0;
    o.showsRealReason = txt.indexOf("not found")>=0 || txt.indexOf("No endpoints")>=0;
    o.pointsToTest = txt.indexOf("اختبار المزوّدين")>=0;

    /* ⑤ب «generateContent» تحوي «rate» — ولا تعني الحصّة */
    o.geminiNotFoundIsGone = _aiIsGone({status:404,
      message:"models/gemini-3.8-flash is not found for API version v1beta, or is not supported for generateContent"});
    o.geminiNotFoundNotLimit = !_aiIsLimit({status:404,
      message:"models/gemini-3.8-flash is not found for API version v1beta, or is not supported for generateContent"});
    o.realLimitStillLimit = _aiIsLimit({status:429,message:"Rate limit reached for model"})
      && _aiIsLimit({status:200,message:"Quota exceeded for quota metric"});

    /* ⑤ج ردٌّ فارغ ليس جواباً */
    clearAll(); key("groq");
    stub(()=>({text:"   "}));
    _aiHistory=[]; document.getElementById("aiMsgs").innerHTML="";
    await _aiRun("سؤال",0);
    o.emptyNotAnswer=document.getElementById("aiMsgs").textContent.indexOf("لم يُجب أي مزوّد")>=0;

    /* ⑥ الحصّة الحقيقية تُقال حصّةً */
    clearAll(); key("groq");
    stub(()=>({err:"Rate limit reached for model",code:429}));
    _aiHistory=[]; document.getElementById("aiMsgs").innerHTML="";
    await _aiRun("سؤال",0);
    const t2=document.getElementById("aiMsgs").textContent;
    o.realQuotaSaid = t2.indexOf("امتلأت")>=0;

    /* ⑦ المفتاح السليم لا يُحذف عند امتلاء الحصّة */
    o.keyKept = !!_aiKeyOf(_AI_PROVIDERS.find(x=>x.id==="groq"));

    /* ⑧ المسار السليم: يجيب ويستعمل نموذجاً مكتشفاً */
    clearAll(); key("openrouter");
    stub(()=>({text:"مجموع الشراء اليوم ٥ ملايين."}));
    _aiHistory=[]; document.getElementById("aiMsgs").innerHTML="";
    calls.length=0;
    await _aiRun("كم مجموع الشراء؟",0);
    o.answered=document.getElementById("aiMsgs").textContent.indexOf("٥ ملايين")>=0;
    o.usedLiveModel=calls.length>0&&/:free$/.test(calls[0].model);

    /* ⑨ زرّ الاختبار يُسمّي الحيّ والميّت */
    clearAll(); key("groq"); key("openrouter");
    stub((prov)=>prov==="groq"?{text:"ن"}:{err:"No endpoints found",code:404});
    _aiShowKeySetup();
    await aiTestProviders();
    const tr=document.getElementById("aiTestRes").textContent;
    o.testNamesOk = tr.indexOf("Groq")>=0 && tr.indexOf("llama-3.3-70b-versatile")>=0;
    o.testNamesBad = tr.indexOf("OpenRouter")>=0 && tr.indexOf("No endpoints")>=0;

    clearAll();
    return o;
  });

  const T=[
    ['OpenRouter يكتشف المجاني الحيّ',        r.orPicksFreeOnly],
    ['ولا يُجرّب النموذج المحذوف',             r.orSkippedDead],
    ['Groq يُسقط whisper ويُبقي llama',        r.groqNoWhisper],
    ['Gemini يُسقط نماذج التضمين',             r.geminiNoEmbed],
    ['المكتوب الحيّ يُقدَّم على المكتشف',        r.geminiPrefersPinned],
    ['القائمة تُخزَّن فلا تُسأل كل رسالة',       r.cached],
    ['لا يتّهم الحصص إن لم تكن الحصص',         r.noFalseQuota],
    ['يُسمّي كل مزوّد فشل',                     r.namesProviders],
    ['ويعرض سبب الفشل بنصّه',                  r.showsRealReason],
    ['ويُرشد إلى زرّ الاختبار',                  r.pointsToTest],
    ['٤٠٤ من Gemini تُقرأ «اختفى» لا «حصّة»',   r.geminiNotFoundIsGone&&r.geminiNotFoundNotLimit],
    ['والحصّة الحقيقية ما زالت تُكتشف',          r.realLimitStillLimit],
    ['الردّ الفارغ ليس جواباً',                  r.emptyNotAnswer],
    ['الحصّة الحقيقية تُقال حصّةً',              r.realQuotaSaid],
    ['المفتاح السليم لا يُحذف عند الامتلاء',     r.keyKept],
    ['المسار السليم يُجيب',                     r.answered],
    ['ويستعمل نموذجاً مكتشفاً حيّاً',             r.usedLiveModel],
    ['الاختبار يُسمّي المزوّد العامل ونموذجه',    r.testNamesOk],
    ['والاختبار يُسمّي الفاشل وسببه',            r.testNamesBad],
    ['بلا أخطاء جافاسكربت',                     errs.length===0],
  ];

  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ مزوّدو المساعد سليمون ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
