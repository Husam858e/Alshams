// Who may call what (same groups as src/auth/roles.js), and shared constants.

export const ROLES = ['owner', 'designer', 'waiter'];
export const anyStaff = ROLES;
export const ownerOnly = ['owner'];
export const contentTeam = ['owner', 'designer'];
export const floorTeam = ['owner', 'waiter'];

export const ACTIVE_STATUSES = ['open', 'preparing', 'served'];
export const SCENE_TYPES = ['welcome', 'menu', 'category', 'dish', 'order', 'off'];

export const publicUser = (u) => u && { id: u.id, name: u.name, username: u.username, role: u.role };
