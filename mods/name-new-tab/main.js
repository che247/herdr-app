import { View, div } from "gpui-kit";
import { InputState, Input, v_flex } from "gpui-base";
import { focused, props, closeOverlay, theme, run } from "herdr";

export default class NameNewTab extends View {
  init(_props, cx) {
    const current = focused();
    this.args = {...(current?.space ? {space: current.space} : {}), ...(current?.cwd ? {folder: current.cwd} : {}), ...(props()?.args ?? {})};
    this.input = InputState.new({value: this.args.name ?? "", placeholder: "Tab name"});
    if (this.args.name) this.input.set_selected_range({start: 0, end: this.args.name.length});
    this.input.on("submit", () => this.save());
    this.input.focus();
    this.handle = cx.focus_handle();
    this.submitted = false;
  }
  save() {
    const name = this.input.value().trim();
    if (!name || this.submitted) return;
    this.submitted = true;
    closeOverlay(props().overlay);
    run("tab.new", {...this.args, name});
  }
  render() {
    const t = theme();
    return v_flex().id("name-new-tab").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
      })
      .size_full().p(14).gap(12).bg(t.popover).text_color(t.foreground)
      .child(div().text_size(14).font_semibold().child("Name your new tab"))
      .child(Input.new(this.input).h(36).px(8).rounded(6).border_1().border_color(t.accent).bg(t.background).text_size(13))
      .child(div().text_size(11).text_color(t.dim).child("Enter creates the tab · Esc cancels"))
      .child(div().id("create-tab").h(28).px(10).rounded(6).bg(t.raised).cursor_pointer().on_click(() => this.save()).child("Create tab"));
  }
}
