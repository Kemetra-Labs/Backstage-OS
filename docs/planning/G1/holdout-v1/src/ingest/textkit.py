"""Text helpers. Only the names in __all__ leave this module through a star import."""
__all__ = ["slugify", "clamp"]


def slugify(text: str) -> str:
    return "-".join(text.lower().split())


def clamp(text: str, size: int) -> str:
    return text[:size]


def trim(text: str) -> str:
    return text.strip("-")
