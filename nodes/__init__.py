from .json_extractor import JsonExtractor
from .multiframe_ref import MultiframeRef
from .get_image import ChooseImage
from .subject_ref_tag_replacement import SubjectRefTagReplacement
from .media_loader import MiniMaxH3MediaLoader, MiniMaxH3ReferenceSplitter
from .tab_string_multiline import TabStringMultiline
from .multi_segment_prompt_editor import MultiSegmentPromptEditor
from . import media_routes  # noqa: F401  (registers /openkit_media/* HTTP routes)

NODE_CLASS_MAPPINGS = {
    "JsonExtractor": JsonExtractor,
    "MultiframeRef": MultiframeRef,
    "ChooseImage": ChooseImage,
    "SubjectRefTagReplacement": SubjectRefTagReplacement,
    "MiniMaxH3MediaLoader": MiniMaxH3MediaLoader,
    "MiniMaxH3ReferenceSplitter": MiniMaxH3ReferenceSplitter,
    "TabStringMultiline": TabStringMultiline,
    "MultiSegmentPromptEditor": MultiSegmentPromptEditor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "JsonExtractor": "JSON提取",
    "MultiframeRef": "多帧参考",
    "ChooseImage": "筛选图像",
    "SubjectRefTagReplacement": "主体引用标签置换",
    "MiniMaxH3MediaLoader": "H3 素材加载",
    "MiniMaxH3ReferenceSplitter": "H3 素材拆分",
    "TabStringMultiline": "多Tab字符串",
    "MultiSegmentPromptEditor": "多段提示词可视化编辑",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
