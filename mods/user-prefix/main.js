import { View, div } from "gpui-kit";
import { focused, setShared, run, props, closeOverlay } from "herdr";

// One-time activation of the personal layout. Later prefixes go straight
// to its tab bar through the layout:user-main key binding.
export default class ActivatePrefix extends View {
  init() {
    const overlay = props()?.overlay;
    if (!overlay) return;
    const target = focused();
    closeOverlay(overlay);
    setShared("user-prefix.pending", target ?? {});
    run("layout.switch", { name: "user-main" });
  }
  render() { return div().w(0).h(0); }
}
