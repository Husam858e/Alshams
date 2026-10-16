#!/usr/bin/env python3
"""
Projector agent — runs on a Raspberry Pi (or any Linux box) whose HDMI output
feeds the table projector. It is the lightweight alternative to the browser
player: no desktop or Chromium needed, just mpv.

    sudo apt install mpv
    python3 projector_agent.py --server http://192.168.1.10:3000 --projector 2 --key <access key>

What it does
  * Exposes POST /cue on the LAN (default port 8765). The server pushes the
    same JSON cues it sends to browser players; requests must carry the
    projector's key in the X-Projector-Key header.
  * Drives mpv through its JSON IPC socket (fullscreen, no OSD).
  * Composes zone placement, 180° rotation for far-side seats and the 4-corner
    calibration into one ffmpeg (lavfi) filter graph, so the image lands
    exactly on the table even without projector keystone.
  * Caches media locally by SHA-256 so clips play instantly the second time
    and keep playing if the server reboots.
  * Sends a heartbeat to the server every few seconds and applies the config
    (idle loop, zones, calibration) returned with it.

Limitation: mpv shows one clip at a time, so the most recent seat cue wins.
For several seats lit simultaneously use the browser player.

Standard library only (Python 3.9+).
"""

import argparse
import hashlib
import hmac
import json
import logging
import os
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

log = logging.getLogger("projector-agent")

CANVAS_W, CANVAS_H = 1920, 1080
FULL_ZONE = {"x": 0, "y": 0, "w": 1, "h": 1, "rotate": 0}
DEFAULT_CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]]
TEST_LAYER = "__test__"
TEST_PATTERN = (
    "av://lavfi:color=black:s=1920x1080,"
    "drawgrid=w=120:h=120:t=2:c=gray@0.6,"
    "drawbox=x=0:y=0:w=iw:h=ih:t=12:c=white"
)


# ── mpv JSON IPC ─────────────────────────────────────────────────────
class Mpv:
    """Starts mpv and talks to it over its JSON IPC unix socket."""

    def __init__(self, mpv_bin, on_event, dry_run=False):
        self.on_event = on_event
        self.dry_run = dry_run
        self.lock = threading.Lock()
        self.pending = {}
        self.next_id = 1
        if dry_run:
            log.info("dry-run: mpv is not started, commands are only logged")
            return
        self.sock_path = os.path.join(tempfile.gettempdir(), f"projector-mpv-{os.getpid()}.sock")
        self.proc = subprocess.Popen([
            mpv_bin, "--idle=yes", "--force-window=yes", "--fullscreen", "--no-osc", "--osd-level=0",
            "--no-input-default-bindings", "--input-vo-keyboard=no", "--cursor-autohide=always",
            "--keepaspect=yes", "--really-quiet", f"--input-ipc-server={self.sock_path}",
        ])
        for _ in range(100):
            if os.path.exists(self.sock_path):
                break
            time.sleep(0.1)
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.sock_path)
        threading.Thread(target=self._reader, daemon=True).start()

    def command(self, *args, timeout=3.0):
        if self.dry_run:
            log.info("mpv %s", json.dumps(args, ensure_ascii=False))
            return None
        with self.lock:
            request_id = self.next_id
            self.next_id += 1
            waiter = {"event": threading.Event(), "reply": None}
            self.pending[request_id] = waiter
            payload = json.dumps({"command": list(args), "request_id": request_id}) + "\n"
            self.sock.sendall(payload.encode())
        if not waiter["event"].wait(timeout):
            self.pending.pop(request_id, None)
            raise TimeoutError(f"mpv did not answer {args[0]}")
        reply = waiter["reply"]
        if reply.get("error") != "success":
            raise RuntimeError(f"mpv {args[0]}: {reply.get('error')}")
        return reply.get("data")

    def _reader(self):
        buffer = b""
        while True:
            chunk = self.sock.recv(65536)
            if not chunk:
                log.error("mpv exited")
                os._exit(1)  # let systemd restart the whole agent
            buffer += chunk
            while b"\n" in buffer:
                line, buffer = buffer.split(b"\n", 1)
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                if "request_id" in msg and msg["request_id"] in self.pending:
                    waiter = self.pending.pop(msg["request_id"])
                    waiter["reply"] = msg
                    waiter["event"].set()
                elif "event" in msg:
                    self.on_event(msg)


# ── Geometry → ffmpeg filter graph ───────────────────────────────────
def even(v, minimum=0):
    # yuv420 frames need even sizes and offsets.
    return max(minimum, int(round(v / 2)) * 2)


