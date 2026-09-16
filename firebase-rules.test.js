/* ══════════════════════════════════════════════════════
   اختبار قواعد أمان فايربيس — بمحاكي RTDB لا بالتخمين
   ──────────────────────────────────────────────────────
   قواعد الأمان تُكتب في لوحة فايربيس ولا يراها أحد يعمل على
   الكود، وخطأ فيها لا يظهر إلا كرفض حفظ عند المستخدم. هذا
   الملف يشغّل القواعد فعلياً على بيانات أشبه بالواقع.

   التشغيل:
     npm install targaryen
     node firebase-rules.test.js

   ⚠️ الحالة التي أسقطت الدفع الجامع: سجل قديم بلا حقل mk.
      val() تُرجع null و child(null) خطأ في قواعد فايربيس،
      فتفشل القاعدة كلها ويُرفض الحفظ. أبقِ اختبارها قائماً.
══════════════════════════════════════════════════════ */
const targaryen = require('targaryen');
const fs = require('fs');

const rules = JSON.parse(fs.readFileSync(process.argv[2] || '/home/user/Alshams/firebase-rules.json', 'utf8'));

// بيانات أشبه بالواقع: وصل قديم بلا mk، وآخر حديث بـ mk، وشهر مغلق
const data = {
  closures: { '2026-07': { month: '2026-07', open: false, closedAt: 'x', closedBy: 'y' } },
  records: {
    OLD1: { id: 'OLD1', driver: 'سعد', dk: '2026-05-11', naqlFee: 50000 },          // بلا mk
    NEW1: { id: 'NEW1', driver: 'علي', dk: '2026-09-01', mk: '2026-09', naqlFee: 1 },
    CLSD: { id: 'CLSD', driver: 'حسن', dk: '2026-07-10', mk: '2026-07', naqlFee: 1 },
  },
  mnl_records: { M_OLD: { id: 'M_OLD', transporter: 'سعد', dk: '2026-04-02', naqlFee: 9000 } }, // بلا mk
  out_records: {},
  audit_log: { A1: { id: 'A1', at: 'x', by: 'y' } },
};

const db = targaryen.database(rules, data).as({ uid: 'anon-1', provider: 'anonymous' });
const anon = targaryen.database(rules, data).as(null);

const results = [];
const check = (label, res, wantAllowed) => {
  const ok = res.allowed === wantAllowed;
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label} — ${res.allowed ? 'مسموح' : 'مرفوض'}${ok ? '' : ` (توقّع ${wantAllowed ? 'مسموح' : 'مرفوض'})`}`);
};

// ① دفع جامع على وصل قديم بلا mk — هذا ما كان يفشل
check('دفع نقل على وصل شراء قديم بلا mk',
  db.write('records/OLD1', { id: 'OLD1', driver: 'سعد', dk: '2026-05-11', mk: '2026-05',
    naqlFee: 50000, naqlPaidTotal: 50000, naqlPaid: true }), true);

check('دفع نقل على وصل نقل يدوي قديم بلا mk',
  db.write('mnl_records/M_OLD', { id: 'M_OLD', transporter: 'سعد', dk: '2026-04-02', mk: '2026-04',
    naqlFee: 9000, naqlPaidTotal: 9000, naqlPaid: true }), true);

// ② السلوك الطبيعي لا يتغيّر
check('تعديل وصل حديث في شهر مفتوح',
  db.write('records/NEW1', { id: 'NEW1', driver: 'علي', dk: '2026-09-01', mk: '2026-09', naqlFee: 2 }), true);

check('إنشاء سجل في قسم المخرجات',
  db.write('out_records/X1', { id: 'X1', farmer: 'بركات', dk: '2026-09-16', mk: '2026-09',
    empty: 20330, gross: 34490, net: 14160 }), true);

check('تعديل تاريخ مخرج',
  db.write('out_records/X1', { id: 'X1', farmer: 'بركات', dk: '2026-09-07', mk: '2026-09',
    empty: 20330, gross: 34490, net: 14160 }), true);

// ③ حارس الفترات المغلقة ما زال يعمل
check('الكتابة في شهر مغلق مرفوضة',
  db.write('records/CLSD', { id: 'CLSD', driver: 'حسن', dk: '2026-07-10', mk: '2026-07', naqlFee: 99 }), false);

check('نقل سجل إلى شهر مغلق مرفوض',
  db.write('records/NEW1', { id: 'NEW1', driver: 'علي', dk: '2026-07-05', mk: '2026-07', naqlFee: 1 }), false);

check('نقل سجل من شهر مغلق مرفوض',
  db.write('records/CLSD', { id: 'CLSD', driver: 'حسن', dk: '2026-09-05', mk: '2026-09', naqlFee: 1 }), false);

check('حذف سجل في شهر مغلق مرفوض', db.write('records/CLSD', null), false);

// ④ الأمان
check('بلا هوية: القراءة مرفوضة', anon.read('records'), false);
check('بلا هوية: الكتابة مرفوضة',
  anon.write('records/Z', { id: 'Z', dk: '2026-09-01', mk: '2026-09' }), false);
check('عقدة غير مذكورة مرفوضة', db.write('random_node/Z', { a: 1 }), false);

// ⑤ سجلّ التدقيق يُضاف ولا يُعدَّل ولا يُحذف
check('سجلّ التدقيق: إضافة قيد جديد',
  db.write('audit_log/A2', { id: 'A2', at: 'x', by: 'y' }), true);
check('سجلّ التدقيق: تعديل قيد قائم مرفوض',
  db.write('audit_log/A1', { id: 'A1', at: 'z', by: 'y' }), false);
check('سجلّ التدقيق: حذف قيد مرفوض', db.write('audit_log/A1', null), false);

// ⑥ القراءة لمن له هوية
check('قراءة الوصولات بهوية', db.read('records'), true);

results.forEach(r => console.log(' ' + r));
const failed = results.filter(r => r.startsWith('FAIL'));
console.log(`\n${failed.length ? '‼ فشل ' + failed.length + ' من ' + results.length : '✅ كل قواعد الأمان سليمة (' + results.length + ')'}`);
process.exit(failed.length ? 1 : 0);
