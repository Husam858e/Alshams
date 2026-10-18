// Projector player in cloud mode (cloud/player.html?device=<key>): the real
// public/player on the cloud backend, through its demo seam
// (public/player/lib/net.js uses window.__PM_DEMO__.openDevice).
//
// The player starts at once, without waiting for the backend: it paints the
// last menu it saved (localStorage) so a projector that reboots without
// internet still lights its table, and connects when the backend is up.
// When the backend says the device is not paired (never, or the owner
// unbound it), native is asked to reopen setup on the pairing code.

import { deviceProject, loadBackend, openSettings, showCrash, showMissingProject, startHost, statusScreen } from './boot.js';

const UNPAIRED_DELAY_MS = 4000; // the player's own "not authorized" notice shows first

const screen = statusScreen('player');

// openDevice / openPreview of a host that is still starting.
function deferredHost(hostReady) {
  let unpairedTimer = null;
  const open = (method, id, on) => {
    let session = null;
    const guarded = {
      ...on,
      fatal: (reason) => {
        on.fatal(reason);
        if (method === 'openDevice' && reason === 'unauthorized' && !unpairedTimer) {
          unpairedTimer = setTimeout(() => openSettings('unpaired'), UNPAIRED_DELAY_MS);
        }
      },
    };
    // Registered before any fetchOrder() below awaits the same promise, so
    // `session` is set by then.
    hostReady.then((host) => {
      session = host[method](id, guarded);
    });
    return {
      reportStatus(state, detail) {
        session?.reportStatus(state, detail);
      },
      async fetchOrder(orderId) {
        await hostReady;
        return session ? session.fetchOrder(orderId) : null;
      },
    };
  };
  return {
    openDevice: (deviceKey, on) => open('openDevice', deviceKey, on),
    openPreview: (tableId, on) => open('openPreview', tableId, on),
  };
}

async function main() {
  const project = await deviceProject();
  if (!project.config) return showMissingProject(screen, project);
  let backend;
  try {
    backend = await loadBackend();
  } catch (err) {
    // A file missing from the APK, or a module that fails to load.
    return showCrash(screen, err, 'تعذّر تشغيل الوضع السحابي');
  }
  const hostReady = startHost(() => backend.createCloudHost(project.config, { role: 'device', emulators: project.emulators }), screen, { quiet: true }).then((host) => {
    screen.hide(); // an error shown while it kept retrying
    return host;
  });
  window.__PM_DEMO__ = deferredHost(hostReady);
  await import('/player/main.js');
}

main().catch((err) => showCrash(screen, err));
