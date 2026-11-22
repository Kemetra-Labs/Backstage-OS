"""Pure-Python checksum used when the accelerated module is missing."""


def checksum(data: bytes) -> int:
    total = 0
    for b in data:
        total = (total + b) & 0xFFFF
    return total
