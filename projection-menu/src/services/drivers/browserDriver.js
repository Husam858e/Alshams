// Driver for "browser" projectors: a small PC (mini-PC / Raspberry Pi) wired
// to the projector over HDMI, running Chromium in kiosk mode on
// /player/?projector=<id>&key=<key>. The page keeps a Socket.IO connection
// open and receives cues in real time, so there is no polling and no inbound
// port to open on the device.

export const playerRoom = (projectorId) => `projector:${projectorId}`;

export function createBrowserDriver({ nsp, timeoutMs }) {
  const isOnline = (projector) => (nsp.adapter.rooms.get(playerRoom(projector.id))?.size ?? 0) > 0;

  return {
    name: 'browser',
    isOnline,

    async send(projector, cue) {
      if (!isOnline(projector)) return { ok: false, result: 'offline', error: 'صفحة العرض غير متصلة' };
      try {
        // One ack per connected player tab (normally exactly one).
        const acks = await nsp.to(playerRoom(projector.id)).timeout(timeoutMs).emitWithAck('cue', cue);
        const rejected = acks.find((a) => !a?.ok);
        if (rejected) return { ok: false, result: 'failed', error: rejected?.error ?? 'رفض جهاز العرض الأمر' };
        return { ok: true, result: 'acked' };
      } catch {
        return { ok: false, result: 'timeout', error: 'لم يستجب جهاز العرض في الوقت المحدد' };
      }
    },
  };
}
