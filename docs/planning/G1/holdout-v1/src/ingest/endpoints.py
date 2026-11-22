"""HTTP endpoints registered with decorators. The TS panel reaches close_ledger only over HTTP."""
from .clean import clean_label
from .models import Record
from .registry import expose, plugin


@expose("POST", "/api/ledger/close")
def close_ledger(body: dict) -> dict:
    return {"closed": clean_label(body.get("label", ""))}


@plugin
def echo(body: dict) -> str:
    return Record("echo", str(body)).key()
