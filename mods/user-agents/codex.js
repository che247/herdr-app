// Codex's visible status footer belongs to one terminal, even when several
// sessions share a directory. Read it without typing commands into the CLI.
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const FOOTER = /^\s*(?:[│┃]\s*)?(gpt-[a-z0-9_.-]+|o[134](?:-[a-z0-9-]+)?)\s+(none|minimal|low|medium|high|xhigh|max|ultra)\s*[·•]/i;

export function isCodex(agent) {
  return agent.app === "codex" || agent.program?.key === "codex";
}

export function parseCodexFooter(text) {
  if (typeof text !== "string") return null;
  for (const line of text.split(/\r?\n/).reverse()) {
    const match = FOOTER.exec(line.replace(ANSI, ""));
    if (match) return { model: match[1], effort: match[2].toLowerCase() };
  }
  return null;
}

export async function readCodexModel(address, exec, previous) {
  const detail = await exec("hc", ["get", address, "--json"], { timeout: 5000 });
  if (detail.code !== 0) return null;
  const info = JSON.parse(detail.stdout);
  const foreground = info.foreground;
  // Codex started inside WSL (or another wrapper) shows the wrapper as the
  // foreground process; its own status report still names it.
  const running = /^codex(?:\.exe)?$/i.test(foreground?.name ?? "") || info.status?.app === "codex";
  if (!running) return null;
  const screen = await exec("hc", ["read", address, "--lines", "0"], { timeout: 5000 });
  const parsed = screen.code === 0 ? parseCodexFooter(screen.stdout) : null;
  if (parsed) return { ...parsed, pid: foreground.pid };
  // A picker or /status can temporarily cover the footer. Retain metadata only
  // while the same Codex process still owns this terminal.
  return foreground.pid != null && previous?.pid === foreground.pid ? previous : null;
}

export function codexMetrics(agent, terminal, live) {
  if (!isCodex(agent)) return null;
  const report = terminal?.report ?? {};
  const text = value => typeof value === "string" ? value.slice(0, 80) : null;
  const model = text(live?.model) ?? text(report.model);
  const effort = text(live?.effort) ?? text(report.reasoning_effort) ?? text(report.effort);
  return model || effort ? { model, effort } : null;
}
