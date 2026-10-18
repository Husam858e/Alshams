import { parseJson } from '../db/index.js';
import { STATUS_LABELS as STATUS_AR } from './orders.js';

// Activity log of important staff actions (not scene changes: too frequent).
// The DB keeps a stable code; the API adds Arabic text for the owner.
const LABELS = {
  'auth.setup': 'إعداد النظام وإنشاء حساب المالك',
  'auth.login': 'تسجيل دخول',
  'auth.password': 'تغيير كلمة المرور',
  'user.create': 'إضافة مستخدم',
  'user.update': 'تعديل مستخدم',
  'user.deactivate': 'تعطيل مستخدم',
  'area.create': 'إضافة قسم',
  'area.update': 'تعديل قسم',
  'area.delete': 'حذف قسم',
  'table.create': 'إضافة طاولة',
  'table.update': 'تعديل طاولة',
  'table.delete': 'حذف طاولة',
  'projector.create': 'إضافة جهاز عرض',
  'projector.update': 'تعديل جهاز عرض',
  'projector.delete': 'حذف جهاز عرض',
  'projector.rotate-key': 'تغيير مفتاح جهاز عرض',
  'projector.power': 'تشغيل/إطفاء جهاز عرض',
  'projector.pairing-code': 'إنشاء رمز ربط جهاز عرض',
  'projector.claim': 'ربط جهاز عرض برمز',
  'category.create': 'إضافة تصنيف',
  'category.delete': 'حذف تصنيف',
  'dish.create': 'إضافة طبق',
  'dish.delete': 'حذف طبق',
  'dish.price': 'تعديل سعر',
  'media.upload': 'رفع ملف',
  'media.delete': 'حذف ملف',
  'settings.general': 'تعديل الإعدادات العامة',
  'settings.theme': 'تعديل تصميم العرض',
  'order.status': 'تغيير حالة طلب',
  'order.item-remove': 'حذف صنف من طلب',
};

// Theme presets as the staff app names them (the log stores the key).
const PRESET_AR = { noir: 'نوار', marble: 'رخام', garden: 'حديقة', royal: 'ملكي' };

export function createActivity(db) {
  const insert = db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)');
  const list = db.prepare(`
    SELECT a.*, u.name AS user_name FROM activity_log a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC LIMIT ?`);

  return {
    log(user, action, details = null) {
      insert.run(user?.id ?? null, action, details == null ? null : JSON.stringify(details));
    },
    list(limit = 100) {
      return list.all(limit).map((row) => {
        const details = parseJson(row.details, null);
        return {
          id: row.id,
          user_id: row.user_id,
          user_name: row.user_name ?? 'النظام',
          action: LABELS[row.action] ?? row.action,
          code: row.action,
          details,
          summary: summarize(row.action, details),
          created_at: row.created_at,
        };
      });
    },
  };
}

// One readable Arabic line per entry (the UI may show it under the action).
function summarize(code, d) {
  if (!d) return LABELS[code] ?? code;
  switch (code) {
    case 'dish.price':
      return `سعر "${d.name}" من ${d.from} إلى ${d.to}`;
    case 'order.status':
      return `الطلب #${d.orderId} (طاولة ${d.tableNumber ?? '؟'}): ${STATUS_AR[d.from] ?? d.from} ← ${STATUS_AR[d.to] ?? d.to}`;
    case 'order.item-remove':
      return `حذف "${d.dish}" ×${d.quantity} من الطلب #${d.orderId}`;
    case 'projector.power':
      return `${d.on ? 'تشغيل' : 'إطفاء'} "${d.name}"`;
    case 'projector.claim':
    case 'projector.pairing-code':
      return `طاولة ${d.tableNumber}${d.name ? ` — ${d.name}` : ''}`;
    case 'settings.theme':
      return `${LABELS[code]}: نمط ${PRESET_AR[d.name] ?? d.name}`;
    default: {
      const name = d.name ?? d.title ?? d.username ?? (d.number != null ? `طاولة ${d.number}` : null);
      return name ? `${LABELS[code] ?? code}: ${name}` : (LABELS[code] ?? code);
    }
  }
}
