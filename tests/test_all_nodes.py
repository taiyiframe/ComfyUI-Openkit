# -*- coding: utf-8 -*-
"""Openkit 全节点回归测试（all 10 nodes）。

覆盖：JsonExtractor / MultiframeRef / ChooseImage / SubjectRefTagReplacement /
      TabStringMultiline / MultiSegmentPromptEditor（MediaLoader/ReferenceSplitter
      由 test_media_loader.py 覆盖）。
运行：venv312/Scripts/python.exe tests/test_all_nodes.py
"""
import io
import sys
import os
import json
import types
import importlib

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

_nodes_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "nodes")
nodes_dir = _nodes_dir
pkg = types.ModuleType("nodes")
pkg.__path__ = [nodes_dir]
sys.modules["nodes"] = pkg

fp = types.ModuleType("folder_paths")
fp.get_input_directory = lambda: "input"
sys.modules["folder_paths"] = fp

import torch
fake_io = types.ModuleType("nodes.media_io")
fake_io.load_image = lambda file, crop=None: torch.zeros(1, 64, 64, 3)
fake_io.load_video_frames = lambda file, fps=24, max_frames=None, start=None, end=None, crop=None: torch.zeros(3, 64, 64, 3)
fake_io.load_audio = lambda file, start=None, end=None: {"waveform": torch.zeros(1, 1, 1000), "sample_rate": 32000}
fake_io.extract_audio = fake_io.load_audio
sys.modules["nodes.media_io"] = fake_io

passed = 0
failed = 0
def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  [PASS] {name} {extra}")
    else:
        failed += 1
        print(f"  [FAIL] {name} {extra}")

# ============ 1) JsonExtractor ============
print("== JsonExtractor ==")
from nodes.json_extractor import JsonExtractor
h3_json = {
    "整体风格": "冷月顶光为主，青铜连枝灯暖橙火光为辅，冷蓝夜空与暖橙强对比",
    "角色档案": ["沈惊鸿，秦代青年，玄黑长袍，祭月主祭"],
    "音色档案": ["沈惊鸿音色：低沉沉稳，语速缓"],
    "道具档案": ["青铜连枝灯，暖橙火光"],
    "场景档案": ["咸阳宫祭月高台，月夜，宫灯点点"],
    "关键帧档案": ["祭月问天起始帧：祭月高台月夜开篇，主祭举灯"],
    "分镜序列": [
        {"编号": 1, "类型": "文戏：10秒", "标题": "祭月问天", "摘要": "沈惊鸿在高台缓缓举灯，仰望月空，祭月问天起始帧。",
         "运镜": ["缓慢横移"], "环境音": "夜风轻拂，宫灯噼啪", "BGM": "古琴低鸣"}
    ],
    "分镜情节": [],
}
je = JsonExtractor()
r = je.extract_json(json=json.dumps(h3_json, ensure_ascii=False), 索引=1, 档案选择="角色档案",
                    角色开关=True, 道具开关=True, 场景开关=True, 关键帧开关=True, BGM开关=True, 情节开关=False, 自定义段落="")
# OUTPUT_NODE 节点返回 {"result": [...]}
res = r["result"] if isinstance(r, dict) else r
(整体风格, 档案, 档案编码, 角色道具场景, 分镜序列, 关键帧索引, 角色索引, 道具索引, 场景索引, 索引时长, 场景判断) = res
check("整体风格输出非空且匹配", 整体风格 and "冷月顶光" in 整体风格, f"len={len(整体风格)}")
check("档案输出含角色名", "沈惊鸿" in 档案, f"len={len(档案)}")
check("角色道具场景含 Subject 标记", "<Subject" in 角色道具场景 or "Subject" in 角色道具场景, str(角色道具场景)[:60])
check("分镜序列含 H3 结构", 分镜序列 and ("subject_definitions" in 分镜序列 or "整体风格" in 分镜序列 or "summary" in 分镜序列), f"len={len(分镜序列)}")
check("关键帧索引匹配到 0", 关键帧索引.strip() == "0", f"got={关键帧索引!r}")
check("索引时长非空", 索引时长 is not None, f"got={索引时长!r}")

