"""Activated only by name in ingest/plugin_host.py; no file imports it statically."""
from ..textkit import slugify


def run(rows):
    return [slugify(r) for r in rows]
