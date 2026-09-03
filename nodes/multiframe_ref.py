import numpy as np
import torch
import torch.nn.functional as F

try:
    import cv2
except ImportError:
    cv2 = None


class MultiframeRef:
    @classmethod
    def INPUT_TYPES(cls):
        list_inputs = {}
        for i in range(1, 8):
            prev = f"图像列表{i - 1}、图像列表{i - 2}" if i >= 3 else "常显"
            list_inputs[f"image_list_{i}"] = (
                "IMAGE",
                {
                    "display_name": f"图像列表{i}",
                    "tooltip": (
                        f"第 {i} 路批量图像，最多 8 张，超出自动截断。"
                        if i <= 2
                        else f"第 {i} 路批量图像，最多 8 张，超出自动截断。仅当 {prev} 都已接入后自动出现。"
                    ),
                },
            )

        return {
            "required": {
                "width": ("INT", {"default": 736, "min": 32, "max": 8192, "step": 32, "display_name": "宽度", "tooltip": "统一输出图像宽度（32 的倍数）"}),
                "height": ("INT", {"default": 1280, "min": 32, "max": 8192, "step": 32, "display_name": "高度", "tooltip": "统一输出图像高度（32 的倍数）"}),
            },
            "optional": {
                "keyframe": ("IMAGE", {"display_name": "关键帧", "tooltip": "关键帧参考图（固定第一个端口），对应输出 batch 索引 0。"}),
                **list_inputs,
                "background": ("IMAGE", {"display_name": "背景", "tooltip": "背景图像（可留空），固定在最后一个端口，不计入主体8张上限，输出时永远排在最后。"}),
            },
        }
    # Each picture input may receive a list (splitter category lists) or a
    # single IMAGE; declare INPUT_IS_LIST so ComfyUI never slices empty lists
    # (which would crash the framework with IndexError) and we unwrap inside.
    INPUT_IS_LIST = True

    
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("图像",)
    OUTPUT_TOOLTIPS = ("按输入顺序拼接的图像 batch（0..1 float），顺序为：关键帧 → 图像列表1..7 → 背景。每张图仅出现一次，背景永远在最后。",)
    FUNCTION = "collect_images"
    CATEGORY = "Openkit"
    DESCRIPTION = (
        "多帧参考节点：收集多张参考图并按顺序输出为一个图像 batch。"
        "关键帧固定首位，图像列表1..7动态扩展（1、2常显，前置连满后依次出现），背景固定末位。"
        "主体图像最多8张（关键帧+图像列表1..7），超出自动忽略；背景不计入主体上限，永远排在最后。"
        "主体图像等比缩放+白底填充（保持完整画面），背景等比缩放+中心裁切（填满画面）。"
        "空兜底图(64x64全黑)视为未接入。"
    )

    @staticmethod
    def _is_empty_fallback_image(image):
        if image is None:
            return True
        t = image
        if isinstance(t, torch.Tensor):
            # 0-batch tensor: connected source produced no frames
            if t.ndim == 4 and t.shape[0] == 0:
                return True
            if t.ndim == 4 and t.shape[0] == 1 and t.shape[1] == 64 and t.shape[2] == 64 and t.shape[3] == 3:
                try:
                    return bool(torch.allclose(t.float(), torch.zeros_like(t.float()), atol=1e-6))
                except Exception:
                    return False
            return False
        if isinstance(t, (list, tuple)):
            # empty python list: connected source that yielded nothing
            if len(t) == 0:
                return True
            # a list whose every item is empty is itself empty
            if all(MultiframeRef._is_empty_fallback_image(x) for x in t):
                return True
            if len(t) == 1:
                return MultiframeRef._is_empty_fallback_image(t[0])
            return False
        return False

    @staticmethod
    def _tensor_to_rgb_array(image):
        if isinstance(image, torch.Tensor):
            if image.ndim == 4:
                if image.shape[0] == 0:
                    raise ValueError("empty image batch (0 frames)")
                image = image[0]
        image = image.detach().cpu().numpy()

        image = np.asarray(image)
        if image.size == 0:
            raise ValueError("empty image array")
        if image.dtype != np.uint8:
            image = np.clip(image * 255.0, 0, 255).astype(np.uint8)

        if image.ndim == 2:
            image = np.stack([image, image, image], axis=-1)
        elif image.shape[-1] == 4:
            image = image[..., :3]

        return np.ascontiguousarray(image)

    @staticmethod
    def _resize(image_array, width, height):
        if cv2 is not None:
            interpolation = (
                cv2.INTER_AREA
                if width < image_array.shape[1] or height < image_array.shape[0]
                else cv2.INTER_LANCZOS4
            )
            return cv2.resize(image_array, (width, height), interpolation=interpolation)

        chw = torch.from_numpy(image_array).permute(2, 0, 1).unsqueeze(0).float()
        resized = F.interpolate(
            chw,
            size=(height, width),
            mode="bicubic",
            align_corners=False,
            antialias=True,
        )
        return np.ascontiguousarray(
            resized.squeeze(0).permute(1, 2, 0).clamp(0, 255).byte().numpy()
        )

    @staticmethod
    def _prepare_image(image, target_size, preserve_full=False):
        image_array = MultiframeRef._tensor_to_rgb_array(image)
        source_height, source_width = image_array.shape[:2]
        target_width, target_height = target_size

        if source_width == target_width and source_height == target_height:
            return np.ascontiguousarray(image_array)

        if preserve_full:
            scale = min(target_width / source_width, target_height / source_height)
            resized_width = max(1, min(target_width, round(source_width * scale)))
            resized_height = max(1, min(target_height, round(source_height * scale)))
            resized = MultiframeRef._resize(image_array, resized_width, resized_height)
            canvas = np.full((target_height, target_width, 3), 255, dtype=np.uint8)
            left = (target_width - resized_width) // 2
            top = (target_height - resized_height) // 2
            canvas[top:top + resized_height, left:left + resized_width] = resized
            return np.ascontiguousarray(canvas)

        scale = max(target_width / source_width, target_height / source_height)
        resized_width = max(target_width, round(source_width * scale))
        resized_height = max(target_height, round(source_height * scale))
        resized = MultiframeRef._resize(image_array, resized_width, resized_height)
        left = (resized_width - target_width) // 2
        top = (resized_height - target_height) // 2
        return np.ascontiguousarray(
            resized[top:top + target_height, left:left + target_width]
        )

    def _iter_tensor_images(self, image_list, limit_per_list, prepare, target_size):
        if image_list is None:
            return
        n = 0
        if isinstance(image_list, torch.Tensor):
            batch = image_list.shape[0] if image_list.ndim == 4 else 1
            take = min(batch, limit_per_list)
            for i in range(take):
                img = image_list[i] if image_list.ndim == 4 else image_list
                yield prepare(img, target_size, preserve_full=True)
                n += 1
                if n >= limit_per_list:
                    return
        elif isinstance(image_list, (list, tuple)):
            for img in image_list:
                if n >= limit_per_list:
                    return
                if img is None:
                    continue
                yield prepare(img, target_size, preserve_full=True)
                n += 1

    @staticmethod
    def _first_valid(value):
        """Return the first usable image from a value that may be None, an
        empty/all-empty list, a single tensor, or a list of tensors. Returns
        None when nothing usable is present (equivalent to a disconnected
        input)."""
        if MultiframeRef._is_empty_fallback_image(value):
            return None
        if isinstance(value, (list, tuple)):
            for x in value:
                if not MultiframeRef._is_empty_fallback_image(x):
                    return MultiframeRef._first_valid(x)
            return None
        return value

    def collect_images(self, width, height, **kwargs):
        # INPUT_IS_LIST keeps every input a list; unwrap scalar dimensions.
        if isinstance(width, (list, tuple)):
            width = width[0] if width else 64
        if isinstance(height, (list, tuple)):
            height = height[0] if height else 64
        background = MultiframeRef._first_valid(kwargs.get("background"))
        keyframe_img = MultiframeRef._first_valid(kwargs.get("keyframe"))
        prepare = self._prepare_image
        target_size = (width, height)

        subjects = []
        TOTAL_LIMIT = 8
        LIMIT_PER_LIST = 8

        if keyframe_img is not None:
            for prepared in self._iter_tensor_images(keyframe_img, LIMIT_PER_LIST, prepare, target_size):
                subjects.append(prepared)
                if len(subjects) >= TOTAL_LIMIT:
                    break

        for i in range(1, 8):
            if len(subjects) >= TOTAL_LIMIT:
                break
            key = f"image_list_{i}"
            img_list = kwargs.get(key)
            if MultiframeRef._is_empty_fallback_image(img_list):
                continue
            for prepared in self._iter_tensor_images(img_list, LIMIT_PER_LIST, prepare, target_size):
                subjects.append(prepared)
                if len(subjects) >= TOTAL_LIMIT:
                    break

        bg_is_empty = background is None
        background_image = None if bg_is_empty else prepare(
            background, target_size, preserve_full=False
        )

        all_images = list(subjects)
        if background_image is not None:
            all_images.append(background_image)

        if all_images:
            output = torch.from_numpy(np.stack(all_images).astype(np.float32) / 255.0)
        else:
            output = torch.zeros((1, 64, 64, 3), dtype=torch.float32)

        return (output,)
