import { Router } from 'express';
import { anyStaff, contentTeam, ownerOnly } from '../auth/roles.js';

// Restaurant settings (owner) and the projected menu's theme (owner + designer).
// Every change reaches staff apps and projectors as 'settings:changed'.
export function settingsRoutes({ settings, projection, activity, mdns }) {
  const r = Router();

  r.get('/settings', anyStaff, (_req, res) => res.json(settings.all()));

  r.put('/settings/general', ownerOnly, (req, res) => {
    const before = settings.general();
    const general = settings.updateGeneral(req.body);
    activity.log(req.user, 'settings.general', { name: general.restaurantName });
    if (general.restaurantName !== before.restaurantName) mdns()?.rename(general.restaurantName);
    projection.settingsChanged();
    res.json(settings.all());
  });

  r.put('/settings/theme', contentTeam, (req, res) => {
    const theme = settings.updateTheme(req.body);
    activity.log(req.user, 'settings.theme', { name: theme.preset });
    projection.settingsChanged();
    res.json(settings.all());
  });

  return r;
}
