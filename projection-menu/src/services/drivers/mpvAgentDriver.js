// Driver for "mpv_agent" projectors: a Raspberry Pi (or any Linux box) wired
// to the projector over HDMI, running agent/projector_agent.py which drives
// the mpv player. The server pushes cues to the agent over plain HTTP on the
// LAN; the agent authenticates them with the projector's access key and sends
// heartbeats back to /api/agent/heartbeat.

// Agents fetch media from the server over the LAN, so URLs must be absolute.
export function toAgentCue(cue, publicBaseUrl) {
  const absolutize = (media) => (media ? { ...media, url: new URL(media.url, publicBaseUrl).href } : media);
  return { ...cue, media: absolutize(cue.media), idle: absolutize(cue.idle) };
}

export function createMpvAgentDriver({ publicBaseUrl, timeoutMs, onlineWindowMs }) {
  return {
    name: 'mpv_agent',

    isOnline(projector) {
      if (!projector.last_seen_at) return false;
      const seenAt = Date.parse(`${projector.last_seen_at.replace(' ', 'T')}Z`);
      return Date.now() - seenAt < onlineWindowMs;
    },

    async send(projector, cue) {
      if (!projector.agent_host) return { ok: false, result: 'failed', error: 'لم يُحدد عنوان IP لجهاز العرض' };

      const body = toAgentCue(cue, publicBaseUrl);
      const url = `http://${projector.agent_host}:${projector.agent_port || 8765}/cue`;
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-projector-key': projector.access_key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err.name === 'TimeoutError';
        return {
          ok: false,
          result: timedOut ? 'timeout' : 'offline',
          error: timedOut ? 'لم يستجب الوكيل في الوقت المحدد' : `تعذر الاتصال بالوكيل (${err.cause?.code ?? err.message})`,
        };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, result: 'failed', error: `رد الوكيل ${res.status}: ${text.slice(0, 200)}` };
      }
      return { ok: true, result: 'acked' };
    },
  };
}
