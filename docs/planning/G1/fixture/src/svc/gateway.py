"""Gateway (fixture). Cases: importlib dynamic import, cross-runtime HTTP call, import-like string."""
import importlib
import json

import requests

BASE = "http://localhost:8080"
EXAMPLE = "from svc.unused import orphan_helper"


def load_handler(config_path):
    with open(config_path) as fh:
        name = json.load(fh)["handler_module"]
    return importlib.import_module(name)


def submit_order(order):
    return requests.post(BASE + "/orders", json=order)
