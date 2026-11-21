"""Order service (fixture). Cases: relative import, classes with methods, cross-module call."""
from dataclasses import dataclass

from .validators import validate


@dataclass
class Order:
    customer_id: str
    lines: list

    def total(self):
        return sum(qty * price for qty, price in self.lines)


class OrderService:
    def place(self, order):
        if not validate(order):
            raise ValueError("invalid order")
        return {"status": "placed"}
