// Locally adapted: initialize Herdr paths in init.
// Agent cards read metadata caches from statusLine and the OpenCode usage plugin.
import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, appHome, readTextFile, run, setAgentOrder, setShared, spaces, theme, watchFolder } from "herdr";
import { agentTitle, appLabel, assignJobs, cachePath, gauge, jobIn, parseCache, portraitPath, remoteCachePath, spritePath, tabNames } from "./lib.js";

const PIC = 40;
// Full-body sprites are 36x48 pixels at 4x: 72x96 points, two pixels per point on Retina.
const SPRITE_W = 36;
const SPRITE_H = 48;
const STATUS = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" };

// 肖像：配到職業就畫肖像圖；沒配到退回程式圖示（單色用 svg、圖片用 image），都沒有就留空。
function portrait(a, assigned, t) {
  const job = jobIn(a.tab_name, assigned);
  const sprite = spritePath(job, a.status);
  if (sprite) return image(sprite).w(SPRITE_W).h(SPRITE_H).flex_none();
  const src = portraitPath(job);
  if (src) return image(src).w(PIC).h(PIC).flex_none();
  const p = a.program;
  if (!p?.icon) return div().w(PIC).h(PIC).flex_none();
  return p.tint
    ? svg(p.icon).size(PIC).flex_none().text_color(t.foreground)
    : image(p.icon).w(PIC).h(PIC).flex_none();
}

const STATUS_TONE = { working: "working", blocked: "blocked", done: "done", idle: "idle" };

// A JRPG status-window frame: dark outer rim, gold hairline inside, a small gold stud on each corner.
function frame(child, color, t, id, onClick, hoverable) {
  const stud = (el) => el.absolute().size(4).bg(color);
  return div()
    .id(id)
    .relative()
    .w_full()
    .flex_none()
    .p(2)
    .bg(`${t.canvas}d9`)
    .border(1)
    .border_color(color)
    .cursor_pointer()
    .on_click(onClick)
    .when(hoverable, (el) => el.hover((s) => s.bg(`${t.raised}e6`)))
    .child(child)
    .child(stud(div()).top(-2).left(-2))
    .child(stud(div()).top(-2).right(-2))
    .child(stud(div()).bottom(-2).left(-2))
    .child(stud(div()).bottom(-2).right(-2));
}

// The sprite stands on a small dark plate, like a party portrait.
function plate(child, t) {
  return v_flex()
    .w(38)
    .h(50)
    .flex_none()
    .items_center()
    .justify_end()
    .pb(1)
    .bg(`${t.canvas}b3`)
    .border(1)
    .border_color(`${t.accent}33`)
    .child(child);
}

// "<space>: <tab>": space in gold, tab in parchment.
function title(a, t) {
  const { space, tab } = agentTitle(a);
  return h_flex()
    .flex_1()
    .min_w(0)
    .items_center()
    .text_size(12.5)
    .font_weight(600)
    .child(div().flex_none().max_w(110).truncate().text_color(t.accent).child(space))
    .child(div().flex_none().text_color(t.dim).child(":\u00a0"))
    .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(tab));
}

function statusPill(status, t) {
  const color = t[STATUS_TONE[status]] ?? t.dim;
  return h_flex()
    .flex_none()
    .h(16)
    .px(5)
    .gap(4)
    .items_center()
    .bg(`${color}1f`)
    .border(1)
    .border_color(`${color}66`)
    .child(div().size(5).rounded_full().bg(color)
      .when(status === "working" || status === "blocked", (el) => el.loop("opacity", { from: 0.3, to: 1, period: 1200 })))
    .child(div().text_size(10).text_color(color).child(STATUS[status] ?? status ?? "—"));
}

// Class line: the model, and the effort as a gold badge.
function classLine(_label, cache, t) {
  const effort = cache?.effort && cache.effort !== "default" ? cache.effort : null;
  return h_flex()
    .w_full()
    .min_w(0)
    .h(16)
    .gap(6)
    .items_center()
    .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(cache?.model ? t.muted : t.dim).child(cache?.model ?? "awaiting report…"))
    .when(Boolean(effort), (el) => el.child(div().flex_none().px(4).border(1).border_color(`${t.accent}80`).text_size(9.5).font_weight(600).text_color(t.accent).child(effort.toUpperCase())));
}

