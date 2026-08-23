const {open,reporter}=require("./lib");
(async()=>{
  const {b,p,errs}=await open();
  const R=reporter();

  // ① لا كلمة سر في ملف التطبيق إطلاقاً
  const fs=require("fs");
  const src=fs.readFileSync(require("path").resolve(__dirname,"..","wheelmanagement_v17_promax_40.html"),"utf8");
  const usersBlock=src.slice(src.indexOf("const USERS=["),src.indexOf("];",src.indexOf("const USERS=["))+2);
  R.ok("لا حقل password في USERS", !/password/i.test(usersBlock), usersBlock.slice(0,300));
  R.ok("لا تُحفظ كلمة السر في التخزين المحلي",
       !/localStorage\.setItem\([^)]*(pass|pw)/i.test(src), "");
  R.ok("USERS يحمل بريداً لكل مستخدم", (usersBlock.match(/email:/g)||[]).length===4, usersBlock.slice(0,300));

  // ② الحالة بلا مكتبة مصادقة
  const st=await p.evaluate(()=>{
    S.cu=USERS[0];
    renderAuthBox();
    return {label:_authLabel(), named:_authIsNamed(), anon:_authIsAnon(),
            html:document.getElementById("authBox").innerText.replace(/\s+/g," "),
            email:_userEmail(USERS[0])};
  });
  R.ok("يُبلّغ بغياب الهوية", st.label==="بلا هوية"&&!st.named&&!st.anon, st);
  R.ok("يعرض بريد الحساب", st.email==="user1@alshams.app"&&st.html.includes("user1@alshams.app"), st);
  R.ok("يشرح أن كلمة السر لا تُحفظ", /لا تُحفظ/.test(st.html), st.html.slice(0,300));

  // ③ الربط برسائل خطأ مفهومة
  const errsMsg=await p.evaluate(async()=>{
    const out={};
    const mk=(code)=>{
      const a=()=>({setPersistence:async()=>{}, currentUser:null,
        signInWithEmailAndPassword:async()=>{const e=new Error(code);e.code=code;throw e;},
        signOut:async()=>{}, signInAnonymously:async()=>{}});
      a.Auth={Persistence:{LOCAL:"local"}};
      return {auth:a};
    };
    for(const c of ["auth/user-not-found","auth/wrong-password","auth/operation-not-allowed"]){
      window.firebase=mk(c);
      S.cu=USERS[0]; renderAuthBox();
      document.getElementById("authPw").value="x";
      await linkDeviceAccount();
      out[c]=document.getElementById("authRes").innerText.replace(/\s+/g," ");
    }
    delete window.firebase;
    return out;
  });

  R.ok("خطأ «لا يوجد حساب» مفهوم ويذكر البريد",
       /لا يوجد حساب/.test(errsMsg["auth/user-not-found"]||""), errsMsg["auth/user-not-found"]);
  R.ok("خطأ كلمة السر مفهوم",
       /كلمة السر غير صحيحة/.test(errsMsg["auth/wrong-password"]||""), errsMsg["auth/wrong-password"]);
  R.ok("يُرشد لتفعيل Email/Password",
       /Email\/Password/.test(errsMsg["auth/operation-not-allowed"]||""), errsMsg["auth/operation-not-allowed"]);

  // ④ الربط الناجح
  const ok=await p.evaluate(async()=>{
    let signedOut=false, persistence=null;
    const user={uid:"UID123",email:"user1@alshams.app",isAnonymous:false};
    let cur={uid:"anon",isAnonymous:true};
    const a=()=>({
      setPersistence:async(v)=>{persistence=v;},
      get currentUser(){return cur;},
      signInWithEmailAndPassword:async()=>{cur=user;return{user};},
      signOut:async()=>{signedOut=true;cur=null;},
      signInAnonymously:async()=>{cur={uid:"anon",isAnonymous:true};}
    });
    a.Auth={Persistence:{LOCAL:"local"}};
    window.firebase={auth:a};
    AUDIT=[]; db=null;
    S.cu=USERS[0]; renderAuthBox();
    document.getElementById("authPw").value="secret";
    await linkDeviceAccount();
    const out={named:_authIsNamed(),label:_authLabel(),signedOut,persistence,
      res:document.getElementById("authRes").innerText.replace(/\s+/g," "),
      pwGone:!document.getElementById("authPw"),
      audited:AUDIT.some(e=>e.kind==="auth"),
      box:document.getElementById("authBox").innerText.replace(/\s+/g," ")};
    delete window.firebase;
    return out;
  });
  R.ok("الربط ينجح ويصير الجهاز مسمّى", ok.named&&ok.label==="user1@alshams.app", ok);
  R.ok("يترك الجلسة المجهولة أولاً", ok.signedOut===true, ok);
  R.ok("يطلب استمرار الجلسة محلياً", ok.persistence==="local", ok);
  R.ok("خانة كلمة السر تختفي بعد الربط", ok.pwGone, ok);
  R.ok("الربط يُسجَّل في التدقيق", ok.audited, ok);
  R.ok("اللوحة تعرض حالة الربط", /مربوط بحسابك/.test(ok.box), ok.box.slice(0,200));

  process.exit(R.done("هوية الجهاز",errs));
})();
