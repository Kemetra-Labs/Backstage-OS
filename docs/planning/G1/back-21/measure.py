"""Run one engine invocation under the G1 evaluation guard rails (BACK-21).

Usage: python -I measure.py --label NAME --cwd DIR --logs DIR -- <cmd> [args...]

- builds a scrubbed environment (no API keys/tokens, telemetry opt-outs, dead proxies)
- takes a config snapshot before and after (baseline/snapshot.py) and diffs them
- lists files under a few home dirs an engine might touch (side-effect watch) before/after
- samples the whole process tree with psutil for peak RSS, records wall time
- writes stdout/stderr logs with the user home path scrubbed to <HOME>
- writes <logs>/<label>.meta.json
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time

import psutil

SANDBOX = os.path.join(os.path.expanduser("~"), "kawalys-g1-sandbox")
SNAP = SANDBOX + r"\baseline\snapshot.py"
HOME = os.path.expanduser("~")
WATCH_DIRS = [os.path.join(HOME, p) for p in (".codegraph", ".graphify", ".cache", ".config", ".local")]
SECRET_RE = re.compile(r"(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|ACCESS_KEY|SESSION)", re.I)
DEAD = "http://127.0.0.1:9"


def clean_env(extra):
    env = {k: v for k, v in os.environ.items() if not SECRET_RE.search(k)
           and not k.startswith(("AWS_", "ANTHROPIC_", "OPENAI_", "GEMINI_", "GOOGLE_", "AZURE_", "CLAUDE"))}
    env.update({
        "DO_NOT_TRACK": "1", "CODEGRAPH_TELEMETRY": "0", "CODEGRAPH_NO_UPDATE_CHECK": "1",
        "CODEGRAPH_NO_DOWNLOAD": "1", "GRAPHIFY_BACKEND": "none", "GRAPHIFY_QUERY_LOG_DISABLE": "1",
        "HTTP_PROXY": DEAD, "HTTPS_PROXY": DEAD, "ALL_PROXY": DEAD,
        "http_proxy": DEAD, "https_proxy": DEAD, "all_proxy": DEAD,
        "NO_PROXY": "", "no_proxy": "", "PYTHONUTF8": "1", "PYTHONDONTWRITEBYTECODE": "1",
    })
    env.update(extra)
    return env


def watch_listing():
    out = {}
    for d in WATCH_DIRS:
        if not os.path.isdir(d):
            continue
        for root, _, files in os.walk(d):
            for fn in files:
                p = os.path.join(root, fn)
                try:
                    st = os.stat(p)
                    out[p] = [st.st_size, int(st.st_mtime)]
                except OSError:
                    pass
    return out


def snapshot(path):
    subprocess.run([sys.executable, "-I", SNAP, path], check=True, capture_output=True)


def scrub(text):
    return text.replace(HOME, "<HOME>").replace(HOME.replace("\\", "/"), "<HOME>")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--cwd", required=True)
    ap.add_argument("--logs", required=True)
    ap.add_argument("--env", action="append", default=[], help="KEY=VALUE extra env")
    ap.add_argument("cmd", nargs=argparse.REMAINDER)
    a = ap.parse_args()
    cmd = a.cmd[1:] if a.cmd and a.cmd[0] == "--" else a.cmd
    os.makedirs(a.logs, exist_ok=True)
    extra = dict(e.split("=", 1) for e in a.env)
    env = clean_env(extra)
    snaps = os.path.join(SANDBOX, "analyzers", "snaps")
    pre, post = os.path.join(snaps, f"{a.label}.pre.json"), os.path.join(snaps, f"{a.label}.post.json")
    snapshot(pre)
    w_before = watch_listing()
    t0 = time.perf_counter()
    proc = subprocess.Popen(cmd, cwd=a.cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    ps = psutil.Process(proc.pid)
    peak = 0
    import threading
    bufs = {"out": b"", "err": b""}

    def pump(stream, key):
        bufs[key] = stream.read()

    th = [threading.Thread(target=pump, args=(proc.stdout, "out")), threading.Thread(target=pump, args=(proc.stderr, "err"))]
    for t in th:
        t.start()
    while proc.poll() is None:
        try:
            total = 0
            for p in [ps] + ps.children(recursive=True):
                try:
                    total += p.memory_info().rss
                except psutil.Error:
                    pass
            peak = max(peak, total)
        except psutil.Error:
            pass
        time.sleep(0.02)
    for t in th:
        t.join()
    wall = time.perf_counter() - t0
    snapshot(post)
    w_after = watch_listing()
    d = subprocess.run([sys.executable, "-I", SNAP, "--diff", pre, post], capture_output=True, text=True)
    changed_watch = sorted(k for k in set(w_before) | set(w_after) if w_before.get(k) != w_after.get(k))
    with open(os.path.join(a.logs, a.label + ".stdout.log"), "w", encoding="utf-8") as f:
        f.write(scrub(bufs["out"].decode("utf-8", "replace")))
    with open(os.path.join(a.logs, a.label + ".stderr.log"), "w", encoding="utf-8") as f:
        f.write(scrub(bufs["err"].decode("utf-8", "replace")))
    meta = {
        "label": a.label, "cmd": [scrub(c) for c in cmd], "cwd": scrub(a.cwd), "exit_code": proc.returncode,
        "wall_seconds": round(wall, 3), "peak_rss_mb_sampled_tree": round(peak / 1048576, 1),
        "config_snapshot_diff_exit": d.returncode, "config_snapshot_diff": scrub(d.stdout.strip()),
        "watched_home_dir_changes": [scrub(x) for x in changed_watch],
        "env_overrides": sorted(extra) + ["DO_NOT_TRACK", "CODEGRAPH_TELEMETRY", "CODEGRAPH_NO_UPDATE_CHECK", "CODEGRAPH_NO_DOWNLOAD",
                                         "GRAPHIFY_BACKEND", "GRAPHIFY_QUERY_LOG_DISABLE", "HTTP(S)/ALL_PROXY=" + DEAD],
    }
    with open(os.path.join(a.logs, a.label + ".meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
    print(json.dumps({k: meta[k] for k in ("label", "exit_code", "wall_seconds", "peak_rss_mb_sampled_tree",
                                           "config_snapshot_diff_exit", "watched_home_dir_changes")}))
    sys.exit(0 if proc.returncode == 0 else proc.returncode)


if __name__ == "__main__":
    main()
