import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

// The layout's pixel font (mods/pixel-agents/fonts), crisp at 16px.
export const PIXEL = "PxPlus IBM VGA 8x16";

export function quotaWindows(snapshot) {
  return [snapshot?.limits?.primary, snapshot?.limits?.secondary]
    .filter(w => w && typeof w.used_percent === "number" && Number.isFinite(w.used_percent))
    .map(w => ({
      label: w.window_minutes === 300 ? "5h" : w.window_minutes === 10080 ? "Week" : `${w.window_minutes}m`,
      remaining: Math.max(0, Math.min(100, Math.round(100 - w.used_percent))),
      reset: w.resets_at ? new Date(w.resets_at * 1000).toLocaleString() : "Not reported",
      updated: snapshot.updated ?? "Unknown",
    }));
}

// A game-style meter: a short label, ten blocks, the value, an optional note.
export function meter(label, percent, color, t, tip, note) {
  const lit = Math.round(Math.max(0, Math.min(100, percent)) / 10);
  const text = (s, c) => div().flex_none().font_family(PIXEL).text_size(16).line_height("14px").text_color(c).child(s);
  let row = h_flex().h(14).gap(6).items_center()
    .child(text(label, color).w(24))
    .child(h_flex().flex_1().min_w(0).h(7).gap(2).children(
      Array.from({ length: 10 }, (_, i) => div().flex_1().h(7).bg(i < lit ? color : t.input)
        .when(i < lit, el => el.border_t(2).border_color("#ffffff38")))))
    .child(text(`${Math.round(percent)}%`, color).w(34).text_right())
    .when(Boolean(note), el => el.child(text(note, t.dim)));
  if (tip) row = row.tooltip(tip);
  return row;
}

// A pixel coin, for the money line.
export function coin() {
  return div().relative().size(10).flex_none()
    .child(div().absolute().left(2).top(0).w(6).h(10).bg("#c98a2a"))
    .child(div().absolute().left(0).top(2).w(10).h(6).bg("#c98a2a"))
    .child(div().absolute().left(2).top(1).w(6).h(8).bg("#ffcd75"))
    .child(div().absolute().left(1).top(2).w(8).h(6).bg("#ffcd75"))
    .child(div().absolute().left(4).top(2).w(2).h(6).bg("#c98a2a"));
}

export function quotaMeters(windows, t) {
  return v_flex().gap(4).children(windows.map(w => {
    const color = w.remaining <= 10 ? "#f28088" : w.remaining <= 25 ? "#f6b865" : "#6cddbb";
    return meter(w.label === "Week" ? "WK" : w.label.toUpperCase(), w.remaining, color, t,
      `Local Codex account quota · ${w.label}\n${w.remaining}% remaining · Resets: ${w.reset}\nSnapshot: ${w.updated}`);
  }));
}
