import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout } from "herdr";

const PIXEL = "PxPlus IBM VGA 8x16";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 340) : window()?.platform === "macos" ? 76 : 44 });
}

// A herding sheep, drawn pixel by pixel.
const SHEEP = [
  "....WWWW........",
  "..WWWWWWWW...KK.",
  ".WWWSWWWWWW.KKKK",
  ".WWWWWWWWWWKKEKK",
  ".WWWWWWSWWWKKKKK",
  "..WWWWWWWWW..KK.",
  "...K..K..K..K...",
  "...K..K..K..K...",
];
const SHEEP_COLORS = { W: "#f4f4f4", S: "#c2d3e0", K: "#566c86", E: "#ffcd75" };

export function pixelArt(rows, colors, scale) {
  const cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const c = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === c) end++;
      if (colors[c]) cells.push(div().absolute().left(x * scale).top(y * scale).w((end - x) * scale).h(scale).bg(colors[c]));
      x = end;
    }
  });
  return div().relative().flex_none().w(rows[0].length * scale).h(rows.length * scale).children(cells);
}

export default class PixelChrome extends View {
  button(id, label, action, tip) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(4).text_color(t.muted)
      .hover(s => s.bg(t.hover).text_color(t.accent)).tooltip(tip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    if (props()?.footer) {
      const row = (id, icon, label, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(4)
        .when(collapsed, el => el.relative().w(32).px(0).justify_center().tooltip(label))
        .text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.accent)).cursor_pointer()
        .on_click(action).child(svg(`mods/workspace-chrome/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(div().font_family(PIXEL).text_size(16).line_height("16px").child(label)));
      const ready = div().size(6).bg(t.accent).loop("opacity", { from: 0.3, to: 1, period: 900 });
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(6).pb(8).gap(2)
        .when(collapsed, el => el.px(0).items_center())
        .child(row("settings", "settings", "SETTINGS", () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(collapsed ? ready.absolute().top(5).right(6) : ready)))
        .child(row("machine", "plus", "ADD MACHINE", () => run("mod.open", { name: "machine-add" })));
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center()
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(10).items_center()
        .child(div().child(pixelArt(SHEEP, SHEEP_COLORS, 2)).loop("top", { from: 0, to: -2, period: 1400 }))
        .child(div().font_family(PIXEL).text_size(16).line_height("16px").text_color(t.accent).child("HERDR"))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/workspace-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }), "Search")))
      // On the macOS rail the traffic lights fill the row; the agents list's arrow unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/workspace-chrome/sidebar.svg").size(15), toggleSidebar, "Toggle sidebar")));
  }
}
