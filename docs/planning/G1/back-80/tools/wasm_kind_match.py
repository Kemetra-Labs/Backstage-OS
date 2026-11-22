#!/usr/bin/env python3
"""BACK-80 helper: identify a tree-sitter wasm grammar by content.

Compares the node-kind names in a candidate repo's src/node-types.json with
the printable strings of a .wasm file (tree-sitter stores the symbol-name
table as C strings in the data section). A high match ratio identifies the
grammar family; it does NOT prove the exact revision. Nothing is executed.
Run with `python3 -I`.

usage: wasm_kind_match.py <grammar.wasm> <node-types.json> [...more pairs]
"""
import json, re, sys
args = sys.argv[1:]
for wasm, nt in zip(args[0::2], args[1::2]):
    blob = open(wasm, "rb").read()
    strings = set(s.decode() for s in re.findall(rb"[\x20-\x7e]{2,}", blob))
    # tree-sitter's symbol names are NUL-separated; split to individual names too
    names = set()
    for s in re.findall(rb"[\x21-\x7e]+", blob):
        names.add(s.decode())
    kinds = set()
    def walk(t):
        if t.get("named"): kinds.add(t["type"])
        for c in t.get("subtypes", []) or []: walk(c)
    for t in json.load(open(nt)): walk(t)
    hit = sorted(k for k in kinds if k in names or k in strings)
    print(f"{wasm.split('/')[-1]} vs {nt}: {len(hit)}/{len(kinds)} named kinds found "
          f"({100*len(hit)/max(1,len(kinds)):.0f}%); missing e.g. {sorted(kinds-set(hit))[:5]}")