def build_filter(zone, corners, scale=1.0):
    """
    Renders the clip into its seat zone on a 1920×1080 canvas, rotated for the
    diner, then corner-pins the whole canvas onto the table.
    """
    rotate = int(zone.get("rotate") or 0) % 360
    zx, zy = even(zone["x"] * CANVAS_W), even(zone["y"] * CANVAS_H)
    zw, zh = even(zone["w"] * CANVAS_W, 2), even(zone["h"] * CANVAS_H, 2)
    zw, zh = min(zw, CANVAS_W - zx), min(zh, CANVAS_H - zy)
    sideways = rotate in (90, 270)
    bw, bh = (zh, zw) if sideways else (zw, zh)       # box before rotation
    s = max(0.1, min(float(scale or 1), 1.0))
    steps = [
        f"scale={even(bw * s, 2)}:{even(bh * s, 2)}:force_original_aspect_ratio=decrease",
        f"pad={bw}:{bh}:(ow-iw)/2:(oh-ih)/2:black",
    ]
    steps += {90: ["transpose=clock"], 180: ["hflip", "vflip"], 270: ["transpose=cclock"]}.get(rotate, [])
    steps.append(f"pad={CANVAS_W}:{CANVAS_H}:{zx}:{zy}:black")
    if corners and corners != DEFAULT_CORNERS:
        # ffmpeg corner order is TL, TR, BL, BR; ours is TL, TR, BR, BL.
        tl, tr, br, bl = [(x * CANVAS_W, y * CANVAS_H) for x, y in corners]
        pts = ":".join(f"x{i}={p[0]:.1f}:y{i}={p[1]:.1f}" for i, p in enumerate([tl, tr, bl, br]))
        steps.append(f"perspective={pts}:sense=destination")
    steps.append("format=yuv420p")
    return "lavfi=[" + ",".join(steps) + "]"


# ── Media cache ──────────────────────────────────────────────────────
class MediaCache:
    def __init__(self, directory):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.downloading = set()
        self.lock = threading.Lock()

    def path_for(self, media):
        ext = Path(urlparse(media["url"]).path).suffix
        return self.dir / f"{media['sha256']}{ext}"

    def resolve(self, media):
        """Local file if cached, else the URL (mpv streams it) + background download."""
        target = self.path_for(media)
        if target.exists():
            return str(target)
        threading.Thread(target=self._download, args=(media, target), daemon=True).start()
        return media["url"]

    def _download(self, media, target):
        with self.lock:
            if target in self.downloading:
                return
            self.downloading.add(target)
        tmp = target.with_suffix(target.suffix + ".part")
        try:
            digest = hashlib.sha256()
            with urllib.request.urlopen(media["url"], timeout=30) as res, open(tmp, "wb") as out:
                while chunk := res.read(1 << 20):
                    digest.update(chunk)
                    out.write(chunk)
            if digest.hexdigest() != media["sha256"]:
                raise ValueError("checksum mismatch")
            tmp.replace(target)
            log.info("cached %s", target.name)
        except Exception as err:  # noqa: BLE001 - a failed cache must never stop playback
            log.warning("download failed for %s: %s", media["url"], err)
            tmp.unlink(missing_ok=True)
        finally:
            with self.lock:
                self.downloading.discard(target)


