/* Openkit · JsonExtractor 索引控制下拉（中英双语显示名）
 *
 * 后端在「索引」INT 的 input spec 里声明了 control_after_generate 字段，
 * ComfyUI 新前端会自动为「索引」创建一个 value-control 下拉
 * （选项 fixed / increment / decrement / randomize，每次生成前自动处理索引）。
 * 该下拉默认显示英文名 "fixed"（spec 字段值即控件名）。
 * 本扩展只做一件事：把该下拉的显示名（label）按当前语言显示为「索引控制 /
 * Index Control」，选项保持官方英文值，逻辑完全由 ComfyUI 前端官方机制驱动。
 * 注意：widget.name 承担序列化 key，必须保持固定中文值不变，只翻译 label。
 */
import { app } from "../../../scripts/app.js";
import { OKT } from "./openkit_i18n.js";

OKT.addPairs([
  ["Index Control", "索引控制"],
  ["Controls how 「索引」 changes before each generation: randomize = random; fixed = fixed; increment = +1 each time; decrement = -1 each time.",
    "控制「索引」在每次生成前的变化方式：randomize=随机生成；fixed=固定不变；increment=每次+1；decrement=每次-1。"],
  ["顶部自定义段落", "顶部自定义段落"],
  ["底部自定义段落", "底部自定义段落"],
  ["在此输入在提示词开头插入的自定义段落", "在此输入在提示词开头插入的自定义段落"],
  ["在此输入在提示词末尾追加的自定义段落", "在此输入在提示词末尾追加的自定义段落"],
]);
const tr = (t) => OKT.tr(t);

app.registerExtension({
  name: "Openkit.JsonExtractor.IndexControl",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "JsonExtractor") return;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onNodeCreated?.apply(this, arguments);
      try {
        // 找到官方 value-control 下拉（含 increment/randomize 选项）
        let controlWidget = null;
        for (const w of this.widgets || []) {
          if (
            w &&
            w.options &&
            Array.isArray(w.options.values) &&
            w.options.values.includes("increment") &&
            w.options.values.includes("randomize")
          ) {
            controlWidget = w;
            break;
          }
        }
        // 兼容旧工作流里保存下来的显式 control_after_generate 普通下拉
        if (!controlWidget) {
          controlWidget = this.widgets?.find((w) => w && w.name === "control_after_generate");
        }
        if (controlWidget) {
          // name 保持中文固定（序列化 key 稳定），label 跟随语言显示
          controlWidget.name = "索引控制";
          const applyLabel = () => {
            controlWidget.label = tr("索引控制");
            if (!controlWidget.tooltip || controlWidget._mmxIdxTip) {
              controlWidget.tooltip =
                tr("控制「索引」在每次生成前的变化方式：randomize=随机生成；fixed=固定不变；increment=每次+1；decrement=每次-1。");
              controlWidget._mmxIdxTip = true;
            }
            try { this.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* ignore */ }
          };
          applyLabel();
          // 语言切换联动：仅当 tooltip 尚未被用户自定义时跟随语言刷新
          this._mmxIdxLocalize = () => {
            controlWidget.label = tr("索引控制");
            if (controlWidget._mmxIdxTip) {
              controlWidget.tooltip =
                tr("控制「索引」在每次生成前的变化方式：randomize=随机生成；fixed=固定不变；increment=每次+1；decrement=每次-1。");
            }
            try { this.graph?.setDirtyCanvas?.(true, true); } catch (e) { /* ignore */ }
          };
        }

        // 为顶部/底部自定义段落 textarea 设置 placeholder
        const setCustomParaPlaceholder = () => {
          try {
            const topW = this.widgets?.find(w => w && w.name === "顶部自定义段落");
            const botW = this.widgets?.find(w => w && w.name === "自定义段落");
            const setPH = (w, ph) => {
              if (!w) return;
              const ta = w.inputEl || w.element;
              if (ta && ta.setAttribute) {
                ta.setAttribute("placeholder", ph);
              }
            };
            setPH(topW, tr("在此输入在提示词开头插入的自定义段落"));
            setPH(botW, tr("在此输入在提示词末尾追加的自定义段落"));
          } catch (e) { /* ignore */ }
        };
        setCustomParaPlaceholder();
        // widget 的 inputEl 可能在首次绘制后才创建，延迟再设一次
        setTimeout(setCustomParaPlaceholder, 100);
        setTimeout(setCustomParaPlaceholder, 500);
      } catch (e) {
        console.error("Openkit JsonExtractor index-control:", e);
      }
      return r;
    };
  },
});

// 全局语言切换联动：刷新所有 JsonExtractor 节点索引控制的显示名。
window.addEventListener("openkit:langchange", () => {
  try {
    (app.graph?._nodes || []).forEach((n) => {
      if (n?.type !== "JsonExtractor") return;
      if (typeof n._mmxIdxLocalize === "function") n._mmxIdxLocalize();
    });
    OKT.applyNodeTitles();
  } catch (e) { /* one node failing must not stop the rest */ }
});
