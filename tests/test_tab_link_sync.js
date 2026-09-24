/* 单元测试：web/js/tab_link_sync.js 纯函数
 *
 * 用 Node.js 运行（无需浏览器）：node tests/test_tab_link_sync.js
 * 通过前注入 globalThis.app（模拟 LiteGraph graph），mock 节点对象。
 * 纯函数模块不注册事件、不依赖 DOM。
 */
import assert from "node:assert";
import {
  getTabSwitcher,
  findTabIndexOutputSlot,
  broadcastTabIndex,
} from "../web/js/tab_link_sync.js";

/* ---------- mock 基础设施 ---------- */
const nodesById = new Map();
let linkSeq = 1;

globalThis.app = {
  graph: {
    links: {},
    getNodeById: (id) => nodesById.get(id),
  },
};

/** 记录每次切换收到的索引，模拟下游节点真实的越界行为。
 * P1修复: 真实 MediaLoader.setCurTab(media_loader.js:2968) 是
 *   if(i<0||i>=length) return —— 越界时不改变当前页，而非钳到末页。
 * 此处 mock 维护内部当前页(初始0)，越界直接 return 不入队，与真实代码一致。 */
function makeLoaderNode(id, numTabs) {
  const node = {
    id,
    type: "MediaLoader",
    outputs: [{ name: "指定素材", links: [] }, { name: "Tab索引", links: [] }],
    received: [],
    _curTab: 0, // 初始当前页
  };
  node._mmlTabsManager = {
    setCurTab: (i) => {
      if (i < 0 || i >= numTabs) return; // 越界不动，匹配真实实现
      node._curTab = i;
      node.received.push(i);
    },
  };
  nodesById.set(id, node);
  return node;
}

function makeTsmNode(id, numTabs) {
  const node = {
    id,
    type: "TabStringMultiline",
    outputs: [{ name: "文本", links: [] }, { name: "Tab索引", links: [] }],
    received: [],
    _curTab: 0, // 初始当前页
  };
  node._tsmSetCurTab = (i) => {
    if (i < 0 || i >= numTabs) return; // 越界不动，匹配真实实现
    node._curTab = i;
    node.received.push(i);
  };
  nodesById.set(id, node);
  return node;
}

function makePlainNode(id) {
  const node = {
    id,
    type: "PrimitiveNode",
    outputs: [{ name: "out", links: [] }],
  };
  nodesById.set(id, node);
  return node;
}

/** 把 src 节点 srcSlot 输出连线连到 dst 节点（任一输入端口即可）。 */
function wire(src, srcSlot, dst) {
  const linkId = linkSeq++;
  src.outputs[srcSlot].links.push(linkId);
  globalThis.app.graph.links[linkId] = { target_id: dst.id };
}

/* 捕获 console.warn */
const warns = [];
const origWarn = console.warn;
console.warn = (...args) => warns.push(args.join(" "));

let passed = 0;
function test(name, fn) {
  warns.length = 0;
  fn();
  passed++;
  origWarn(`  ✓ ${name}`);
}

/* ---------- getTabSwitcher ---------- */
{
  const loader = makeLoaderNode(100, 3);
  const tsm = makeTsmNode(101, 4);
  const plain = makePlainNode(102);

  test("getTabSwitcher 识别 MediaLoader（_mmlTabsManager）", () => {
    const sw = getTabSwitcher(loader);
    assert.strictEqual(typeof sw, "function");
    sw(2);
    assert.deepStrictEqual(loader.received, [2]);
  });

  test("getTabSwitcher 识别 TabStringMultiline（_tsmSetCurTab）", () => {
    const sw = getTabSwitcher(tsm);
    assert.strictEqual(typeof sw, "function");
    sw(1);
    assert.deepStrictEqual(tsm.received, [1]);
  });

  test("getTabSwitcher 对普通节点返回 null", () => {
    assert.strictEqual(getTabSwitcher(plain), null);
  });
}

