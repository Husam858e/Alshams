// Arrow-key / D-pad focus movement for Android TV remotes: moves focus to
// the nearest focusable control in the pressed direction. In text fields
// left/right move the caret until it reaches the edge of the text, and
// OK (Enter) toggles checkboxes.

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, a[href], [tabindex="0"]';
const DIRECTIONS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const TEXT_TYPES = new Set(['text', 'url', 'password', 'number', 'search', 'tel', 'email']);

const isTextField = (el) => el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && TEXT_TYPES.has(el.type));
const center = (r) => [r.left + r.width / 2, r.top + r.height / 2];

// True while left/right still has text to move the caret over.
function caretCanMove(el, dx) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  if (start == null) return false;
  if (start !== end) return true;
  const towardsStart = (dx < 0) !== (getComputedStyle(el).direction === 'rtl');
  return towardsStart ? start > 0 : end < value.length;
}

function visible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

// Nearest candidate in direction [dx, dy], measured edge to edge. Sideways
// distance is 0 when the two overlap (a half-width field under a full-width
// one) and costs more than distance, so focus keeps to its row or column.
function findNext(from, [dx, dy]) {
  const a = from.getBoundingClientRect();
  const [ax, ay] = center(a);
  let best = null;
  let bestScore = Infinity;
  for (const el of document.querySelectorAll(FOCUSABLE)) {
    if (el === from || !visible(el)) continue;
    const b = el.getBoundingClientRect();
    const [bx, by] = center(b);
    if ((bx - ax) * dx + (by - ay) * dy <= 4) continue; // not in that direction
    const gapX = Math.max(0, b.left - a.right, a.left - b.right);
    const gapY = Math.max(0, b.top - a.bottom, a.top - b.bottom);
    const [ahead, side] = dx ? [gapX, gapY] : [gapY, gapX];
    const score = ahead + side * 3 + Math.hypot(bx - ax, by - ay) * 0.01;
    if (score < bestScore) {
      best = el;
      bestScore = score;
    }
  }
  return best;
}

export function enableArrowNavigation() {
  // <html class="keyboard"> while a remote/keyboard is in use, for focus
  // rings that :focus-visible can't express (custom checkbox rows).
  const root = document.documentElement;
  document.addEventListener('pointerdown', () => root.classList.remove('keyboard'), { passive: true });
  document.addEventListener('keydown', (e) => {
    root.classList.add('keyboard');
    if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    const current = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;

    if (e.key === 'Enter' && current?.type === 'checkbox') {
      e.preventDefault();
      current.click();
      return;
    }
    const dir = DIRECTIONS[e.key];
    if (!dir) return;
    if (dir[0] !== 0 && isTextField(current) && caretCanMove(current, dir[0])) return;

    const next = current ? findNext(current, dir) : [...document.querySelectorAll(FOCUSABLE)].find(visible);
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
