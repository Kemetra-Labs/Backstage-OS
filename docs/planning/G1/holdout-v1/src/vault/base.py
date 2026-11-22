"""Base model with an overridable save() (inheritance case)."""


class BaseModel:
    def __init__(self, ref: str):
        self.ref = ref

    def save(self) -> str:
        return "saved " + self.ref

    def describe(self) -> str:
        return type(self).__name__ + "(" + self.ref + ")"
