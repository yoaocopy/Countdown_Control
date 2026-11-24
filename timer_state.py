"""Authoritative countdown and durable event configuration."""
import json
import os
from pathlib import Path
import time
from uuid import uuid4


DEFAULTS = dict(duration=300, warning=30, effect="color", sound="beep", volume=70,
                twoStage=False, questionsDuration=120, autoAdvance=False)
EFFECTS = {"off", "color", "pulse"}
SOUNDS = {"beep", "double", "tone", "chime", "bell", "mute"}
MAX_GROUPS = 200
MAX_NAME = 120


class Rejected(Exception):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.code = code
        self.status = status


def require(condition, code="invalid", status=400):
    if not condition:
        raise Rejected(code, status)


def group_name(value):
    require(isinstance(value, str))
    value = value.strip()
    require(0 < len(value) <= MAX_NAME and not any(ord(c) < 32 or 0xD800 <= ord(c) <= 0xDFFF for c in value))
    return value


def settings_for(value):
    require(isinstance(value, dict))
    duration, warning, effect, sound = (value.get(key) for key in ("duration", "warning", "effect", "sound"))
    volume = value.get("volume", DEFAULTS["volume"])
    two_stage = value.get("twoStage", DEFAULTS["twoStage"])
    questions_duration = value.get("questionsDuration", DEFAULTS["questionsDuration"])
    auto_advance = value.get("autoAdvance", DEFAULTS["autoAdvance"])
    require(type(duration) is int and 1 <= duration <= 5999)
    require(type(warning) is int and 0 <= warning <= 5999)
    require(isinstance(effect, str) and effect in EFFECTS)
    require(isinstance(sound, str) and sound in SOUNDS)
    require(type(volume) is int and 0 <= volume <= 100)
    require(type(two_stage) is bool and type(auto_advance) is bool)
    require(type(questions_duration) is int and 1 <= questions_duration <= 5999)
    return dict(duration=duration, warning=warning, effect=effect, sound=sound, volume=volume,
                twoStage=two_stage, questionsDuration=questions_duration, autoAdvance=auto_advance)


def read_configuration(value):
    require(isinstance(value, dict) and value.get("version") == 1)
    groups = value.get("groups")
    require(isinstance(groups, list) and len(groups) <= MAX_GROUPS)
    cleaned = []
    ids = set()
    for group in groups:
        require(isinstance(group, dict))
        identifier = group.get("id")
        require(isinstance(identifier, str) and 0 < len(identifier) <= 64 and identifier.isascii() and identifier.isalnum())
        require(identifier not in ids)
        ids.add(identifier)
        cleaned.append(dict(id=identifier, name=group_name(group.get("name"))))
    current = value.get("current")
    require((not cleaned and current is None) or (isinstance(current, str) and current in ids))
    return dict(version=1, groups=cleaned, current=current, settings=settings_for(value.get("settings")))


