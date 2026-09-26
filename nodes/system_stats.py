"""
Openkit · 轻量系统状态采集（VRAM / RAM）

供前端顶部计时器轮询 GET /openkit_media/system_stats，返回显存与内存的
{used, total} 字节数。全部采集函数均为软导入 + 全异常降级，任何依赖缺失
都返回 None 而绝不抛错；不新增硬依赖（torch / psutil 均软导入）。
"""

try:
    from server import PromptServer
    from aiohttp import web
except Exception:  # pragma: no cover - 仅在 ComfyUI 外导入时触发
    PromptServer = None
    web = None

# 复用 memory_cleanup.py 中已定义的 Windows _MEMORYSTATUSEX 结构，避免重复定义。
# 非 Windows 上该名称不存在 → ImportError → 降级到 /proc/meminfo 或 psutil。
try:
    from .memory_cleanup import _MEMORYSTATUSEX
except Exception:  # pragma: no cover
    _MEMORYSTATUSEX = None


def get_vram_usage():
    """返回 {"used": int, "total": int} 字节；无 CUDA / torch 不可用 / 异常 → None。"""
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        free, total = torch.cuda.mem_get_info()
        return {"used": int(total - free), "total": int(total)}
    except Exception:
        return None


def get_ram_usage():
    """返回 {"used": int, "total": int} 字节；全部途径不可用 → None。

    优先级：Windows GlobalMemoryStatusEx（复用 _MEMORYSTATUSEX）
           → Linux /proc/meminfo → psutil。
    """
    # Windows：复用 memory_cleanup 的 _MEMORYSTATUSEX 结构
    if _MEMORYSTATUSEX is not None:
        try:
            import ctypes
            from ctypes import wintypes, byref, sizeof
            stat = _MEMORYSTATUSEX()
            stat.dwLength = wintypes.DWORD(sizeof(stat))
            kernel32 = ctypes.windll.kernel32
            if not kernel32.GlobalMemoryStatusEx(byref(stat)):
                raise RuntimeError("GlobalMemoryStatusEx 返回失败")
            total = int(stat.ullTotalPhys)
            avail = int(stat.ullAvailPhys)
            return {"used": total - avail, "total": total}
        except Exception:
            pass

    # Linux：/proc/meminfo（kB → 字节）
    try:
        info = {}
        with open("/proc/meminfo", "r", encoding="utf-8") as handle:
            for line in handle:
                parts = line.split()
                if len(parts) >= 2:
                    info[parts[0].rstrip(":")] = int(parts[1])  # kB
        total_kb = info.get("MemTotal")
        avail_kb = info.get("MemAvailable")
        if total_kb is not None and avail_kb is not None:
            total = total_kb * 1024
            avail = avail_kb * 1024
            return {"used": total - avail, "total": total}
    except Exception:
        pass

    # 最终降级：psutil
    try:
        import psutil
        vm = psutil.virtual_memory()
        return {"used": int(vm.used), "total": int(vm.total)}
    except Exception:
        return None


if PromptServer is not None and web is not None and getattr(PromptServer, "instance", None) is not None:
    routes = PromptServer.instance.routes

    @routes.get("/openkit_media/system_stats")
    async def system_stats(request):
        """只读：返回 VRAM / RAM 的 {used, total} 字节数（本地/LAN 无鉴权）。"""
        return web.json_response({
            "vram": get_vram_usage(),
            "ram": get_ram_usage(),
        })
