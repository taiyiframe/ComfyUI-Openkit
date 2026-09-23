# ComfyUI 加载本插件时最先执行：先打 asyncio Proactor 静默补丁，再注册节点。
# 修复 Windows ProactorEventLoop 下连接关闭时 _call_connection_lost 抛
# ConnectionResetError/ConnectionAbortedError/BrokenPipeError 未捕获，导致 ComfyUI
# FATAL traceback（asyncio/proactor_events.py:165）刷屏。
#
# 同时恢复 stderr/stdout 管道容错：内存压力下 kit 侧日志消费变慢 -> OS 管道缓冲满 ->
# ComfyUI 侧 write(stderr) 阻塞/抛 OSError [Errno 22] Invalid argument，直接杀死
# 采样节点。注意 Python 3.11+ 的 _io.TextIOWrapper 是 C 实现的 immutable type，
# 禁止对其类属性做赋值（旧写法 _io.TextIOWrapper.flush = safe_flush 直接抛
# TypeError: cannot set 'flush' attribute of immutable type '_io.TextIOWrapper'）。
# 因此这里改用实例级代理：用 _SafeTextIO 包装 sys.stdout/sys.stderr，write/flush
# 遇 OSError 静默吞掉，绝不对任何 immutable 内置类型做类级 monkey-patch。
import asyncio.proactor_events as _proactor_events
import sys as _sys

_TRANSPORT = getattr(_proactor_events, "_ProactorBasePipeTransport", None)
_ORIGINAL = getattr(_TRANSPORT, "_call_connection_lost", None)


def _quiet_call_connection_lost(self, exc):
    try:
        return _ORIGINAL(self, exc)
    except (ConnectionResetError, ConnectionAbortedError, BrokenPipeError):
        return


if _ORIGINAL is not None and not getattr(_ORIGINAL, "_quiet_patched", False):
    _quiet_call_connection_lost._quiet_patched = True
    _TRANSPORT._call_connection_lost = _quiet_call_connection_lost


# 实例级 stdout/stderr 管道容错代理。
# 用 __getattr__ 动态委托给被包装的流；仅 write/flush/writelines 单独 override
# 并吞掉 OSError。绝不对 _io.TextIOWrapper 等 immutable 内置类型做类属性赋值。
# 整段用 try/except 包裹：任何异常都不得阻断插件后续 import。
try:
    class _SafeTextIO(object):
        __slots__ = ("_ok_wrapped",)

        def __init__(self, wrapped):
            object.__setattr__(self, "_ok_wrapped", wrapped)

        def write(self, data):
            try:
                return self._ok_wrapped.write(data)
            except OSError:
                try:
                    return len(data)
                except Exception:
                    return 0

        def writelines(self, lines):
            try:
                return self._ok_wrapped.writelines(lines)
            except OSError:
                pass

        def flush(self):
            try:
                return self._ok_wrapped.flush()
            except OSError:
                return None

        def __getattr__(self, name):
            return getattr(object.__getattribute__(self, "_ok_wrapped"), name)

        def __setattr__(self, name, value):
            setattr(object.__getattribute__(self, "_ok_wrapped"), name, value)

        def __delattr__(self, name):
            delattr(object.__getattribute__(self, "_ok_wrapped"), name)

        # 让 isinstance() / hasattr() 透传到被包装流，避免下游判断流类型时漏判。
        def __iter__(self):
            return iter(self._ok_wrapped)

        def __next__(self):
            return next(self._ok_wrapped)

    for _stream_name in ("stdout", "stderr"):
        _orig = getattr(_sys, _stream_name, None)
        # 已包装过则跳过，避免重复包装。
        if _orig is not None and not isinstance(_orig, _SafeTextIO):
            try:
                setattr(_sys, _stream_name, _SafeTextIO(_orig))
            except Exception:
                pass
    del _stream_name
except Exception:
    pass


from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
