import { Plugin } from "@opencode/plugin/tui"
import { execFile } from "node:child_process"
import { mkdir, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

// Writes model, effort and usage metadata for Herdr's agent cards.
// Metadata only: no prompts, responses or credentials.
const TERMINAL = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const HEARTBEAT_MS = 60000

function windowsEnv() {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-Command",
      "[pscustomobject]@{terminal=$env:HC_TERMINAL_ID;home=$env:HERDR_APP_HOME;profile=$env:USERPROFILE}|ConvertTo-Json -Compress"],
      { timeout: 8000 }, (error, stdout) => {
        if (error) return resolve(null)
        try { resolve(JSON.parse(String(stdout).trim())) } catch { resolve(null) }
      })
  })
}

async function target() {
  let terminal = process.env.HC_TERMINAL_ID
  let base = process.env.HERDR_APP_HOME || join(homedir(), ".config/herdr-app")
  if (process.env.WSL_DISTRO_NAME) {
    // WSL doesn't inherit HC_TERMINAL_ID; Windows programs started from it do.
    const env = await windowsEnv()
    if (!env) return null
    terminal ||= env.terminal
    const path = env.home || `${env.profile}\\.config\\herdr-app`
    base = path.replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`).replace(/\\/g, "/")
  }
  if (!TERMINAL.test(terminal || "")) return null
  return { terminal, folder: join(base, "data/traveler/sessions") }
}

// Just enough of opencode-quota's RPC contract to read its last snapshot.
const pass = { "~standard": { version: 1, vendor: "herdr-cards", validate: (value) => ({ value }) } }
const QuotaRpc = { id: "slkiser.opencode-quota", events: {}, methods: { snapshot: { input: pass, output: pass } } }
const QUOTA_POLL_MS = 60000

// The tightest primary quota of the providers serving the current model.
function quotaFrom(snapshot) {
  if (!snapshot?.providers) return null
  const ids = snapshot.currentModelProviderIds?.length ? snapshot.currentModelProviderIds : snapshot.providers.map((p) => p.providerId)
  const rows = snapshot.providers.filter((p) => ids.includes(p.providerId)).flatMap((p) => p.rows.map((r) => ({ ...r, provider: p.label })))
    .filter((r) => r.type === "quota" && Number.isFinite(r.percentRemaining))
  const primary = rows.filter((r) => r.prominence === "primary")
  const best = (primary.length ? primary : rows).sort((a, b) => a.percentRemaining - b.percentRemaining)[0]
  if (!best) return null
  return {
    pct: Math.max(0, Math.min(100, Math.floor(best.percentRemaining))),
    label: `${best.provider}${best.label ? ` ${best.label}` : ""}`,
    resetsAt: best.resetsAt ?? null,
  }
}

const count = (value) => (Number.isFinite(value) && value >= 0 ? value : 0)
const tokenSum = (t) => t ? count(t.input) + count(t.output) + count(t.reasoning) + count(t.cache?.read) + count(t.cache?.write) : 0

export default Plugin.define({
  id: "herdr.cards",
  async setup(context) {
    const where = await target()
    if (!where) return
    try { await mkdir(where.folder, { recursive: true }) } catch { return }
    const file = join(where.folder, `${where.terminal}.json`)
    const location = () => context.location ?? context.data.location.default()
    context.data.location.model.sync(location()).catch(() => {})
    context.data.location.provider.sync(location()).catch(() => {})

    let last = "", lastWrite = 0, writing = Promise.resolve()
    let quota = null, quotaAt = 0, quotaSession, quotaLoading = false

    const loadQuota = (sessionID) => {
      if (quotaLoading || (sessionID === quotaSession && Date.now() - quotaAt < QUOTA_POLL_MS)) return
      quotaLoading = true
      quotaSession = sessionID
      quotaAt = Date.now()
      const loc = location()
      Promise.resolve()
        .then(() => context.client.rpc(QuotaRpc).snapshot(sessionID ? { sessionID } : {},
          { location: { directory: loc.directory }, signal: AbortSignal.timeout(30000) }))
        .then((output) => { quota = quotaFrom(output?.snapshot) ?? quota })
        .catch(() => {})
        .finally(() => { quotaLoading = false })
    }

    const snapshot = () => {
      const route = context.ui.router.current()
      const id = route.type === "session" ? context.data.session.root(route.sessionID) : null
      const session = id ? context.data.session.get(id) : undefined
      loadQuota(id ?? undefined)
      const selected = context.ui.model.current()
      const ref = selected ?? (session?.model ? { providerID: session.model.providerID, modelID: session.model.id, variant: session.model.variant } : undefined)
      const info = ref ? (context.data.location.model.list(location()) ?? [])
        .find((m) => m.providerID === ref.providerID && (m.modelID === ref.modelID || m.id === ref.modelID)) : undefined
      // The provider serving this model right now (GitHub Copilot, OpenAI, ...), by its display name.
      const provider = ref ? (context.data.location.provider.list(location()) ?? []).find((p) => p.id === ref.providerID) : undefined
      const messages = id ? context.data.session.message.list(id) ?? [] : []
      const replies = messages.filter((m) => m.type === "assistant")
      const lastReply = [...replies].reverse().find((m) => m.tokens)
      const contextTokens = lastReply ? tokenSum(lastReply.tokens) : null
      const contextLimit = info?.limit?.context ?? null
      return {
        sessionID: id,
        sessionName: session?.title ?? null,
        model: info?.name ?? ref?.modelID ?? null,
        effort: ref ? ref.variant ?? "default" : null,
        providerID: ref?.providerID ?? null,
        provider: provider?.name ?? ref?.providerID ?? null,
        usage: session ? {
          input: count(session.tokens?.input),
          output: count(session.tokens?.output),
          reasoning: count(session.tokens?.reasoning),
          cacheRead: count(session.tokens?.cache?.read),
          cacheWrite: count(session.tokens?.cache?.write),
          cost: count(context.data.session.cost(id) || session.cost),
          responses: replies.filter((m) => m.time?.completed).length,
        } : null,
        contextTokens,
        contextLimit,
        usageRemainingPct: quota?.pct ?? null,
        usageLabel: quota?.label ?? null,
        usageResetsAt: quota?.resetsAt ?? null,
        contextRemainingPct: contextLimit && contextTokens !== null ? Math.max(0, Math.min(100, Math.round(100 * (1 - contextTokens / contextLimit)))) : null,
      }
    }

    const flush = () => {
      let data
      try { data = snapshot() } catch { return }
      const json = JSON.stringify(data)
      if (json === last && Date.now() - lastWrite < HEARTBEAT_MS) return
      last = json
      lastWrite = Date.now()
      const payload = JSON.stringify({ updatedAt: Date.now() / 1000, ...data })
      writing = writing.catch(() => {}).then(async () => {
        const temp = `${file}.${process.pid}.tmp`
        await writeFile(temp, payload)
        await rename(temp, file)
      }).catch(() => {})
    }

    flush()
    const timer = setInterval(flush, 1500)
    return () => clearInterval(timer)
  },
})
