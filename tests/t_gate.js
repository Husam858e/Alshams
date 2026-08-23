/* ══════════════════════════════════════════════════════════════
   t_gate — وضع «الحسابات المختارة فقط» (v17.64)
   ──────────────────────────────────────────────────────────────
   يحرس أربعة أشياء لا يجوز أن تنكسر:

   ١) الجلسة المستعادة لا تُستبدَل بهوية مجهولة.
      هذا عطل وقع فعلاً: signInAnonymously() كانت تُنادى بلا شرط
      عند كل إقلاع، فتحلّ محلّ حساب الجهاز المربوط ويُفكّ الربط
      بصمت. الاختبار يثبت أنها لا تُنادى أصلاً حين توجد جلسة.

   ٢) رفض المجهول (operation-not-allowed) يُكتشف ويُحفظ، وتُفتح
      البوابة بدل الصمت.

   ٣) البوابة لا تغطّي شاشة الرمز — تنتظر الدخول.

   ٤) لا كلمة سرّ في الملف ولا في التخزين المحلي. أبداً.
══════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const { open, reporter } = require("./lib");

const FILE = path.resolve(__dirname, "..", "wheelmanagement_v17_promax_40.html");

(async () => {
  const { b, p, errs } = await open();
  const R = reporter();

  /* ── ١) الجلسة المستعادة لا تُستبدَل ── */
  const restored = await p.evaluate(() => {
    const calls = { anon: 0, persistence: 0 };
    let cb = null;
    window.firebase = {
      auth: Object.assign(() => ({
        currentUser: null,
        setPersistence: () => { calls.persistence++; return Promise.resolve(); },
        onAuthStateChanged: f => { cb = f; },
        signInAnonymously: () => { calls.anon++; return Promise.resolve(); },
        signOut: () => Promise.resolve(),
      }), { Auth: { Persistence: { LOCAL: "local" } } }),
    };
    _setAnonOff(false);
    _fbSignIn({});
    // فايربيس يُبلّغ بجلسة مستعادة (حساب حقيقي)
    if (cb) cb({ uid: "U1", isAnonymous: false, email: "a@b.c" });
    return { anon: calls.anon, ready: _authReady, persistence: calls.persistence };
  });
  R.ok("الجلسة المستعادة لا تُستبدَل بمجهول", restored.anon === 0, restored);
  R.ok("الهوية تُعتمد فور استعادتها", restored.ready === true, restored);
  R.ok("الجلسة تُثبَّت على الجهاز (LOCAL)", restored.persistence >= 1, restored);

  /* ── ٢) لا جلسة + المجهول مسموح → تُجرَّب مرة واحدة ── */
  const tryAnon = await p.evaluate(async () => {
    const calls = { anon: 0 };
    let cb = null;
    window.firebase = {
      auth: Object.assign(() => ({
        currentUser: null,
        setPersistence: () => Promise.resolve(),
        onAuthStateChanged: f => { cb = f; },
        signInAnonymously: () => { calls.anon++; return Promise.resolve(); },
        signOut: () => Promise.resolve(),
      }), { Auth: { Persistence: { LOCAL: "local" } } }),
    };
    _setAnonOff(false);
    _authGateClose();
    _fbSignIn({});
    if (cb) cb(null);          // لا جلسة
    if (cb) cb(null);          // نداء ثانٍ — يجب ألّا يُعيد المحاولة
    await new Promise(r => setTimeout(r, 60));
    return { anon: calls.anon, gate: document.getElementById("mAuthGate").classList.contains("active") };
  });
  R.ok("بلا جلسة: يُجرَّب المجهول مرة واحدة", tryAnon.anon === 1, tryAnon);
  R.ok("والمجهول مسموح فلا بوابة", tryAnon.gate === false, tryAnon);

  /* ── ٣) المجهول مُطفأ → يُكتشف ويُحفظ وتُفتح البوابة ── */
  const off = await p.evaluate(async () => {
    let cb = null;
    window.firebase = {
      auth: Object.assign(() => ({
        currentUser: null,
        setPersistence: () => Promise.resolve(),
        onAuthStateChanged: f => { cb = f; },
        signInAnonymously: () => Promise.reject({ code: "auth/operation-not-allowed" }),
        signOut: () => Promise.resolve(),
      }), { Auth: { Persistence: { LOCAL: "local" } } }),
    };
    _setAnonOff(false);
    _authGateClose();
    _fbSignIn({});
    if (cb) cb(null);
    await new Promise(r => setTimeout(r, 120));
    const el = document.getElementById("mAuthGate");
    return {
      flag: _anonOff,
      stored: (() => { try { return localStorage.getItem("wShamsAnonOff"); } catch (e) { return null; } })(),
      gate: el.classList.contains("active"),
      hasEmail: !!document.getElementById("gateEmail"),
      hasPw: !!document.getElementById("gatePw"),
    };
  });
  R.ok("طفء المجهول يُكتشف", off.flag === true, off);
  R.ok("ويُحفظ فلا يُعاد اكتشافه", off.stored === "1", off);
  R.ok("والبوابة تُفتح بدل الصمت", off.gate === true, off);
  R.ok("البوابة فيها بريد وكلمة سر", off.hasEmail && off.hasPw, off);

  /* الكود البديل الذي ترجعه بعض المشاريع */
  const off2 = await p.evaluate(async () => {
    let cb = null;
    window.firebase = {
      auth: Object.assign(() => ({
        currentUser: null, setPersistence: () => Promise.resolve(),
        onAuthStateChanged: f => { cb = f; },
        signInAnonymously: () => Promise.reject({ code: "auth/admin-restricted-operation" }),
        signOut: () => Promise.resolve(),
      }), { Auth: { Persistence: { LOCAL: "local" } } }),
    };
    _setAnonOff(false); _authGateClose();
    _fbSignIn({}); if (cb) cb(null);
    await new Promise(r => setTimeout(r, 120));
    return _anonOff;
  });
  R.ok("admin-restricted-operation يُفهم أيضاً", off2 === true, off2);

  /* ── ٤) البوابة لا تغطّي شاشة الرمز ── */
  const beforeLogin = await p.evaluate(() => {
    _authGateClose();
    const keep = S.cu;
    S.cu = null;
    _authGateOpen();
    const shown = document.getElementById("mAuthGate").classList.contains("active");
    const pending = _gatePending;
    S.cu = keep;
    _authGateMaybe();                         // بعد الدخول تظهر
    const after = document.getElementById("mAuthGate").classList.contains("active");
    _authGateClose();
    return { shown, pending, after };
  });
  R.ok("لا بوابة قبل رمز الدخول", beforeLogin.shown === false, beforeLogin);
  R.ok("تُؤجَّل لا تُلغى", beforeLogin.pending === true, beforeLogin);
  R.ok("وتظهر بعد الدخول", beforeLogin.after === true, beforeLogin);

  /* ── ٥) رفض الصلاحيات: البوابة تُفتح في وضعها وحده ──
     الهوية المجهولة هوية صحيحة. رفضها مشكلة قواعد لا مشكلة ربط،
     وإرسال صاحبها إلى بوابة الحساب يُضلّله عن السبب الحقيقي. */
  const denied = await p.evaluate(async () => {
    const run = async (anonOff, user) => {
      window.firebase = { auth: Object.assign(() => ({ currentUser: user }),
        { Auth: { Persistence: { LOCAL: "local" } } }) };
      _setAnonOff(anonOff);
      _authGateClose();
      const toasts = [];
      const orig = window.showToast;
      window.showToast = m => { toasts.push(m); };
      _fbReportWriteError({ code: "PERMISSION_DENIED" }, "records");
      await new Promise(r => setTimeout(r, 60));
      window.showToast = orig;
      const g = document.getElementById("mAuthGate").classList.contains("active");
      _authGateClose();
      return { gate: g, toast: toasts.join(" | ") };
    };
    return {
      offNoId:  await run(true,  null),
      offAnon:  await run(true,  { uid: "A", isAnonymous: true }),
      onAnon:   await run(false, { uid: "A", isAnonymous: true }),
      onNoId:   await run(false, null),
      offNamed: await run(true,  { uid: "N", isAnonymous: false, email: "a@b.c" }),
    };
  });
  R.ok("حسابات مختارة + بلا هوية → بوابة", denied.offNoId.gate === true, denied.offNoId);
  R.ok("حسابات مختارة + مجهول عالق → بوابة", denied.offAnon.gate === true, denied.offAnon);
  R.ok("وضع المجهول + مجهول → لا بوابة، بل سبب الصلاحيات",
       denied.onAnon.gate === false && /صلاحيات/.test(denied.onAnon.toast), denied.onAnon);
  R.ok("وضع المجهول + بلا هوية → لا بوابة", denied.onNoId.gate === false, denied.onNoId);
  R.ok("حساب مربوط ومرفوض → لا بوابة، فالمشكلة في القواعد",
       denied.offNamed.gate === false && /صلاحيات/.test(denied.offNamed.toast), denied.offNamed);
  await p.evaluate(() => _setAnonOff(false));

  /* ── ٦) البريد يُحفظ، وكلمة السر لا ── */
  const store = await p.evaluate(() => {
    _rememberEmail("someone@example.com");
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    const blob = keys.map(k => k + "=" + (localStorage.getItem(k) || "")).join("\n");
    return {
      email: _lastEmail(),
      suggest: _suggestEmail(),
      pwLike: /pass(word)?["' :=]|\bpw["' :=]/i.test(blob),
    };
  });
  R.ok("البريد يُتذكَّر على الجهاز", store.email === "someone@example.com", store);
  R.ok("والمقترح يتبعه", store.suggest === "someone@example.com", store);
  R.ok("لا أثر لكلمة سر في التخزين المحلي", store.pwLike === false, store);

  await b.close();

  /* ── ٧) لا كلمة سر مكتوبة في الملف نفسه ── */
  const src = fs.readFileSync(FILE, "utf8");
  const badPw = /(password|كلمة السر|كلمة سر)\s*[:=]\s*["'][^"']{3,}["']/i.test(src);
  R.ok("لا كلمة سر حساب مكتوبة في الملف", badPw === false, badPw);
  R.ok("USERS بلا حقل كلمة سر", /const USERS=\[[\s\S]{0,400}?\]/.test(src) &&
       !/USERS=\[[\s\S]{0,400}?pass/i.test(src), true);

  const bad = R.done("وضع الحسابات المختارة فقط", errs);
  process.exit(bad ? 1 : 0);
})();
