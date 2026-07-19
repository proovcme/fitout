#!/usr/bin/env python3
import base64
import hashlib
import hmac
import json
import os
import secrets
import tempfile
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(os.environ.get("FITOUT_PORT", "4188"))
DATA_DIR = Path(os.environ.get("FITOUT_DATA_DIR", "/var/lib/fitout"))
DB_PATH = DATA_DIR / "players.json"
SECRET_PATH = DATA_DIR / "session-secret"
MAX_BODY = 1_500_000
LOCK = threading.Lock()
ATTEMPTS = {}
DATA_DIR.mkdir(parents=True, exist_ok=True)

if SECRET_PATH.exists():
    SESSION_SECRET = SECRET_PATH.read_bytes()
else:
    SESSION_SECRET = secrets.token_bytes(48)
    SECRET_PATH.write_bytes(SESSION_SECRET)
    os.chmod(SECRET_PATH, 0o600)


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def read_db():
    try:
        return json.loads(DB_PATH.read_text("utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {"users": {}}


def write_db(db):
    fd, temp_name = tempfile.mkstemp(prefix="players-", suffix=".json", dir=DATA_DIR)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(db, stream, ensure_ascii=False, indent=2)
        os.chmod(temp_name, 0o600)
        os.replace(temp_name, DB_PATH)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def password_hash(password: str, salt: bytes) -> str:
    return b64(hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 310_000, dklen=64))


def make_token(name: str) -> str:
    payload = b64(json.dumps({"name": name, "exp": int(time.time()) + 2_592_000}, ensure_ascii=False).encode())
    signature = b64(hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{signature}"


def parse_token(token: str):
    try:
        payload, signature = token.split(".", 1)
        expected = b64(hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(unb64(payload))
        return data["name"] if data["exp"] > int(time.time()) else None
    except (ValueError, KeyError, json.JSONDecodeError):
        return None


class Handler(BaseHTTPRequestHandler):
    server_version = "FitoutSave/1"

    def log_message(self, fmt, *args):
        print(f"{self.client_address[0]} {fmt % args}")

    def send_json(self, status, payload, cookie=None):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY:
            raise ValueError("body-too-large")
        return json.loads(self.rfile.read(length) or b"{}")

    def session_name(self):
        cookies = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = cookies.get("fitout_session")
        return parse_token(morsel.value) if morsel else None

    def rate_limited(self):
        now = time.time()
        recent = [stamp for stamp in ATTEMPTS.get(self.client_address[0], []) if now - stamp < 60]
        recent.append(now)
        ATTEMPTS[self.client_address[0]] = recent
        return len(recent) > 18

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True})
        else:
            self.send_json(404, {"error": "not-found"})

    def do_POST(self):
        try:
            if self.path in ("/register", "/login"):
                if self.rate_limited():
                    return self.send_json(429, {"error": "Слишком много попыток. Технологический перерыв."})
                body = self.read_json()
                name = " ".join(str(body.get("username", "")).strip().split())[:28]
                password = str(body.get("password", ""))
                if len(name) < 2 or not 4 <= len(password) <= 72:
                    return self.send_json(400, {"error": "Имя: 2–28 символов. Пароль: 4–72 символа."})
                key = name.casefold()
                with LOCK:
                    db = read_db()
                    user = db["users"].get(key)
                    if self.path == "/register":
                        if user:
                            return self.send_json(409, {"error": "Такой игрок уже зарегистрирован."})
                        salt = secrets.token_bytes(18)
                        user = {"name": name, "salt": b64(salt), "passwordHash": password_hash(password, salt), "createdAt": int(time.time()), "save": None, "history": []}
                        db["users"][key] = user
                        write_db(db)
                    elif not user or not hmac.compare_digest(password_hash(password, unb64(user["salt"])), user["passwordHash"]):
                        return self.send_json(401, {"error": "Имя или пароль не подошли."})
                cookie = f"fitout_session={make_token(user['name'])}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000"
                return self.send_json(200, {"ok": True, "user": user["name"], "state": user.get("save"), "historyCount": len(user.get("history", []))}, cookie)

            if self.path == "/save":
                name = self.session_name()
                if not name:
                    return self.send_json(401, {"error": "Нужно войти заново."})
                state = self.read_json().get("state")
                if not isinstance(state, dict) or not isinstance(state.get("tasks"), list):
                    return self.send_json(400, {"error": "Сохранение повреждено."})
                with LOCK:
                    db = read_db()
                    user = db["users"].get(name.casefold())
                    if not user:
                        return self.send_json(401, {"error": "Игрок не найден."})
                    was_completed = bool((user.get("save") or {}).get("completed"))
                    user["save"] = state
                    if state.get("completed") and not was_completed:
                        user.setdefault("history", []).insert(0, {"at": int(time.time()), "order": (state.get("selectedOrder") or {}).get("title", "Безымянный объект"), "quality": round(state.get("quality", 0)), "budget": round(state.get("budget", 0))})
                        user["history"] = user["history"][:40]
                    write_db(db)
                return self.send_json(200, {"ok": True})

            if self.path == "/logout":
                return self.send_json(200, {"ok": True}, "fitout_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0")
            self.send_json(404, {"error": "not-found"})
        except (ValueError, json.JSONDecodeError):
            self.send_json(400, {"error": "Некорректный запрос."})
        except Exception:
            self.send_json(500, {"error": "Серверный прораб уронил журнал. Попробуйте ещё раз."})


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