function resetsIn(at, now) {
  const ms = Date.parse(at ?? "") - now * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = ms / 3600000;
  return hours >= 24 ? `${Math.ceil(hours / 24)}d` : `${Math.max(1, Math.ceil(hours))}h`;
}

// HP: the usage left this cycle, in a framed, bevelled meter.
function hpMeter(g, cache, now, t, status, label) {
  const color = g.pct === null ? t.dim : g.pct > 50 ? t.done : g.pct > 20 ? t.accent : t.blocked;
  const reset = resetsIn(cache?.resetsAt, now);
  return v_flex()
    .w_full()
    .gap(2)
    .child(h_flex()
      .w_full()
      .h(13)
      .gap(7)
      .items_center()
      .child(div().w(18).flex_none().text_size(11).font_weight(700).text_color(t.accent).child("HP"))
      .child(div()
        .flex_1()
        .min_w(0)
        .h(9)
        .p(1)
        .bg(t.canvas)
        .border(1)
        .border_color(`${t.accent}59`)
        .when(g.pct !== null, (el) => el.child(v_flex()
          .h_full()
          .w(`${g.pct}%`)
          .bg(color)
          .child(div().w_full().h(2).bg("#ffffff40")))))
      .child(div().w(34).flex_none().text_size(11.5).font_weight(600)
        .text_color(g.stale ? t.dim : g.pct === null ? t.dim : color)
        .child(g.pct === null ? "—" : `${g.pct}%`)))
    .child(h_flex().w_full().pl(25).gap(6).items_center()
      .when(Boolean(label), (el) => el.child(div().flex_none().text_size(9.5).font_weight(700).text_color(t.unknown).child(label.text.toUpperCase())))
      .child(div().flex_1().min_w(0).truncate().text_size(9.5).text_color(t.dim)
        .child(g.stale ? "last reading is old" : reset ? `resets in ${reset}` : ""))
      .child(status));
}

export default class Traveler extends View {
  init(_props, cx) {
    this.home = appHome();
    this.sessionsDir = `${this.home}/data/traveler/sessions`;
    this.jobsFile = `${this.home}/mods/traveler-agents/jobs.json`;
    this.jobs = {};
    this.cache = {};
    this.remote = {};
    this.tick = 0;
    this.seen = new Set();
    this.watching = false;
    this.statuses = {};
    this.loadJobs(cx);
    this.load(cx);
    this.loadRemote(cx);
    this.watch(cx);
    // File watching refreshes immediately; polling is a fallback and retries watches.
    cx.timer.every(15000, (cx) => {
      this.load(cx);
      this.watch(cx);
      // Remote folders cannot be watched; refresh them every 30 seconds.
      if (++this.tick % 2 === 0) this.loadRemote(cx);
    });
  }

  // 監看快取資料夾：有變更就重讀。資料夾不存在或不被允許時結束迴圈，
  // 交給上面的計時器每 30 秒重試，不會變成緊迴圈。
  watch(cx) {
    if (this.watching) return;
    this.watching = true;
    cx.spawn(async (cx) => {
      let quick = 0;
      for (;;) {
        let changed;
        const started = Date.now();
        try {
          changed = await watchFolder(this.sessionsDir);
        } catch {
          break;
        }
        // 立刻回來又沒有任何變更，代表監看沒真的生效，也別讓它空轉。
        quick = Date.now() - started < 500 && (changed ?? []).length === 0 ? quick + 1 : 0;
        if (quick >= 3) break;
        this.load(cx);
      }
      this.watching = false;
    });
  }

