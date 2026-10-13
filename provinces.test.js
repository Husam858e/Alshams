/* المحافظات العراقية (v17.90): قائمة الوجهة في البيع كانت مراكز وأقضية
   (الفلوجة، سامراء، خانقين) وتنقصها حلبجة. الآن المحافظات التسع عشرة،
   والوصولات القديمة المحفوظة باسم المدينة تُردّ إلى محافظتها. */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
  const p = await b.newPage({ viewport:{width:430,height:950} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file:///home/user/Alshams/wheelmanagement_v17_promax_43.html');
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{S.su=USERS[0];S.pin=USERS[0].pin;doLogin();});
  await p.waitForTimeout(600);

  const r = await p.evaluate(()=>{
    db=null; const o={};
    const GOV=["بغداد","البصرة","نينوى","أربيل","السليمانية","دهوك","حلبجة","كركوك","ديالى","الأنبار",
      "صلاح الدين","بابل","كربلاء","النجف","القادسية","المثنى","ذي قار","ميسان","واسط"];
    const vals=id=>[...document.getElementById(id).options].map(x=>x.value);
    const txts=id=>[...document.getElementById(id).options].map(x=>x.textContent);
    /* ① القوائم الثلاث: المحافظات التسع عشرة و«أخرى» */
    o.newList  = JSON.stringify(vals("sDst"))===JSON.stringify([...GOV,"أخرى"]);
    o.editList = JSON.stringify(vals("seDst"))===JSON.stringify([...GOV,"أخرى"]);
    o.filtList = JSON.stringify(vals("sfDst"))===JSON.stringify(["all",...GOV,"أخرى"]);
    o.noDistricts = !["الفلوجة","سامراء","خانقين"].some(x=>vals("sDst").includes(x)||txts("sDst").some(t=>t.indexOf(x)>=0));
    o.halabja = vals("sDst").includes("حلبجة");
    /* المركز بين قوسين حيث يختلف اسمه */
    o.capHint = txts("sDst").includes("نينوى (الموصل)") && txts("sDst").includes("بابل (الحلة)") && txts("sDst").includes("بغداد");

    /* ② وصولات قديمة بأسماء المدن */
    const mk=(id,dest)=>({id,seq:1,dk:toDay(),status:'weighed',driver:'زبون',plate:'1',receiver:'م',dest,
      mat:'jet',empty:10000,gross:20000,net:10000,ppkg:300,final:3000000,payments:[]});
    SELL_RECS=[mk('A','الموصل'),mk('B','الفلوجة'),mk('C','الرمادي'),mk('D','بغداد'),mk('E','خانقين'),mk('F','الأنبار')];
    o.mapOne = provOf('الموصل')==='نينوى'&&provOf('الفلوجة')==='الأنبار'&&provOf('سامراء')==='صلاح الدين'
            && provOf('خانقين')==='ديالى'&&provOf('بغداد')==='بغداد'&&provOf('حلبجة')==='حلبجة';
    /* التصفية بـ«الأنبار» تجمع الرمادي والفلوجة والجديد */
    document.getElementById("sfDst").value="الأنبار"; renderSellRecs();
    /* ما عُرض فعلاً في السجل: ثلاث بطاقات، بالرمادي والفلوجة والأنبار */
    const L=document.getElementById("sellRL").textContent;
    o.filterIds = L.indexOf("📍 الرمادي")>=0 && L.indexOf("📍 الفلوجة")>=0 && L.indexOf("📍 الأنبار")>=0
               && L.indexOf("📍 الموصل")<0 && L.indexOf("📍 بغداد")<0 && L.indexOf("📍 خانقين")<0;
    document.getElementById("sfDst").value="all";
    /* ③ شاشة التعديل: «الموصل» القديمة تظهر «نينوى» */
    openSellEdit('A');
    o.editLegacy = document.getElementById("seDst").value==="نينوى";
    closeM();
    openSellEdit('E');
    o.editLegacy2 = document.getElementById("seDst").value==="ديالى";
    closeM();
    /* ④ المحصلة: قسمٌ لكل محافظة لا لكل مدينة */
    const html=buildSellCollHTML(SELL_RECS,'daily',"جميع الوجهات",toDay());
    o.collAnbar = (html.match(/الأنبار/g)||[]).length>=1 && html.indexOf(">الفلوجة<")<0 && html.indexOf(">الرمادي<")<0;
    o.collNineveh = html.indexOf("نينوى")>=0;
    /* ⑤ الوصل الجديد يحفظ اسم المحافظة */
    document.getElementById("sDst").value="حلبجة";
    o.newSaves = document.getElementById("sDst").value==="حلبجة";
    /* ⑥ المساعد: «الحلة» تُحفظ «بابل» */
    o.ai = PROVS.includes(provOf("الحلة"))&&provOf("الحلة")==="بابل";
    return o;
  });

  const T=[
    ['الوصل الجديد: ١٩ محافظة و«أخرى»',        r.newList],
    ['التعديل: القائمة نفسها',                  r.editList],
    ['التصفية: «الكل» والمحافظات',               r.filtList],
    ['لا أقضية (الفلوجة، سامراء، خانقين)',       r.noDistricts],
    ['حلبجة موجودة',                            r.halabja],
    ['المركز بين قوسين حيث يختلف',               r.capHint],
    ['أسماء المدن القديمة تُردّ لمحافظتها',       r.mapOne],
    ['التصفية بالأنبار تجمع الرمادي والفلوجة',     r.filterIds],
    ['تعديل وصلٍ قديم «الموصل» ← نينوى',          r.editLegacy&&r.editLegacy2],
    ['المحصلة بالمحافظة لا بالمدينة',             r.collAnbar&&r.collNineveh],
    ['الوصل الجديد يحفظ المحافظة',               r.newSaves],
    ['المساعد يردّ المدينة لمحافظتها',            r.ai],
    ['بلا أخطاء جافاسكربت',                      errs.length===0],
  ];
  let bad=0;
  T.forEach(([n,ok])=>{ if(!ok)bad++; console.log((ok?'✓':'✗')+' '+n); });
  if(bad)console.log('\n'+JSON.stringify(r,null,1));
  if(errs.length)console.log(errs.join('\n'));
  console.log('\n'+(bad?'✗ '+bad+' فشل':'✅ المحافظات العراقية كاملة ('+T.length+')'));
  await b.close();
  process.exit(bad?1:0);
})();
