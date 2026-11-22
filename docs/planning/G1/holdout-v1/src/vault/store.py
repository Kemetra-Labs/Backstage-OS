"""Store: instantiates the vault Record and calls into the ingest package."""
from ingest.compat import fingerprint
from ingest.clean import clean_label
from .models import Record
# from ingest.models import Record


def persist(ref: str) -> str:
    rec = Record(clean_label(ref))
    rec.describe()
    return rec.save() + " " + fingerprint(rec)
