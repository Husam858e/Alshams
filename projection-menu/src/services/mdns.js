import { Bonjour } from 'bonjour-service';

export const MDNS_TYPE = 'projection-menu'; // advertised as _projection-menu._tcp

const DEFAULT_NAME = 'Projection Menu';
const LABEL_BYTES = 63; // a DNS label holds at most 63 bytes (Arabic letters take 2 in UTF-8)
const PROBE_WAIT_MS = 2500; // bonjour probes for at most ~1 s before announcing
const MAX_TRIES = 9;

// The instance name as a valid DNS label: dots become dashes (as bonjour does)
// and the name is cut on whole characters to fit 63 bytes with its suffix.
export function serviceLabel(name, suffix = '') {
  const clean = String(name ?? '').split('.').join('-').trim() || DEFAULT_NAME;
  const budget = LABEL_BYTES - Buffer.byteLength(suffix);
  let out = '';
  for (const ch of clean) {
    if (Buffer.byteLength(out + ch) > budget) break;
    out += ch;
  }
  return out.trim() + suffix;
}

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
  let baseName = null;
  let timer = null;

  // bonjour silently drops a service whose name is already taken on the
  // network; then try again as "name (2)", "name (3)", …
  const publish = (serviceName, attempt = 1) => {
    clearTimeout(timer);
    baseName = serviceName;
    const current = bonjour.publish({
      name: serviceLabel(serviceName, attempt > 1 ? ` (${attempt})` : ''),
      type: MDNS_TYPE,
      port: config.port,
      txt: { app: 'projection-menu', version: config.version, path: '/app/' },
    });
    current.on('error', (err) => log.warn(`⚠️  mDNS: ${err.message}`));
    service = current;
    timer = setTimeout(() => {
      if (service !== current || current.published || current.activated || attempt >= MAX_TRIES) return;
      publish(serviceName, attempt + 1);
    }, PROBE_WAIT_MS);
    timer.unref?.();
  };
  publish(name);

  return {
    get name() {
      return service?.name ?? null;
    },
    // The restaurant was renamed: re-announce under the new name.
    rename(newName) {
      if (!newName || newName === baseName) return;
      clearTimeout(timer);
      if (service) service.stop(() => publish(newName));
      else publish(newName);
    },
    stop() {
      clearTimeout(timer);
      return new Promise((resolve) => {
        bonjour.unpublishAll(() => {
          bonjour.destroy();
          resolve();
        });
      });
    },
  };
}
