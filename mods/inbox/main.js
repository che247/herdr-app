// Locally adapted: Windows Inbox commands and instance-owned paths.
// 收件匣：列出 appHome()/data/inbox/files 的檔案，點一下用 macOS 預設 App 開啟。
// 右鍵：複製到桌面（cp -n，不覆蓋）、丟到垃圾桶（/usr/bin/trash，可救回）；此外不寫檔、不連網，
// 檔名一律當文字顯示，exec 一律用參數陣列。
import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, exec, home, theme, watchFolder, window } from "herdr";
import {
  copyCommand, desktopCandidates, formatSize, isRegularFile, listCommand,
  openCommand, parseListing, statCommand, thumbSource, trashCommand,
} from "./lib.js";

import * as windows from "./windows.js";
const BADGE = { image: "Image", video: "Video", pdf: "PDF", text: "MD" };

function clockText(seconds) {
  const d = new Date(seconds * 1000);
  const two = (n) => `0${n}`.slice(-2);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export default class Inbox extends View {
  init(_props, cx) {
    this.inboxDir = appHome() + "/data/inbox/files";
    this.desktopDir = home() + "/Desktop";
    this.windows = window()?.platform === "windows";
    this.items = [];
    this.error = null;
    this.loading = true;
    this.notice = null;
    this.noticeOk = false;
    this.menuPath = null;
    cx.spawn(async (cx) => {
      const mkdir = this.windows ? windows.mkdirCommand(this.inboxDir) : { cmd: "/bin/mkdir", args: ["-p", this.inboxDir] };
      const made = await exec(mkdir.cmd, mkdir.args).catch(() => null);
      if (!made || made.code !== 0) {
        this.loading = false;
        this.error = `Cannot create the inbox folder: ${this.inboxDir}`;
        cx.notify();
        return;
      }
      await this.load(cx);
      for (;;) {
        try {
          await watchFolder(this.inboxDir);
        } catch {
          this.error = "Cannot watch the inbox folder";
          cx.notify();
          return;
        }
        await this.load(cx);
      }
    });
  }

  async load(cx) {
    const listed = (this.windows ? windows.listCommand : listCommand)(this.inboxDir);
    const result = await exec(listed.cmd, listed.args).catch(() => null);
    if (!result || result.code !== 0) {
      this.items = [];
      this.error = `Cannot read the inbox: ${this.inboxDir}`;
    } else {
      this.items = (this.windows ? windows.parseListing : parseListing)(result.stdout, this.inboxDir);
      this.error = null;
    }
    this.loading = false;
    cx.notify();
  }

  // 動手前一律複查：還是收件匣裡的一般檔案（不是符號連結）。
  async stillRegular(item) {
    const stat = (this.windows ? windows.statCommand : statCommand)(item.path);
    const checked = await exec(stat.cmd, stat.args).catch(() => null);
    return Boolean(checked && checked.code === 0 && isRegularFile(checked.stdout));
  }

  say(cx, text, ok = false) {
    this.notice = text;
    this.noticeOk = ok;
    cx.notify();
  }

  // 點一列：先確認還是收件匣裡的一般檔案，再交給 open。
  launch(item, cx) {
    this.menuPath = null;
    cx.spawn(async (cx) => {
      const command = (await this.stillRegular(item)) ? (this.windows ? windows.openCommand : openCommand)(item.path, this.inboxDir) : null;
      if (!command) return this.say(cx, `Cannot open: ${item.name}`);
      const opened = await exec(command.cmd, command.args).catch(() => null);
      if (opened && opened.code === 0) {
        this.notice = null;
        cx.notify();
      } else {
        this.say(cx, `Cannot open: ${item.name}`);
      }
    });
  }

  // 複製到桌面：原名先試，撞名就換「 2」「 3」…，cp -n 保證不蓋掉桌面上的檔案。
  copyToDesktop(item, cx) {
    this.menuPath = null;
    cx.spawn(async (cx) => {
      if (!(await this.stillRegular(item))) return this.say(cx, `Cannot copy: ${item.name}`);
      for (const name of desktopCandidates(item.name)) {
        const command = (this.windows ? windows.copyCommand : copyCommand)(item.path, this.inboxDir, this.desktopDir, name);
        if (!command) break;
        const copied = await exec(command.cmd, command.args).catch(() => null);
        if (copied && copied.code === 0) return this.say(cx, `Copied to the Desktop: ${name}`, true);
        if (!copied) break;
      }
      this.say(cx, `Cannot copy to the Desktop: ${item.name}`);
    });
  }

  // 丟到垃圾桶：用 macOS 內建 trash，誤刪可以從垃圾桶救回。
  moveToTrash(item, cx) {
    this.menuPath = null;
    cx.spawn(async (cx) => {
      const command = (await this.stillRegular(item)) ? (this.windows ? windows.trashCommand : trashCommand)(item.path, this.inboxDir) : null;
      if (!command) return this.say(cx, `Cannot move to the Trash: ${item.name}`);
      const trashed = await exec(command.cmd, command.args).catch(() => null);
      if (trashed && trashed.code === 0) this.say(cx, `Moved to the Trash: ${item.name}`, true);
      else this.say(cx, `Cannot move to the Trash: ${item.name}`);
    });
  }

  menuItem(id, label, t, action) {
    return div()
      .id(id)
      .px(10)
      .py(6)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_event, cx) => action(cx))
      .child(label);
  }

  menu(item, index, t) {
    return v_flex()
      .id(`inbox-menu-${index}`)
      .flex_none()
      .mx(10)
      .mb(4)
      .py(4)
      .bg(t.raised)
      .border_1()
      .border_color(t.border)
      .text_size(12)
      .on_mouse_down_out((_event, cx) => {
        this.menuPath = null;
        cx.notify();
      })
      .child(this.menuItem(`inbox-copy-${index}`, "Copy to Desktop", t, (cx) => this.copyToDesktop(item, cx)))
      .child(this.menuItem(`inbox-trash-${index}`, "Move to Recycle Bin", t, (cx) => this.moveToTrash(item, cx)));
  }

  badge(item, t) {
    return h_flex()
      .w(40)
      .h(40)
      .flex_none()
      .items_center()
      .justify_center()
      .bg(t.raised)
      .child(div().text_size(11).text_color(t.dim).child(BADGE[item.kind] ?? "File"));
  }

  row(item, index, t) {
    const thumb = thumbSource(item);
    return h_flex()
      .id(`inbox-row-${index}`)
      .h(52)
      .flex_none()
      .px(10)
      .gap(10)
      .items_center()
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click((_event, cx) => this.launch(item, cx))
      .on_mouse_down("right", (_event, cx) => {
        this.menuPath = this.menuPath === item.path ? null : item.path;
        cx.notify();
      })
      .child(thumb ? image(thumb).w(40).h(40).flex_none() : this.badge(item, t))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .child(div().truncate().child(item.name))
          .child(
            div()
              .text_size(11)
              .text_color(t.dim)
              .child(`${formatSize(item.size)} · ${clockText(item.mtime)}`),
          ),
      );
  }

  render(cx) {
    const t = theme();
    const rows = this.items.flatMap((item, index) =>
      item.path === this.menuPath ? [this.row(item, index, t), this.menu(item, index, t)] : [this.row(item, index, t)]);
    return v_flex()
      .id("inbox")
      .size_full()
      .min_h(0)
      .bg(t.background)
      .text_color(t.foreground)
      .text_size(13)
      .child(
        h_flex()
          .h(38)
          .flex_none()
          .px(14)
          .gap(8)
          .items_center()
          .border_b(1)
          .border_color(t.border)
          .child(div().font_semibold().child("Inbox"))
          .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.dim).child(`${this.items.length} file${this.items.length === 1 ? "" : "s"}`)),
      )
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .overflow_y_scrollbar()
          .p(6)
          .children(rows)
          .when(Boolean(this.notice), (el) => el.child(div().p(8).text_size(12).text_color(this.noticeOk ? t.dim : t.blocked).child(this.notice)))
          .when(Boolean(this.error), (el) => el.child(div().p(8).text_size(12).text_color(t.blocked).child(this.error)))
          .when(!this.error && this.items.length === 0, (el) =>
            el
              .child(div().p(8).text_size(12).text_color(t.dim).child(this.loading ? "Loading…" : "The inbox is empty"))
              .child(div().px(8).text_size(11).text_color(t.muted).child(this.inboxDir)),
          ),
      );
  }
}
