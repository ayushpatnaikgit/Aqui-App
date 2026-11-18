"""Publishes Aqui's store listing and app bundle to a Play testing track in one edit.

Usage: publish.py <bundle.aab> [--no-bundle] [--track internal]
       Listing text and images are read from play/listing next to this script.
       Release notes come from play/listing/release-notes.txt; the release name is
       the versionName in android/app/build.gradle.

The app has never been published, so Play only accepts releases with status
"draft" through the API. Roll out the first internal test in Play Console.
Production is deliberately not a supported track.

Credentials: ~/.config/aqui/play-publisher.json (service account, mode 600).
Prints statuses only, never tokens.
"""
import glob, os, re, sys, time
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request

PKG = os.environ.get("PLAY_PACKAGE", "org.xkdr.aqui")
KEY = os.path.expanduser(os.environ.get("PLAY_KEY", "~/.config/aqui/play-publisher.json"))
HERE = os.path.dirname(os.path.abspath(__file__))
LISTING = os.path.join(HERE, "listing")
GRADLE = os.path.join(HERE, "..", "android", "app", "build.gradle")
CONTACT_EMAIL = "ayushpatnaik@gmail.com"
CONTACT_WEBSITE = "https://aqui.xkdr.org/"
TESTING_TRACKS = {"internal", "alpha", "beta"}  # alpha = closed testing, beta = open testing

API = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PKG}"
UPLOAD = f"https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/{PKG}"
creds = service_account.Credentials.from_service_account_file(
    KEY, scopes=["https://www.googleapis.com/auth/androidpublisher"])


def headers(extra=None):
    if not creds.valid:
        creds.refresh(Request())
    h = {"Authorization": f"Bearer {creds.token}"}
    h.update(extra or {})
    return h


def check(r, what):
    if r.status_code >= 300:
        msg = r.json().get("error", {}).get("message", r.text[:300]) if r.content else ""
        sys.exit(f"{what} failed: {r.status_code} {msg}")
    print(f"{what}: ok", flush=True)
    return r.json() if r.content else {}


def read(name):
    with open(os.path.join(LISTING, name), encoding="utf-8") as f:
        return f.read().strip()


def check_listing():
    """Fail before opening an edit if the listing breaks Play's limits."""
    limits = {"title.txt": 30, "short.txt": 80, "full.txt": 4000, "release-notes.txt": 500}
    for name, limit in limits.items():
        n = len(read(name))
        if not 0 < n <= limit:
            sys.exit(f"{name} is {n} characters; Play allows 1 to {limit}")
    shots = sorted(glob.glob(os.path.join(LISTING, "screenshot-*.png")))
    if len(shots) < 2:
        sys.exit("Play needs at least two phone screenshots (play/listing/screenshot-*.png)")
    return shots


def version_name():
    m = re.search(r'versionName\s+"([^"]+)"', open(GRADLE, encoding="utf-8").read())
    return m.group(1) if m else None


args = [a for a in sys.argv[1:] if not a.startswith("--")]
with_bundle = "--no-bundle" not in sys.argv
track = sys.argv[sys.argv.index("--track") + 1] if "--track" in sys.argv else "internal"
if track not in TESTING_TRACKS:
    sys.exit(f"track must be one of {sorted(TESTING_TRACKS)}; production releases are made in Play Console")
if track in args:
    args.remove(track)
if with_bundle and len(args) != 1:
    sys.exit(__doc__)
bundle = args[0] if with_bundle else None
screenshots = check_listing()

edit = check(requests.post(f"{API}/edits", headers=headers(), json={}), "open edit")["id"]
E = f"{API}/edits/{edit}"

check(requests.patch(f"{E}/details", headers=headers(), json={
    "defaultLanguage": "en-US", "contactEmail": CONTACT_EMAIL, "contactWebsite": CONTACT_WEBSITE}),
      "contact details")
check(requests.put(f"{E}/listings/en-US", headers=headers(), json={
    "language": "en-US", "title": read("title.txt"), "shortDescription": read("short.txt"),
    "fullDescription": read("full.txt")}), "listing text")

images = {"icon": [os.path.join(LISTING, "icon-512.png")],
          "featureGraphic": [os.path.join(LISTING, "feature-1024x500.png")],
          "phoneScreenshots": screenshots}
for kind, files in images.items():
    check(requests.delete(f"{E}/listings/en-US/{kind}", headers=headers()), f"clear {kind}")
    for path in files:
        with open(path, "rb") as fh:
            check(requests.post(f"{UPLOAD}/edits/{edit}/listings/en-US/{kind}?uploadType=media",
                                headers=headers({"Content-Type": "image/png"}), data=fh.read()),
                  f"upload {kind} {os.path.basename(path)}")

if with_bundle:
    size = os.path.getsize(bundle)
    r = requests.post(f"{UPLOAD}/edits/{edit}/bundles?uploadType=resumable&ackBundleInstallationWarning=true",
                      headers=headers({"X-Upload-Content-Type": "application/octet-stream",
                                       "X-Upload-Content-Length": str(size), "Content-Length": "0"}))
    if r.status_code != 200:
        sys.exit(f"start bundle upload failed: {r.status_code} {r.text[:300]}")
    url = r.headers["Location"]
    chunk, sent, t0, result = 8 * 1024 * 1024, 0, time.time(), None
    with open(bundle, "rb") as fh:
        while sent < size:
            data = fh.read(chunk)
            end = sent + len(data) - 1
            for attempt in range(5):
                try:
                    r = requests.put(url, headers=headers({"Content-Range": f"bytes {sent}-{end}/{size}"}),
                                     data=data, timeout=600)
                    break
                except requests.RequestException as e:
                    print(f"  retry ({type(e).__name__})", flush=True)
                    time.sleep(5 * (attempt + 1))
            else:
                sys.exit("bundle upload failed after retries")
            if r.status_code in (200, 201):
                result = r.json()
            elif r.status_code != 308:
                sys.exit(f"bundle upload failed: {r.status_code} {r.text[:500]}")
            sent = end + 1
            print(f"  bundle {sent * 100 // size}% ({sent // 1_000_000} of {size // 1_000_000} MB, "
                  f"{time.time() - t0:.0f} s)", flush=True)
    print("bundle: ok, versionCode", result.get("versionCode"), flush=True)
    check(requests.put(f"{E}/tracks/{track}", headers=headers(), json={
        "track": track,
        "releases": [{"name": version_name() or str(result["versionCode"]),
                      "versionCodes": [str(result["versionCode"])], "status": "draft",
                      "releaseNotes": [{"language": "en-US", "text": read("release-notes.txt")}]}]}),
          f"{track} track (draft release)")

check(requests.post(f"{E}:commit", headers=headers()), "commit edit")
