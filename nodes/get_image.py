import torch


class ChooseImage:
    """1:1 port of ComfyUI-Yuan-Tool's GetImage (Yuan_Tool.py), renamed to ChooseImage, hardened so a
    connected source that yields nothing (None / empty batch / empty list /
    all-black fallback) behaves exactly like a disconnected input."""

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("筛选图像",)
    OUTPUT_TOOLTIPS = ("按指定索引从批量图像中筛选出的帧（顺序保持）。空输入时输出 64x64 全黑兜底图。",)
    # A category list output (e.g. the splitter's empty pictures list) arrives
    # as a list. Declare INPUT_IS_LIST so ComfyUI passes it through verbatim;
    # otherwise an empty list + a non-empty scalar input crashes the
    # framework's slice_dict with IndexError.
    INPUT_IS_LIST = True
    FUNCTION = "indexedimagesfrombatch"
    CATEGORY = "Openkit/图像"
    DESCRIPTION = (
        "从批量中筛选一张或者多张图像。用逗号分隔索引（从 0 起），支持多行；"
        "无效索引会被自动忽略，全无效时回退到第 0 张。"
        "连了节点但源头无输入（None / 空 batch / 空列表）时等同未接入，输出 64x64 全黑空兜底图，不报错。"
    )

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "images": ("IMAGE", {"display_name": "输入图像", "tooltip": "要筛选的图像批次（batch）"}),
                "indexes": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "display_name": "索引列表",
                    "tooltip": "逗号分隔的索引（从 0 起），如 0,2,5；也支持多行。留空=不筛选任何图像（等价未接入，输出 64x64 全黑空兜底图）。超出范围的索引会被忽略。",
                }),
            },
        }

    @staticmethod
    def _is_empty_input(image):
        if image is None:
            return True
        if isinstance(image, torch.Tensor):
            # 0-batch tensor: connected source produced no frames
            if image.ndim == 4 and image.shape[0] == 0:
                return True
            # 64x64 all-black fallback emitted by other Openkit nodes
            if (
                image.ndim == 4
                and image.shape[0] == 1
                and image.shape[1] == 64
                and image.shape[2] == 64
                and image.shape[3] == 3
            ):
                try:
                    return bool(
                        torch.allclose(
                            image.float(), torch.zeros_like(image.float()), atol=1e-6
                        )
                    )
                except Exception:
                    return False
            return False
        if isinstance(image, (list, tuple)):
            return len(image) == 0
        return False

    def indexedimagesfrombatch(self, images, indexes):
        # INPUT_IS_LIST keeps every input a list; unwrap the scalar ones.
        if isinstance(indexes, (list, tuple)):
            indexes = indexes[0] if indexes else ""

        # Treat a connected-but-empty source the same as a disconnected input.
        if ChooseImage._is_empty_input(images):
            return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)

        # A list arrives when images is wired to a list-typed output (e.g. the
        # splitter's category picture lists). Select frames by index first, then
        # merge: identical shapes stack into a batch, mixed shapes keep the
        # first selected frame so the node never crashes on uneven sizes.
        if isinstance(images, (list, tuple)):
            selected = []
            for token in (indexes or '').split(','):
                token = token.strip()
                if not token:
                    continue
                try:
                    idx = int(token)
                except ValueError:
                    continue
                if 0 <= idx < len(images):
                    im = images[idx]
                    if im is None:
                        continue
                    if isinstance(im, torch.Tensor):
                        if im.ndim == 4:
                            im = im[0]
                        selected.append(im)
                    # non-tensor items are skipped defensively (e.g. a nested
                    # empty list from a disconnected list-typed source)
            if not selected or not any(isinstance(t, torch.Tensor) for t in selected):
                return (torch.zeros((1, 64, 64, 3), dtype=torch.float32),)
            shapes = {tuple(t.shape) for t in selected}
            if len(shapes) == 1:
                chosen_images = torch.stack(selected, dim=0)
            else:
                chosen_images = selected[0]
                if chosen_images.ndim == 3:
                    chosen_images = chosen_images.unsqueeze(0)
            return (chosen_images,)

        batch_size = images.shape[0] if images.ndim >= 1 else 0

        valid_indices = []
        if batch_size > 0:
            for token in indexes.split(','):
                token = token.strip()
                if not token:
                    continue
                try:
                    idx = int(token)
                except ValueError:
                    continue
                if 0 <= idx < batch_size:
                    valid_indices.append(idx)

        if valid_indices:
            indices_tensor = torch.tensor(valid_indices, dtype=torch.long)
            chosen_images = images[indices_tensor]
        else:
            chosen_images = torch.zeros((1, 64, 64, 3), dtype=torch.float32)

        return (chosen_images,)
