"""
Openkit · 显存/内存清理节点

功能（合并自参考插件 Comfyui-Memory_Cleanup 的 VRAMCleanup 与 RAMCleanup）：
- VRAM：可选卸载全部模型、清理显存缓存（gc + soft_empty_cache + free_memory flag）
- RAM：可选清理文件缓存、枚举进程工作集（EmptyWorkingSet）、修剪当前进程工作集
- 全程零第三方依赖：不引入任何外部进程库，内存读数与进程枚举均用 ctypes + stdlib 实现
- 跨平台：Windows 完整实现；Linux malloc_trim + /proc/meminfo；其他平台安全跳过（ctypes.wintypes 仅 Windows 可用，已条件导入）
"""

import gc
import os
import platform
import time
from ctypes import (
    POINTER,
    Structure,
    byref,
    c_size_t,
    sizeof,
)

if platform.system() == "Windows":
    from ctypes import wintypes
else:
    wintypes = None

from ._common import AnyType, any  # noqa: E402

# ---------------------------------------------------------------------------
# 软导入：ComfyUI 运行时模块缺失时不让整个插件 import 失败
# ---------------------------------------------------------------------------

try:
    from server import PromptServer
except Exception:  # pragma: no cover - 纯防御
    PromptServer = None

try:
    import comfy.model_management  # noqa: F401  (调用处再 try)
except Exception:  # pragma: no cover - 纯防御
    comfy = None


CATEGORY = "Openkit/效率工具"


# ---------------------------------------------------------------------------
# Windows 内存读取（替代原插件读取物理内存占用的做法）
# ---------------------------------------------------------------------------

if platform.system() == "Windows":

    class _MEMORYSTATUSEX(Structure):
        _fields_ = [
            ("dwLength", wintypes.DWORD),
            ("dwMemoryLoad", wintypes.DWORD),
            ("ullTotalPhys", c_size_t),
            ("ullAvailPhys", c_size_t),
            ("ullTotalPageFile", c_size_t),
            ("ullAvailPageFile", c_size_t),
            ("ullTotalVirtual", c_size_t),
            ("ullAvailVirtual", c_size_t),
            ("ullAvailExtendedVirtual", c_size_t),
        ]


def _read_ram_usage():
    """返回 (percent, available_mb)。

    Windows: GlobalMemoryStatusEx；Linux: /proc/meminfo；其他平台返回 (None, None)。
    """
    system = platform.system()

    if system == "Windows":
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            stat = _MEMORYSTATUSEX()
            stat.dwLength = wintypes.DWORD(sizeof(stat))
            if not kernel32.GlobalMemoryStatusEx(byref(stat)):
                print("[OpenkitMemoryCleanup] GlobalMemoryStatusEx 调用失败")
                return None, None
            percent = float(stat.dwMemoryLoad)
            available_mb = float(stat.ullAvailPhys) / (1024.0 * 1024.0)
            return percent, available_mb
        except Exception as e:
            print(f"[OpenkitMemoryCleanup] 读取 Windows 内存失败: {e}")
            return None, None

    if system == "Linux":
        try:
            info = {}
            with open("/proc/meminfo", "r", encoding="utf-8") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 2:
                        info[parts[0].rstrip(":")] = int(parts[1])  # kB
            total_kb = info.get("MemTotal")
            avail_kb = info.get("MemAvailable")
            if total_kb is None or avail_kb is None:
                print("[OpenkitMemoryCleanup] /proc/meminfo 缺少 MemTotal/MemAvailable")
                return None, None
            percent = (total_kb - avail_kb) * 100.0 / total_kb if total_kb else 0.0
            return percent, float(avail_kb) / 1024.0
        except Exception as e:
            print(f"[OpenkitMemoryCleanup] 读取 Linux 内存失败: {e}")
            return None, None

    print(f"[OpenkitMemoryCleanup] 非 Windows/Linux（{system}），跳过 RAM 读取")
    return None, None


# ---------------------------------------------------------------------------
# 节点定义
# ---------------------------------------------------------------------------

