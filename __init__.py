# ComfyUI 加载本插件时最先执行：先打 asyncio Proactor 静默补丁，再注册节点。
# 修复 Windows ProactorEventLoop 下连接关闭时 _call_connection_lost 抛
# ConnectionResetError/ConnectionAbortedError/BrokenPipeError 未捕获，导致 ComfyUI
# FATAL traceback（asyncio/proactor_events.py:165）刷屏。
import asyncio.proactor_events as _proactor_events

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


from .nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

WEB_DIRECTORY = "./web"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
