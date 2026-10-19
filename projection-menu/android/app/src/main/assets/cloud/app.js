// Staff app in cloud mode (cloud/app.html): the real public/app on the cloud
// backend. frame-shim.js (loaded first by the page) turns fetch / XHR to
// /api/* into host.request(); the import map sends the Socket.IO client to
// demo/fake-socket.js, which plays host.subscribeLive(). Player previews are
// iframes of /player/ inside this page and find the host as
// window.parent.__PM_DEMO__ (public/player/lib/net.js).

import { deviceProject, loadBackend, showCrash, showMissingProject, startHost, statusScreen } from './boot.js';

const screen = statusScreen('app');

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
  const host = await startHost(() => backend.createCloudHost(project.config, { role: 'staff', appName: backend.STAFF_APP, emulators: project.emulators }), screen);
  window.__pmInstallShim(host, { realUploads: true });
  // The app paints over the splash; drop the status layer once it runs.
  await import('/app/main.js');
  screen.hide();
}

main().catch((err) => showCrash(screen, err));
