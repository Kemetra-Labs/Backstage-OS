"""Vault-side record. Same class name as the ingest package's Record, different package."""
from .base import BaseModel


class Record(BaseModel):
    def save(self) -> str:
        return "vault:" + super().save()
