"""Openkit offline dependency bootstrap.

Why this exists
---------------
Some optional backends used by Openkit nodes (e.g. PyAV for robust video /
audio decoding) ship compiled binaries. Requiring users to ``pip install``
them raises the barrier to entry and can clash with their existing packages.

So we vendor the wheels inside this package during development and, on first
use, install any missing backend into the plugin's own ``pkg/site`` directory
with ``pip --target``. The result:
  - zero network access at runtime (offline find-links source),
  - zero pollution of the user's Python environment or other plugins,
  - zero manual install steps.

Pure-Python helpers can simply be dropped into ``pkg/vendored/`` and they are
added to ``sys.path`` on bootstrap. Principle: avoid dependencies whenever a
small self-contained implementation suffices; vendor a good, reliable
dependency rather than re-inventing it.
"""

import importlib.util
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WHEELS = os.path.join(HERE, "wheels")
SITE = os.path.join(HERE, "site")
VENDORED = os.path.join(HERE, "vendored")

# {module_name: distribution_name}
# Binary backends that may be missing on a fresh machine are installed
# offline from pkg/wheels when first needed.
_BINARY_DEPS = {
    "av": "av",
}


def _has(module_name):
    try:
        return importlib.util.find_spec(module_name) is not None
    except (ImportError, ValueError, ModuleNotFoundError):
        return False


def _offline_install(dist_name):
    """Install dist from local wheels into pkg/site. Offline, no user env touch."""
    wheels = []
    if os.path.isdir(WHEELS):
        for fn in os.listdir(WHEELS):
            if fn.endswith(".whl"):
                wheels.append(os.path.join(WHEELS, fn))
    if not wheels:
        return False
    os.makedirs(SITE, exist_ok=True)
    cmd = [
        sys.executable, "-m", "pip", "install",
        "--target", SITE,
        "--no-index", "--find-links", WHEELS,
        "--no-warn-script-location",
        "--quiet",
        dist_name,
    ]
    try:
        subprocess.check_call(cmd)
        return True
    except (subprocess.CalledProcessError, OSError):
        return False


def bootstrap():
    """Call once at plugin import time. Safe to call repeatedly."""
    if os.path.isdir(VENDORED) and VENDORED not in sys.path:
        sys.path.insert(0, VENDORED)

    for module_name, dist_name in _BINARY_DEPS.items():
        if _has(module_name):
            continue
        if SITE in sys.path or (os.path.isdir(SITE) and SITE not in sys.path):
            if SITE not in sys.path:
                sys.path.insert(0, SITE)
        # Try the already-importable path after adding site.
        if _has(module_name):
            continue
        if _offline_install(dist_name):
            if SITE not in sys.path:
                sys.path.insert(0, SITE)
            importlib.invalidate_caches()
            if _has(module_name):
                print(f"[Openkit pkg] installed {dist_name} offline into pkg/site")


def ensure(module_name):
    """Bootstrap and report whether a backend is usable."""
    bootstrap()
    return _has(module_name)
