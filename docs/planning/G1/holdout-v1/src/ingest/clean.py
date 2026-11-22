"""Cleaning pipeline: two star imports and one shadowed name."""
from .legacy import *
from .textkit import *


def clean_label(text: str) -> str:
    return clamp(slugify(trim(text)), 40)


def clean_rows(rows, slugify=str.lower):
    return [slugify(r) for r in rows]
