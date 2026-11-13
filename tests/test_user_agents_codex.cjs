const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const root = path.resolve(__dirname, '../mods/user-agents');
const source = name => fs.readFileSync(path.join(root, name), 'utf8')
  .replace(/^import .*;\n/gm, '').replace(/export default /g, '').replace(/export /g, '');
const helpers = new Function(source('codex.js') + '; return {isCodex, parseCodexFooter, readCodexModel, codexMetrics};')();
const a = {address: 't1', app: 'codex'};

async function main() {
  const {parseCodexFooter, readCodexModel, codexMetrics} = helpers;
  assert.deepEqual(parseCodexFooter('Please use gpt-6.1-sol high\n\x1b[33m GPT-6.1-Sol medium · ~\x1b[0m'),
    {model: 'GPT-6.1-Sol', effort: 'medium'});
  assert.equal(parseCodexFooter('I am using gpt-6.1-sol high'), null);
  const calls = [];
  let pid = 10;
  let program = 'codex.exe';
  let covered = false;
  const exec = async (command, args) => {
    assert.equal(command, 'hc');
    calls.push(args);
    if (args[0] === 'get') return {code: 0, stdout: JSON.stringify({foreground: {name: program, pid}})};
    assert.deepEqual(args.slice(2), ['--lines', '0']);
    return {code: 0, stdout: covered ? 'Model picker' :
      args[1] === 't1' ? 'gpt-6.1-sol high · /same' : 'gpt-6.1-astra ultra · /same'};
  };
  const first = await readCodexModel('t1', exec);
  const second = await readCodexModel('remote/t1', exec);
  assert.equal(first.model, 'gpt-6.1-sol');
  assert.equal(second.effort, 'ultra');
  covered = true;
  assert.deepEqual(await readCodexModel('t1', exec, first), first);
  pid++;
  assert.equal(await readCodexModel('t1', exec, first), null);
  program = 'pwsh.exe';
  assert.equal(await readCodexModel('t1', exec, first), null);
  assert.equal(calls.filter(c => c[0] === 'read').length, 4);
  // Codex inside WSL: the foreground is wsl.exe, but the core's status names Codex.
  const wsl = async (command, args) => args[0] === 'get'
    ? {code: 0, stdout: JSON.stringify({foreground: {name: 'wsl.exe', pid: 7}, status: {app: 'codex', state: 'idle'}})}
    : {code: 0, stdout: '\u203a prompt\n\n  GPT-6.1-Sol medium \u00b7 ~/scripts/webgui \u00b7 Ready'};
  assert.deepEqual(await readCodexModel('t28', wsl), {model: 'GPT-6.1-Sol', effort: 'medium', pid: 7});
  const plainWsl = async (command, args) => args[0] === 'get'
    ? {code: 0, stdout: JSON.stringify({foreground: {name: 'wsl.exe', pid: 7}})}
    : {code: 0, stdout: 'gpt-6.1-sol high \u00b7 ~'};
  assert.equal(await readCodexModel('t9', plainWsl), null);
  const report = {report: {model: 'reported-model', reasoning_effort: 'low'}};
  assert.deepEqual(codexMetrics(a, report, first), {model: 'gpt-6.1-sol', effort: 'high'});
  assert.deepEqual(codexMetrics(a, report), {model: 'reported-model', effort: 'low'});
  assert.equal(codexMetrics({app: 'opencode'}, report, first), null);

  // Exercise the panel's actual refresh, card metadata and shared publication.
  const shared = {};
  const all = [{address: 't1', ...report}];
  const Panel = new Function('View', 'agents', 'terminals', 'setShared', 'exec',
    'codexMetrics', 'isCodex', 'readCodexModel',
    source('main.js') + '; return UserAgents;')(
      class {}, () => [a], () => all, (key, value) => { shared[key] = value; }, exec,
      helpers.codexMetrics, helpers.isCodex, helpers.readCodexModel);
  const panel = new Panel();
  panel.cache = {t1: {hp: 80, model: 'stale-model'}};
  panel.remote = {};
  panel.codex = {};
  program = 'codex';
  covered = false;
  let task;
  panel.loadCodex({spawn: fn => { task = fn({notify() {}}); }});
  await task;
  assert.equal(panel.metrics(a).model, 'gpt-6.1-sol');
  assert.equal(panel.metrics(a).hp, 80);
  assert.equal(shared['user.agent.metrics'].t1.effort, 'high');
  assert.equal(panel.codexBusy, false);
  console.log('Codex footer, process identity, remote address, report fallback and panel publication checks passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
