from .json_extractor import JsonExtractor
from .multiframe_ref import MultiframeRef
from .get_image import ChooseImage
from .subject_ref_tag_replacement import SubjectRefTagReplacement
from .media_loader import MediaLoader, ReferenceSplitter
from .tab_string_multiline import TabStringMultiline
from .multi_segment_prompt_editor import MultiSegmentPromptEditor
from .execution_time import OpenkitExecutionTime
from . import media_routes  # noqa: F401  (registers /openkit_media/* HTTP routes)

NODE_CLASS_MAPPINGS = {
    "JsonExtractor": JsonExtractor,
    "MultiframeRef": MultiframeRef,
    "ChooseImage": ChooseImage,
    "SubjectRefTagReplacement": SubjectRefTagReplacement,
    "MediaLoader": MediaLoader,
    "ReferenceSplitter": ReferenceSplitter,
    "TabStringMultiline": TabStringMultiline,
    "MultiSegmentPromptEditor": MultiSegmentPromptEditor,
    "OpenkitExecutionTime": OpenkitExecutionTime,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "JsonExtractor": "JSON提取",
    "MultiframeRef": "多帧参考",
    "ChooseImage": "筛选图像",
    "SubjectRefTagReplacement": "主体引用标签置换",
    "MediaLoader": "素材加载",
    "ReferenceSplitter": "素材拆分",
    "TabStringMultiline": "多Tab字符串",
    "MultiSegmentPromptEditor": "多段提示词可视化编辑",
    "OpenkitExecutionTime": "执行时间统计",
}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS"]
