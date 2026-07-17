"""Local preview server with a tiny content-saving endpoint.

Run: python dev_server.py
Then open: http://127.0.0.1:4173/index.html
Local password: python set_editor_password.py
Cloud password: set YEZI_EDITOR_PASSWORD in the deployment environment
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import threading
import time
from datetime import date as calendar_date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent
CONTENT_FILE = ROOT / "content.json"
ARCHIVE_FILE = ROOT / "archive-docs.json"
MEDIA_FILE = ROOT / "media.json"
COMMENTS_FILE = ROOT / "comments.json"
ASSETS_DIR = ROOT / "assets"
ARCHIVE_IMAGES_DIR = ASSETS_DIR / "archive"
MUSIC_DIR = ASSETS_DIR / "music"
MUSIC_LIBRARY_FILE = MUSIC_DIR / "library.json"
EDITOR_AUTH_FILE = ROOT / ".editor-auth.json"
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "4173"))
MAX_BODY_SIZE = 2 * 1024 * 1024
MAX_IMAGE_SIZE = 8 * 1024 * 1024
EDITOR_SESSION_SECONDS = 8 * 60 * 60
EDITOR_LOGIN_WINDOW_SECONDS = 5 * 60
EDITOR_LOGIN_MAX_ATTEMPTS = 5
IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
IMAGE_SLOTS = {"hero", "id"}
MUSIC_AUDIO_EXTENSIONS = {".mp3", ".m4a", ".ogg", ".wav", ".webm"}
MUSIC_COVER_EXTENSIONS = (".webp", ".jpg", ".jpeg", ".png")
EDITOR_SESSIONS: dict[str, float] = {}
EDITOR_SESSIONS_LOCK = threading.Lock()
EDITOR_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
EDITOR_LOGIN_LOCK = threading.Lock()
ARCHIVE_LOCK = threading.Lock()
ARCHIVE_CATEGORIES = {"daily", "product", "aigc", "games"}
ARCHIVE_IMAGE_PATTERN = re.compile(r"assets/archive/[A-Za-z0-9._-]+\.(?:jpg|png|webp)")


def editor_auth_configured() -> bool:
    return bool(os.environ.get("YEZI_EDITOR_PASSWORD")) or EDITOR_AUTH_FILE.exists()


def verify_editor_password(password: str) -> bool:
    environment_password = os.environ.get("YEZI_EDITOR_PASSWORD")
    if environment_password:
        return hmac.compare_digest(password.encode("utf-8"), environment_password.encode("utf-8"))
    try:
        config = json.loads(EDITOR_AUTH_FILE.read_text(encoding="utf-8"))
        if config.get("algorithm") != "pbkdf2_sha256":
            return False
        iterations = int(config["iterations"])
        salt = base64.b64decode(config["salt"], validate=True)
        expected_hash = base64.b64decode(config["hash"], validate=True)
    except (OSError, ValueError, KeyError, json.JSONDecodeError):
        return False
    candidate_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return hmac.compare_digest(candidate_hash, expected_hash)


def create_editor_session() -> str:
    token = secrets.token_urlsafe(32)
    now = time.time()
    with EDITOR_SESSIONS_LOCK:
        expired = [session for session, expiry in EDITOR_SESSIONS.items() if expiry <= now]
        for session in expired:
            EDITOR_SESSIONS.pop(session, None)
        EDITOR_SESSIONS[token] = now + EDITOR_SESSION_SECONDS
    return token


def verify_editor_session(token: str) -> bool:
    if not token:
        return False
    now = time.time()
    with EDITOR_SESSIONS_LOCK:
        expiry = EDITOR_SESSIONS.get(token, 0)
        if expiry <= now:
            EDITOR_SESSIONS.pop(token, None)
            return False
        return True


def editor_login_is_blocked(client: str) -> bool:
    cutoff = time.time() - EDITOR_LOGIN_WINDOW_SECONDS
    with EDITOR_LOGIN_LOCK:
        attempts = [attempt for attempt in EDITOR_LOGIN_ATTEMPTS.get(client, []) if attempt > cutoff]
        EDITOR_LOGIN_ATTEMPTS[client] = attempts
        return len(attempts) >= EDITOR_LOGIN_MAX_ATTEMPTS


def record_editor_login(client: str, succeeded: bool) -> None:
    with EDITOR_LOGIN_LOCK:
        if succeeded:
            EDITOR_LOGIN_ATTEMPTS.pop(client, None)
        else:
            EDITOR_LOGIN_ATTEMPTS.setdefault(client, []).append(time.time())


def normalize_archive_document(payload: dict) -> dict:
    date = str(payload.get("date", "")).strip()
    title = str(payload.get("title", "")).strip()[:80]
    summary = str(payload.get("summary", "")).strip()[:240]
    content = str(payload.get("content", "")).strip()[:8000]
    category = str(payload.get("category", "")).strip()
    raw_tags = payload.get("tags", [])
    raw_images = payload.get("images", [])
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date) or not title:
        raise ValueError("日期和标题不能为空")
    calendar_date.fromisoformat(date)
    if category not in ARCHIVE_CATEGORIES:
        raise ValueError("无效的文档分类")
    if not isinstance(raw_tags, list):
        raise ValueError("标签格式无效")
    if not isinstance(raw_images, list):
        raise ValueError("图片格式无效")
    tags = [str(tag).strip().lstrip("#")[:20] for tag in raw_tags]
    images = [str(image).strip() for image in raw_images]
    if len(images) > 9 or any(not ARCHIVE_IMAGE_PATTERN.fullmatch(image) for image in images):
        raise ValueError("归档图片无效或超过 9 张")
    return {
        "date": date,
        "title": title,
        "summary": summary,
        "content": content,
        "category": category,
        "tags": list(dict.fromkeys(tag for tag in tags if tag))[:8],
        "images": list(dict.fromkeys(images)),
    }


def is_valid_image_data(content_type: str, data: bytes) -> bool:
    if content_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if content_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/webp":
        return len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP"
    return False


def _music_sort_key(path: Path) -> list[object]:
    return [int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", path.stem)]


def _read_music_metadata(lyrics_file: Path | None) -> dict[str, str]:
    metadata = {"title": "", "artist": "", "album": ""}
    if lyrics_file is None:
        return metadata
    lyrics = ""
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            lyrics = lyrics_file.read_text(encoding=encoding)
            break
        except UnicodeDecodeError:
            continue
    tag_names = {"ti": "title", "ar": "artist", "al": "album"}
    for line in lyrics.splitlines():
        match = re.fullmatch(r"\[(ti|ar|al):\s*(.*?)\s*\]", line, flags=re.IGNORECASE)
        if match and match.group(2):
            metadata[tag_names[match.group(1).lower()]] = match.group(2)
    return metadata


def generate_music_library() -> int:
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    audio_files = sorted(
        (path for path in MUSIC_DIR.iterdir() if path.is_file() and path.suffix.lower() in MUSIC_AUDIO_EXTENSIONS),
        key=_music_sort_key,
    )
    library = []
    for audio_file in audio_files:
        base = audio_file.with_suffix("")
        cover_file = next((base.with_suffix(extension) for extension in MUSIC_COVER_EXTENSIONS if base.with_suffix(extension).exists()), None)
        lyrics_file = next((base.with_suffix(extension) for extension in (".lrc", ".txt") if base.with_suffix(extension).exists()), None)
        metadata = _read_music_metadata(lyrics_file)
        fallback_title = re.sub(r"^\d+[\s._-]*", "", audio_file.stem).strip() or audio_file.stem
        library.append({
            "id": audio_file.stem,
            "title": metadata["title"] or fallback_title,
            "artist": metadata["artist"] or "YEZI RADIO",
            "album": metadata["album"],
            "audio": audio_file.relative_to(ROOT).as_posix(),
            "cover": cover_file.relative_to(ROOT).as_posix() if cover_file else "",
            "lyrics": lyrics_file.relative_to(ROOT).as_posix() if lyrics_file else "",
        })
    output = json.dumps(library, ensure_ascii=False, indent=2) + "\n"
    if not MUSIC_LIBRARY_FILE.exists() or MUSIC_LIBRARY_FILE.read_text(encoding="utf-8") != output:
        temp_file = MUSIC_LIBRARY_FILE.with_suffix(".json.tmp")
        temp_file.write_text(output, encoding="utf-8")
        os.replace(temp_file, MUSIC_LIBRARY_FILE)
    return len(library)


class EditorHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format: str, *args: object) -> None:
        if sys.stderr is not None:
            super().log_message(format, *args)

    def end_headers(self) -> None:
        if self.path.endswith((".html", ".json")):
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def _is_private_request(self) -> bool:
        request_path = unquote(urlparse(self.path).path)
        parts = [part for part in request_path.split("/") if part]
        return any(part.startswith(".") for part in parts) or any(
            part.endswith((".py", ".pyc", ".tmp")) for part in parts
        )

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if urlparse(self.path).path == "/_editor/status":
            self._send_json({"available": editor_auth_configured()})
            return
        if self._is_private_request():
            self.send_error(404, "Not found")
            return
        super().do_GET()

    def do_HEAD(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        if self._is_private_request():
            self.send_error(404, "Not found")
            return
        super().do_HEAD()

    def do_POST(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        request = urlparse(self.path)
        if request.path not in {"/_editor/unlock", "/_editor/save", "/_editor/upload", "/_editor/archive-image", "/_editor/archive", "/_visitor/comment"}:
            self.send_error(404, "Not found")
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_error(400, "Invalid content length")
            return

        if request.path == "/_editor/unlock":
            self._unlock_editor(content_length)
            return

        if request.path == "/_visitor/comment":
            self._add_comment(content_length)
            return

        if not verify_editor_session(self.headers.get("X-Editor-Token", "")):
            self.send_error(403, "Editor session is invalid or expired")
            return

        size_limit = MAX_IMAGE_SIZE if request.path in {"/_editor/upload", "/_editor/archive-image"} else MAX_BODY_SIZE
        if content_length <= 0 or content_length > size_limit:
            self.send_error(413, "Content payload is empty or too large")
            return

        if request.path == "/_editor/upload":
            self._save_media(request, content_length)
            return

        if request.path == "/_editor/archive-image":
            self._save_archive_image(content_length)
            return

        if request.path == "/_editor/archive":
            self._save_archive_document(content_length)
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Payload must be an object")
            content = {
                str(key): value
                for key, value in payload.items()
                if isinstance(key, str) and isinstance(value, str)
            }

            temp_file = CONTENT_FILE.with_suffix(".json.tmp")
            temp_file.write_text(
                json.dumps(content, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            os.replace(temp_file, CONTENT_FILE)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self.send_error(400, str(error))
            return
        except OSError as error:
            self.send_error(500, f"Unable to save content: {error}")
            return

        response = json.dumps({"ok": True, "fields": len(content)}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def _save_archive_document(self, content_length: int) -> None:
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("归档内容格式无效")
            document_id = str(payload.get("id", "")).strip()
            fields = normalize_archive_document(payload)
            with ARCHIVE_LOCK:
                documents = json.loads(ARCHIVE_FILE.read_text(encoding="utf-8")) if ARCHIVE_FILE.exists() else []
                if not isinstance(documents, list):
                    raise ValueError("归档数据格式无效")
                if document_id:
                    document_index = next((index for index, item in enumerate(documents) if item.get("id") == document_id), -1)
                    if document_index < 0:
                        raise ValueError("没有找到要编辑的归档")
                    document = {"id": document_id, **fields}
                    documents[document_index] = document
                    action = "updated"
                else:
                    document = {"id": f"archive-{time.time_ns()}", **fields}
                    documents.append(document)
                    action = "created"
                temp_file = ARCHIVE_FILE.with_suffix(".json.tmp")
                temp_file.write_text(json.dumps(documents, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                os.replace(temp_file, ARCHIVE_FILE)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, AttributeError, OSError) as error:
            self.send_error(400, str(error))
            return
        self._send_json({"ok": True, "action": action, "document": document})

    def _unlock_editor(self, content_length: int) -> None:
        if content_length <= 0 or content_length > 4096:
            self.send_error(413, "Invalid unlock payload")
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            password = str(payload.get("password", ""))
        except (UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            self.send_error(400, "Invalid unlock payload")
            return
        client = self.client_address[0]
        if editor_login_is_blocked(client):
            self.send_error(429, "Too many password attempts; try again later")
            return
        if not verify_editor_password(password):
            record_editor_login(client, False)
            self.send_error(403, "Invalid editor password")
            return
        record_editor_login(client, True)
        self._send_json({"token": create_editor_session(), "expiresIn": EDITOR_SESSION_SECONDS})

    def _save_media(self, request, content_length: int) -> None:
        slot = parse_qs(request.query).get("slot", [""])[0]
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].lower()
        extension = IMAGE_TYPES.get(content_type)
        if slot not in IMAGE_SLOTS or extension is None:
            self.send_error(400, "Unsupported image slot or format")
            return
        if content_length > MAX_IMAGE_SIZE:
            self.send_error(413, "Image file is too large")
            return
        try:
            ASSETS_DIR.mkdir(exist_ok=True)
            image_data = self.rfile.read(content_length)
            target = ASSETS_DIR / f"profile-{slot}{extension}"
            temp_file = target.with_suffix(target.suffix + ".tmp")
            temp_file.write_bytes(image_data)
            os.replace(temp_file, target)

            media = {}
            if MEDIA_FILE.exists():
                media = json.loads(MEDIA_FILE.read_text(encoding="utf-8"))
            media[slot] = target.relative_to(ROOT).as_posix()
            media_temp = MEDIA_FILE.with_suffix(".json.tmp")
            media_temp.write_text(
                json.dumps(media, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            os.replace(media_temp, MEDIA_FILE)
        except (OSError, json.JSONDecodeError) as error:
            self.send_error(500, f"Unable to save image: {error}")
            return

        response = json.dumps({"ok": True, "url": media[slot]}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def _save_archive_image(self, content_length: int) -> None:
        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].lower()
        extension = IMAGE_TYPES.get(content_type)
        if extension is None:
            self.send_error(400, "仅支持 JPG、PNG 或 WebP 图片")
            return
        try:
            image_data = self.rfile.read(content_length)
            if not is_valid_image_data(content_type, image_data):
                raise ValueError("图片内容与格式不匹配")
            ARCHIVE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
            target = ARCHIVE_IMAGES_DIR / f"archive-{time.time_ns()}-{secrets.token_hex(4)}{extension}"
            temp_file = target.with_suffix(target.suffix + ".tmp")
            temp_file.write_bytes(image_data)
            os.replace(temp_file, target)
        except (OSError, ValueError) as error:
            self.send_error(400, str(error))
            return
        self._send_json({"ok": True, "url": target.relative_to(ROOT).as_posix()})

    def _add_comment(self, content_length: int) -> None:
        if content_length > 64 * 1024:
            self.send_error(413, "Comment is too large")
            return
        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            author = str(payload.get("author", "")).strip()[:20]
            content = str(payload.get("content", "")).strip()[:120]
            month = str(payload.get("month", "")).strip()
            if not author or not content or len(month) != 7 or month[4] != "-":
                raise ValueError("Invalid comment fields")
            comments = json.loads(COMMENTS_FILE.read_text(encoding="utf-8")) if COMMENTS_FILE.exists() else []
            comments.append({
                "id": f"comment-{time.time_ns()}",
                "content": content,
                "author": author,
                "month": month.replace("-", "."),
            })
            temp_file = COMMENTS_FILE.with_suffix(".json.tmp")
            temp_file.write_text(json.dumps(comments, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temp_file, COMMENTS_FILE)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError, OSError) as error:
            self.send_error(400, str(error))
            return
        self._send_json({"ok": True})

    def do_DELETE(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        request = urlparse(self.path)
        if request.path not in {"/_visitor/comment", "/_editor/archive"}:
            self.send_error(404, "Not found")
            return
        if not verify_editor_session(self.headers.get("X-Editor-Token", "")):
            self.send_error(403, "Editor session is invalid or expired")
            return
        if request.path == "/_editor/archive":
            self._delete_archive_document(request)
            return
        comment_id = parse_qs(request.query).get("id", [""])[0]
        try:
            comments = json.loads(COMMENTS_FILE.read_text(encoding="utf-8")) if COMMENTS_FILE.exists() else []
            remaining = [comment for comment in comments if comment.get("id") != comment_id]
            temp_file = COMMENTS_FILE.with_suffix(".json.tmp")
            temp_file.write_text(json.dumps(remaining, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            os.replace(temp_file, COMMENTS_FILE)
        except (json.JSONDecodeError, OSError) as error:
            self.send_error(500, str(error))
            return
        self._send_json({"ok": True})

    def _delete_archive_document(self, request) -> None:
        document_id = parse_qs(request.query).get("id", [""])[0].strip()
        if not document_id:
            self.send_error(400, "归档 ID 不能为空")
            return
        try:
            with ARCHIVE_LOCK:
                documents = json.loads(ARCHIVE_FILE.read_text(encoding="utf-8")) if ARCHIVE_FILE.exists() else []
                remaining = [document for document in documents if document.get("id") != document_id]
                if len(remaining) == len(documents):
                    self.send_error(404, "没有找到要删除的归档")
                    return
                temp_file = ARCHIVE_FILE.with_suffix(".json.tmp")
                temp_file.write_text(json.dumps(remaining, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                os.replace(temp_file, ARCHIVE_FILE)
        except (json.JSONDecodeError, OSError, AttributeError) as error:
            self.send_error(500, str(error))
            return
        self._send_json({"ok": True})

    def _send_json(self, payload: dict) -> None:
        response = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)


class SingleInstanceHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True


if __name__ == "__main__":
    if not editor_auth_configured():
        raise SystemExit(
            "Editor password is not configured. Run python set_editor_password.py "
            "or set YEZI_EDITOR_PASSWORD."
        )
    music_count = generate_music_library()
    server = SingleInstanceHTTPServer((HOST, PORT), EditorHandler)
    if sys.stdout is not None:
        print(f"Editing preview: http://{HOST}:{PORT}/index.html")
        print(f"Music library: {music_count} track(s) from {MUSIC_DIR}")
        print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
