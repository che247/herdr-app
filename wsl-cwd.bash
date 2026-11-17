# Herdr app (Windows) + WSL: reopen each terminal in its last Linux folder.
#
# herdr-core runs on Windows and starts shells through wsl.exe, so it only ever
# sees the Windows folder (C:\Users\<you>) and restores every terminal there
# after a restart. This remembers each terminal's Linux folder, keyed by its
# herdr-core address (the same address comes back after a restart), and goes
# back to it when the shell starts. A new terminal starts in the last folder
# used in its space, else the Linux home.
#
# Source it at the end of ~/.bash_profile (and ~/.bashrc) inside WSL:
#   [ -r /mnt/c/Users/<you>/.config/herdr-app/wsl-cwd.bash ] && . /mnt/c/Users/<you>/.config/herdr-app/wsl-cwd.bash

[[ $- == *i* ]] || return 0
# Once per terminal: skip nested shells, tmux, and terminals of a Linux herdr-core.
[[ -z ${__HERDR_CWD_SHELL-} && -z ${TMUX-} && -z ${HC_TERMINAL_ID-} ]] || return 0
export __HERDR_CWD_SHELL=none
[[ -d /mnt/c ]] && command -v cmd.exe >/dev/null 2>&1 || return 0

# wsl.exe's Windows environment carries HC_TERMINAL_ID; Windows programs
# started from this shell see it, Linux ones don't.
__herdr_cwd_win=$(cd /mnt/c && cmd.exe /d /c 'echo %HC_TERMINAL_ID%&echo %USERPROFILE%' 2>/dev/null | tr -d '\r')
__herdr_cwd_tid=${__herdr_cwd_win%%$'\n'*}
[[ $__herdr_cwd_tid =~ ^t[0-9a-z]+$ ]] || { unset __herdr_cwd_win __herdr_cwd_tid; return 0; }
__HERDR_CWD_SHELL=$__herdr_cwd_tid

__herdr_cwd_dir=${XDG_STATE_HOME:-$HOME/.local/state}/herdr-app-cwd
__herdr_cwd_file=$__herdr_cwd_dir/$__herdr_cwd_tid
__herdr_cwd_space=
__herdr_cwd_target=
mkdir -p "$__herdr_cwd_dir" 2>/dev/null

if [[ -f $__herdr_cwd_file ]]; then
    { IFS= read -r __herdr_cwd_target; IFS= read -r __herdr_cwd_space; } < "$__herdr_cwd_file"
fi

if [[ -z $__herdr_cwd_space ]] && command -v hc.exe >/dev/null 2>&1; then
    __herdr_cwd_space=$(cd /mnt/c && hc.exe get "$__herdr_cwd_tid" --json 2>/dev/null |
        grep -o '"herdr\.space":"[^"]*"' | head -n 1 | cut -d'"' -f4)
fi

if [[ -z $__herdr_cwd_target ]]; then
    # New terminal: only when it started in the default place, not a chosen folder.
    __herdr_cwd_profile=$(wslpath -u "${__herdr_cwd_win#*$'\n'}" 2>/dev/null)
    if [[ $PWD == "$HOME" || ( -n $__herdr_cwd_profile && $PWD == "$__herdr_cwd_profile" ) ]]; then
        if [[ -n $__herdr_cwd_space && -f $__herdr_cwd_dir/space-$__herdr_cwd_space ]]; then
            IFS= read -r __herdr_cwd_target < "$__herdr_cwd_dir/space-$__herdr_cwd_space"
        fi
        [[ -n $__herdr_cwd_target ]] || __herdr_cwd_target=$HOME
    fi
    unset __herdr_cwd_profile
fi

if [[ -n $__herdr_cwd_target && $__herdr_cwd_target != "$PWD" && -d $__herdr_cwd_target ]]; then
    cd -- "$__herdr_cwd_target" || true
fi
unset __herdr_cwd_win __herdr_cwd_target

__herdr_cwd_last=
__herdr_cwd_save() {
    [[ $PWD == "$__herdr_cwd_last" ]] && return
    __herdr_cwd_last=$PWD
    printf '%s\n%s\n' "$PWD" "$__herdr_cwd_space" > "$__herdr_cwd_file" 2>/dev/null
    [[ -n $__herdr_cwd_space ]] &&
        printf '%s\n' "$PWD" > "$__herdr_cwd_dir/space-$__herdr_cwd_space" 2>/dev/null
}

# Starship keeps its own prompt command first and runs others from this variable.
if declare -F starship_precmd >/dev/null; then
    STARSHIP_PROMPT_COMMAND="${STARSHIP_PROMPT_COMMAND:+$STARSHIP_PROMPT_COMMAND;}__herdr_cwd_save"
else
    PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND;}__herdr_cwd_save"
fi

# Forget terminals unused for two months.
( find "$__herdr_cwd_dir" -type f -mtime +60 -delete 2>/dev/null & )
