import argparse
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading
import time
import unittest

from server import ROOT, Event, Service, parse_pairing_code, parse_run_duration


class Stream:
    def __init__(self, port, projection=False):
        self.connection = http.client.HTTPConnection("127.0.0.1", port, timeout=4)
        self.connection.request("GET", "/api/events?view=projection" if projection else "/api/events")
        self.response = self.connection.getresponse()
        assert self.response.status == 200
        assert self.response.getheader("X-Accel-Buffering") == "no"
        kind, welcome = self.next()
        assert kind == "welcome"
        self.client, self.state = welcome["client"], welcome["state"]

    def next(self):
        while True:
            line = self.response.readline()
            if not line:
                raise EOFError("stream closed")
            if line.startswith(b"event: "):
                kind = line[7:].decode().strip()
                data = json.loads(self.response.readline()[6:])
                self.response.readline()
                if kind != "heartbeat":
                    return kind, data

    def close(self):
        self.response.close()
        self.connection.close()


class ServerCommandLineTests(unittest.TestCase):
    def test_duration_formats(self):
        for value, seconds in (("90", 90), ("45m", 2700), ("2h30m", 9000), ("1m15s", 75), ("1H", 3600)):
            with self.subTest(value=value):
                self.assertEqual(parse_run_duration(value), seconds)
        for value in ("", "0", "0m", "-5", "1.5h", "30m2h", "10x", "9" * 400):
            with self.subTest(value=value):
                with self.assertRaises(argparse.ArgumentTypeError):
                    parse_run_duration(value)

    def test_pairing_code_format(self):
        self.assertEqual(parse_pairing_code("Room123"), "ROOM123")
        self.assertEqual(parse_pairing_code("7" * 32), "7" * 32)
        for value in ("12345", "7" * 33, "room-123", "房间123456"):
            with self.subTest(value=value), self.assertRaises(argparse.ArgumentTypeError):
                parse_pairing_code(value)

    def test_process_exits_at_limit_even_with_an_open_projection(self):
        env = os.environ.copy()
        env.pop("COUNTDOWN_PUBLIC_URL", None)
        with tempfile.TemporaryDirectory() as directory:
            data = str(Path(directory) / "data.json")
            command = [sys.executable, "-X", "utf8", str(ROOT / "server.py"),
                       "--port", "0", "--data", data, "--run-for", "3s", "--pairing-code", "RoomReview2026"]
            with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                  text=True, encoding="utf-8", env=env) as process:
                lines = []
                first_line = threading.Event()

                def read_output():
                    for line in process.stdout:
                        lines.append(line)
                        first_line.set()

                reader = threading.Thread(target=read_output, daemon=True)
                reader.start()
                try:
                    self.assertTrue(first_line.wait(5), "No startup output")
                    address = re.search(r"http://127\.0\.0\.1:(\d+)", lines[0])
                    self.assertIsNotNone(address, lines)
                    port = int(address.group(1))
                    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=2)
                    try:
                        connection.request("POST", "/api/pair", json.dumps({"code": "roomreview2026"}),
                                           {"Content-Type": "application/json"})
                        paired = connection.getresponse()
                        self.assertEqual(paired.status, 200)
                        self.assertTrue(json.load(paired)["token"])
                    finally:
                        connection.close()
                    projection = Stream(port, projection=True)
                    try:
                        self.assertEqual(process.wait(timeout=8), 0)
                        with self.assertRaises(EOFError):
                            projection.next()
                    finally:
                        projection.close()
                    reader.join(timeout=2)
                    self.assertIn("Automatic stop", "".join(lines))
                    self.assertIn("ROOMREVIEW2026", "".join(lines))
                    self.assertIn("Run limit reached", "".join(lines))
                finally:
                    if process.poll() is None:
                        process.kill()
                        process.wait()
                    reader.join(timeout=2)


