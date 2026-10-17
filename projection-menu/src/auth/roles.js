import { HttpError, forbidden } from '../lib/validate.js';

export const ROLES = ['owner', 'designer', 'waiter'];

export const ROLE_LABELS = { owner: 'مالك', designer: 'مصمم', waiter: 'ويتر' };

// Route guard: 401 when not logged in, 403 when the role may not do this.
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new HttpError(401, 'يجب تسجيل الدخول أولاً'));
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const anyStaff = requireRole(...ROLES);
export const ownerOnly = requireRole('owner');
export const contentTeam = requireRole('owner', 'designer');
export const floorTeam = requireRole('owner', 'waiter');

export const publicUser = (u) => u && { id: u.id, name: u.name, username: u.username, role: u.role };
