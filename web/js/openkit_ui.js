/* Openkit Unified UI — shared design tokens & base component styles.
 *
 * Single source of truth for Openkit's node-panel look:
 *   - Inherits ComfyUI's native dark palette where a theme variable exists
 *     (falling back to Openkit's own values when it does not), so Openkit
 *     panels track the user's ComfyUI theme instead of fighting it.
 *   - Applies the original "Lite Design" signature: neutral dark surfaces,
 *     an amber accent (#b08d2e family), 6px radius, 150ms feedback, hairline
 *     borders, semantic status colors. The theme should feel invisible —
 *     content first, chrome second.
 *
 * Load exactly once (idempotent). Each node front-end imports this module
 * and calls injectOpenkitUI() during onNodeCreated; its CSS then uses the
 * var(--ok-*) tokens below.
 */
export function injectOpenkitUI() {
  if (window.__OK_UI_INJECTED__) return;
  window.__OK_UI_INJECTED__ = true;

  const style = document.createElement("style");
  style.id = "openkit-ui-tokens";
  style.textContent = `
.okt-root{
  /* ---- surface & text (ComfyUI-native fallbacks) ---- */
  --ok-bg:      var(--bg-color,       #191c22);
  --ok-panel:   var(--comfy-menu-bg,  #141820);
  --ok-panel-2: #12151b;
  --ok-line:    #2a2f3a;
  --ok-line-2:  #2e3440;
  --ok-text:    var(--fg-color,       #d7dbe2);
  --ok-dim:     #8a93a3;
  --ok-faint:   #6b7484;
  /* ---- Lite Design accent ---- */
  --ok-accent:   #b08d2e;   /* amber — Openkit signature */
  --ok-accent-2: #e0a94c;
  --ok-accent-bg:#6d5527;   /* picture border / active fills */
  /* ---- media semantic colors ---- */
  --ok-video:  #4cc3e0;
  --ok-audio:  #b48ce8;
  /* ---- status ---- */
  --ok-ok:   #7ec87e;
  --ok-warn: #e0a94c;
  --ok-err:  #f07070;
  /* ---- geometry / motion ---- */
  --ok-radius: 6px;
  --ok-transition: 150ms ease;
  --ok-font: system-ui, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  --ok-mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
}
.okt-root, .okt-root *{ box-sizing:border-box; }
.okt-root{ font-family:var(--ok-font); color:var(--ok-text); font-size:12px; }
.okt-root ::-webkit-scrollbar{ width:8px; height:8px; }
.okt-root ::-webkit-scrollbar-thumb{ background:#333b4d; border-radius:4px; }
.okt-root ::-webkit-scrollbar-thumb:hover{ background:#454f63; }
.okt-root ::-webkit-scrollbar-track{ background:transparent; }
/* ---- shared button ---- */
.okt-btn{
  background:#2b3140; border:1px solid #3a4252; color:var(--ok-text);
  border-radius:var(--ok-radius); padding:4px 10px; font-size:11px;
  font-family:var(--ok-font); cursor:pointer; line-height:1.2;
  transition:background var(--ok-transition), border-color var(--ok-transition),
             color var(--ok-transition);
}
.okt-btn:hover{ background:#333b4d; }
.okt-btn.sm{ padding:3px 9px; font-size:10px; }
.okt-btn.danger{ border-color:#7a3a3a; color:#f0a0a0; }
.okt-btn.danger:hover{ background:#3a2020; }
.okt-btn:focus-visible{ outline:1px solid var(--ok-accent-2); outline-offset:1px; }
/* ---- shared inputs / selects ---- */
.okt-input, .okt-select{
  background:#12151b; color:var(--ok-text); border:1px solid var(--ok-line-2);
  border-radius:var(--ok-radius); padding:3px 7px; font-size:11px;
  font-family:var(--ok-font); transition:border-color var(--ok-transition);
}
.okt-input:focus, .okt-select:focus{ outline:none; border-color:var(--ok-accent-2); }
.okt-select option{ background:#1c212b; color:var(--ok-text); }
/* ---- shared section label ---- */
.okt-sec{
  flex:0 0 auto; display:flex; align-items:center; gap:6px; font-size:10px;
  text-transform:uppercase; letter-spacing:.07em; color:var(--ok-faint);
}
.okt-sec span{ margin-left:auto; text-transform:none; letter-spacing:0;
  color:#5c6472; font-family:var(--ok-mono); }
`;

  (document.head || document.documentElement).appendChild(style);
}

/** Tag a freshly created DOM subtree with the .okt-root surface class so the
 *  tokens apply (CSS variables cascade through the panel element). */
export function oktSurface(el) {
  if (el) el.classList.add("okt-root");
  return el;
}
