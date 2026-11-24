"""Run one shared countdown per process using only Python's standard library."""
import argparse
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import queue
import re
import secrets
import socket
import ssl
import sys
import threading
import time
from urllib.parse import urlsplit
import webbrowser

from timer_state import Countdown, Rejected, SOUNDS, overlay_for, require


ROOT = Path(__file__).resolve().parent
ASSETS = {
    "/": ("console.html", "text/html"),
    "/display": ("display.html", "text/html"),
    "/display.html": ("display.html", "text/html"),
    "/two-stage": ("display.html", "text/html"),
    "/two-stage.html": ("display.html", "text/html"),
    "/guide.html": ("guide.html", "text/html"),
    "/clock": ("clock.html", "text/html"),
    "/clock.html": ("clock.html", "text/html"),
    "/style.css": ("style.css", "text/css"),
    "/overlay.css": ("overlay.css", "text/css"),
    **{f"/{name}.js": (f"{name}.js", "text/javascript") for name in ("common", "offline", "console", "display", "projection", "two-stage", "clock", "overlay-names")},
}


class Event:
    def __init__(self, path, public_url=None, mode="public", pairing_code=None):
        self.timer = Countdown(path)
        self.instance = secrets.token_hex(12)
        self.public_url = public_url
        self.mode = mode
        self.code = pairing_code or "".join(secrets.choice("23456789ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(10))
        self.tokens = set()
        self.failures = deque()
        self.streams = {}
        self.projections = set()
        self.overlays = {}
        self.overlay_number = 0
        self.changed = threading.Condition()

    def snapshot(self):
        return dict(**self.timer.snapshot(), instance=self.instance, mode=self.mode)

    def emit(self, kind, data, recipients=None):
        targets = self.streams.keys() if recipients is None else recipients
        for client in targets:
            inbox = self.streams.get(client)
            if inbox is not None:
                try:
                    inbox.put_nowait((kind, data))
                except queue.Full:
                    # Discard the backlog and force the slow client to reconnect.
                    while not inbox.empty():
                        try:
                            inbox.get_nowait()
                        except queue.Empty:
                            break
                    inbox.put_nowait((None, None))

    def settle(self):
        result = self.timer.settle()
        if result:
            self.emit("state", self.snapshot())
            if result["deadline"] is None:
                return
            self.emit("finish", result)
            settings = self.timer.configuration["settings"]
            if (self.projections and settings["sound"] != "mute" and settings["volume"] > 0
                    and self.timer.now() - result["deadline"] < 2000):
                self.send_audio(issued=result["deadline"])

    def send_audio(self, *, sound=None, volume=None, issued=None):
        settings = self.timer.configuration["settings"]
        self.emit("audio", {"sound": settings["sound"] if sound is None else sound,
                            "volume": settings["volume"] if volume is None else volume,
                            "issued": self.timer.now() if issued is None else issued}, self.projections)

    def watch(self, stopped):
        with self.changed:
            while not stopped.is_set():
                self.settle()
                deadline = self.timer.deadline
                if deadline is None:
                    deadline = self.timer.questions_at
                timeout = None if deadline is None else max(0, (deadline - self.timer.now()) / 1000)
                self.changed.wait(timeout)

    def pair(self, value):
        code = value.get("code")
        if isinstance(code, str) and code.isascii() and secrets.compare_digest(code.strip().upper(), self.code):
            require(len(self.tokens) < 128, "busy", 503)
            token = secrets.token_urlsafe(32)
            self.tokens.add(token)
            return {"token": token, "instance": self.instance}
        now = time.monotonic()
        while self.failures and now - self.failures[0] >= 60:
            self.failures.popleft()
        require(len(self.failures) < 30, "rateLimit", 429)
        self.failures.append(now)
        raise Rejected("badCode", 401)


class Service(ThreadingHTTPServer):
    request_queue_size = 64
    daemon_threads = True
    allow_reuse_address = os.name != "nt"

    def __init__(self, address, event):
        self.event = event
        self.slots = threading.BoundedSemaphore(96)
        super().__init__(address, Handler)
        self.stopped = threading.Event()
        self.watcher = threading.Thread(target=event.watch, args=(self.stopped,), daemon=True)
        self.watcher.start()

    def server_bind(self):
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def process_request(self, request, client_address):
        if self.slots.acquire(blocking=False):
            try:
                super().process_request(request, client_address)
            except BaseException:
                self.slots.release()
                raise
        else:
            self.shutdown_request(request)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()

    def serve_for(self, seconds):
        deadline = time.monotonic() + seconds
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return
            self.timeout = min(remaining, 3600)
            self.handle_request()

    def server_close(self):
        super().server_close()
        if hasattr(self, "stopped"):
            self.stopped.set()
            with self.event.changed:
                self.event.emit(None, None)
                self.event.changed.notify_all()
            self.watcher.join()


class Handler(BaseHTTPRequestHandler):
    timeout = 10
    server_version = "DemoCountdown"
    sys_version = ""

    def log_message(self, *_):
        pass

    @property
    def event(self):
        return self.server.event

    def headers_for(self, status, kind, size=None, *, public_read=False):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Cache-Control", "no-store")
        if public_read:
            self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if size is not None:
            self.send_header("Content-Length", str(size))
        else:
            self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

    def send_json(self, value, status=200, *, public_read=False):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.headers_for(status, "application/json; charset=utf-8", len(data), public_read=public_read)
        self.wfile.write(data)

    def body(self):
        require(self.headers.get_content_type() == "application/json")
        try:
            size = int(self.headers.get("Content-Length", "0"))
            require(0 < size <= 384 * 1024)
            data = json.loads(self.rfile.read(size).decode("utf-8"))
        except (ValueError, RecursionError):
            raise Rejected("invalid") from None
        require(isinstance(data, dict))
        return data

    def stream(self, projection=False):
        event = self.event
        identifier = secrets.token_urlsafe(24)
        inbox = queue.Queue(maxsize=32)
        with event.changed:
            require(not self.server.stopped.is_set(), "offline", 503)
            event.settle()
            require(len(event.streams) < 48, "busy", 503)
            snapshot = event.snapshot()
            event.streams[identifier] = inbox
            if projection:
                event.projections.add(identifier)
                if self.headers.get("X-Countdown-Overlay") == "1":
                    event.overlay_number += 1
                    event.overlays[identifier] = {"device": event.overlay_number}
        try:
            self.headers_for(200, "text/event-stream; charset=utf-8")
            self.send_event("welcome", dict(client=identifier, state=snapshot))
            while True:
                try:
                    kind, data = inbox.get(timeout=5)
                except queue.Empty:
                    self.send_event("heartbeat", {})
                    continue
                if kind is None:
                    break
                self.send_event(kind, data)
        finally:
            with event.changed:
                event.streams.pop(identifier, None)
                event.projections.discard(identifier)
                event.overlays.pop(identifier, None)

    def send_event(self, name, value):
        self.wfile.write(f"event: {name}\ndata: {json.dumps(value, ensure_ascii=False)}\n\n".encode())
        self.wfile.flush()

    def do_GET(self):
        path, _, query = self.path.partition("?")
        try:
            if path == "/api/events":
                self.stream(projection=query == "view=projection")
            elif path == "/api/time":
                self.send_json({"epochMs": time.time_ns() // 1_000_000}, public_read=True)
            elif path == "/api/state":
                with self.event.changed:
                    self.event.settle()
                    snapshot = self.event.snapshot()
                self.send_json(snapshot)
            elif path in ASSETS:
                filename, kind = ASSETS[path]
                data = (ROOT / "web" / filename).read_bytes()
                self.headers_for(200, kind + "; charset=utf-8", len(data))
                self.wfile.write(data)
            else:
                raise Rejected("notFound", 404)
        except Rejected as exc:
            self.send_json({"error": exc.code}, exc.status)
        except OSError:
            self.close_connection = True

    def do_POST(self):
        try:
            path = self.path.partition("?")[0]
            origin = self.headers.get("Origin")
            allowed = self.event.public_url or f"http://{self.headers.get('Host', '')}"
            require(origin is None or origin == allowed, "forbidden", 403)
            body = self.body()
            with self.event.changed:
                require(not self.server.stopped.is_set(), "offline", 503)
                self.event.settle()
                try:
                    result = self.post_action(path, body)
                    status = 200
                except Rejected as exc:
                    result, status = {"error": exc.code}, exc.status
                    if exc.status == 409:
                        result["state"] = self.event.snapshot()
            self.send_json(result, status)
        except Rejected as exc:
            self.send_json({"error": exc.code}, exc.status)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            self.close_connection = True
        except OSError as exc:
            print(f"Could not persist configuration / 无法保存设置: {exc}", flush=True)
            self.send_json({"error": "storage"}, 500)

    def post_action(self, path, body):
        event = self.event
        scheme, _, credential = self.headers.get("Authorization", "").partition(" ")
        bearer = credential if scheme.lower() == "bearer" else ""
        if path == "/api/pair":
            return event.pair(body)
        if path == "/api/overlay/report":
            require(bearer in event.overlays, "unpaired", 401)
            screen = body.get("screen")
            require(isinstance(screen, dict))
            width, height = screen.get("width"), screen.get("height")
            require(type(width) is int and 1 <= width <= 32768 and type(height) is int and 1 <= height <= 32768)
            event.overlays[bearer].update(appearance=overlay_for(body.get("appearance")),
                                          screen={"width": width, "height": height}, reported=time.monotonic())
            return {}
        require(bearer in event.tokens, "unpaired", 401)
        if path == "/api/overlay/clients":
            now = time.monotonic()
            return {"clients": [{key: client[key] for key in ("device", "appearance", "screen")}
                                for client in event.overlays.values() if now - client.get("reported", -float("inf")) < 35]}
        if path == "/api/session":
            return {"instance": event.instance}
        if path == "/api/preview":
            sound = body.get("sound")
            volume = body.get("volume", event.timer.configuration["settings"]["volume"])
            require(isinstance(sound, str) and sound in SOUNDS)
            require(type(volume) is int and 0 <= volume <= 100)
            require(bool(event.projections), "projectionMissing", 409)
            event.send_audio(sound=sound, volume=volume)
            return {}
        if path == "/api/command":
            event.timer.command(body)
            snapshot = event.snapshot()
            event.emit("state", snapshot)
            event.changed.notify_all()
            return snapshot
        raise Rejected("notFound", 404)


def lan_addresses():
    try:
        addresses = socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        return []
    return sorted({address for address in addresses if not address.startswith("127.")})


def parse_run_duration(value):
    message = "use a positive number of seconds or H/M/S units in order, e.g. 90, 45m or 2h30m"
    try:
        if re.fullmatch(r"[0-9]+", value):
            seconds = int(value)
        else:
            units = re.fullmatch(r"(?:([0-9]+)h)?(?:([0-9]+)m)?(?:([0-9]+)s)?", value, re.IGNORECASE | re.ASCII)
            if not units:
                raise ValueError
            hours, minutes, seconds = (int(part or 0) for part in units.groups())
            seconds += hours * 3600 + minutes * 60
    except ValueError as exc:
        raise argparse.ArgumentTypeError(message) from exc
    if not 0 < seconds <= sys.maxsize:
        raise argparse.ArgumentTypeError(message)
    return seconds


def parse_pairing_code(value):
    value = value.strip()
    if not re.fullmatch(r"[A-Za-z0-9]{6,32}", value):
        raise argparse.ArgumentTypeError("use 6 to 32 ASCII letters or digits")
    return value.upper()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lan", action="store_true",
                        help="Use local-network HTTP mode, listening on all interfaces by default. "
                             "Uses data/lan.json and ignores the public URL setting.")
    parser.add_argument("--open", action="store_true", help="Open the local LAN console")
    parser.add_argument("--host", help="Bind address (default: loopback for public, all interfaces for LAN)")
    parser.add_argument("--port", type=int, default=int(os.environ.get("COUNTDOWN_PORT", "8765")))
    parser.add_argument("--public-url", default=os.environ.get("COUNTDOWN_PUBLIC_URL"),
                        help="Browser-facing HTTPS origin for pairing and control, e.g. https://example.edu. "
                             "Omit paths such as /timer/. Defaults to COUNTDOWN_PUBLIC_URL if set.")
    parser.add_argument("--pairing-code", metavar="CODE", type=parse_pairing_code,
                        help="Set a fixed controller pairing code (6 to 32 letters or digits, "
                             "case-insensitive). Omit to generate a new random code at startup.")
    parser.add_argument("--data", type=Path)
    parser.add_argument("--cert", type=Path, help="PEM full chain for direct HTTPS")
    parser.add_argument("--key", type=Path, help="PEM private key for direct HTTPS")
    parser.add_argument("--run-for", metavar="DURATION", type=parse_run_duration,
                        help="Exit normally after this much elapsed time once the server is ready, even while idle. "
                             "Use seconds (90) or h/m/s in order (45m, 2h30m, 1m15s). "
                             "Omit to run until stopped manually.")
    args = parser.parse_args()
    if args.lan:
        args.public_url = None
    if args.public_url:
        try:
            url = urlsplit(args.public_url)
            valid = url.scheme == "https" and url.hostname and not url.username and not url.password
            valid = valid and url.path in ("", "/") and not url.query and not url.fragment and url.port != 0
        except ValueError:
            valid = False
        if not valid:
            parser.error("--public-url must be an HTTPS origin, such as https://timer.example.edu")
        hostname = f"[{url.hostname}]" if ":" in url.hostname else url.hostname
        args.public_url = "https://" + hostname + (f":{url.port}" if url.port not in (None, 443) else "")
    if bool(args.cert) != bool(args.key) or (args.cert and not args.public_url):
        parser.error("Direct HTTPS requires --cert, --key and --public-url")
    if args.open and not args.lan:
        parser.error("--open is for LAN mode")
    mode = "lan" if args.lan else "public"
    host = args.host or ("0.0.0.0" if args.lan else "127.0.0.1")
    path = args.data or ROOT / "data" / f"{mode}.json"
    try:
        context = None
        if args.cert:
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            context.load_cert_chain(args.cert, args.key)
        event = Event(path, args.public_url, mode, pairing_code=args.pairing_code)
        with Service((host, args.port), event) as service:
            if context:
                service.socket = context.wrap_socket(service.socket, server_side=True, do_handshake_on_connect=False)
            port = service.server_port
            local = f"http://127.0.0.1:{port}"
            print(f"Local console / 本机控制台: {args.public_url if context else local}", flush=True)
            if args.lan:
                for address in lan_addresses():
                    print(f"Teacher LAN console / 教师局域网地址: http://{address}:{port}", flush=True)
            else:
                address = args.public_url or "(direct HTTP: use server IP and port / HTTP 直连：使用服务端 IP 和端口)"
                print(f"Public console / 公共控制台: {address}", flush=True)
            print(f"Pairing code / 配对码: {event.code}", flush=True)
            if args.run_for is not None:
                print(f"Automatic stop / 自动退出: {args.run_for} seconds / 秒", flush=True)
            if args.open:
                threading.Thread(target=webbrowser.open, args=(local,), daemon=True).start()
            if args.run_for is None:
                service.serve_forever()
            else:
                service.serve_for(args.run_for)
        if args.run_for is not None:
            print("Run limit reached. Server stopped. / 已达到运行时限，服务已退出。", flush=True)
    except KeyboardInterrupt:
        return 0
    except (OSError, ValueError, Rejected) as exc:
        print(f"Startup failed / 启动失败 (port / 端口 {args.port}): {exc}", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
