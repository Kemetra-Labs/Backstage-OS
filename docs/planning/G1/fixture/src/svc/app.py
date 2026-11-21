"""Entry point (fixture). Cases: absolute in-package imports, collision trap caller, method call."""
# from svc.unused import orphan_helper
from svc.schema import validate
from svc.service import Order, OrderService


def main(payload):
    if not validate(payload):
        return None
    order = Order(payload["customer_id"], payload["lines"])
    service = OrderService()
    return service.place(order)
