// Agents for user-main: clean cards, each agent with its own monoline sigil on a
// tinted tile (mods/user-agents/sigils), in the same family as user-spaces' marks.
// Reads statusLine / OpenCode caches and Codex terminal metadata, publishing
// shared "user.agent.metrics" for the pane headers.
import { View, div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, appHome, exec, layout, readTextFile, run, setAgentOrder, setShared, shared, terminals, theme, watchFolder } from "herdr";
import { agentTitle, appLabel, cachePath, gauge, parseCache, remoteCachePath } from "./lib.js";
import { codexMetrics, isCodex, readCodexModel } from "./codex.js";

export const SIGILS = ["orbit", "spark", "nodes", "prism", "compass", "pulse", "loop", "beacon", "cube", "target", "bolt", "asterisk", "petals", "layers", "eye", "knot"];
// The same hues the space tiles use, so the sidebar reads as one set.
const HUES = ["#5b8def", "#22a99a", "#e3814f", "#8b7cf6", "#3fae6a", "#d9649a", "#d4a72c", "#4fb3d9"];
const STATUS = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" };
const TILE = 30;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
// A color at a fraction of its opacity. Theme colors may already carry an alpha
// (#rrggbbaa), so the two multiply instead of a suffix being appended.
function alpha(color, amount) {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color ?? "");
  if (!m) return color;
  const base = m[2] ? parseInt(m[2], 16) / 255 : 1;
  return `#${m[1]}${Math.round(base * amount * 255).toString(16).padStart(2, "0")}`;
}
const hash = (s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

// Each agent keeps the sigil and hue it got first; a new one takes the least-used
// sigil and hue among the agents still running, so no two look alike.
function assignMarks(list) {
  const stored = shared("user.agent.marks") ?? {};
  const live = new Set(terminals().map((t) => t.address));
  const marks = Object.fromEntries(Object.entries(stored).filter(([a]) => live.size === 0 || live.has(a)));
  let changed = Object.keys(marks).length !== Object.keys(stored).length;
  for (const a of list) {
    const m = marks[a.address];
    if (m && SIGILS.includes(m.sigil) && HUES[m.hue]) continue;
    const used = Object.values(marks);
    const h = hash(a.address);
    const pick = (n, count) => Array.from({ length: n }, (_, k) => (h + k) % n)
      .reduce((best, k) => (count(k) < count(best) ? k : best), h % n);
    const sigil = pick(SIGILS.length, (k) => used.filter((u) => u.sigil === SIGILS[k]).length);
    const hue = pick(HUES.length, (k) => used.filter((u) => u.hue === k).length);
    marks[a.address] = { sigil: SIGILS[sigil], hue };
    changed = true;
  }
  if (changed) setShared("user.agent.marks", marks);
  return marks;
}

function tileFor(a, mark, t, size) {
  const hue = HUES[mark?.hue] ?? t.accent;
  const dot = t[a.status] ?? t.dim;
  return div()
    .relative()
    .size(size)
    .flex_none()
    .child(h_flex().size_full().rounded(Math.round(size * 0.28)).bg(alpha(hue, 0.14)).border(1).border_color(alpha(hue, 0.35))
      .items_center().justify_center()
      .child(svg(`mods/user-agents/sigils/${mark?.sigil ?? "orbit"}.svg`).size(Math.round(size * 0.56)).text_color(hue)))
    .when(a.status !== "idle", (el) => el.child(div().absolute().right(-2).bottom(-2).size(9).rounded(5)
      .border(2).border_color(t.chrome).bg(dot)
      .when(a.status === "working" || a.status === "blocked", (d) => d.loop("opacity", { from: 0.35, to: 1, period: 1200 }))));
}

function statusChip(status, t) {
  const color = t[status] ?? t.dim;
  if (status === "blocked") {
    return div().flex_none().px(6).h(17).flex().items_center().rounded(5).bg(alpha(color, 0.15))
      .text_size(10).font_semibold().text_color(color).child(STATUS.blocked);
  }
  return div().flex_none().text_size(10.5).text_color(status === "idle" ? t.dim : color).child(STATUS[status] ?? status ?? "");
}

function resetsIn(at, now) {
  const ms = Date.parse(at ?? "") - now * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const hours = ms / 3600000;
  return hours >= 24 ? `${Math.ceil(hours / 24)}d` : `${Math.max(1, Math.ceil(hours))}h`;
}

// Usage left this cycle: a hairline bar, the percent and when it resets.
function meter(g, cache, now, t) {
  const color = g.pct > 50 ? t.done : g.pct > 20 ? t.accent : t.blocked;
  const reset = resetsIn(cache?.resetsAt, now);
  return h_flex().w_full().gap(8).items_center()
    .child(div().flex_1().min_w(0).h(3).rounded(2).bg(t.border)
      .child(div().h_full().w(`${g.pct}%`).rounded(2).bg(g.stale ? t.dim : color)))
    .child(div().flex_none().text_size(10).text_color(g.stale ? t.dim : t.muted)
      .child(`${g.pct}%${g.stale ? " · old" : reset ? ` · ${reset}` : ""}`));
}

export default class UserAgents extends View {
  init(_props, cx) {
    this.home = appHome();
    this.sessionsDir = `${this.home}/data/traveler/sessions`;
    this.cache = {};
    this.remote = {};
    this.tick = 0;
    this.seen = new Set();
    this.watching = false;
    this.statuses = {};
    this.codex = {};
    this.load(cx);
    this.loadCodex(cx);
    this.loadRemote(cx);
    this.watch(cx);
    cx.timer.every(5000, (cx) => this.loadCodex(cx));
    cx.timer.every(15000, (cx) => {
      this.load(cx);
      this.watch(cx);
      if (++this.tick % 2 === 0) this.loadRemote(cx);
    });
  }

  loadCodex(cx) {
    if (this.codexBusy) return;
    const wanted = agents().filter(isCodex);
    this.codexBusy = true;
    cx.spawn(async (cx) => {
      try {
        const entries = await Promise.all(wanted.map(async (a) => {
          try {
            return [a.address, await readCodexModel(a.address, exec, this.codex[a.address])];
          } catch {
            return [a.address, null];
          }
        }));
        this.codex = Object.fromEntries(entries);
        this.publish();
        cx.notify();
      } finally {
        this.codexBusy = false;
      }
    });
  }

  metrics(a, all = terminals()) {
    const cache = this.cache[a.address] ?? this.remote[a.address] ?? null;
    const codex = codexMetrics(a, all.find((t) => t.address === a.address), this.codex[a.address]);
    return codex ? { ...cache, ...codex } : cache;
  }

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
        quick = Date.now() - started < 500 && (changed ?? []).length === 0 ? quick + 1 : 0;
        if (quick >= 3) break;
        this.load(cx);
      }
      this.watching = false;
    });
  }

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
      for (const w of wanted) next[w.address] = parseCache(await readTextFile(w.path).catch(() => null));
      this.cache = next;
      this.publish();
      cx.notify();
    });
  }

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
      for (const w of wanted) next[w.address] = parseCache(await readTextFile(w.path, { on: w.on }).catch(() => null));
      this.remote = next;
      this.publish();
      cx.notify();
    });
  }

  publish() {
    const value = { ...this.remote, ...this.cache };
    const all = terminals();
    for (const a of agents()) value[a.address] = this.metrics(a, all);
    const json = JSON.stringify(value);
    if (json !== this.published) {
      this.published = json;
      setShared("user.agent.metrics", value);
    }
  }

  card(a, mark, now, t) {
    const cache = this.metrics(a);
    const g = gauge(cache ? cache.hp : null, cache ? cache.updatedAt : null, now);
    const { space, tab } = agentTitle(a);
    const app = appLabel(a.app)?.text ?? a.program?.name ?? null;
    // Agent, model, reasoning level; then, for OpenCode, the provider serving that model now.
    const sub = [app, cache?.model, cache?.effort].filter(Boolean).join(" · ");
    const modelLabel = [app, cache?.model].filter(Boolean).join(" · ");
    const provider = a.app === "opencode" || a.program?.key === "opencode" ? cache?.provider : null;
    const blocked = a.status === "blocked";
    return h_flex()
      .id(`ua-${a.address}`)
      .w_full()
      .flex_none()
      .px(8)
      .py(7)
      .gap(10)
      .items_start()
      .rounded(8)
      .border(1)
      .border_color(blocked ? alpha(t.blocked, 0.4) : a.focused ? t.border : alpha(t.border, 0))
      .when(a.focused, (el) => el.bg(t.selected))
      .when(!a.focused, (el) => el.hover((s) => s.bg(t.hover)))
      .cursor_pointer()
      .when(Boolean(cache?.name), (el) => el.tooltip(cache.name))
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(tileFor(a, mark, t, TILE))
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().w_full().min_w(0).gap(6).items_center()
          .child(h_flex().flex_1().min_w(0).items_center().text_size(12.5).font_medium()
            .child(div().flex_none().max_w(110).truncate().text_color(t.muted).child(space))
            .child(div().flex_none().text_color(t.dim).child("\u00a0/\u00a0"))
            .child(div().flex_1().min_w(0).truncate().text_color(a.status === "idle" && !a.focused ? t.muted : t.foreground).child(tab)))
          .child(statusChip(a.status, t)))
        .child(h_flex().w_full().min_w(0).gap(6).items_center().text_size(11).text_color(t.muted).tooltip(sub)
          .child(div().flex_1().min_w(0).truncate().child(modelLabel || "awaiting report…"))
          .when(Boolean(cache?.effort), (el) => el.child(div().flex_none().child(cache.effort))))
        .when(Boolean(provider), (el) => el.child(div().w_full().min_w(0).truncate().text_size(10.5).text_color(t.dim).child(`${provider}`)))
        .when(g.pct !== null, (el) => el.child(meter(g, cache, now, t))));
  }

  compact(a, mark, t) {
    return h_flex()
      .id(`ua-${a.address}`)
      .w_full()
      .h(40)
      .flex_none()
      .justify_center()
      .items_center()
      .rounded(6)
      .when(a.focused, (el) => el.bg(t.selected))
      .when(!a.focused, (el) => el.hover((s) => s.bg(t.hover)))
      .tooltip(`${a.space_name || "Space"} / ${a.tab_name || a.address}`)
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(tileFor(a, mark, t, 26));
  }

  render(cx) {
    const t = theme();
    const list = agents();
    const statuses = Object.fromEntries(list.map((a) => [a.address, a.status]));
    const completed = list.filter((a) => this.statuses[a.address] === "working" && a.status !== "working");
    this.statuses = statuses;
    const fresh = list.filter((a) => !this.seen.has(a.address));
    const reload = [...completed, ...fresh];
    if (reload.some(isCodex)) this.loadCodex(cx);
    if (reload.some((a) => cachePath(this.home, a.address) !== null)) this.load(cx);
    if (reload.some((a) => remoteCachePath(a.address) !== null)) this.loadRemote(cx);
    setAgentOrder(list.map((a) => a.address));
    const marks = assignMarks(list);
    const now = Math.floor(Date.now() / 1000);
    const collapsed = narrow();
    return v_flex()
      .id("user-agents")
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_color(t.foreground)
      .text_size(13)
      .when(!collapsed, (el) => el.child(h_flex().h(36).flex_none().pl(16).pr(12).items_center().justify_between()
        .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
        .when(list.length > 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(String(list.length))))))
      .child(v_flex()
        .flex_1()
        .min_h(0)
        .gap(4)
        .px(collapsed ? 4 : 8)
        .pt(collapsed ? 6 : 0)
        .pb(8)
        .overflow_y_scrollbar()
        .children(list.map((a) => (collapsed ? this.compact(a, marks[a.address], t) : this.card(a, marks[a.address], now, t))))
        .when(list.length === 0 && !collapsed, (el) =>
          el.child(div().px(8).text_size(12).text_color(t.dim).child("No agents yet. They show up here once they report a status."))));
  }
}
