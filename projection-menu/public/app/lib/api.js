// Every HTTP request of the staff app goes through this module, so the
// offline demo can stand in for the server by replacing fetch / XHR here.
// Errors become ApiError with the server's Arabic message; a 401 on any
// call except login/setup tells the app to show the login screen.

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

const NETWORK_ERROR = 'تعذّر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.';

const FALLBACK = {
  400: 'البيانات المرسلة غير صحيحة',
  401: 'انتهت الجلسة، سجّل الدخول من جديد',
  403: 'لا تملك صلاحية تنفيذ هذا الإجراء',
  404: 'العنصر غير موجود',
  409: 'تعارض مع بيانات موجودة',
  413: 'الملف أكبر من الحد المسموح',
  415: 'نوع المحتوى غير مدعوم',
  429: 'محاولات كثيرة، انتظر قليلاً ثم أعد المحاولة',
};
const fallbackMessage = (status) => FALLBACK[status] ?? (status >= 500 ? 'حدث خطأ في الخادم' : `خطأ غير متوقع (${status})`);

const unauthorizedListeners = new Set();
export function onUnauthorized(fn) {
  unauthorizedListeners.add(fn);
  return () => unauthorizedListeners.delete(fn);
}
const notifyUnauthorized = (err) => unauthorizedListeners.forEach((fn) => fn(err));

async function request(method, path, body, { quiet401 = false } = {}) {
  // POST must always be JSON (the server's CSRF guard): send {} when empty.
  const payload = body === undefined && method === 'POST' ? {} : body;
  const headers = { accept: 'application/json' };
  if (payload !== undefined) headers['content-type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
  } catch {
    throw new ApiError(NETWORK_ERROR, 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = new ApiError(data?.error ?? fallbackMessage(res.status), res.status, data);
    if (res.status === 401 && !quiet401) notifyUnauthorized(err);
    throw err;
  }
  return data;
}

const get = (path, opts) => request('GET', path, undefined, opts);
const post = (path, body, opts) => request('POST', path, body, opts);
const put = (path, body) => request('PUT', path, body);
const patch = (path, body) => request('PATCH', path, body);
const del = (path) => request('DELETE', path);

const qs = (params) => {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  return s ? `?${s}` : '';
};

// Upload one file with progress (fetch has no upload progress).
// -> { promise, abort }; the promise resolves with the new media asset.
export function uploadMedia(file, { title, onProgress } = {}) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (title) form.append('title', title);
    xhr.open('POST', '/api/media');
    xhr.withCredentials = true;
    xhr.setRequestHeader('accept', 'application/json');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onerror = () => reject(new ApiError(NETWORK_ERROR, 0));
    xhr.onabort = () => reject(new ApiError('أُلغي الرفع', -1));
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // non-JSON error page (e.g. a proxy)
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      const err = new ApiError(data?.error ?? fallbackMessage(xhr.status), xhr.status, data);
      if (xhr.status === 401) notifyUnauthorized(err);
      reject(err);
    };
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

export const api = {
  // Public
  info: () => get('/info'),
  authState: () => get('/auth/state', { quiet401: true }),
  setup: (body) => post('/auth/setup', body, { quiet401: true }),
  login: (body) => post('/auth/login', body, { quiet401: true }),
  logout: () => post('/auth/logout', {}, { quiet401: true }),
  changePassword: (current, next) => post('/me/password', { current, next }),

  // Users (owner)
  users: () => get('/users'),
  createUser: (body) => post('/users', body),
  updateUser: (id, body) => patch(`/users/${id}`, body),
  deactivateUser: (id) => del(`/users/${id}`),

  // Floor
  floor: () => get('/floor'),
  createArea: (body) => post('/areas', body),
  updateArea: (id, body) => patch(`/areas/${id}`, body),
  deleteArea: (id) => del(`/areas/${id}`),
  createTable: (body) => post('/tables', body),
  updateTable: (id, body) => patch(`/tables/${id}`, body),
  deleteTable: (id) => del(`/tables/${id}`),
  setTableStatus: (id, status) => patch(`/tables/${id}/status`, { status }),

  // Projectors
  projectors: () => get('/projectors'),
  createProjector: (body) => post('/projectors', body),
  updateProjector: (id, body) => patch(`/projectors/${id}`, body),
  deleteProjector: (id) => del(`/projectors/${id}`),
  rotateProjectorKey: (id) => post(`/projectors/${id}/rotate-key`, {}),
  projectorPower: (id) => get(`/projectors/${id}/power`),
  setProjectorPower: (id, on) => post(`/projectors/${id}/power`, { on }),
  saveCalibration: (id, corners) => put(`/projectors/${id}/calibration`, { corners }),
  testPattern: (id, on) => post(`/projectors/${id}/test-pattern`, { on }),
  pairingCode: (tableId, name) => post('/projectors/pairing-codes', { table_id: tableId, name: name || undefined }),
  serverInfo: () => get('/system/server-info'),

  // Menu
  menu: () => get('/menu'),
  createCategory: (body) => post('/categories', body),
  updateCategory: (id, body) => patch(`/categories/${id}`, body),
  deleteCategory: (id) => del(`/categories/${id}`),
  orderCategories: (ids) => put('/categories/order', { ids }),
  createDish: (body) => post('/dishes', body),
  updateDish: (id, body) => patch(`/dishes/${id}`, body),
  deleteDish: (id) => del(`/dishes/${id}`),
  orderDishes: (categoryId, ids) => put('/dishes/order', { category_id: categoryId, ids }),

  // Media
  media: () => get('/media'),
  renameMedia: (id, title) => patch(`/media/${id}`, { title }),
  deleteMedia: (id) => del(`/media/${id}`),

  // Settings
  settings: () => get('/settings'),
  saveGeneral: (body) => put('/settings/general', body),
  saveTheme: (body) => put('/settings/theme', body),

  // Scenes
  scene: (tableId) => get(`/tables/${tableId}/scene`),
  setScene: (tableId, scene) => put(`/tables/${tableId}/scene`, { scene }),

  // Orders
  orders: (params = {}) => get(`/orders${qs(params)}`),
  order: (id) => get(`/orders/${id}`),
  createOrder: (body) => post('/orders', body),
  addOrderItem: (orderId, body) => post(`/orders/${orderId}/items`, body),
  updateOrderItem: (orderId, itemId, body) => patch(`/orders/${orderId}/items/${itemId}`, body),
  removeOrderItem: (orderId, itemId) => del(`/orders/${orderId}/items/${itemId}`),
  setOrderStatus: (orderId, status) => patch(`/orders/${orderId}`, { status }),
  setOrderNotes: (orderId, notes) => patch(`/orders/${orderId}`, { notes }),

  // Reports (owner)
  reports: (from, to) => get(`/reports/summary${qs({ from, to })}`),
  activity: (limit = 100) => get(`/activity${qs({ limit })}`),
};
