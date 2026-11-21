"""Order validation (fixture). Case: name-collision trap, definition 1 of 2 named validate."""


def validate(order):
    return bool(order.lines)
