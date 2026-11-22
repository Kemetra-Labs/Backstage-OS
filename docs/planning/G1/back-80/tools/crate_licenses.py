#!/usr/bin/env python3
"""BACK-80 helper: licence inventory of a Cargo.lock without building anything.

For every registry package in the lock file it downloads the .crate tarball
from static.crates.io, checks the sha256 against the lock file's `checksum`,
and reads `license` / `license-file` from the crate's own Cargo.toml plus the
names of licence/notice files shipped in the tarball. Nothing is executed
(no build.rs, no cargo). Run with `python3 -I`.

usage: crate_licenses.py <Cargo.lock> <download-dir> <out.json>
"""
import hashlib, json, os, sys, tarfile, tomllib, urllib.request

lock_path, dl_dir, out_path = sys.argv[1:4]
lock = tomllib.load(open(lock_path, "rb"))
os.makedirs(dl_dir, exist_ok=True)
rows = []
for pkg in lock["package"]:
    name, ver = pkg["name"], pkg["version"]
    src = pkg.get("source", "")
    row = {"name": name, "version": ver, "source": src or "path (local)"}
    if not src.startswith("registry+"):
        row["note"] = "workspace/path crate, not downloaded"
        rows.append(row); continue
    fn = os.path.join(dl_dir, f"{name}-{ver}.crate")
    if not os.path.exists(fn):
        url = f"https://static.crates.io/crates/{name}/{name}-{ver}.crate"
        with urllib.request.urlopen(url, timeout=60) as r, open(fn, "wb") as f:
            f.write(r.read())
    data = open(fn, "rb").read()
    sha = hashlib.sha256(data).hexdigest()
    row["sha256"] = sha
    row["checksum_match"] = (sha == pkg.get("checksum"))
    with tarfile.open(fn, "r:gz") as t:
        names = t.getnames()
        prefix = f"{name}-{ver}/"
        toml_member = t.extractfile(prefix + "Cargo.toml")
        meta = tomllib.loads(toml_member.read().decode("utf-8"))
        p = meta.get("package", {})
        row["license"] = p.get("license")
        row["license_file"] = p.get("license-file")
        row["repository"] = p.get("repository")
        row["authors"] = p.get("authors")
        row["licence_files"] = sorted(
            n[len(prefix):] for n in names
            if "/" not in n[len(prefix):]
            and any(k in n[len(prefix):].upper() for k in ("LICEN", "COPYING", "NOTICE", "UNLICENSE", "COPYRIGHT")))
        # first copyright lines for attribution drafting
        cr = []
        for lf in row["licence_files"]:
            try:
                txt = t.extractfile(prefix + lf).read().decode("utf-8", "replace")
            except Exception:
                continue
            for line in txt.splitlines():
                if "copyright" in line.lower() and "(c)" in line.lower() or line.strip().lower().startswith("copyright 20") or line.strip().lower().startswith("copyright (c)"):
                    cr.append(f"{lf}: {line.strip()}")
        row["copyright_lines"] = cr[:6]
    rows.append(row)
json.dump(rows, open(out_path, "w"), indent=1)
print(len(rows), "packages;", sum(1 for r in rows if r.get("checksum_match")), "checksum-verified")