class OpenkitMemoryCleanup:
    """合并 VRAM 与 RAM 清理为单一节点。"""

    CATEGORY = "Openkit/效率工具"
    RETURN_TYPES = (any,)
    RETURN_NAMES = ("output",)
    OUTPUT_NODE = True
    FUNCTION = "clean"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "vram_offload_model": ("BOOLEAN", {"default": True}),
                "vram_offload_cache": ("BOOLEAN", {"default": True}),
                "ram_clean_file_cache": ("BOOLEAN", {"default": True}),
                "ram_clean_processes": ("BOOLEAN", {"default": True}),
                "ram_clean_dlls": ("BOOLEAN", {"default": True}),
                "retry_times": ("INT", {"default": 3, "min": 1, "max": 10, "step": 1}),
            },
            "optional": {
                "anything": (any, {}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # 返回当前时间戳，确保每次执行
        return float(time.time())

    # -- VRAM 子动作 --------------------------------------------------------

    def _vram_offload_model(self):
        try:
            comfy.model_management.unload_all_models()
            print("[OpenkitMemoryCleanup] 已卸载全部模型")
            return True
        except Exception as e:
            print(f"[OpenkitMemoryCleanup] 卸载模型失败: {e}")
            return False

    def _vram_offload_cache(self):
        try:
            gc.collect()
            try:
                comfy.model_management.soft_empty_cache()
            except Exception as e:
                print(f"[OpenkitMemoryCleanup] soft_empty_cache 失败: {e}")
            try:
                if PromptServer is not None:
                    PromptServer.instance.prompt_queue.set_flag("free_memory", True)
            except Exception as e:
                print(f"[OpenkitMemoryCleanup] 设置 free_memory flag 失败: {e}")
            print("[OpenkitMemoryCleanup] 已清理显存缓存")
            return True
        except Exception as e:
            print(f"[OpenkitMemoryCleanup] 清理显存缓存失败: {e}")
            return False

    # -- RAM 子动作 ---------------------------------------------------------

    def _ram_clean_file_cache(self, system):
        try:
            if system == "Windows":
                import ctypes
                k32 = ctypes.windll.kernel32
                k32.SetSystemFileCacheSize.restype = wintypes.BOOL
                k32.SetSystemFileCacheSize.argtypes = [c_size_t, c_size_t, wintypes.DWORD]
                ok = k32.SetSystemFileCacheSize(c_size_t(-1), c_size_t(-1), wintypes.DWORD(0))
                if not ok:
                    k32.GetLastError.restype = wintypes.DWORD
                    err = k32.GetLastError()
                    print(f"[OpenkitMemoryCleanup] 文件缓存清理需要管理员/SE_INCREASE_QUOTA_NAME 权限（GetLastError={err}），已跳过")
                    return False
            elif system == "Linux":
                import ctypes
                libc = ctypes.CDLL("libc.so.6")
                libc.malloc_trim(0)
            print(f"[OpenkitMemoryCleanup] 已清理文件缓存（{system}）")
            return True
        except Exception as e:
            print(f"[OpenkitMemoryCleanup] 清理文件缓存失败: {e}")
            return False

    def _ram_clean_processes(self, system):
        """枚举进程并 EmptyWorkingSet；失败则降级为只清理当前进程。"""
        if system != "Windows":
            return False
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            psapi = ctypes.windll.psapi

            PROCESS_SET_QUOTA = 0x0100
            PROCESS_ALL_ACCESS = 0x1F0FFF

            kernel32.OpenProcess.restype = wintypes.HANDLE
            kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
            psapi.EmptyWorkingSet.restype = wintypes.BOOL
            psapi.EmptyWorkingSet.argtypes = [wintypes.HANDLE]
            kernel32.GetCurrentProcess.restype = wintypes.HANDLE

            # EnumProcesses
            psapi.EnumProcesses.restype = wintypes.BOOL
            psapi.EnumProcesses.argtypes = [POINTER(wintypes.DWORD), wintypes.DWORD, POINTER(wintypes.DWORD)]

            count = 1024
            pids = (wintypes.DWORD * count)()
            bytes_returned = wintypes.DWORD(0)
            ok = psapi.EnumProcesses(pids, wintypes.DWORD(count * sizeof(wintypes.DWORD)), byref(bytes_returned))
            if not ok or bytes_returned.value == 0:
                raise RuntimeError("EnumProcesses 返回空或失败")

            num_pids = bytes_returned.value // sizeof(wintypes.DWORD)
            cleaned = 0
            for i in range(num_pids):
                pid = pids[i]
                if pid == 0:
                    continue
                handle = kernel32.OpenProcess(wintypes.DWORD(PROCESS_ALL_ACCESS), wintypes.BOOL(False), wintypes.DWORD(pid))
                if not handle:
                    # 无权打开系统/受保护进程，静默跳过（预期）
                    continue
                try:
                    if psapi.EmptyWorkingSet(handle):
                        cleaned += 1
                finally:
                    kernel32.CloseHandle(handle)
            print(f"[OpenkitMemoryCleanup] 已对 {cleaned} 个进程执行 EmptyWorkingSet")
            return True
        except Exception as e:
            print(f"[OpenkitMemoryCleanup] 枚举进程清理失败，降级为只清理当前进程: {e}")
            try:
                import ctypes
                kernel32 = ctypes.windll.kernel32
                psapi = ctypes.windll.psapi
                kernel32.GetCurrentProcess.restype = wintypes.HANDLE
                psapi.EmptyWorkingSet.restype = wintypes.BOOL
                psapi.EmptyWorkingSet.argtypes = [wintypes.HANDLE]
                if psapi.EmptyWorkingSet(kernel32.GetCurrentProcess()):
                    print("[OpenkitMemoryCleanup] 已对当前进程执行 EmptyWorkingSet")
                    return True
                print("[OpenkitMemoryCleanup] 当前进程 EmptyWorkingSet 返回失败")
                return False
            except Exception as e2:
                print(f"[OpenkitMemoryCleanup] 当前进程 EmptyWorkingSet 也失败: {e2}")
                return False

    def _ram_clean_dlls(self, system):
        if system != "Windows":
            return False
        try:
            import ctypes
            k32 = ctypes.windll.kernel32
            # HANDLE = (HANDLE)-1 即 GetCurrentProcess()，比裸传 -1 更稳；
            # 必须显式声明 argtypes，否则 Win64 下魔数被截断导致 INVALID_HANDLE。
            k32.GetCurrentProcess.restype = wintypes.HANDLE
            k32.SetProcessWorkingSetSize.restype = wintypes.BOOL
            k32.SetProcessWorkingSetSize.argtypes = [wintypes.HANDLE, c_size_t, c_size_t]
            h = k32.GetCurrentProcess()
            ok = k32.SetProcessWorkingSetSize(h, c_size_t(-1), c_size_t(-1))
            if not ok:
                k32.GetLastError.restype = wintypes.DWORD
                err = k32.GetLastError()
                print(f"[OpenkitMemoryCleanup] 修剪进程工作集失败（GetLastError={err}）")
                return False
            print("[OpenkitMemoryCleanup] 已修剪当前进程工作集")
            return True
        except Exception as e:
            print(f"[OpenkitMemoryCleanup] 修剪进程工作集失败: {e}")
            return False

    # -- 主入口 -------------------------------------------------------------

    def clean(self, vram_offload_model, vram_offload_cache,
              ram_clean_file_cache, ram_clean_processes, ram_clean_dlls,
              retry_times, anything=None, unique_id=None, extra_pnginfo=None):
        system = platform.system()

        # VRAM
        vram_model_done = self._vram_offload_model() if vram_offload_model else False
        vram_cache_done = self._vram_offload_cache() if vram_offload_cache else False

        # RAM（仅 Windows/Linux 执行；其他平台安全跳过）
        if system not in ("Windows", "Linux"):
            print(f"[OpenkitMemoryCleanup] 非 Windows/Linux（{system}），跳过 RAM 清理")
            before_pct = after_pct = freed_mb = None
        else:
            ram_any = ram_clean_file_cache or ram_clean_processes or ram_clean_dlls
            before_pct, before_avail = _read_ram_usage()

            if ram_any:
                for _ in range(max(1, int(retry_times))):
                    if ram_clean_file_cache:
                        self._ram_clean_file_cache(system)
                    if ram_clean_processes:
                        self._ram_clean_processes(system)
                    if ram_clean_dlls:
                        self._ram_clean_dlls(system)
                    time.sleep(1)
            else:
                print("[OpenkitMemoryCleanup] RAM 三个开关均关闭，跳过 RAM 清理")

            after_pct, after_avail = _read_ram_usage()
            if before_avail is not None and after_avail is not None:
                freed_mb = after_avail - before_avail
            else:
                freed_mb = None

        # 汇总
        def _yn(flag):
            return "执行" if flag else "跳过"

        if before_pct is not None and after_pct is not None and freed_mb is not None:
            ram_summary = f"{before_pct:.1f}%→{after_pct:.1f}% 释放 {freed_mb:.0f}MB"
        else:
            ram_summary = "内存读数不可用"

        print(
            f"[OpenkitMemoryCleanup] 完成 | "
            f"卸载模型:{_yn(vram_model_done)} | 显存缓存:{_yn(vram_cache_done)} | "
            f"RAM:{ram_summary}"
        )

        return (anything,)
