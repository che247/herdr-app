// Local adaptation: Windows commands with literal paths; no shell interpolation of filenames.
import { kindOf, MAX_ITEMS } from "./lib.js";

const quote = value => `'${String(value).replace(/'/g, "''")}'`;
const normalize = value => String(value).replace(/\\/g, "/").replace(/\/+$/, "");
const plain = name => typeof name === "string" && !/[\\/:\x00-\x1f]/.test(name) && kindOf(name) !== null;
const powershell = script => ({
  cmd: "powershell.exe",
  args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
    "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); " + script],
});

function inboxName(path, dir) {
  const prefix = normalize(dir) + "/", normalized = normalize(path);
  if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const name = normalized.slice(prefix.length);
  return plain(name) ? name : null;
}

function regular(path) {
  return `$f=Get-Item -LiteralPath ${quote(path)} -Force; if($f.PSIsContainer -or ($f.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Not a regular file'}; `;
}

export function mkdirCommand(dir) {
  return powershell(`[void][IO.Directory]::CreateDirectory(${quote(dir)})`);
}

export function listCommand(dir) {
  return powershell(`$items=@(Get-ChildItem -LiteralPath ${quote(dir)} -File -Force | Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) } | ForEach-Object { [pscustomobject]@{path=$_.FullName;name=$_.Name;size=$_.Length;mtime=[long](($_.LastWriteTimeUtc-[datetime]'1970-01-01Z').TotalSeconds)} }); ConvertTo-Json -Compress -InputObject $items`);
}

export function parseListing(text, dir) {
  let items;
  try { items = JSON.parse(String(text).replace(/^\uFEFF/, "")); } catch { return []; }
  if (!Array.isArray(items)) return [];
  return items.filter(item => item && inboxName(item.path, dir) === item.name
      && Number.isFinite(item.size) && item.size >= 0 && Number.isFinite(item.mtime))
    .map(item => ({ ...item, kind: kindOf(item.name) }))
    .sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name))
    .slice(0, MAX_ITEMS);
}

export function statCommand(path) {
  return powershell(regular(path) + "Write-Output 'Regular File'");
}

export function openCommand(path, dir) {
  if (!inboxName(path, dir)) return null;
  return powershell(regular(path) + `Start-Process -FilePath ${quote(path)}`);
}

export function copyCommand(path, dir, _destDir, name) {
  if (!inboxName(path, dir) || !plain(name)) return null;
  // Windows resolves a redirected/OneDrive Desktop here. File.Copy never overwrites.
  return powershell(regular(path) + `$desktop=[Environment]::GetFolderPath('Desktop'); if(-not $desktop){throw 'Desktop unavailable'}; $dest=[IO.Path]::Combine($desktop,${quote(name)}); if(Test-Path -LiteralPath $dest){exit 1}; [IO.File]::Copy(${quote(path)},$dest,$false)`);
}

export function trashCommand(path, dir) {
  if (!inboxName(path, dir)) return null;
  return powershell(regular(path) + `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(${quote(path)},'OnlyErrorDialogs','SendToRecycleBin')`);
}
