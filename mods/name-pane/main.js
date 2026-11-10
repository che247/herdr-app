import { View, div } from "gpui-kit";
import { InputState, Input, v_flex } from "gpui-base";
import { focused, props, shared, setShared, closeOverlay, theme } from "herdr";

export default class NamePane extends View {
  init(_props, cx) {
    this.pane = props()?.pane ?? focused()?.pane;
    const name = (shared("pane.names") ?? {})[this.pane] ?? "";
    this.input = InputState.new({value: name, placeholder: "Pane name"});
    if (name) this.input.set_selected_range({start: 0, end: name.length});
    this.input.on("submit", () => this.save());
    this.input.focus();
    this.handle = cx.focus_handle();
  }
  save() {
    if (this.pane) {
      const names = {...(shared("pane.names") ?? {})};
      const name = this.input.value().trim();
      if (name) names[this.pane] = name;
      else delete names[this.pane];
      setShared("pane.names", names);
    }
    closeOverlay(props().overlay);
  }
  render() {
    const t = theme();
    return v_flex().id("name-pane").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
      })
      .size_full().p(14).gap(12).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(14).font_semibold().child("Name pane"))
      .child(Input.new(this.input).h(36).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background).text_size(13))
      .child(div().text_size(11).text_color(t.dim).child("Enter saves · Esc cancels · Empty restores automatic title"))
      .child(div().id("save-name").h(28).px(10).rounded(6).bg(t.raised).cursor_pointer().on_click(() => this.save()).child("Save"));
  }
}
