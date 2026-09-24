/* TabLinkSync — Tab 索引联动切换共享纯函数模块
 *
 * 沿「Tab索引」输出端口的连线，把触发节点当前的 Tab 索引广播到所有下游
 * 多 Tab 节点，驱动其页签切换。本模块为纯函数集合：不注册任何事件监听、
 * 不持有状态，副作用仅限于调用下游节点的 tab 切换方法。
 *
 * 为避免与 media_loader.js 形成 ES module 循环引用，这里内置一份与
 * media_loader.outputTargets 等价的 outputTargets 实现（不依赖其 export）。
 */

/** 返回连到某个输出端口的所有下游节点（渲染器无关，兜底走 graph.links）。 */
function outputTargets(node, slot) {
  try {
    const direct = node.getOutputNodes?.(slot);
    if (Array.isArray(direct) && direct.length) return direct;
  } catch (e) { /* fall through to the link table */ }
  const out = [];
  try {
    for (const id of node.outputs?.[slot]?.links || []) {
      const link = app.graph.links?.[id];
      const target = link && app.graph.getNodeById?.(link.target_id);
      if (target) out.push(target);
    }
  } catch (e) { /* nothing wired */ }
  return out;
}

/** 鸭子类型识别节点的 tab 切换函数；不是多 Tab 节点时返回 null。 */
export function getTabSwitcher(node) {
  if (node._mmlTabsManager && typeof node._mmlTabsManager.setCurTab === "function")
    return (i) => node._mmlTabsManager.setCurTab(i);
  if (typeof node._tsmSetCurTab === "function")
    return (i) => node._tsmSetCurTab(i);
  return null;
}

/** 查找节点的「Tab索引」输出端口 slot；没有则返回 -1。 */
export function findTabIndexOutputSlot(node) {
  const outs = node.outputs || [];
  for (let i = 0; i < outs.length; i++) {
    if (outs[i] && outs[i].name === "Tab索引") return i;
  }
  return -1;
}

/**
 * 沿 Tab索引 输出端口连线广播 tab 索引到所有下游多 Tab 节点。
 * @param {object} sourceNode  触发源节点
 * @param {number} sourceSlot   源节点 Tab索引 输出端口索引
 * @param {number} index        要传播的 tab 索引（越界由下游自行钳制）
 * @param {Set<number>} [visited] 已处理节点 id 集合（防环路）
 */
export function broadcastTabIndex(sourceNode, sourceSlot, index, visited) {
  if (!sourceNode || sourceSlot < 0) return;
  visited = visited || new Set();
  const targets = outputTargets(sourceNode, sourceSlot);
  for (const target of targets) {
    if (!target || visited.has(target.id)) continue;
    visited.add(target.id);
    const switcher = getTabSwitcher(target);
    if (!switcher) {
      console.warn(`[Openkit] tab link: node #${target.id} (${target.type}) has no tab switcher, skipped`);
      continue;
    }
    try {
      switcher(index); // 下游自行钳制越界
    } catch (e) {
      console.warn(`[Openkit] tab link: failed to switch node #${target.id}:`, e);
      continue;
    }
    // 链式传播：若下游也有 Tab索引 输出，继续广播
    const nextSlot = findTabIndexOutputSlot(target);
    if (nextSlot >= 0) {
      broadcastTabIndex(target, nextSlot, index, visited);
    }
  }
}
