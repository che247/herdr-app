// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, panes, spaces, props, run, theme, home, shared } from "herdr";

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// An opaque blend of two #rrggbb colors, so the header never shows the pane background through it.
function mix(base, over, amount) {
  const ch = (c, i) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  if (!/^#[0-9a-f]{6}/i.test(base) || !/^#[0-9a-f]{6}/i.test(over)) return base;
  return "#" + [0, 1, 2].map(i => Math.round(ch(base, i) + (ch(over, i) - ch(base, i)) * amount).toString(16).padStart(2, "0")).join("");
}

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/pane/${icon}.svg`).size(14));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const agent = agents().find(a => a.address === p.terminal);
    const cache = shared("user.agent.metrics")?.[p.terminal];
    const space = spaces().find(s => s.tabs.some(tab => tab.id === p.tab));
    const tab = space?.tabs.find(tab => tab.id === p.tab);
    const isAgent = Boolean(agent || p.program?.agent || cache);
    const location = `${space?.name || agent?.space_name || "Space"}: ${tab?.name || agent?.tab_name || "Tab"}`;
    const model = cache?.model ? ` · ${cache.model} · ${cache.effort || "default"}` : "";
    const name = isAgent ? `${location}${model}` : shared("user.pane.names")?.[p.pane] || ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, t.dim);
    const st = p.status;
    const pane = p.pane;
    const on = p.focused;
    const blue = t.ansi12;
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      // Focused pane: a blue wash, blue edges and a blue name, so it stands out from the gold chrome (zoomed too).
      .bg(on ? mix(t.background, blue, 0.2) : t.background)
      .border_b(1)
      .border_color(on ? blue : t.border)
      .when(on, el => el.border_l(3))
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(isAgent ? 800 : 260).font_medium().text_color(on ? blue : t.foreground).child(name))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd)))
      .when(p.zoomed, el => el.child(div().flex_none().px(5).h(16).flex().items_center().border(1).border_color(on ? blue : t.border)
        .text_size(9.5).font_semibold().text_color(on ? blue : t.dim).child("ZOOMED")))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
