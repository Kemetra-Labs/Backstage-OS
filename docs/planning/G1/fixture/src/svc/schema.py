"""Payload schema check (fixture). Case: name-collision trap, definition 2 of 2 named validate."""


def validate(payload):
    return "customer_id" in payload and "lines" in payload