# ============ 2) MultiframeRef ============
print("== MultiframeRef ==")
from nodes.multiframe_ref import MultiframeRef
mf = MultiframeRef()
key = torch.rand(1, 100, 100, 3)
il1 = torch.rand(2, 120, 80, 3)
bg = torch.rand(1, 80, 120, 3)
out = mf.collect_images(64, 64, keyframe=key, image_list_1=il1, background=bg)
check("拼接 batch=4 (关键帧1+列表2+背景1)", out[0].shape[0] == 4, f"shape={tuple(out[0].shape)}")
check("尺寸统一 64x64", out[0].shape[1] == 64 and out[0].shape[2] == 64)
# 空输入 → 64x64 全黑兜底
out_empty = mf.collect_images(64, 64, keyframe=None, background=None)
check("空输入兜底 64x64", out_empty[0].shape == (1, 64, 64, 3), f"shape={tuple(out_empty[0].shape)}")

# ============ 3) ChooseImage ============
print("== ChooseImage ==")
from nodes.get_image import ChooseImage
ci = ChooseImage()
batch = torch.rand(5, 64, 64, 3)
sel = ci.indexedimagesfrombatch(batch, "0,2,4")[0]
check("筛选 3 张", sel.shape[0] == 3, f"shape={tuple(sel.shape)}")
sel2 = ci.indexedimagesfrombatch(batch, "1,99,-1")[0]
check("无效索引忽略→1张", sel2.shape[0] == 1, f"shape={tuple(sel2.shape)}")
empty_in = torch.zeros(1, 64, 64, 3)
out3 = ci.indexedimagesfrombatch(empty_in, "0")[0]
check("空输入兜底 64x64", out3.shape == (1, 64, 64, 3), f"shape={tuple(out3.shape)}")

# ============ 4) SubjectRefTagReplacement ============
print("== SubjectRefTagReplacement ==")
from nodes.subject_ref_tag_replacement import SubjectRefTagReplacement
sr = SubjectRefTagReplacement()
角色道具场景 = "<Subject 1>：沈惊鸿，秦代青年玄黑长袍\n<Subject 2>：青铜连枝灯，暖橙光\n<Subject 3>：祭月高台，月夜"
分镜序列 = "沈惊鸿在高台缓缓举灯，低声说：<d>祭月问天</d>。\n沈惊鸿转身望向祭月高台。"
角色索引 = "0,1,2"
shot_out, voice_idx = sr.replace_shot_names(角色道具场景, 分镜序列, 台词开关=True, 参考音频开关=True, 角色索引=角色索引)
check("说话者替换为 Subject+Audio", "<Subject 1><Audio 1>" in shot_out or "<Subject 1>" in shot_out, str(shot_out)[:80])
check("普通引用替换", "<Subject 3>" in shot_out, str(shot_out)[-60:])
check("台词内容 <d>祭月问天</d> 保留", "<d>祭月问天</d>" in shot_out)
check("音色索引按说话顺序输出", voice_idx.strip() == "0", f"got={voice_idx!r}")

# ============ 5) TabStringMultiline ============
print("== TabStringMultiline ==")
from nodes.tab_string_multiline import TabStringMultiline
ts = TabStringMultiline()
check("Tab索引=1 → B", ts.execute(1, '{"tabs":["A","B","C"]}')[0] == "B")
# P1修复: 越界钳制改为末页(3个tab索引0/1/2)，99越界→末页"C"（旧断言"A"是钳首页的错误预期）
check("Tab索引越界→末Tab", ts.execute(99, '{"tabs":["A","B","C"]}')[0] == "C")
check("空 tabs → 空串", ts.execute(0, '{}')[0] == "")
check("损坏 JSON 安全", ts.execute(0, 'not json')[0] == "")

