"""Plugin host: module names are only known at runtime."""
import importlib


def activate(name: str):
    return importlib.import_module("ingest.plugins." + name)


def activate_legacy(dotted: str):
    return __import__(dotted, fromlist=["run"])
