# -*- coding: utf-8 -*-
"""Detect which decoders/deps are available in the current environment."""
import importlib
import os
import shutil

mods = ["av", "torchaudio", "numpy", "torch", "PIL", "cv2", "soundfile", "imageio", "scipy"]
for m in mods:
    try:
        mod = importlib.import_module(m)
        print("  [OK] %-12s %s" % (m, getattr(mod, "__version__", "?")))
    except Exception:
        print("  [--] %-12s missing" % m)

print()
print("ffmpeg :", shutil.which("ffmpeg"))
print("ffprobe:", shutil.which("ffprobe"))
print()

cands = [
    r"D:\ComfyUI_ROB2900_H3\ComfyUI\ffmpeg.exe",
    r"D:\ComfyUI_ROB2900_H3\venv312\Scripts\ffmpeg.exe",
    r"D:\ComfyUI_ROB2900_H3\Mylauncher\launcher_data\python\ffmpeg\bin\ffmpeg.exe",
    r"D:\ComfyUI_ROB2900_H3\Program Files\ffmpeg\bin\ffmpeg.exe",
    r"D:\ComfyUI_ROB2900_H3\ffmpeg\bin\ffmpeg.exe",
]
for c in cands:
    print("exists?", c, os.path.exists(c))