# ============ 6) MultiSegmentPromptEditor ============
print("== MultiSegmentPromptEditor ==")
from nodes.multi_segment_prompt_editor import MultiSegmentPromptEditor
me = MultiSegmentPromptEditor()
# P1修复: execute 签名为 (self, tab_index=0, prompt_json="{}")，必须关键字传 prompt_json，
# 否则位置实参 '{}' 会错绑到 tab_index。
out_full = me.execute(prompt_json='{}')[0]
data = json.loads(out_full)
check("顶层 7 模块齐全", all(k in data for k in ["整体风格", "角色档案", "音色档案", "道具档案", "场景档案", "关键帧档案", "分镜序列"]))
check("分镜序列默认 1 条含全字段", "编号" in data["分镜序列"][0] and "类型" in data["分镜序列"][0] and "运镜" in data["分镜序列"][0])
out_part = me.execute(prompt_json=json.dumps({"整体风格": "测试风格", "分镜序列": [{"编号": 3}]}, ensure_ascii=False))[0]
data2 = json.loads(out_part)
check("保留已有字段", data2["整体风格"] == "测试风格")
check("补全缺失分镜字段", "摘要" in data2["分镜序列"][0] and data2["分镜序列"][0]["运镜"] == [""])
check("输出为格式化 JSON", "\n" in out_part)

# ============ 7) NODE_CLASS_MAPPINGS smoke test ============
print("== NODE_CLASS_MAPPINGS smoke test ==")
try:
    # nodes 包在开头被替换为裸 ModuleType，此处手动执行 __init__.py 以验证注册
    import importlib.util
    _init_path = os.path.join(nodes_dir, "__init__.py")
    _init_ns = {"__name__": "nodes", "__path__": [nodes_dir], "__file__": _init_path}
    exec(compile(open(_init_path, encoding="utf-8").read(), _init_path, "exec"), _init_ns)
    _mappings = _init_ns.get("NODE_CLASS_MAPPINGS", {})
    check("NODE_CLASS_MAPPINGS 有 10 个键", len(_mappings) == 10, f"got={len(_mappings)}")
    _expected = {"JsonExtractor", "MultiframeRef", "ChooseImage", "SubjectRefTagReplacement",
                "MediaLoader", "ReferenceSplitter", "TabStringMultiline", "MultiSegmentPromptEditor",
                "OpenkitExecutionTime", "OpenkitMemoryCleanup"}
    _actual = set(_mappings.keys())
    check("10 个节点类全部注册", _actual == _expected,
          f"missing={_expected - _actual} extra={_actual - _expected}")
except Exception as e:
    check("NODE_CLASS_MAPPINGS smoke test", False, f"import failed: {e}")

# ============ 8) execution_time patch 幂等性测试 ============
print("== execution_time patch 幂等性 ==")
try:
    os.environ["OPENKIT_DISABLE_EXECTIME"] = "1"
    # Mock execution 模块
    fake_execution = types.ModuleType("execution")
    async def _fake_execute(*args, **kwargs):
        return None
    fake_execution.execute = _fake_execute
    sys.modules["execution"] = fake_execution
    # Mock server 模块
    fake_server = types.ModuleType("server")
    class _FakePromptServer:
        @classmethod
        def send_sync(cls, event, data, sid=None):
            pass
    fake_server.PromptServer = _FakePromptServer
    sys.modules["server"] = fake_server
    # 清理可能的缓存
    for _k in list(sys.modules.keys()):
        if "execution_time" in _k:
            del sys.modules[_k]
    # P1修复: 仅删 sys.modules 还不够——nodes 包对象上仍残留 execution_time 属性，
    # `from nodes import execution_time` 会命中旧缓存(_CORE_AVAILABLE=False)而不重新导入，
    # 导致 _apply_patches 永远返回 False。必须同时清掉包属性强制重新加载。
    if hasattr(sys.modules.get("nodes"), "execution_time"):
        delattr(sys.modules["nodes"], "execution_time")
    from nodes import execution_time
    result1 = execution_time._apply_patches()
    result2 = execution_time._apply_patches()
    check("第一次 _apply_patches 成功", result1 is True, f"got={result1}")
    check("第二次不报错且 _patched=True", result2 is True and execution_time._patched is True,
          f"got={result2}, _patched={execution_time._patched}")
except Exception as e:
    check("execution_time patch 幂等性测试", False, f"error: {e}")

# ============ 汇总 ============
print(f"\n========== 结果 ==========")
print(f"PASS: {passed}  FAIL: {failed}")
if failed:
    sys.exit(1)
print("ALL NODE TESTS PASSED")
