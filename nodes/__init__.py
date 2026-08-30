from .json_extractor import JsonExtractor
from .multiframe_ref import MultiframeRef
from .subject_ref_tag_replacement import SubjectRefTagReplacement

NODE_CLASS_MAPPINGS = {
    "JsonExtractor": JsonExtractor,
    "MultiframeRef": MultiframeRef,
    "SubjectRefTagReplacement": SubjectRefTagReplacement,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "JsonExtractor": "JSON提取",
    "MultiframeRef": "多帧参考",
    "SubjectRefTagReplacement": "主体引用标签置换",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
