"""Decoding helpers for the Openkit MiniMax H3 Media Loader.

Provides image / video / audio decoding with graceful backend fallback.
Fixed vs the upstream Fantastic loader: video rotation metadata is now
honoured on the ffmpeg path (no more reshape crashes on phone videos), the
ffmpeg video path no longer hard-crashes when ffprobe/PyAV disagree on
dimensions, and decoded videos are capped so a long file cannot exhaust RAM.
"""

import os
import shutil
import subprocess

try:
    import numpy as np
    import torch
except Exception:  # pragma: no cover
    np = None
    torch = None

try:
    import folder_paths
except Exception:  # pragma: no cover
    folder_paths = None

FPS = 24
AUDIO_SR = 32000


def _bootstrap_pkg():
    """Load offline-vendored optional backends (PyAV etc.) from ../pkg."""
    try:
        from ..pkg import bootstrap as _b
        _b()
        return
    except Exception:
        pass
    try:
        from pkg import bootstrap as _b  # when imported outside the package
        _b()
    except Exception:
        pass


def _have_av():
    _bootstrap_pkg()
    try:
        import av  # noqa: F401
        return True
    except Exception:
        return False


def _ffmpeg():
    return shutil.which("ffmpeg")


def _ffprobe():
    return shutil.which("ffprobe")


def backends():
    return {"av": _have_av(), "ffmpeg": bool(_ffmpeg()), "ffprobe": bool(_ffprobe())}


def can_decode_video():
    return _have_av() or bool(_ffmpeg())


