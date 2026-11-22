"""Optional accelerated checksum (absent in some builds)."""


def checksum(data: bytes) -> int:
    return sum(data) & 0xFFFF
