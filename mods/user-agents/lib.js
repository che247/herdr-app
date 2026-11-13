// Pure helpers for the user-agents cards (no herdr / gpui-kit): reading the
// statusLine / OpenCode usage caches the traveler scripts write, and the gauge.

export const STALE_SECONDS = 300;

const SESSIONS_DIR = "data/traveler/sessions";
const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function pct(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const s = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  return s === "" ? null : [...s].slice(0, max).join("");
}

const NAME_MAX = 80;
export function cleanName(value) {
  return cleanText(value, NAME_MAX);
}

const MODEL_MAX = 40;
function cleanModel(value) {
  return cleanText(value, MODEL_MAX);
}

// 程式標籤：看 agent 自己回報的 app（OSC 7501），只認這三種；builder 沒有 HP/SP 的來源。
const APPS = new Map([
  ["claude-code", { text: "Claude", builder: false }],
  ["codex", { text: "Codex", builder: true }],
  ["opencode", { text: "OpenCode", builder: true }],
]);
export function appLabel(app) {
  const found = typeof app === "string" ? APPS.get(app) : undefined;
  return found ? { ...found } : null;
}

// 快取只給本機終端機；遠端代號（vps/t7）沒有本機檔案。
export function cachePath(appHomeDir, address) {
  if (typeof appHomeDir !== "string") return null;
  const base = appHomeDir.replace(/\/+$/, "");
  if (base === "") return null;
  if (typeof address !== "string" || !LOCAL_ID.test(address)) return null;
  return `${base}/${SESSIONS_DIR}/${address}.json`;
}

// 遠端 agent（imac/t1）：那台自己的 statusLine 寫在它的預設 Herdr 資料夾，
// readTextFile 帶 on 時相對路徑從那台的家目錄算起（2026-11-03 用 hc file read --on 實測）。
const MACHINE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export function remoteCachePath(address) {
  if (typeof address !== "string") return null;
  const parts = address.split("/");
  if (parts.length !== 2 || !MACHINE.test(parts[0]) || !LOCAL_ID.test(parts[1])) return null;
  return { on: parts[0], path: `.config/herdr-app/${SESSIONS_DIR}/${parts[1]}.json` };
}

// 快取內容：{ updatedAt, contextRemainingPct, fiveHourRemainingPct, sessionName, model, effort }。
// 單一欄位壞掉只讓該欄位變 null；updatedAt 不合法就整份當作讀不到。
export function parseCache(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
  const updatedAt = data.updatedAt;
  if (typeof updatedAt !== "number" || !Number.isFinite(updatedAt) || updatedAt < 0) return null;
  return {
    updatedAt,
    hp: pct(data.usageRemainingPct) ?? pct(data.fiveHourRemainingPct),
    resetsAt: typeof data.usageResetsAt === "string" ? data.usageResetsAt : null,
    sp: pct(data.fiveHourRemainingPct),
    name: cleanName(data.sessionName),
    model: cleanModel(data.model),
    effort: cleanModel(data.effort),
    provider: cleanModel(data.provider),
    usage: data.usage && typeof data.usage === "object" ? Object.fromEntries(
      ["input", "output", "reasoning", "cacheRead", "cacheWrite", "cost", "responses"].map(key =>
        [key, typeof data.usage[key] === "number" && Number.isFinite(data.usage[key]) && data.usage[key] >= 0 ? data.usage[key] : null])) : null,
    contextTokens: typeof data.contextTokens === "number" && Number.isFinite(data.contextTokens) && data.contextTokens >= 0 ? data.contextTokens : null,
    contextLimit: typeof data.contextLimit === "number" && Number.isFinite(data.contextLimit) && data.contextLimit > 0 ? data.contextLimit : null,
  };
}

export function agentTitle(a) {
  return { space: a.space_name || "Space", tab: a.tab_name || a.address };
}

export function usageText(cache) {
  const u = cache?.usage;
  if (!u) return "Usage: awaiting agent report";
  const n = value => value === null ? "—" : value >= 1000000 ? `${(value / 1000000).toFixed(2)}M` : value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(Math.round(value));
  return `In ${n(u.input)} · Out ${n(u.output)} · Reason ${n(u.reasoning)}\nCache ${n(u.cacheRead)} read / ${n(u.cacheWrite)} write\n${u.cost === null ? "Cost —" : `$${u.cost.toFixed(3)}`} · ${n(u.responses)} responses`;
}

// 卡片上的「模型 · effort」一行：沒有模型就不顯示（effort 單獨出現沒有意義）。
export function modelText(model, effort) {
  const m = cleanModel(model);
  if (m === null) return null;
  const e = cleanModel(effort);
  return e === null ? m : `${m} · ${e}`;
}

// 一條 HP/SP 條要畫的東西：沒有數字（或沒有時間戳）就顯示「—」且不填色；
// 過舊只加標記，數字照實顯示，不改寫成別的值。
export function gauge(value, updatedAt, now) {
  const p = pct(value);
  const at =
    typeof updatedAt === "number" && Number.isFinite(updatedAt) && updatedAt >= 0
      ? updatedAt
      : null;
  if (p === null || at === null) return { text: "—", pct: null, stale: false };
  const stale = typeof now === "number" && Number.isFinite(now) && now - at > STALE_SECONDS;
  return { text: `${p}%`, pct: p, stale };
}
