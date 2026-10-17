// Number, price and label formatting for the projected menu.
// Latin digits read better from a distance and match the staff app.

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const formatNumber = (value) => numberFormat.format(Number(value) || 0);

// Prices of 0 (a dish the designer created before the owner priced it) are hidden.
export const hasPrice = (value) => Number(value) > 0;

// What guests see on the status chip of their order.
export const ORDER_STATUS = {
  open: 'تم استلام الطلب',
  preparing: 'قيد التحضير',
  served: 'تم التقديم',
  paid: 'تم الدفع',
  cancelled: 'ملغي',
};

// Steps of the little order tracker (paid/cancelled are shown as a chip only).
export const ORDER_STEPS = [
  { status: 'open', label: 'الاستلام' },
  { status: 'preparing', label: 'التحضير' },
  { status: 'served', label: 'التقديم' },
];

export const tableLabel = (number) => (number != null ? `طاولة ${number}` : '');

// Shrink very long titles a step at a time instead of overflowing.
export function lengthClass(text, steps = [18, 30, 44]) {
  const n = String(text ?? '').length;
  if (n > steps[2]) return 'len-xl';
  if (n > steps[1]) return 'len-l';
  if (n > steps[0]) return 'len-m';
  return 'len-s';
}
