import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";

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

export function quotaMeters(windows, t) {
  return v_flex().gap(3).children(windows.map(w => {
    const color = w.remaining <= 10 ? "#f28088" : w.remaining <= 25 ? "#f6b865" : "#6cddbb";
    return h_flex().gap(5).h(14).items_center()
      .tooltip(`Local Codex account quota · ${w.label}\n${w.remaining}% remaining · Resets: ${w.reset}\nSnapshot: ${w.updated}`)
      .child(div().w(30).flex_none().text_size(10).text_color(t.muted).child(w.label))
      .child(div().flex_1().min_w(0).h(6).rounded(3).bg(t.input)
        .child(div().w(`${w.remaining}%`).h(6).rounded(3).bg(color)))
      .child(div().w(32).flex_none().text_right().font_semibold().text_size(10).text_color(color).child(`${w.remaining}%`));
  }));
}
