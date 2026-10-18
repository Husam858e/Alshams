// Cloud mode: pairing a projector device with a 6-digit code, cutting a
// device off, PJLink power (LAN only), and showing a scene on a table with
// the projectors' acknowledgements (see "Projector devices" in
// docs/cloud-architecture.md).
//
// Pairing: the owner's code creates the projector doc (pending: true, so
// staff screens do not list it yet) and pairing/{code}; the device enters
// the code (claimProjector in device.js): it writes devices/{uid}, sets its
// projector pending: false and deletes the code. The pairing dialog sees a
// new projector appear on the table, as with the server.

import { Timestamp, doc, getDoc } from 'firebase/firestore';
import { anyStaff, ownerOnly } from '../../../demo/backend/roles.js';
import { DEFAULT_CALIBRATION } from '../../../demo/backend/seed.js';
import { HttpError, badRequest, forbidden, idParam, int, notFound, str } from '../../../demo/backend/validate.js';
import { httpErrorOf } from '../firebase.js';
import { PAIRING_TTL_MS, spec } from '../schema.js';

const POWER_UNSUPPORTED = 'التشغيل والإطفاء عبر الشبكة (PJLink) يحتاج الخادم المحلي على شبكة المطعم، ولا يعمل في وضع السحابة.';

export function projectorRoutes(route, cloud) {
  const { s, ctx, services, now, nowIso } = cloud;
  const { find, dto } = ctx;
  const projectors = spec('projectors');

  const loadProjector = (id) => {
    const p = s.projectors.find((x) => x.id === idParam(id, 'جهاز العرض'));
    if (!p) throw notFound('جهاز العرض غير موجود');
    return p;
  };
  const loadTable = (id) => {
    const t = find.table(idParam(id, 'الطاولة'));
    if (!t) throw notFound('الطاولة غير موجودة');
    return t;
  };
  const randomCode = () => String(Math.floor(Math.random() * 1e6)).padStart(6, '0');

  // A free code (a code nobody holds, or one that has expired).
  async function freshCode() {
    for (let i = 0; i < 6; i++) {
      const code = randomCode();
      let snap;
      try {
        snap = await getDoc(doc(services.db, 'pairing', code));
      } catch (err) {
        throw httpErrorOf(err);
      }
      if (!snap.exists() || snap.data().expiresAt.toMillis() <= now()) return code;
    }
    throw new HttpError(503, 'تعذّر إنشاء رمز ربط. أعد المحاولة.');
  }

  // body: {table_id, name?, projector_id?} — projector_id re-pairs an
  // existing projector (its old device is cut off) instead of adding one.
  route('POST', '/projectors/pairing-codes', ownerOnly, async ({ body, user }) => {
    const tableId = int(body.table_id, 'الطاولة', { required: true, min: 1 });
    if (!find.table(tableId)) throw badRequest('الطاولة المختارة غير موجودة');
    const name = str(body.name, 'اسم الجهاز', { max: 60 });
    const existingId = int(body.projector_id, 'جهاز العرض', { min: 1 });
    if (existingId) loadProjector(existingId);
    const code = await freshCode();
    const expiresMs = now() + PAIRING_TTL_MS;
    const expiresAt = new Date(expiresMs).toISOString();

    await cloud.mutate((extra) => {
      const table = find.table(tableId);
      if (!table) throw badRequest('الطاولة المختارة غير موجودة');
      // Codes nobody typed in leave their pending projector behind: clean up.
      for (const { id, data } of cloud.pendingProjectors()) {
        if (Date.parse(data.pairing_expires_at ?? 0) > now()) continue;
        extra.push({ op: 'delete', path: ['projectors', id] });
        if (data.pairing_code) extra.push({ op: 'delete', path: ['pairing', data.pairing_code] });
      }
      let projectorId = existingId;
      if (projectorId) {
        const p = loadProjector(projectorId);
        p.device_uid = null; // the old device stops at once (extraWrites deletes devices/{uid})
      } else {
        projectorId = s.nextId('projector');
        const row = {
          id: projectorId,
          table_id: table.id,
          name: name ?? `جهاز عرض طاولة ${table.number}`,
          calibration: DEFAULT_CALIBRATION(),
          rotation: 0,
          layout: 'single',
          pjlink_host: null,
          pjlink_port: 4352,
          pjlink_password: null,
          power: 'on',
          last_seen_at: null,
          acked_at: null,
          test_pattern: false,
          device_uid: null,
          created_at: nowIso(),
          pending: true,
          pairing_code: code,
          pairing_expires_at: expiresAt,
        };
        extra.push({ op: 'set', path: ['projectors', String(projectorId)], data: projectors.toDoc(row) });
      }
      extra.push({
        op: 'set',
        path: ['pairing', code],
        data: { projectorId, tableId: table.id, expiresAt: Timestamp.fromMillis(expiresMs), createdBy: user.id },
      });
      ctx.log(user, 'projector.pairing-code', { tableNumber: table.number, name });
    });
    return ctx.created({ code, expiresAt });
  });

  // The server's claim endpoint: in cloud mode the device claims through
  // Firestore itself (claimProjector), never through the staff app.
  route('POST', '/projectors/claim', null, () => {
    throw badRequest('في وضع السحابة يُربط جهاز العرض من شاشة إعداده: «جهاز عرض على طاولة» ثم رمز الربط.');
  });

  // "Rotate key": the device is unbound and must be paired again.
  route('POST', '/projectors/:id/rotate-key', ownerOnly, ({ params, user }) =>
    cloud.mutate(() => {
      const p = loadProjector(params.id);
      Object.assign(p, { device_uid: null, last_seen_at: null, acked_at: null, online: false });
      ctx.log(user, 'projector.rotate-key', { name: p.name });
      return dto.projector(p);
    }),
  );

  // PJLink talks to the projector over the restaurant's LAN.
  route('GET', '/projectors/:id/power', ownerOnly, ({ params }) => {
    loadProjector(params.id);
    return { supported: false, power: null };
  });
  route('POST', '/projectors/:id/power', ownerOnly, ({ params }) => {
    loadProjector(params.id);
    throw new HttpError(501, POWER_UNSUPPORTED);
  });

  // The scene is written at once; then the table's online projectors have
  // ACK_WAIT_MS to report it (projectors/{id}.acked_at = scene.at).
  route('PUT', '/tables/:id/scene', anyStaff, async ({ params, body, user }) => {
    const input = body.scene ?? body;
    if (user.role === 'designer' && input?.type === 'order') throw forbidden('عرض الطلبات من صلاحيات المالك والويتر');
    const out = await cloud.mutate(() => {
      const tableId = loadTable(params.id).id;
      return { tableId, ...ctx.projection.setScene(tableId, input, user) };
    });
    const delivered = await cloud.waitForAcks(out.tableId, out.scene.at);
    return { scene: out.scene, delivered };
  });
}
