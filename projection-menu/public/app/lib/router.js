// Hash routing: '#/table/7?tab=order' -> { path: '/table/7', query }.

import { useEffect, useState } from 'preact/hooks';

export function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
  const [path, search = ''] = raw.split('?');
  return { path: path.startsWith('/') ? path : `/${path}`, query: new URLSearchParams(search) };
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(path, { replace = false } = {}) {
  const hash = `#${path}`;
  if (location.hash === hash) return;
  if (replace) {
    history.replaceState(null, '', hash);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = path;
  }
}

// match('/table/:id', '/table/7') -> { id: '7' } | null
export function match(pattern, path) {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = b[i];
    else if (a[i] !== b[i]) return null;
  }
  return params;
}