/* ---------- findTabIndexOutputSlot ---------- */
{
  test("findTabIndexOutputSlot 有 Tab索引 输出返回其 slot", () => {
    const tsm = makeTsmNode(200, 2);
    assert.strictEqual(findTabIndexOutputSlot(tsm), 1);
  });

  test("findTabIndexOutputSlot 无 Tab索引 输出返回 -1", () => {
    const plain = makePlainNode(201);
    assert.strictEqual(findTabIndexOutputSlot(plain), -1);
  });

  test("findTabIndexOutputSlot 无 outputs 返回 -1", () => {
    assert.strictEqual(findTabIndexOutputSlot({}), -1);
  });
}

/* ---------- broadcastTabIndex ---------- */
{
  test("单下游：切换成功", () => {
    const a = makeLoaderNode(300, 3);
    const b = makeTsmNode(301, 3);
    wire(a, 1, b);
    broadcastTabIndex(a, 1, 2, new Set([a.id]));
    assert.deepStrictEqual(b.received, [2]);
  });

  test("多下游扇出：全部切换", () => {
    const a = makeLoaderNode(310, 3);
    const b = makeTsmNode(311, 3);
    const c = makeTsmNode(312, 3);
    wire(a, 1, b);
    wire(a, 1, c);
    broadcastTabIndex(a, 1, 1, new Set([a.id]));
    assert.deepStrictEqual(b.received, [1]);
    assert.deepStrictEqual(c.received, [1]);
  });

  test("链式 A→B→C：C 也被切换", () => {
    const a = makeLoaderNode(320, 3);
    const b = makeTsmNode(321, 3);
    const c = makeTsmNode(322, 3);
    wire(a, 1, b);
    wire(b, 1, c); // B 自身的 Tab索引 输出继续连 C
    broadcastTabIndex(a, 1, 2, new Set([a.id]));
    assert.deepStrictEqual(b.received, [2]);
    assert.deepStrictEqual(c.received, [2]);
  });

  test("环路 A→B→A：不无限递归", () => {
    const a = makeLoaderNode(330, 3);
    const b = makeTsmNode(331, 3);
    wire(a, 1, b);
    wire(b, 1, a); // B 输出回连 A，构成环
    // 不应抛异常/栈溢出
    broadcastTabIndex(a, 1, 1, new Set([a.id]));
    assert.deepStrictEqual(b.received, [1]);
    // A 在 visited 中，不会被再次切换
    assert.deepStrictEqual(a.received, []);
  });

  test("非多 Tab 下游：跳过并 warn", () => {
    const a = makeLoaderNode(340, 3);
    const p = makePlainNode(341);
    wire(a, 1, p);
    broadcastTabIndex(a, 1, 1, new Set([a.id]));
    assert.ok(warns.some((w) => w.includes("no tab switcher")), "应 warn 无 switcher");
  });

  test("无下游：无操作不报错", () => {
    const a = makeLoaderNode(350, 3);
    broadcastTabIndex(a, 1, 1, new Set([a.id]));
    assert.strictEqual(warns.length, 0);
  });

  test("索引越界：下游忽略不动(保持初始页)", () => {
    const a = makeLoaderNode(360, 5);
    const small = makeTsmNode(361, 2); // 仅 2 个 tab，有效索引 0/1
    wire(a, 1, small);
    broadcastTabIndex(a, 1, 99, new Set([a.id]));
    // 真实 setCurTab 越界(i>=length)直接 return：不切换、不入队，当前页保持初始 0
    assert.deepStrictEqual(small.received, []); // 未发生任何切换
    assert.strictEqual(small._curTab, 0);       // 仍停在初始页
  });

  test("下游切换抛异常：warn 后继续", () => {
    const a = makeLoaderNode(370, 3);
    const bad = makeTsmNode(371, 3);
    const good = makeTsmNode(372, 3);
    bad._tsmSetCurTab = () => { throw new Error("boom"); };
    wire(a, 1, bad);
    wire(a, 1, good);
    broadcastTabIndex(a, 1, 1, new Set([a.id]));
    assert.ok(warns.some((w) => w.includes("failed to switch")), "应 warn 切换失败");
    assert.deepStrictEqual(good.received, [1]); // 其余下游不受影响
  });
}

console.warn = origWarn;
origWarn(`\n全部通过：${passed} 个用例。`);
