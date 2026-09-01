from .json_extractor import JsonExtractor
from .multiframe_ref import MultiframeRef
from .subject_ref_tag_replacement import SubjectRefTagReplacement
from .media_loader import MiniMaxH3MediaLoader
from . import media_routes  # noqa: F401  (registers /openkit_media/* HTTP routes)

NODE_CLASS_MAPPINGS = {
    "JsonExtractor": JsonExtractor,
    "MultiframeRef": MultiframeRef,
    "SubjectRefTagReplacement": SubjectRefTagReplacement,
    "MiniMaxH3MediaLoader": MiniMaxH3MediaLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "JsonExtractor": "JSON提取",
    "MultiframeRef": "多帧参考",
    "SubjectRefTagReplacement": "主体引用标签置换",
    "MiniMaxH3MediaLoader": "H3 多段素材加载",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