class CountdownIntegration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "data.json"
        self.start()

    def start(self, public_url=None):
        self.event = Event(self.path, public_url=public_url, mode="public" if public_url else "lan")
        self.service = Service(("127.0.0.1", 0), self.event)
        self.port = self.service.server_port
        self.worker = threading.Thread(target=self.service.serve_forever)
        self.worker.start()

    def stop(self):
        self.service.shutdown()
        self.service.server_close()
        self.worker.join()

    def tearDown(self):
        self.stop()

    def request(self, path, body=None, token=None, origin=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=4)
        headers = {}
        if token:
            headers["Authorization"] = "Bearer " + token
        if origin:
            headers["Origin"] = origin
        try:
            if body is None:
                connection.request("GET", path, headers=headers)
            else:
                headers["Content-Type"] = "application/json"
                connection.request("POST", path, json.dumps(body), headers)
            response = connection.getresponse()
            data = response.read()
            if response.getheader("Content-Type").startswith("application/json"):
                data = json.loads(data)
            return response.status, data
        finally:
            connection.close()

    def pair(self):
        status, result = self.request("/api/pair", {"code": self.event.code})
        self.assertEqual(status, 200)
        return result["token"]

    def view(self):
        return self.request("/api/state")[1]

    def command(self, token, action, **fields):
        body = {"action": action, "revision": self.view()["revision"], **fields}
        return self.request("/api/command", body, token)

    def stream(self, projection=False):
        stream = Stream(self.port, projection)
        self.addCleanup(stream.close)
        return stream

    def advance(self, milliseconds):
        with self.event.changed:
            self.offset += milliseconds / 1000
            self.event.changed.notify_all()

    def use_clock(self):
        with self.event.changed:
            self.offset = 0
            self.event.timer.clock = lambda: time.monotonic() + self.offset

    def test_pairing_and_public_origin(self):
        self.assertEqual(self.request("/")[0], 200)
        self.assertEqual(self.request("/display")[0], 200)
        for path in ("/two-stage", "/two-stage.html", "/two-stage.js"):
            self.assertEqual(self.request(path)[0], 200)
        self.assertEqual(self.request("/api/pair", {"code": "wrong"})[0], 401)
        for path in ("command", "preview"):
            self.assertEqual(self.request("/api/" + path, {"action": "start"})[0], 401)
        self.stop()
        self.start("https://timer.example.edu")
        self.assertEqual(self.request("/api/pair", {"code": self.event.code}, origin="https://elsewhere.example")[0], 403)
        self.assertEqual(self.request("/api/pair", {"code": self.event.code}, origin="https://timer.example.edu")[0], 200)

    def test_clock_routes_and_public_time_endpoint(self):
        for path in ("/clock", "/clock.html", "/clock.js"):
            self.assertEqual(self.request(path)[0], 200)
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=4)
        self.addCleanup(connection.close)
        before = time.time_ns() // 1_000_000
        connection.request("GET", "/api/time", headers={"Origin": "null"})
        response = connection.getresponse()
        epoch = json.load(response)["epochMs"]
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader("Access-Control-Allow-Origin"), "*")
        self.assertEqual(response.getheader("Cache-Control"), "no-store")
        self.assertLessEqual(before, epoch)
        self.assertLessEqual(epoch, time.time_ns() // 1_000_000)

    def test_empty_queue_can_complete_and_accept_first_group_while_running(self):
        self.use_clock()
        teacher = self.pair()
        defaults = self.view()["settings"]
        self.assertEqual((defaults["sound"], defaults["volume"]), ("beep", 70))
        self.command(teacher, "settings", settings=dict(defaults, duration=12))
        status, running = self.command(teacher, "start")
        self.assertEqual(status, 200)
        self.assertIsNone(running["current"])
        self.assertEqual(self.command(teacher, "pause")[1]["phase"], "paused")
        resumed = self.command(teacher, "resume")[1]
        added = self.command(teacher, "add", names=["First"])[1]
        self.assertEqual(added["phase"], "running")
        self.assertEqual(added["deadline"], resumed["deadline"])
        self.advance(13000)
        self.assertEqual(self.view()["phase"], "finished")

    def test_two_stages_auto_advance_within_the_same_group(self):
        self.use_clock()
        teacher = self.pair()
        self.command(teacher, "add", names=["First", "Second"])
        self.command(teacher, "settings", settings=dict(self.view()["settings"],
            duration=10, questionsDuration=20, twoStage=True, autoAdvance=True))
        projection = self.stream()
        self.command(teacher, "start")
        running = projection.next()[1]
        self.assertEqual(running["stage"], "presentation")
        self.advance(12000)
        questions = projection.next()[1]
        self.assertEqual((questions["current"], questions["stage"], questions["phase"]),
                         (running["current"], "questions", "running"))
        self.assertEqual(questions["deadline"], running["deadline"] + 20000)
        self.assertTrue(projection.next()[1]["transition"])
        self.advance(20000)
        finished = projection.next()[1]
        self.assertEqual((finished["stage"], finished["phase"], finished["remainingMs"]), ("questions", "finished", 0))
        self.assertFalse(projection.next()[1]["transition"])
        next_group = self.command(teacher, "next")[1]
        self.assertEqual((next_group["stage"], next_group["phase"], next_group["remainingMs"]), ("presentation", "ready", 10000))
        self.assertNotEqual(next_group["current"], running["current"])

    def test_two_stages_manual_wait_and_deferred_settings(self):
        self.use_clock()
        teacher = self.pair()
        original = dict(self.view()["settings"], duration=5, questionsDuration=20, twoStage=True)
        self.command(teacher, "settings", settings=original)
        self.command(teacher, "start")
        self.advance(6000)
        waiting = self.view()
        self.assertTrue(waiting["waitingQuestions"])
        self.assertEqual(waiting["remainingMs"], 0)
        self.assertEqual(self.command(teacher, "reset")[0], 409)
        updated = self.command(teacher, "settings", settings=dict(original, twoStage=False, questionsDuration=35))[1]
        self.assertTrue(updated["waitingQuestions"])
        self.assertTrue(updated["twoStage"])
        questions = self.command(teacher, "questions")[1]
        self.assertEqual((questions["stage"], questions["phase"]), ("questions", "running"))
        self.assertGreater(questions["remainingMs"], 19000)
        self.assertLessEqual(questions["remainingMs"], 20000)
        self.assertEqual(self.command(teacher, "pause")[1]["phase"], "paused")
        reset = self.command(teacher, "reset", confirmed=True)[1]
        self.assertFalse(reset["twoStage"])
        self.assertEqual((reset["stage"], reset["phase"]), ("presentation", "ready"))

    def test_batch_queue_edit_preserves_current_until_confirmed_removal(self):
        teacher = self.pair()
        added = self.command(teacher, "add", names=["A", "B", "C", "D"])[1]
        a, b, c, d = [group["id"] for group in added["groups"]]
        running = self.command(teacher, "start")[1]
        status, edited = self.command(teacher, "editQueue", order=[d, a, c, b], removed=[c])
        self.assertEqual(status, 200)
        self.assertEqual(edited["current"], a)
        self.assertEqual(edited["deadline"], running["deadline"])
        self.assertEqual([group["id"] for group in edited["upcoming"]], [b])
        status, denied = self.command(teacher, "editQueue", order=[d, a, b], removed=[a, d])
        self.assertEqual((status, denied["error"]), (409, "confirmRequired"))
        self.assertEqual(denied["state"]["current"], a)
        status, applied = self.command(teacher, "editQueue", order=[d, a, b], removed=[a, d], confirmed=True)
        self.assertEqual(status, 200)
        self.assertEqual(applied["current"], b)
        self.assertEqual(applied["groups"], [added["groups"][1]])
        self.assertEqual(applied["phase"], "ready")

    def test_two_clients_start_pause_resume_reorder_and_disconnect(self):
        self.use_clock()
        teacher, venue = self.pair(), self.pair()
        status, setup = self.command(teacher, "add", names=["Alpha", "Beta", "Gamma", "Delta"])
        self.assertEqual(status, 200)
        a, b, c, d = [group["id"] for group in setup["groups"]]
        first, second = self.stream(), self.stream()
        self.assertEqual(self.command(teacher, "start")[0], 200)
        running = first.next()[1]
        self.assertEqual(second.next()[1], running)
        self.assertEqual(running["phase"], "running")
        self.assertEqual(self.command(venue, "next")[1]["error"], "confirmRequired")
        self.advance(1000)
        self.assertEqual(self.command(venue, "pause")[0], 200)
        paused = second.next()[1]
        self.assertEqual(first.next()[1], paused)
        self.advance(1000)
        self.assertEqual(self.view()["remainingMs"], paused["remainingMs"])
        self.assertEqual(self.command(teacher, "resume")[0], 200)
        resumed = first.next()[1]
        self.assertEqual(second.next()[1], resumed)
        self.assertEqual(self.command(venue, "move", id=a, before=c)[0], 200)
        moved = first.next()[1]
        self.assertEqual(second.next()[1], moved)
        self.assertEqual(moved["current"], a)
        self.assertEqual(moved["deadline"], resumed["deadline"])
        self.assertEqual([item["id"] for item in moved["upcoming"]], [c, d])
        self.assertEqual(self.command(teacher, "remove", id=c)[0], 200)
        self.assertEqual([item["id"] for item in second.next()[1]["upcoming"]], [d])
        first.close()
        self.advance(2000)
        reconciled = self.stream().state
        self.assertEqual(reconciled["deadline"], resumed["deadline"])
        self.assertLess(reconciled["remainingMs"], moved["remainingMs"] - 1000)
        self.assertEqual(self.command(venue, "next", confirmed=True)[1]["phase"], "ready")
        self.assertEqual(self.view()["current"], d)
        self.assertNotEqual(self.view()["current"], b)

    def test_preview_and_finish_delivered_to_regular_projections_only(self):
        self.use_clock()
        teacher = self.pair()
        self.command(teacher, "add", names=["Demo"])
        self.command(teacher, "settings", settings=dict(duration=20, warning=2, effect="pulse", sound="bell", volume=36))
        self.assertEqual(self.request("/api/preview", {"sound": "bell"}, teacher)[1]["error"], "projectionMissing")
        display, console, mirror = self.stream(projection=True), self.stream(), self.stream(projection=True)
        self.assertEqual(self.request("/api/preview", {"sound": "double", "volume": 101}, teacher)[0], 400)
        self.assertEqual(self.request("/api/preview", {"sound": "double", "volume": 25}, teacher)[0], 200)
        for stream in (display, mirror):
            kind, preview = stream.next()
            self.assertEqual(kind, "audio")
            self.assertEqual((preview["sound"], preview["volume"]), ("double", 25))
        self.command(teacher, "start")
        for stream in (display, console, mirror):
            self.assertEqual(stream.next()[0], "state")
        self.advance(20100)
        for stream in (display, console, mirror):
            self.assertEqual(stream.next()[1]["phase"], "finished")
            self.assertEqual(stream.next()[0], "finish")
        for stream in (display, mirror):
            kind, finish = stream.next()
            self.assertEqual(kind, "audio")
            self.assertEqual((finish["sound"], finish["volume"]), ("bell", 36))
        self.assertEqual(self.view()["remainingMs"], 0)
        display.close()
        reloaded = self.stream(projection=True)
        self.assertEqual(reloaded.state["phase"], "finished")
        self.command(teacher, "reset")
        for stream in (console, mirror, reloaded):
            self.assertEqual(stream.next()[1]["phase"], "ready")

    def test_mute_and_zero_volume_suppress_countdown_audio(self):
        self.use_clock()
        teacher = self.pair()
        display = self.stream(projection=True)
        for sound, volume in (("mute", 70), ("beep", 0)):
            settings = dict(self.view()["settings"], duration=10, sound=sound, volume=volume)
            self.command(teacher, "settings", settings=settings)
            self.assertEqual(display.next()[1]["phase"], "ready")
            self.command(teacher, "start")
            self.assertEqual(display.next()[1]["phase"], "running")
            self.advance(10100)
            self.assertEqual(display.next()[1]["phase"], "finished")
            self.assertEqual(display.next()[0], "finish")
            self.command(teacher, "reset")
            self.assertEqual(display.next()[1]["phase"], "ready")

    def test_settings_deferred_concurrent_writes_and_restarts(self):
        teacher, venue = self.pair(), self.pair()
        self.command(teacher, "add", names=["甲组", "Beta"])
        initial = self.view()
        self.assertEqual(self.command(teacher, "start")[0], 200)
        running = self.view()
        settings = dict(running["settings"], duration=75, warning=15, effect="off", sound="mute", volume=0)
        updated = self.command(teacher, "settings", settings=settings)[1]
        self.assertEqual(updated["deadline"], running["deadline"])
        status, conflict = self.command(venue, "remove", id=initial["current"], revision=running["revision"])
        self.assertEqual(status, 409)
        self.assertEqual(conflict["state"]["settings"], settings)
        self.assertEqual(self.command(venue, "reset", confirmed=True)[1]["remainingMs"], 75000)
        self.command(teacher, "select", id=initial["groups"][1]["id"])
        self.command(teacher, "start")
        before = self.view()
        old_code = self.event.code
        self.stop()
        self.start()
        after = self.view()
        for field in ("groups", "current", "settings"):
            self.assertEqual(after[field], before[field])
        self.assertEqual(after["phase"], "ready")
        self.assertEqual(after["remainingMs"], 75000)
        self.assertNotEqual(old_code, self.event.code)
        self.assertEqual(self.request("/api/session", {}, teacher)[0], 401)

    def test_backup_validation_and_import(self):
        teacher = self.pair()
        self.command(teacher, "add", names=["Initial"])
        backup = {key: self.view()[key] for key in ("version", "current", "groups", "settings")}
        del backup["settings"]["volume"]
        self.command(teacher, "add", names=["New"])
        self.assertEqual(self.command(teacher, "import", configuration={"version": 1})[0], 400)
        status, imported = self.command(teacher, "import", configuration=backup)
        self.assertEqual(status, 200)
        self.assertEqual(imported["groups"], backup["groups"])
        self.assertEqual(imported["current"], backup["current"])
        self.assertEqual(imported["settings"]["volume"], 70)


if __name__ == "__main__":
    unittest.main()
