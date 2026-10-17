import { Bonjour } from 'bonjour-service';

export const MDNS_TYPE = 'projection-menu'; // advertised as _projection-menu._tcp

// Advertises the server on the LAN (mDNS / zeroconf) so the Android app can
// list it without typing an IP address. Returns null when disabled
// (config.mdns === false, env MDNS=0, tests).
export function startMdns({ config, name, log = console }) {
  if (!config.mdns) return null;
  let bonjour;
  try {
    bonjour = new Bonjour({}, (err) => log.warn(`⚠️  mDNS: ${err.message}`));
  } catch (err) {
    log.warn(`⚠️  تعذّر تشغيل الإعلان على الشبكة (mDNS): ${err.message}`);
    return null;
  }

  let service = null;
  const publish = (serviceName) => {
    service = bonjour.publish({
      name: String(serviceName || 'Projection Menu').slice(0, 60),
      type: MDNS_TYPE,
      port: config.port,
      txt: { app: 'projection-menu', version: config.version, path: '/app/' },
    });
    service.on('error', (err) => log.warn(`⚠️  mDNS: ${err.message}`));
  };
  publish(name);

  return {
    get name() {
      return service?.name ?? null;
    },
    // The restaurant was renamed: re-announce under the new name.
    rename(newName) {
      if (!newName || newName === service?.name) return;
      const old = service;
      old?.stop?.(() => publish(newName));
      if (!old?.stop) publish(newName);
    },
    stop() {
      return new Promise((resolve) => {
        bonjour.unpublishAll(() => {
          bonjour.destroy();
          resolve();
        });
      });
    },
  };
}
