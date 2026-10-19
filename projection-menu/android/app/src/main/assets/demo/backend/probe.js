// Size / duration of an uploaded image or video, read in the browser (the
// server uses ffprobe). Shared by the offline demo and the cloud host.

export async function probe(blob, kind) {
  if (typeof document === 'undefined') return {}; // Node (tests): no decoders
  if (kind === 'image') {
    try {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (info) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(info);
    };
    video.muted = true;
    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      finish({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        duration_ms: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : null,
      });
    video.onerror = () => finish({});
    setTimeout(() => finish({}), 4000);
    video.src = url;
  });
}
