/* ══════════════════════════════════════════════════════════════
   t_paygrp — تجميع الدفعة الجامعة في سجل الدفعات (v17.63)
   ──────────────────────────────────────────────────────────────
   ما يجب أن يبقى صحيحاً مهما تغيّر الشكل:
     ١) المجموع لا يتغيّر بالتجميع — ولا فلس
     ٢) لا يضيع جزء: مجموع أجزاء كل العمليات = عدد الدفعات
     ٣) الدفعة المفردة لا تُجمَع مع أخرى أبداً
     ٤) عمليتان جامعتان مستقلّتان تبقيان سطرين
     ٥) الدفعات القديمة (بلا bid) تُجمَع بالاستنتاج
     ٦) العملية التي مسّت أكثر من اسم تُعلَّم
     ٧) الدفع الجامع الحقيقي يكتب bid واحداً على كل أجزائه
══════════════════════════════════════════════════════════════ */
const { open, reporter } = require("./lib");

(async () => {
  const { b, p, errs } = await open();
  const R = reporter();

  /* ── ١..٦: محرّك التجميع على بيانات مُصطنعة ── */
  const g = await p.evaluate(() => {
    const mk = (o) => Object.assign(
      { src: "naql", who: "محمد الحياني", ref: "تريلة", amount: 0,
        at: "2026-08-23 09:27", by: "حسام عايد", note: "", bid: "", recId: "R1", kind: "mnl" }, o);

    // عملية جامعة جديدة: bid واحد على ٣ أجزاء
    const A = [
      mk({ amount: 150000, bid: "BID1", by: "حسام عايد (دفع جامع نقل)", ref: "ابو خطاب" }),
      mk({ amount:  50000, bid: "BID1", by: "حسام عايد (دفع جامع نقل)", ref: "تريلة" }),
      mk({ amount: 400000, bid: "BID1", by: "حسام عايد (دفع جامع نقل)", ref: "كبان" }),
    ];
    // عملية جامعة قديمة بلا bid — نفس الوقت والمنفّذ والملاحظة
    const B = [
      mk({ amount: 100000, at: "2026-08-12 18:08", by: "حسام عايد (دفع جامع نقل)", note: "من حسام بالكبان" }),
      mk({ amount: 300000, at: "2026-08-12 18:08", by: "حسام عايد (دفع جامع نقل)", note: "من حسام بالكبان" }),
    ];
    // عملية جامعة أخرى في الدقيقة نفسها لكن بملاحظة مختلفة → يجب ألّا تندمج مع B
    const C = [
      mk({ amount: 70000, at: "2026-08-12 18:08", by: "حسام عايد (دفع جامع نقل)", note: "دفعة أخرى" }),
    ];
    // دفعتان مفردتان في اللحظة نفسها وبالمنفّذ نفسه → سطران منفصلان دائماً
    const D = [
      mk({ amount: 25000, at: "2026-08-01 10:00", by: "حسام عايد", note: "" }),
      mk({ amount: 25000, at: "2026-08-01 10:00", by: "حسام عايد", note: "" }),
    ];
    // عملية جامعة وزّعت على شخصين — يجب أن تُعلَّم
    const E = [
      mk({ amount: 10000, bid: "BID2", who: "عبد الرحمن واثق", by: "حسام عايد (دفع شامل)" }),
      mk({ amount: 20000, bid: "BID2", who: "عبد الله احمد",   by: "حسام عايد (دفع شامل)" }),
    ];

    const list = [...A, ...B, ...C, ...D, ...E];
    const gs = _payGroups(list);
    const find = k => gs.find(x => x.key === k);
    return {
      listN: list.length,
      listSum: list.reduce((s, x) => s + x.amount, 0),
      groupsN: gs.length,
      groupsSum: gs.reduce((s, x) => s + x.amount, 0),
      partsN: gs.reduce((s, x) => s + x.items.length, 0),
      bid1: (() => { const x = find("b:BID1"); return x && { n: x.items.length, amt: x.amount, names: x.names.size }; })(),
      bid2: (() => { const x = find("b:BID2"); return x && { n: x.items.length, amt: x.amount, names: x.names.size }; })(),
      // القديمة: مجموعة واحدة من جزأين بمبلغ ٤٠٠٠٠٠
      legacy: gs.filter(x => x.key.startsWith("h:") && x.note === "من حسام بالكبان")
                .map(x => ({ n: x.items.length, amt: x.amount })),
      // الملاحظة المختلفة بقيت وحدها
      legacyOther: gs.filter(x => x.key.startsWith("h:") && x.note === "دفعة أخرى")
                     .map(x => ({ n: x.items.length, amt: x.amount })),
      singles: gs.filter(x => x.key.startsWith("s:")).map(x => ({ n: x.items.length, amt: x.amount })),
      // كل مجموعة مرتّبة تنازلياً بالوقت
      sorted: gs.every((x, i) => i === 0 || String(gs[i - 1].at) >= String(x.at)),
    };
  });

  R.ok("المجموع لا يتغيّر بالتجميع", g.groupsSum === g.listSum, g);
  R.ok("لا يضيع جزء", g.partsN === g.listN, g);
  R.ok("العملية الجديدة سطر واحد بثلاثة أجزاء", g.bid1 && g.bid1.n === 3 && g.bid1.amt === 600000, g.bid1);
  R.ok("العملية القديمة تُجمَع بالاستنتاج", g.legacy.length === 1 && g.legacy[0].n === 2 && g.legacy[0].amt === 400000, g.legacy);
  R.ok("ملاحظة مختلفة = عملية مستقلّة", g.legacyOther.length === 1 && g.legacyOther[0].n === 1, g.legacyOther);
  R.ok("الدفعتان المفردتان سطران لا سطر", g.singles.length === 2 && g.singles.every(s => s.n === 1), g.singles);
  R.ok("العملية متعددة الأسماء تُعلَّم", g.bid2 && g.bid2.names === 2 && g.bid2.amt === 30000, g.bid2);
  R.ok("الترتيب تنازلي بالوقت", g.sorted === true, g.sorted);
  R.ok("عدد العمليات أقل من عدد الأجزاء هنا", g.groupsN < g.listN, g);

  /* ── ٧: الدفع الجامع الحقيقي يكتب bid واحداً ── */
  const real = await p.evaluate(() => {
    const dk = toDay();
    const ids = ["PGA", "PGB", "PGC"];
    // ثلاث وصولات نقل يدوية لناقل واحد
    MNL_RECS.length = 0;
    ids.forEach((id, i) => MNL_RECS.push({
      id, dk, farmer: "فلاح تجريبي", transporter: "ناقل التجميع",
      naqlFee: 100000, naqlPayments: [], naqlPaidTotal: 0, naqlPaid: false,
      plate: "ت " + (i + 1), seq: i,
    }));
    const entries = _getNaqlBulkEntries("ناقل التجميع");
    if (entries.length !== 3) return { err: "entries=" + entries.length };

    // نُشغّل نفس حلقة التوزيع التي يستعملها الزر
    document.getElementById("naqlBulkPayName").value = "ناقل التجميع";
    _naqlBulkPayName = "ناقل التجميع";
    setPayAmt("naqlBulkPayAmount", 250000);
    document.getElementById("naqlBulkPayNote").value = "اختبار";
    execNaqlBulkPay();

    const pays = ids.map(id => (MNL_RECS.find(r => r.id === id) || {}).naqlPayments || []).flat();
    const bids = [...new Set(pays.map(x => x.bid).filter(Boolean))];
    const groups = _payGroups(pays.map(x => ({
      src: "naql", who: "ناقل التجميع", ref: "", amount: x.amount,
      at: x.at, by: x.by, note: x.note || "", bid: x.bid || "",
    })));
    const out = {
      parts: pays.length,
      sum: pays.reduce((s, x) => s + x.amount, 0),
      bids: bids.length,
      allTagged: pays.every(x => !!x.bid),
      groups: groups.length,
      groupAmt: groups[0] && groups[0].amount,
    };
    MNL_RECS.length = 0;
    return out;
  });

  R.ok("التوزيع الحقيقي مسّ ٣ وصولات", real.parts === 3, real);
  R.ok("المبلغ الموزَّع كما أُدخل", real.sum === 250000, real);
  R.ok("كل جزء يحمل معرّف العملية", real.allTagged === true, real);
  R.ok("معرّف واحد لا أكثر", real.bids === 1, real);
  R.ok("تظهر سطراً واحداً بمجموعها", real.groups === 1 && real.groupAmt === 250000, real);

  /* ── سجل الدفعات يرسم بلا خطأ ── */
  const drew = await p.evaluate(() => {
    try {
      const el = document.getElementById("payLogResult");
      if (!el) return "no-el";
      renderPayLog();
      return el.innerHTML.length > 40 ? "ok" : "empty";
    } catch (e) { return "throw: " + e.message; }
  });
  R.ok("سجل الدفعات يُرسم", drew === "ok" || drew === "empty", drew);

  const bad = R.done("تجميع الدفعة الجامعة", errs);
  await b.close();
  process.exit(bad ? 1 : 0);
})();
