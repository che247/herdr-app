// A game HUD along the bottom: where you are, the party's states, the gold spent,
// a blinking "press start" for the command palette, and the clock.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, shared } from "herdr";

const PIXEL = "PxPlus IBM VGA 8x16";
const ORDER = [["blocked", "NEED YOU"], ["working", "WORKING"], ["done", "DONE"], ["idle", "IDLE"]];

export default class PixelStatus extends View {
  init(_props, cx) {
    this.clock = this.now();
    // Data, not animation: the minute only changes once a minute.
    cx.timer.every(15000, (cx) => {
      const next = this.now();
      if (next !== this.clock) { this.clock = next; cx.notify(); }
    });
  }

  now() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  hint() {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "CTRL+", ctrl: mac ? "⌃" : "CTRL+", shift: mac ? "⇧" : "SHIFT+", alt: mac ? "⌥" : "ALT+", option: mac ? "⌥" : "ALT+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    return parts ? parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("") : null;
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const gold = shared("pixel.party.gold");
    const text = (s, c) => div().flex_none().font_family(PIXEL).text_size(16).line_height("16px").text_color(c).child(s);
    const key = this.hint();
    return h_flex().size_full().px(14).gap(18).items_center().bg(t.chrome).border_t(1).border_color(t.border)
      .child(h_flex().gap(6).items_center().text_color(t.muted)
        .child(svg(`mods/workspace-chrome/${space?.machine ? "server" : "monitor"}.svg`).size(13))
        .child(text((space?.machine ?? "This computer").toUpperCase(), t.muted)))
      .when(Boolean(space?.branch), el => el.child(h_flex().gap(6).items_center().text_color(t.dim)
        .child(svg("mods/workspace-chrome/branch.svg").size(13)).child(text(space.branch, t.dim))))
      .child(h_flex().gap(12).items_center()
        .when(list.length === 0, el => el.child(text("NO PARTY", t.dim)))
        .children(ORDER.map(([status, word]) => {
          const n = list.filter(a => a.status === status).length;
          if (!n) return null;
          const color = t[status] ?? t.dim;
          let chip = h_flex().gap(5).items_center().child(div().size(7).bg(color)).child(text(`${n} ${word}`, color));
          if (status === "blocked") chip = chip.loop("opacity", { from: 0.4, to: 1, period: 700 });
          return chip;
        }).filter(Boolean)))
      .when(typeof gold === "number" && gold > 0, el => el.child(h_flex().gap(5).items_center()
        .tooltip("Spent by the agents shown, from their usage reports")
        .child(div().size(8).bg("#ffcd75").border_1().border_color("#c98a2a"))
        .child(text(`$${gold.toFixed(2)}`, "#ffcd75"))))
      .child(div().flex_1())
      .when(Boolean(key), el => el.child(div().id("palette").cursor_pointer().on_click(() => run("app.palette"))
        .child(text(`PRESS ${key}`, t.dim).loop("opacity", { from: 0.35, to: 1, period: 1600 }))))
      .child(text(this.clock, t.muted));
  }
}
