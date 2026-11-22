"""Agent/config snapshot for BACK-77 (written for this pass; BACK-21's baseline/snapshot.py is not in the repo).

Usage:
  python3 -I snapshot.py <out.json>               write a snapshot
  python3 -I snapshot.py --diff <a.json> <b.json> print added/removed/changed paths; exit 0 if none, 1 otherwise

Scope (per file sha256 + size; symlinks recorded by target, not followed):
  ~/.claude (recursive), ~/.claude.json, ~/.config, ~/.cache, ~/.local, ~/.graphify, ~/.codegraph
Missing roots are recorded as absent, so their creation shows up as a change.
"""
import hashlib
import json
import os
import sys

HOME = os.path.expanduser("~")
ROOTS = [".claude", ".claude.json", ".config", ".cache", ".local", ".graphify", ".codegraph"]


def file_entry(p):
    try:
        if os.path.islink(p):
            return {"link": os.readlink(p)}
        h = hashlib.sha256()
        with open(p, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        return {"sha256": h.hexdigest(), "size": os.path.getsize(p)}
    except OSError as e:
        return {"error": type(e).__name__}


def snap():
    out = {"roots": {}, "files": {}}
    for r in ROOTS:
        full = os.path.join(HOME, r)
        if not os.path.lexists(full):
            out["roots"][r] = "absent"
            continue
        out["roots"][r] = "present"
        if os.path.isfile(full) or os.path.islink(full):
            out["files"]["~/" + r] = file_entry(full)
            continue
        for root, dirs, files in os.walk(full):
            dirs.sort()
            for fn in sorted(files):
                p = os.path.join(root, fn)
                out["files"]["~/" + os.path.relpath(p, HOME)] = file_entry(p)
    return out


def diff(a, b):
    lines = []
    for r in ROOTS:
        if a["roots"].get(r) != b["roots"].get(r):
            lines.append(f"ROOT {r}: {a['roots'].get(r)} -> {b['roots'].get(r)}")
    fa, fb = a["files"], b["files"]
    for k in sorted(set(fa) | set(fb)):
        if k not in fa:
            lines.append(f"ADDED   {k}")
        elif k not in fb:
            lines.append(f"REMOVED {k}")
        elif fa[k] != fb[k]:
            lines.append(f"CHANGED {k}")
    return lines


def main():
    if len(sys.argv) == 4 and sys.argv[1] == "--diff":
        with open(sys.argv[2]) as fh:
            a = json.load(fh)
        with open(sys.argv[3]) as fh:
            b = json.load(fh)
        lines = diff(a, b)
        print(f"{len(lines)} change(s) across {len(a['files'])} -> {len(b['files'])} tracked files")
        for x in lines:
            print(x)
        sys.exit(0 if not lines else 1)
    s = snap()
    with open(sys.argv[1], "w") as fh:
        json.dump(s, fh, indent=0, sort_keys=True)
    print(f"{len(s['files'])} files")


if __name__ == "__main__":
    main()
