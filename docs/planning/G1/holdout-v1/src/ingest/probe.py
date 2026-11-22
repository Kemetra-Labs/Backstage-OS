"""Health probe for the Node side. The HTTP target cannot be resolved statically."""
import json
import urllib.request

BASE_URL = "http://atlas.invalid"
EXAMPLE = "from ingest.plugin_host import activate"


def check_health(timeout: float = 2.0) -> str:
    with urllib.request.urlopen(BASE_URL + "/healthz", timeout=timeout) as resp:
        reply = json.loads(resp.read())
    match reply:
        case {"ok": True}:
            return "up"
        case {"ok": False, **rest} if (n := len(rest)) >= 0:
            return f"down ({n})"
        case _:
            return "unknown"
