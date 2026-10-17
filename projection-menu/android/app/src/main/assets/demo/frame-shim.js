// Loaded first by demo/app.html (a classic script, before any module), so
// the real staff app (/app/main.js) talks to the demo backend of the parent
// page instead of a server:
//   fetch('/api/...')          -> parent backend.request()
//   XMLHttpRequest '/api/...'  -> the same, with upload progress (media uploads)
//   window.open('/player/...') -> the demo's table shows that projector
// and nested player previews (/player/?preview=<id>) find the backend as
// window.parent.__PM_DEMO__ (see public/player/lib/net.js).
// Keep to plain ES2017: it runs before anything else on the page.

(function () {
  'use strict';
  var host = null;
  try {
    host = window.parent !== window ? window.parent.__PM_DEMO__ || null : null;
  } catch (err) {
    host = null;
  }
  if (!host) return; // opened on its own: the app shows "server unreachable"
  window.__PM_DEMO__ = host;

  var isApi = function (url) {
    return url.origin === location.origin && url.pathname.indexOf('/api/') === 0;
  };
  var parseBody = function (body) {
    if (body == null || body === '') return null;
    if (typeof body !== 'string') return body;
    try {
      return JSON.parse(body);
    } catch (err) {
      return null;
    }
  };

  // ── fetch ──
  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    var request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
    var url = new URL(request ? request.url : String(input), location.href);
    if (!isApi(url)) return realFetch(input, init);
    var method = String(init.method || (request && request.method) || 'GET').toUpperCase();
    return Promise.resolve(host.request({ method: method, url: url.pathname + url.search, body: parseBody(init.body) })).then(
      function (reply) {
        var empty = reply.status === 204 || reply.data === null || reply.data === undefined;
        return new Response(empty ? null : JSON.stringify(reply.data), {
          status: reply.status,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      },
    );
  };

  // ── XMLHttpRequest (only api.js uploads use it) ──
  var RealXHR = window.XMLHttpRequest;
  var DONE = 4;
  class DemoXHR extends RealXHR {
    open(method, url) {
      var parsed = new URL(String(url), location.href);
      this._demo = isApi(parsed) ? { method: String(method).toUpperCase(), url: parsed.pathname + parsed.search, status: 0, text: '', state: 1 } : null;
      if (!this._demo) return super.open.apply(this, arguments);
    }

    setRequestHeader() {
      if (!this._demo) return super.setRequestHeader.apply(this, arguments);
    }

    get readyState() {
      return this._demo ? this._demo.state : super.readyState;
    }

    get status() {
      return this._demo ? this._demo.status : super.status;
    }

    get responseText() {
      return this._demo ? this._demo.text : super.responseText;
    }

    get response() {
      return this._demo ? this._demo.text : super.response;
    }

    send(body) {
      var demo = this._demo;
      if (!demo) return super.send(body);
      var self = this;
      var file = null;
      var fields = {};
      if (body instanceof FormData) {
        body.forEach(function (value, key) {
          if (typeof value === 'string') fields[key] = value;
          else if (key === 'file') file = value;
        });
      }
      var total = file ? file.size : 0;
      var fire = function (target, type, loaded) {
        target.dispatchEvent(new ProgressEvent(type, { lengthComputable: total > 0, loaded: loaded || 0, total: total }));
      };
      var finish = function (reply) {
        if (demo.aborted) return;
        demo.status = reply.status;
        demo.text = reply.data == null ? '' : JSON.stringify(reply.data);
        demo.state = DONE;
        self.dispatchEvent(new Event('readystatechange'));
        fire(self, 'load', total);
        fire(self, 'loadend', total);
      };
      // A believable upload: progress over ~0.4-1.5 s depending on size.
      var steps = 8;
      var stepMs = Math.min(190, 50 + total / 400000);
      var step = 0;
      var tick = function () {
        if (demo.aborted) return;
        step += 1;
        if (total) fire(self.upload, 'progress', Math.round((total * step) / steps));
        if (step < steps) return setTimeout(tick, stepMs);
        Promise.resolve(host.request({ method: demo.method, url: demo.url, body: parseBody(file ? null : body), file: file, fields: fields }))
          .then(finish)
          .catch(function () {
            if (demo.aborted) return;
            demo.state = DONE;
            fire(self, 'error', 0);
            fire(self, 'loadend', 0);
          });
      };
      setTimeout(tick, stepMs);
    }

    abort() {
      if (!this._demo) return super.abort();
      if (this._demo.aborted || this._demo.state === DONE) return;
      this._demo.aborted = true;
      this._demo.state = DONE;
      this.dispatchEvent(new ProgressEvent('abort'));
      this.dispatchEvent(new ProgressEvent('loadend'));
    }
  }
  window.XMLHttpRequest = DemoXHR;

  // ── "Open the player link here" ──
  var realOpen = window.open.bind(window);
  window.open = function (url) {
    try {
      var parsed = new URL(String(url), location.href);
      if (parsed.origin === location.origin && parsed.pathname.indexOf('/player/') === 0) {
        if (host.focusDevice) host.focusDevice(parsed.searchParams.get('device'));
        return null;
      }
    } catch (err) {
      // fall through to the browser
    }
    return realOpen.apply(window, arguments);
  };
})();
