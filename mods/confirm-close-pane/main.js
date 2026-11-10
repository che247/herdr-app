import { View, div } from "gpui-kit";
import { run, props, closeOverlay, theme, focused } from "herdr";

export default class ConfirmClosePane extends View {
  init(_props, cx) {
    // Capture the pane when opening; never close a later selection.
    this.pane = focused()?.pane;
    this.handle = cx.focus_handle();
    this.handle.focus();
  }
  render(cx) {
    const t = theme();
    return div().id("confirm-close-pane").track_focus(this.handle)
      .on_key_down((e, cx) => {
        cx.stop_propagation();
        const m = e.modifiers;
        if (e.key === "escape" || (!m.control && !m.alt && !m.platform && e.key.toLowerCase() === "n")) {
          closeOverlay(props().overlay);
        } else if (!m.control && !m.alt && !m.platform && e.key.toLowerCase() === "y" && !e.is_held) {
          const pane = this.pane;
          closeOverlay(props().overlay);
          if (pane) run("pane.close", {pane});
        }
      })
      .size_full().p(10).bg(t.popover).text_color(t.foreground).text_size(14)
      .child(this.pane ? "Kill this pane and its running program? (y/n)" : "No pane selected. Press n or Esc to cancel.");
  }
}
