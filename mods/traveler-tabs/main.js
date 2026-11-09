// Locally adapted: preserve Ctrl-B bindings, last-tab history, and wider tabs.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, panes, run, openOverlay, theme, window, shared, layout, settings, appHome, readTextFile, focused, nextCommand, setShared } from "herdr";
import { assignJobs, jobIn, portraitPath, tabNames } from "./lib.js";



function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

import { verifyActivation } from "./install-verification.js";

import { checkPaneUpdate } from "./check-pane-update.js";
export default class Tabs extends View {
  init(_props, cx) {
    checkPaneUpdate(cx);
    verifyActivation(cx);
    this.handle = cx.focus_handle();
    this.history = {};
    this.armed = false;
    this.confirming = false;
    this.observeTabs();
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "prefix") this.arm(cx);
      }
    });
    const pending = shared("user-prefix.pending");
    if (pending) {
      setShared("user-prefix.pending", null);
      this.arm(cx, pending);
    }
    this.pressed = null;
    this.jobs = {};
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${appHome()}/mods/traveler-agents/jobs.json`).catch(() => null);
      try { const parsed = JSON.parse(text); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) this.jobs = parsed; } catch {}
      cx.notify();
    });
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
  }

  // Observe all tab changes, including mouse clicks and existing shortcuts.
  observeTabs() {
    for (const space of spaces()) {
      const current = space.tabs.find(tab => tab.active)?.id;
      if (!current) continue;
      const record = this.history[space.id] ?? { current, previous: null };
      if (record.current !== current) {
        if (space.tabs.some(tab => tab.id === record.current)) record.previous = record.current;
        record.current = current;
      }
      if (record.previous === current || !space.tabs.some(tab => tab.id === record.previous)) record.previous = null;
      this.history[space.id] = record;
    }
  }

  arm(cx, target) {
    if (this.armed) { this.release(cx); return; }
    this.observeTabs();
    this.target = target ?? focused();
    this.tabNumber = "";
    this.numberAttempt = null;
    this.armed = true;
    this.confirming = false;
    this.handle.focus();
    cx.notify();
  }

  release(cx) {
    this.armed = false;
    this.numberAttempt = null;
    this.confirming = false;
    const f = this.target;
    // Return keyboard focus before splitting, opening a prompt, or selecting a tab.
    if (f?.pane && panes().some(p => p.pane === f.pane)) run("pane.focus", { pane: f.pane });
    else if (f?.terminal) run("pane.focus", { terminal: f.terminal });
    cx.notify();
  }

  prefixKey(e, cx) {
    if (!this.armed) return;
    cx.stop_propagation();
    if (e.is_held) return;
    if (e.keystroke === "ctrl-b" || e.key === "escape") { this.release(cx); return; }
    if (e.keystroke === "ctrl-t") { this.prefixAction("ctrl-t", cx); return; }
    if (e.modifiers.control || e.modifiers.alt || e.modifiers.platform) return;
    this.prefixAction(e.key_char || (e.modifiers.shift ? e.key.toUpperCase() : e.key), cx);
  }

  prefixAction(key, cx) {
    const f = this.target;
    if (/^[0-9]$/.test(key)) {
      this.tabNumber += key;
      const tabs = spaces().find(s => s.id === f?.space)?.tabs ?? [];
      const matches = tabs.map((_, i) => String(i + 1)).filter(n => n.startsWith(this.tabNumber));
      if (!matches.length) { this.release(cx); return; }
      // Single digits are immediate unless they also begin a larger tab number.
      if (matches.length === 1 && matches[0] === this.tabNumber) { this.selectNumber(cx); return; }
      const attempt = this.numberAttempt = {};
      cx.timer.after(650, cx => {
        if (this.armed && this.numberAttempt === attempt) this.selectNumber(cx);
      });
      return;
    }
    if (this.tabNumber) {
      if (key === "enter") this.selectNumber(cx);
      else this.release(cx);
      return;
    }
    if (key === "x" && f?.pane) {
      this.release(cx);
      openOverlay({ mod: "user-pane-confirm", kind: "dialog", width: 420, height: 190,
        props: { title: "Close pane?", detail: "This ends the terminal in this pane. Y confirms; N or Escape cancels.", command: { name: "pane.close", args: { pane: f.pane } } } });
      return;
    }
    if (key === "ctrl-t" && f?.pane) {
      this.release(cx);
      run("pane.zoom", { pane: f.pane });
      return;
    }
    this.release(cx);
    if (key === "c") run("tab.new", f?.space ? { space: f.space } : {});
    else if (key === "n" || key === "p") run(key === "n" ? "tab.next" : "tab.prev");
    else if (key === "l") {
      const previous = this.history[f?.space]?.previous;
      const space = spaces().find(s => s.id === f?.space);
      if (previous && space?.tabs.some(tab => tab.id === previous)) run("tab.select", { id: previous });
    }
    else if ((key === "v" || key === "h") && f?.pane) run("pane.split", { pane: f.pane, direction: key === "v" ? "right" : "down" });
    else if (key === "T" && f?.tab) run("tab.rename", { id: f.tab });
    else if (key === "P" && f?.pane) openOverlay({ mod: "user-pane-rename", kind: "dialog", width: 440, height: 210, props: { pane: f.pane, title: "Rename pane", value: shared("user.pane.names")?.[f.pane] ?? "", hint: "Leave empty to restore the automatic name." } });
    else if (key === "W" && f?.space) run("space.rename", { id: f.space });
    else if (key === "g") {
      const root = layout();
      if (find(root, "panel") && find(root, "panel-body") && find(root, "changes")) {
        const panel = find(root, "panel"), body = find(root, "panel-body");
        if (!panel.hidden && body.active === "changes") run("layout.hide", { id: "panel" });
        else {
          run("layout.select", { stack: "panel-body", child: "changes" });
          run("layout.show", { id: "panel" });
        }
      } else openOverlay({ mod: "changes", kind: "dialog", width: 0.85, height: 0.85 });
    }
  }

  selectNumber(cx) {
    const tab = spaces().find(s => s.id === this.target?.space)?.tabs[Number(this.tabNumber) - 1];
    this.release(cx);
    if (tab) run("tab.select", { id: tab.id });
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    this.observeTabs();
    const t = theme();
    // Whether this window has the system focus: gold underline and gold active badge only then.
    const focus = window()?.active !== false;
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const assigned = assignJobs(tabNames(spaces(), agents()), this.jobs);
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      const name = /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      const portrait = portraitPath(jobIn(c.name, assigned));
      return h_flex().id(`tab-${c.id}`).h(29).px(6).gap(0).items_center().flex_none().text_size(12.8)
        .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .child(div().flex_none().mr(6).px(4).text_size(10.5).font_weight(700)
          .text_color(c.active && focus ? t.accent_foreground : c.active ? t.foreground : t.accent).bg(c.active && focus ? t.accent : c.active ? t.raised : `${t.accent}1f`).child(String(i + 1)))
        .child(div().max_w(300).truncate().child(name))
        .when(c.zoomed, el => el.child(div().flex_none().ml(5).text_size(10).text_color(t.accent).child("ZOOM")));
    };
    const root = layout(), sidebar = find(root, "sidebar"), w = window();
    // Old saved rails and a dragged-narrow sidebar can be smaller than the window buttons.
    const lightsPadding = w?.platform === "macos" && w.titlebar === "none" && !w.fullscreen && root?.traffic_lights
      ? Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0))
      : 10;
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = ["files", "changes"];
    this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center()
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(image(icon).size(20).flex_none()).child(label);
    };
    return h_flex().id("traveler-tabs").track_focus(this.handle)
      .on_key_down((e, cx) => this.prefixKey(e, cx))
      .size_full().min_w(0).px(10).pl(lightsPadding).gap(3).items_center().bg(t.chrome).border_b(focus ? 2 : 1).border_color(focus ? t.accent : t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/traveler-tabs/win-min.svg").size(16) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/traveler-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/traveler-tabs/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close"))));
  }
}

