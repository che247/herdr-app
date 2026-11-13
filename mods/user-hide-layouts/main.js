import { View, div } from "gpui-kit";
import { appHome } from "herdr";
import { exists, unlink } from "fs/promises";

// Herdr rewrites its shipped layouts on every start; remove them again so
// only personal layouts show in the layout list.
const FILES = [
  "layouts/main.json",
  "layouts/terminals.json",
  "layouts/win98.json",
  "layouts/win98.svg",
  "layouts/.state/main.json",
  "layouts/.state/terminals.json",
  "layouts/.state/win98.json",
];

export default class HideLayouts extends View {
  init(_props, cx) {
    cx.spawn(async () => {
      const home = appHome();
      for (const file of FILES) {
        const path = `${home}/${file}`;
        try {
          if (await exists(path)) await unlink(path);
        } catch (e) {
          console.log(`user-hide-layouts: could not remove ${file}: ${e}`);
        }
      }
    });
  }

  render() {
    return div().w(0).h(0);
  }
}