def resolve(annotated):
    """'name [input]' or 'sub/name' -> absolute path inside ComfyUI's dirs."""
    if folder_paths is not None:
        try:
            return folder_paths.get_annotated_filepath(annotated)
        except Exception:
            pass
    name = annotated
    for suffix in (" [input]", " [output]", " [temp]"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    if folder_paths is not None:
        return os.path.join(folder_paths.get_input_directory(), name)
    return name


def load_image(annotated, crop=None):
    from PIL import Image, ImageOps

    path = resolve(annotated)
    img = Image.open(path)
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    arr = np.asarray(img).astype(np.float32) / 255.0
    return _apply_crop(torch.from_numpy(arr)[None, ...], crop)  # [1, H, W, 3]


def _normalize_scale(waveform):
    """Force samples into [-1, 1] whatever the decoder produced."""
    peak = float(waveform.abs().max()) if waveform.numel() else 0.0
    if peak <= 1.5:
        return waveform
    if peak <= 132.0:
        scale = 128.0
    elif peak <= 33000.0:
        scale = 32768.0
    elif peak >= 1e6:
        scale = 2147483648.0
    else:
        scale = peak
    print(f"[Openkit media_io] audio out of range (peak {peak:.0f}); scaling by {scale:.0f}")
    return waveform / scale


def _to_audio_dict(waveform, sr):
    if waveform.ndim == 1:
        waveform = waveform[None, :]
    if waveform.ndim == 2:
        waveform = waveform[None, ...]
    return {"waveform": _normalize_scale(waveform.float()), "sample_rate": int(sr)}


def _audio_via_comfy(annotated, path):
    last = None
    try:
        from comfy_extras import nodes_audio as na
    except Exception as exc:
        raise RuntimeError(f"comfy audio module unavailable: {exc}")

    for name in ("load_audio", "load"):
        fn = getattr(na, name, None)
        if callable(fn):
            try:
                d = _unwrap_audio(fn(path))
                if d is not None:
                    return d
            except Exception as exc:
                last = exc

    cls = getattr(na, "LoadAudio", None)
    if cls is not None:
        for attr in ("execute", getattr(cls, "FUNCTION", None), "load"):
            fn = getattr(cls, attr, None) if isinstance(attr, str) else None
            if not callable(fn):
                continue
            for arg in (annotated, path):
                try:
                    d = _unwrap_audio(fn(arg))
                    if d is not None:
                        return d
                except Exception as exc:
                    last = exc
    raise RuntimeError(f"comfy LoadAudio path failed: {last}")


def _unwrap_audio(out):
    seen = 0
    while out is not None and seen < 5:
        if isinstance(out, dict) and "waveform" in out:
            return {"waveform": _normalize_scale(out["waveform"].float()),
                    "sample_rate": int(out["sample_rate"])}
        if isinstance(out, (tuple, list)) and out:
            out = out[0]
        elif hasattr(out, "args"):
            out = out.args
        elif hasattr(out, "audio"):
            out = out.audio
        else:
            return None
        seen += 1
    return None


def _audio_via_av(path):
    import av

    with av.open(path) as container:
        stream = next(s for s in container.streams if s.type == "audio")
        chunks = []
        for frame in container.decode(stream):
            arr = frame.to_ndarray()
            if arr.dtype.kind == "i":
                arr = arr.astype(np.float32) / float(np.iinfo(arr.dtype).max)
            elif arr.dtype.kind == "u":
                arr = (arr.astype(np.float32) - 128.0) / 128.0
            else:
                arr = arr.astype(np.float32)
            if arr.ndim == 1:
                arr = arr[None, :]
            per_channel = int(getattr(frame, "samples", 0) or 0)
            if arr.shape[0] == 1 and per_channel and arr.shape[1] > per_channel:
                ch = arr.shape[1] // per_channel
                if ch * per_channel == arr.shape[1]:
                    arr = arr.reshape(per_channel, ch).T
            chunks.append(arr)
        if not chunks:
            raise RuntimeError("no decodable audio frames")
        data = np.concatenate(chunks, axis=1)
        sr = stream.rate
    return _to_audio_dict(torch.from_numpy(data), sr)


def _slice_audio(d, start, end):
    if not start and not end:
        return d
    sr = d["sample_rate"]
    total = d["waveform"].shape[-1]
    a = max(0, int(round((start or 0.0) * sr)))
    b = min(total, int(round(end * sr))) if end else total
    if b <= a:
        raise RuntimeError(
            f"Audio trim {start or 0:.2f}-{end:.2f}s selects nothing "
            f"(clip is {total / sr:.2f}s).")
    return {"waveform": d["waveform"][..., a:b], "sample_rate": sr}


def load_audio(annotated, start=None, end=None):
    path = resolve(annotated)
    errors = []
    try:
        d = _audio_via_comfy(annotated, path)
        print(f"[Openkit media_io] {os.path.basename(path)}: decoded via Comfy LoadAudio")
        return _slice_audio(d, start, end)
    except Exception as exc:
        errors.append(f"comfy: {exc}")
    try:
        d = _audio_via_av(path)
        print(f"[Openkit media_io] {os.path.basename(path)}: decoded via PyAV")
        return _slice_audio(d, start, end)
    except Exception as exc:
        errors.append(f"av: {exc}")
    try:
        return _slice_audio(_audio_via_ffmpeg(path), start, end)
    except Exception as exc:
        errors.append(f"ffmpeg: {exc}")
    try:
        import torchaudio

        waveform, sr = torchaudio.load(path)
        return _slice_audio(_to_audio_dict(waveform, sr), start, end)
    except Exception as exc:
        errors.append(f"torchaudio: {exc}")
    raise RuntimeError(
        f"Can't decode audio from {os.path.basename(path)} — " + "; ".join(errors))


def _audio_via_ffmpeg(path):
    exe = _ffmpeg()
    if not exe:
        raise RuntimeError(
            f"Can't decode audio from {os.path.basename(path)}: no torchaudio and "
            "no ffmpeg on PATH. Install ffmpeg or supply a WAV file.")
    cmd = [exe, "-v", "error", "-i", path, "-f", "f32le", "-acodec", "pcm_f32le",
           "-ac", "2", "-ar", str(AUDIO_SR), "-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    if not raw:
        raise RuntimeError(f"{os.path.basename(path)} contains no decodable audio.")
    data = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()
    return _to_audio_dict(torch.from_numpy(data), AUDIO_SR)


def _apply_crop(frames, crop):
    """Crop [T, H, W, C] frames by a normalised {x, y, w, h} rect (0..1)."""
    if not crop:
        return frames
    try:
        H, W = int(frames.shape[1]), int(frames.shape[2])
        x = float(crop.get("x", 0.0))
        y = float(crop.get("y", 0.0))
        x0 = max(0, min(W - 16, int(round(x * W))))
        y0 = max(0, min(H - 16, int(round(y * H))))
        x1 = min(W, max(x0 + 16, int(round((x + float(crop.get("w", 1.0))) * W))))
        y1 = min(H, max(y0 + 16, int(round((y + float(crop.get("h", 1.0))) * H))))
        if (x0, y0, x1, y1) == (0, 0, W, H):
            return frames
        print(f"[Openkit media_io] crop {W}x{H} -> {x1 - x0}x{y1 - y0} at ({x0},{y0})")
        return frames[:, y0:y1, x0:x1, :]
    except Exception as exc:
        print(f"[Openkit media_io] crop ignored ({exc})")
        return frames


def _rotation(path):
    """Return 90/180/270 for the video's rotation metadata, else 0."""
    if _have_av():
        try:
            import av
            with av.open(path) as c:
                s = c.streams.video[0]
                for side_data in s.side_data:
                    if getattr(side_data, "display_matrix", None):
                        m = side_data.display_matrix
                        theta = m[0] if isinstance(m, (list, tuple)) else None
                        if theta == 0:
                            return 90
                        if theta == 65536:
                            return 0
                        if theta == -65536:
                            return 180
                        if theta in (131072, -131072):
                            return 270
        except Exception:
            pass
    return 0


def _dimensions(path):
    """Decoded (W, H) after rotation, so reshape never fights ffmpeg."""
    try:
        if _have_av():
            import av
            with av.open(path) as c:
                s = c.streams.video[0]
                w = int(s.codec_context.width)
                h = int(s.codec_context.height)
            if _rotation(path) in (90, 270):
                w, h = h, w
            return w, h
    except Exception:
        pass
    exe = _ffprobe()
    if not exe:
        raise RuntimeError("ffprobe not found; can't determine video dimensions.")
    out = subprocess.run(
        [exe, "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height", "-of", "csv=p=0:s=x", path],
        capture_output=True, text=True, check=True).stdout.strip()
    w, h = out.split("x")[:2]
    return int(w), int(h)


def load_video_frames(annotated, fps=FPS, max_frames=None, start=None, end=None,
                      crop=None):
    """Decode to an IMAGE batch [N, H, W, 3] resampled to `fps`."""
    path = resolve(annotated)
    if _have_av():
        try:
            return _apply_crop(_frames_via_av(path, fps, max_frames, start, end), crop)
        except Exception:
            pass
    if _ffmpeg():
        return _apply_crop(_frames_via_ffmpeg(path, fps, max_frames, start, end), crop)
    raise RuntimeError(
        f"Can't decode {os.path.basename(path)}: install PyAV (pip install av) "
        "or put ffmpeg on PATH.")


def _frames_via_av(path, fps, max_frames, start=None, end=None):
    import av

    t0 = float(start or 0.0)
    out = []
    with av.open(path) as container:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        if t0 > 0:
            container.seek(int(t0 / stream.time_base), stream=stream,
                           backward=True, any_frame=False)
        grid = 1.0 / float(fps)
        want = t0
        for frame in container.decode(stream):
            t = frame.time
            if t is None:
                continue
            if end is not None and t > end + grid / 2:
                break
            if t < want - grid / 2:
                continue
            out.append(frame.to_ndarray(format="rgb24"))
            want += grid
            if max_frames and len(out) >= max_frames:
                break
    if not out:
        raise RuntimeError(
            "No video frames decoded"
            + (f" in {t0:.2f}-{end:.2f}s" if (start or end) else "") + ".")
    arr = np.stack(out).astype(np.float32) / 255.0
    return torch.from_numpy(arr)


def _frames_via_ffmpeg(path, fps, max_frames, start=None, end=None):
    exe = _ffmpeg()
    w, h = _dimensions(path)
    cmd = [exe, "-v", "error"]
    if start:
        cmd += ["-ss", f"{float(start):.3f}"]
    cmd += ["-i", path]
    if end:
        span = float(end) - float(start or 0.0)
        if span <= 0:
            raise RuntimeError(f"Video trim {start}-{end}s selects nothing.")
        cmd += ["-t", f"{span:.3f}"]
    cmd += ["-vf", f"fps={fps},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "rgb24"]
    if max_frames:
        cmd += ["-frames:v", str(int(max_frames))]
    cmd += ["-"]
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    if not raw:
        raise RuntimeError(f"No video frames decoded from {os.path.basename(path)}.")
    # scale forces the exact decoded size so reshape always matches.
    n = len(raw) // (w * h * 3)
    arr = np.frombuffer(raw, dtype=np.uint8)[: n * w * h * 3].reshape(n, h, w, 3)
    return torch.from_numpy(arr.astype(np.float32) / 255.0)


def extract_audio(annotated, start=None, end=None):
    """Pull the soundtrack out of a video file."""
    path = resolve(annotated)
    if _have_av():
        try:
            return _slice_audio(_audio_via_av(path), start, end)
        except Exception:
            pass
    return _slice_audio(_audio_via_ffmpeg(path), start, end)


def probe(annotated):
    """Duration / stream info shown on the node. Never raises."""
    path = resolve(annotated)
    info = {"duration": None, "has_audio": False, "width": None, "height": None}
    if not os.path.exists(path):
        return info
    if _have_av():
        try:
            import av
            with av.open(path) as c:
                if c.duration:
                    info["duration"] = round(c.duration / 1000000.0, 2)
                info["has_audio"] = len(c.streams.audio) > 0
                if c.streams.video:
                    s = c.streams.video[0]
                    info["width"] = int(s.codec_context.width)
                    info["height"] = int(s.codec_context.height)
            return info
        except Exception:
            pass
    exe = _ffprobe()
    if exe:
        try:
            out = subprocess.run(
                [exe, "-v", "error", "-show_entries",
                 "format=duration:stream=codec_type,width,height",
                 "-of", "default=nw=1", path],
                capture_output=True, text=True, check=True).stdout
            for line in out.splitlines():
                k, _, v = line.partition("=")
                if k == "duration" and v:
                    info["duration"] = round(float(v), 2)
                elif k == "codec_type" and v == "audio":
                    info["has_audio"] = True
                elif k == "width" and v and not info["width"]:
                    info["width"] = int(v)
                elif k == "height" and v and not info["height"]:
                    info["height"] = int(v)
        except Exception:
            pass
    return info
