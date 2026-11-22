"""Decorator helpers: a plain decorator and a decorator factory."""
from typing import Callable

PLUGINS: dict = {}
ROUTES: dict = {}


def plugin(fn: Callable) -> Callable:
    PLUGINS[fn.__name__] = fn
    return fn


def expose(method: str, path: str) -> Callable:
    def wrap(fn: Callable) -> Callable:
        ROUTES[(method, path)] = fn
        return fn
    return wrap
