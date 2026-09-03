/* Openkit · JsonExtractor 索引控制下拉（中文显示名）
 *
 * 后端在「索引」INT 的 input spec 里声明了 control_after_generate 字段，
 * ComfyUI 新前端会自动为「索引」创建一个 value-control 下拉
 * （选项 fixed / increment / decrement / randomize，每次生成前自动处理索引）。
 * 该下拉默认显示英文名 "fixed"（spec 字段值即控件名）。
 * 本扩展只做一件事：把该下拉的名字（label）显示为中文「索引控制」，
 * 选项保持官方英文值，逻辑完全由 ComfyUI 前端官方机制驱动。
 */
import { app } from "../../../scripts/app.js";

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
          controlWidget.name = "索引控制";
          controlWidget.label = "索引控制";
          if (!controlWidget.tooltip) {
            controlWidget.tooltip =
              "控制「索引」在每次生成前的变化方式：randomize=随机生成；fixed=固定不变；increment=每次+1；decrement=每次-1。";
          }
        }
      } catch (e) {
        console.error("Openkit JsonExtractor index-control:", e);
      }
      return r;
    };
  },
});
