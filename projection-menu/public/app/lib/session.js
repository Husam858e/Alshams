// Login state: who is using this device, and the first-run check.

import { api } from './api.js';
import { disconnectLive } from './live.js';
import { clearResources, getState, setState } from './store.js';

export async function checkAuth() {
  try {
    const s = await api.authState();
    const prev = getState().auth.user;
    // Another user (or role) on the same device: forget cached data.
    if (prev && (!s.user || s.user.id !== prev.id || s.user.role !== prev.role)) clearResources();
    setState({ auth: { checked: true, user: s.user, needsSetup: s.needsSetup, error: null } });
    return s.user;
  } catch (err) {
    setState({ auth: { ...getState().auth, checked: true, error: err } });
    return getState().auth.user;
  }
}

export async function login(username, password) {
  const { user } = await api.login({ username, password });
  clearResources();
  setState({ auth: { checked: true, user, needsSetup: false, error: null } });
  rememberUsername(username);
  return user;
}

export async function setupOwner(body) {
  const { user } = await api.setup(body);
  clearResources();
  setState({ auth: { checked: true, user, needsSetup: false, error: null } });
  rememberUsername(body.username);
  return user;
}

export async function logout() {
  try {
    await api.logout();
  } catch {
    // the cookie is cleared server-side; offline logout still forgets locally
  }
  endSession();
}

// Session ended (logout, 401, revoked): back to the login screen.
export function endSession() {
  disconnectLive();
  clearResources();
  setState({ auth: { checked: true, user: null, needsSetup: false, error: null } });
}

const NAME_KEY = 'pm-app:last-username';
export function rememberUsername(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage disabled
  }
}
export function lastUsername() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