class Countdown:
    def __init__(self, path, clock=time.monotonic):
        self.path = Path(path)
        self.clock = clock
        self.configuration = dict(version=1, groups=[], current=None, settings=DEFAULTS.copy())
        if self.path.exists():
            self.configuration = read_configuration(json.loads(self.path.read_text(encoding="utf-8")))
        self.revision = 0
        self.reset(self.configuration["settings"])

    def reset(self, settings):
        self.phase = "ready"
        self.remaining = settings["duration"] * 1000
        self.deadline = None
        self.stage = "presentation"
        self.two_stage = settings["twoStage"]
        self.questions_duration = settings["questionsDuration"] * 1000
        self.auto_advance = settings["autoAdvance"]

    def waiting_for_questions(self):
        return self.two_stage and self.stage == "presentation" and self.phase == "finished"

    def start_questions(self, timestamp):
        self.stage = "questions"
        self.phase = "running"
        self.remaining = self.questions_duration
        self.deadline = timestamp + self.questions_duration

    def now(self):
        return round(self.clock() * 1000)

    def settle(self):
        now = self.now()
        if self.deadline is None or now < self.deadline:
            return None
        finished_at = self.deadline
        self.phase, self.remaining, self.deadline = "finished", 0, None
        if self.waiting_for_questions() and self.auto_advance:
            self.start_questions(finished_at)
            if now >= self.deadline:
                finished_at = self.deadline
                self.phase, self.remaining, self.deadline = "finished", 0, None
        self.revision += 1
        return {"deadline": finished_at, "transition": self.phase == "running"}

    def snapshot(self):
        now = self.now()
        groups = self.configuration["groups"]
        current = self.configuration["current"]
        index = next((i for i, group in enumerate(groups) if group["id"] == current), None)
        return dict(**self.configuration, revision=self.revision, serverNow=now, deadline=self.deadline,
                    phase=self.phase, twoStage=self.two_stage, stage=self.stage, waitingQuestions=self.waiting_for_questions(),
                    remainingMs=self.remaining if self.deadline is None else max(0, self.deadline - now),
                    upcoming=[] if index is None else groups[index + 1:index + 3])

    def save(self, configuration):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        try:
            with temporary.open("w", encoding="utf-8") as file:
                json.dump(configuration, file, ensure_ascii=False, indent=2)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def command(self, body):
        require(type(body.get("revision")) is int and body["revision"] == self.revision, "stale", 409)
        action = body.get("action")
        config = self.configuration
        groups, current = config["groups"], config["current"]
        selected, updated, settings = current, groups, config["settings"]
        identifier = body.get("id")
        index = next((i for i, group in enumerate(groups) if group["id"] == identifier), None)
        reset = False

        if action == "add":
            names = body.get("names")
            require(isinstance(names, list) and bool(names))
            require(len(groups) + len(names) <= MAX_GROUPS, "groupLimit")
            updated = groups + [dict(id=uuid4().hex, name=group_name(name)) for name in names]
            if current is None:
                selected = updated[0]["id"]
                reset = self.phase == "ready"
        elif action in ("select", "rename", "remove", "move"):
            require(index is not None)
            if action == "select":
                selected, reset = identifier, identifier != current
            elif action == "rename":
                updated = groups.copy()
                updated[index] = dict(id=identifier, name=group_name(body.get("name")))
            elif action == "remove":
                updated = groups[:index] + groups[index + 1:]
                if identifier == current:
                    selected = updated[min(index, len(updated) - 1)]["id"] if updated else None
                    reset = True
            else:
                before = body.get("before")
                if before == identifier:
                    return
                updated = groups[:index] + groups[index + 1:]
                destination = next((i for i, group in enumerate(updated) if group["id"] == before), None)
                require(before is None or destination is not None)
                updated.insert(len(updated) if before is None else destination, groups[index])
        elif action == "editQueue":
            by_id = {group["id"]: group for group in groups}
            order, removed = body.get("order"), body.get("removed")
            require(isinstance(order, list) and len(order) == len(groups))
            require(isinstance(removed, list) and len(removed) <= len(groups))
            require(all(isinstance(item, str) and item in by_id for item in order + removed))
            removed_ids = set(removed)
            require(len(set(order)) == len(groups) and len(removed_ids) == len(removed))
            kept = [item for item in order if item not in removed_ids]
            updated = [by_id[item] for item in kept]
            if current in removed_ids:
                following = order[order.index(current) + 1:]
                selected = next((item for item in following if item not in removed_ids), kept[-1] if kept else None)
                reset = True
        elif action == "next":
            upcoming = self.snapshot()["upcoming"]
            require(bool(upcoming), "noNext", 409)
            selected, reset = upcoming[0]["id"], True
        elif action == "settings":
            settings = settings_for(body.get("settings"))
            reset = self.phase == "ready"
        elif action == "import":
            imported = read_configuration(body.get("configuration"))
            updated, selected, settings = imported["groups"], imported["current"], imported["settings"]
            reset = True
        elif action == "reset":
            reset = True
        elif action == "questions":
            require(self.waiting_for_questions(), "unavailable", 409)
            self.start_questions(self.now())
        elif action in ("start", "resume", "pause"):
            required = {"start": "ready", "resume": "paused", "pause": "running"}[action]
            require(self.phase == required, "unavailable", 409)
            now = self.now()
            if action == "pause":
                self.remaining = max(1, self.deadline - now)
                self.deadline, self.phase = None, "paused"
            else:
                self.deadline, self.phase = now + self.remaining, "running"
        else:
            raise Rejected("invalid")

        if reset and (self.phase in ("running", "paused") or self.waiting_for_questions()):
            require(body.get("confirmed") is True, "confirmRequired", 409)
        new_configuration = dict(version=1, groups=updated, current=selected, settings=settings)
        if new_configuration != config:
            self.save(new_configuration)
            self.configuration = new_configuration
        if reset:
            self.reset(settings)
        self.revision += 1
