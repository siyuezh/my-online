"""Securely replace the local editor password hash."""

from __future__ import annotations

import base64
import getpass
import hashlib
import json
import os
import secrets
from pathlib import Path


ROOT = Path(__file__).resolve().parent
AUTH_FILE = ROOT / ".editor-auth.json"
ITERATIONS = 600_000
MIN_PASSWORD_LENGTH = 10


def main() -> None:
    print("Set the local website editor password.")
    while True:
        password = getpass.getpass("New password: ")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"Use at least {MIN_PASSWORD_LENGTH} characters.")
            continue
        if password != getpass.getpass("Confirm password: "):
            print("Passwords do not match.")
            continue
        break

    salt = secrets.token_bytes(16)
    password_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    payload = {
        "version": 1,
        "algorithm": "pbkdf2_sha256",
        "iterations": ITERATIONS,
        "salt": base64.b64encode(salt).decode("ascii"),
        "hash": base64.b64encode(password_hash).decode("ascii"),
    }
    temp_file = AUTH_FILE.with_suffix(".json.tmp")
    temp_file.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(temp_file, AUTH_FILE)
    print("Password updated. Restart dev_server.py to invalidate existing sessions.")


if __name__ == "__main__":
    main()
