"""Read cached Codex accounting only. No network, terminal input, or transcript output."""
import json
import os
import subprocess
import re
import shutil
from pathlib import Path

def snapshot(root):
    sessions = {}
    latest = None
    # Recent sessions suffice for the local account snapshot; bound disk reads.
    paths = sorted(root.rglob('*.jsonl'), key=lambda p:p.stat().st_mtime, reverse=True)[:40]
    for path in paths:
        try:
            with path.open('rb') as f:
                first = json.loads(f.readline())
                meta = first.get('payload', {})
                size = path.stat().st_size
                f.seek(max(0, size - 2*1024*1024))
                if f.tell(): f.readline()
                rows = f.read().decode('utf-8', errors='replace').splitlines()
            usage = None
            model = None
            effort = None
            for line in rows:
                try: row = json.loads(line)
                except ValueError: continue
                p = row.get('payload', {})
                if row.get('type') == 'turn_context':
                    model = p.get('model', model)
                    effort = p.get('effort', p.get('reasoning_effort', effort))
                if row.get('type') == 'event_msg' and p.get('type') == 'token_count':
                    usage = {'updated':row.get('timestamp'), 'info':p.get('info'), 'limits':p.get('rate_limits')}
                    if usage['limits'] and (latest is None or (usage['updated'] or '') > (latest['updated'] or '')):
                        latest = usage
            sid = meta.get('id') or meta.get('session_id')
            if sid and usage: sessions[sid] = {**usage, 'model':model, 'effort':effort}
        except (OSError, ValueError): continue
    return {'account':latest, 'sessions':sessions}

# Read only the visible footer. Never send /status, keystrokes, or scroll input.
ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")
FOOTER = re.compile(r"^\s*(?:[│┃]\s*)?(gpt-[a-z0-9_.-]+|o[134](?:-[a-z0-9-]+)?)\s+(none|minimal|low|medium|high|xhigh|max|ultra)\s*[·•]", re.I)

def parse_footer(text):
    matches = [FOOTER.match(ANSI.sub('', line)) for line in text.splitlines()]
    matches = [m for m in matches if m]
    if not matches: return None
    m = matches[-1]
    return {'provider':'Codex', 'model':m.group(1), 'effort':m.group(2).lower(), 'source':'terminal-footer'}

def terminal_models(run=subprocess.run):
    result = {}
    hc = shutil.which('hc')
    if not hc:
        local = Path.home()/'.local/bin/hc'
        hc = str(local) if local.is_file() else 'hc'
    def call(*args):
        r = run([hc, *args], capture_output=True, text=True, timeout=5)
        if r.returncode: raise ValueError('Herdr read failed')
        return r.stdout
    try:
        data = json.loads(call('ls', '--json'))
        terms = data if isinstance(data,list) else data.get('terminals', [])
    except (OSError, ValueError, subprocess.TimeoutExpired): return result
    for t in terms:
        if not t.get('agent') or '/' in t.get('address', ''): continue
        try:
            detail = json.loads(call('get', t['address'], '--json'))
            fg = detail.get('foreground') or {}
            # A shell or another foreground program must never inherit Codex metadata.
            if fg.get('name', '').lower() not in ('codex','codex.exe'): continue
            parsed = parse_footer(call('read', t['address'], '--lines', '0'))
            if parsed:
                parsed['pid'] = fg.get('pid')
                parsed['turn'] = detail.get('turn')
                result[t['address']] = parsed
        except (OSError, ValueError, subprocess.TimeoutExpired): continue
    return result

if __name__ == '__main__':
    root = Path(os.environ.get('CODEX_HOME', str(Path.home()/'.codex')))/'sessions'
    result = snapshot(root)
    result['agents'] = terminal_models()
    print(json.dumps(result))
