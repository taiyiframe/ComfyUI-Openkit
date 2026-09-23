"""Openkit 共享类型定义。"""


class AnyType(str):
    """用于表示任意类型的特殊类，在类型比较时总是返回相等。"""

    def __eq__(self, _) -> bool:
        return True

    def __ne__(self, __value: object) -> bool:
        return False


any = AnyType("*")