  loadJobs(cx) {
    cx.spawn(async (cx) => {
      const text = await readTextFile(this.jobsFile).catch(() => null);
      let jobs = {};
      try {
        const parsed = JSON.parse(text);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) jobs = parsed;
      } catch {
        jobs = {};
      }
      this.jobs = jobs;
      cx.notify();
    });
  }

  // 每個本機 agent 讀自己那份快取；遠端的由 loadRemote 讀。
  load(cx) {
    const wanted = [];
    for (const a of agents()) {
      const path = cachePath(this.home, a.address);
      if (path === null) continue;
      this.seen.add(a.address);
      wanted.push({ address: a.address, path });
    }
    cx.spawn(async (cx) => {
      const next = {};
      for (const w of wanted) {
        const text = await readTextFile(w.path).catch(() => null);
        next[w.address] = parseCache(text);
      }
      this.cache = next;
      this.publish();
      cx.notify();
    });
  }

  // 遠端 agent 讀它那台的快取檔（透過 Herdr 原有的連線，不執行指令）；連不上就是 null，畫面顯示「—」。
  loadRemote(cx) {
    const wanted = [];
    for (const a of agents()) {
      const r = remoteCachePath(a.address);
      if (r === null) continue;
      this.seen.add(a.address);
      wanted.push({ address: a.address, ...r });
    }
    if (wanted.length === 0) return;
    cx.spawn(async (cx) => {
      const next = {};
      for (const w of wanted) {
        const text = await readTextFile(w.path, { on: w.on }).catch(() => null);
        next[w.address] = parseCache(text);
      }
      this.remote = next;
      this.publish();
      cx.notify();
    });
  }

  publish() {
    const value = { ...this.remote, ...this.cache };
    const json = JSON.stringify(value);
    if (json !== this.published) {
      this.published = json;
      setShared("user.agent.metrics", value);
    }
  }

  card(a, now, t) {
    const cache = this.cache[a.address] ?? this.remote[a.address] ?? null;
    const hp = gauge(cache ? cache.hp : null, cache ? cache.updatedAt : null, now);
    // Blocked wins over focus, so an agent waiting on you stands out.
    const edge = a.status === "blocked" ? t.blocked : a.focused ? t.accent : `${t.accent}66`;
    const body = v_flex()
      .w_full()
      .px(6)
      .py(5)
      .gap(4)
      .bg(a.status === "blocked" ? `${t.blocked}14` : `${t.surface}cc`)
      .border(1)
      .border_color(a.focused ? `${t.accent}59` : `${t.accent}1f`)
      .child(h_flex()
        .w_full()
        .min_w(0)
        .gap(7)
        .items_center()
        .child(plate(portrait(a, this.assigned, t), t))
        .child(v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .child(h_flex().w_full().min_w(0).items_center().child(title(a, t)))
          .child(div().w_full().h(1).bg(`${t.accent}40`))
          .when(Boolean(cache?.name), (el) => el.child(div().w_full().min_w(0).truncate().italic().text_size(11).text_color(t.dim).child(cache.name)))
          .child(classLine(null, cache, t))))
      .child(hpMeter(hp, cache, now, t, statusPill(a.status, t), appLabel(a.app)));
    return frame(body, edge, t, `traveler-${a.address}`, () => run("agent.focus", { terminal: a.address }), !a.focused);
  }

  render(cx) {
    const t = theme();
    const list = agents();
    const statuses = Object.fromEntries(list.map(a => [a.address, a.status]));
    const completed = list.filter(a => this.statuses[a.address] === "working" && a.status !== "working");
    this.statuses = statuses;
    if (completed.some(a => cachePath(this.home, a.address) !== null)) this.load(cx);
    if (completed.some(a => remoteCachePath(a.address) !== null)) this.loadRemote(cx);
    this.assigned = assignJobs(tabNames(spaces(), list), this.jobs);
    setAgentOrder(list.map((a) => a.address));
    // 剛出現的 agent 先補讀一次快取，不用等下一次計時器。
    const fresh = list.filter((a) => !this.seen.has(a.address));
    if (fresh.some((a) => cachePath(this.home, a.address) !== null)) this.load(cx);
    if (fresh.some((a) => remoteCachePath(a.address) !== null)) this.loadRemote(cx);
    const now = Math.floor(Date.now() / 1000);
    return v_flex()
      .id("traveler")
      .size_full()
      .min_h(0)
      .text_color(t.foreground)
      .text_size(13)
      .child(h_flex().h(30).flex_none().px(12).gap(8).items_center()
        .bg(`${t.chrome}eb`).border_t(1).border_b(1).border_color(t.border)
        .child(div().size(5).flex_none().bg(t.accent))
        .child(div().flex_1().text_size(11.5).font_weight(600).text_color(t.foreground).child("Agents"))
        .child(div().flex_none().px(6).border(1).border_color(`${t.accent}66`).text_size(10.5).text_color(t.accent).child(String(list.length))))
      .child(
        v_flex()
          .flex_1()
          .min_h(0)
          .gap(8)
          .px(8)
          .py(8)
          .overflow_y_scrollbar()
          .children(list.map((a) => this.card(a, now, t)))
          .when(list.length === 0, (el) =>
            el.child(div().p(8).italic().text_size(12).text_color(t.dim).child("No agents in the party yet")),
          ),
      );
  }
}
