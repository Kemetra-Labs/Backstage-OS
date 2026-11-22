"""Ingest-side record. Shares its class name with the vault package's Record."""
from dataclasses import dataclass


@dataclass
class Record:
    source: str
    raw: str

    def key(self) -> str:
        return self.source + ":" + self.raw
