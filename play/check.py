"""Read-only check of the Play Developer API: open an edit, list tracks, discard the edit.

Usage: check.py
Credentials: ~/.config/aqui/play-publisher.json (service account, mode 600). Prints statuses only, never tokens.
"""
import os, sys
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request

PKG = os.environ.get("PLAY_PACKAGE", "org.xkdr.aqui")
KEY = os.path.expanduser(os.environ.get("PLAY_KEY", "~/.config/aqui/play-publisher.json"))

creds = service_account.Credentials.from_service_account_file(
    KEY, scopes=["https://www.googleapis.com/auth/androidpublisher"])
creds.refresh(Request())
H = {"Authorization": f"Bearer {creds.token}"}
B = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PKG}"


def err(r):
    return r.json().get("error", {}).get("message", "") if r.content else ""


r = requests.post(f"{B}/edits", headers=H, json={})
print("open edit:", r.status_code, "ok" if r.ok else err(r))
if not r.ok:
    sys.exit(1)
eid = r.json()["id"]
t = requests.get(f"{B}/edits/{eid}/tracks", headers=H)
print("tracks:", t.status_code, [x["track"] for x in t.json().get("tracks", [])] if t.ok else err(t))
d = requests.delete(f"{B}/edits/{eid}", headers=H)
print("discard edit:", d.status_code)