# ── Agent state machine ──────────────────────────────────────────────
class Agent:
    def __init__(self, args):
        self.cache = MediaCache(args.cache_dir)
        self.lock = threading.RLock()
        self.config = {"zones": [], "calibration": {"corners": DEFAULT_CORNERS}, "idle": None}
        self.current = None  # {"cueId", "layer", "loop"} of the clip playing, None = idle
        self.timer = None
        self.mpv = Mpv(args.mpv, self.on_mpv_event, dry_run=args.dry_run)
        self.mpv.command("set_property", "pause", False)

    def corners(self):
        return (self.config.get("calibration") or {}).get("corners") or DEFAULT_CORNERS

    def handle(self, cue):
        action = cue.get("action")
        with self.lock:
            if action == "config":
                self.apply_config(cue)
            elif action == "play":
                self.play(cue)
            elif action == "stop":
                if cue.get("layer") is None or (self.current and self.current["layer"] == cue["layer"]):
                    self.show_idle()
            elif action == "test_pattern":
                if cue.get("on", True):
                    self.show_test_pattern()
                else:
                    self.show_idle()
            else:
                raise ValueError(f"unknown action {action}")

    def apply_config(self, cue):
        changed = {k: cue.get(k) for k in ("zones", "calibration", "idle")}
        if changed == {k: self.config.get(k) for k in changed}:
            return
        self.config.update(changed)
        log.info("config updated (idle=%s)", (cue.get("idle") or {}).get("url"))
        if self.current is None:
            self.show_idle()
        elif self.current["layer"] == TEST_LAYER:
            self.show_test_pattern()  # live feedback while calibrating

    def play(self, cue):
        self.cancel_timer()
        self.current = {"cueId": cue.get("cueId"), "layer": cue.get("layer"), "loop": bool(cue.get("loop"))}
        self.load(self.cache.resolve(cue["media"]), cue.get("zone") or FULL_ZONE,
                  loop=bool(cue.get("loop")), scale=cue.get("scale", 1))
        if cue.get("durationMs"):
            self.timer = threading.Timer(cue["durationMs"] / 1000, self.finish, args=(self.current["cueId"],))
            self.timer.daemon = True
            self.timer.start()

    def show_test_pattern(self):
        self.cancel_timer()
        self.current = {"cueId": None, "layer": TEST_LAYER, "loop": True}
        self.load(TEST_PATTERN, FULL_ZONE, loop=True)

    def show_idle(self):
        self.cancel_timer()
        self.current = None
        idle = self.config.get("idle")
        if idle:
            self.load(self.cache.resolve(idle), FULL_ZONE, loop=True)
        else:
            self.mpv.command("stop")

    def load(self, source, zone, loop, scale=1):
        self.mpv.command("set_property", "vf", build_filter(zone, self.corners(), scale))
        self.mpv.command("set_property", "loop-file", "inf" if loop else "no")
        self.mpv.command("loadfile", source, "replace")

    def finish(self, cue_id):
        with self.lock:
            if self.current and self.current["cueId"] == cue_id:
                self.show_idle()

    def cancel_timer(self):
        if self.timer:
            self.timer.cancel()
            self.timer = None

    def on_mpv_event(self, msg):
        # A non-looping clip reached its end: back to the idle loop.
        if msg.get("event") == "end-file" and msg.get("reason") == "eof":
            with self.lock:
                if self.current and not self.current["loop"]:
                    threading.Thread(target=self.finish, args=(self.current["cueId"],), daemon=True).start()


# ── HTTP API + heartbeat ─────────────────────────────────────────────
def make_handler(agent, key):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                return self.reply(200, {"ok": True, "playing": agent.current})
            self.reply(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/cue":
                return self.reply(404, {"error": "not found"})
            if not hmac.compare_digest(self.headers.get("X-Projector-Key", ""), key):
                return self.reply(401, {"error": "unauthorized"})
            try:
                length = min(int(self.headers.get("Content-Length", 0)), 1 << 20)
                agent.handle(json.loads(self.rfile.read(length)))
            except Exception as err:  # noqa: BLE001 - report any failure back to the server
                log.exception("cue failed")
                return self.reply(400, {"ok": False, "error": str(err)})
            self.reply(200, {"ok": True})

        def reply(self, status, body):
            data = json.dumps(body).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, fmt, *args):
            log.debug(fmt, *args)

    return Handler


def heartbeat_loop(agent, args):
    url = f"{args.server.rstrip('/')}/api/agent/heartbeat"
    body = json.dumps({"projector_id": args.projector, "key": args.key}).encode()
    while True:
        try:
            req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=5) as res:
                config = json.load(res).get("config")
            if config:
                with agent.lock:
                    agent.apply_config(config)
        except Exception as err:  # noqa: BLE001 - keep beating while the server is down
            log.warning("heartbeat failed: %s", err)
        time.sleep(args.heartbeat)


def cec_power_on():
    """Wake the projector over HDMI-CEC (if it supports it and cec-utils is installed)."""
    if shutil.which("cec-client"):
        subprocess.run(["cec-client", "-s", "-d", "1"], input=b"on 0\n", timeout=15, check=False)
    else:
        log.warning("--cec: cec-client not found (sudo apt install cec-utils)")


def main():
    parser = argparse.ArgumentParser(description="Projection menu — mpv projector agent")
    parser.add_argument("--server", required=True, help="e.g. http://192.168.1.10:3000")
    parser.add_argument("--projector", type=int, required=True, help="projector id from the dashboard")
    parser.add_argument("--key", required=True, help="projector access key from the dashboard")
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--mpv", default="mpv")
    parser.add_argument("--cache-dir", default=str(Path.home() / ".cache" / "projector-agent"))
    parser.add_argument("--heartbeat", type=float, default=10.0, help="seconds")
    parser.add_argument("--cec", action="store_true", help="power the projector on via HDMI-CEC at start")
    parser.add_argument("--dry-run", action="store_true", help="log mpv commands instead of running mpv")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s")
    if args.cec:
        cec_power_on()

    agent = Agent(args)
    threading.Thread(target=heartbeat_loop, args=(agent, args), daemon=True).start()
    server = ThreadingHTTPServer((args.bind, args.port), make_handler(agent, args.key))
    log.info("agent for projector #%s listening on %s:%s", args.projector, args.bind, args.port)
    server.serve_forever()


if __name__ == "__main__":
    main()
