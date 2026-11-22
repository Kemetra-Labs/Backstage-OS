"""Conditional imports: try/except ImportError and a TYPE_CHECKING-only import."""
from typing import TYPE_CHECKING

try:
    from ._speedups import checksum
except ImportError:  # pragma: no cover
    from ._purechecksum import checksum

if TYPE_CHECKING:
    from vault.models import Record

__all__ = ["checksum", "fingerprint"]


def fingerprint(record: "Record") -> str:
    return record.ref + "#" + str(len(record.ref))
