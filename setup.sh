#!/usr/bin/env bash
set -euo pipefail

case "${1-}" in
  '') [ "$#" -eq 0 ] || { echo 'Usage: ./setup.sh [--check]' >&2; exit 2; } ;;
  --check) [ "$#" -eq 1 ] || { echo 'Usage: ./setup.sh [--check]' >&2; exit 2; } ;;
  *) echo 'Usage: ./setup.sh [--check]' >&2; exit 2 ;;
esac

repo_dir=$(cd -- "$(dirname -- "$0")" && pwd)
settings="$HOME/.claude/settings.json"
instructions="$HOME/.claude/CLAUDE.md"
plugin='routing-mod@routing-mod-claude'

# Accept pretty-printed JSON: outer braces on separate lines, one top-level
# property per line, and unescaped string values for the two model settings.
# Unfamiliar shapes fail before any settings backup or edit. Nested content
# stays byte-for-byte intact (apart from awk normalizing the final newline).
settings_data() {
  awk -v mode="$1" '
    { lines[NR]=$0; line=$0 }
    NR==1 && line !~ /^[[:space:]]*\{[[:space:]]*$/ { bad=1 }
    depth==1 && line !~ /^[[:space:]]*$/ {
      if (line ~ /^[[:space:]]*\}[[:space:]]*$/) closing=NR
      else if (line ~ /^[[:space:]]*"[^"\\]+"[[:space:]]*:/) {
        properties++
        key=line; sub(/^[[:space:]]*"/, "", key); sub(/".*/, "", key)
        if (key=="model" || key=="advisorModel") {
          if (seen[key]++ || line !~ /^[[:space:]]*"[^"\\]+"[[:space:]]*:[[:space:]]*"[^"\\]*"[[:space:]]*,?[[:space:]]*$/) bad=1
          value=line; sub(/^[^:]*:[[:space:]]*"/, "", value); sub(/".*/, "", value)
          values[key]=value; locations[key]=NR
        }
      } else bad=1
    }
    {
      for (i=1; i<=length(line); i++) {
        c=substr(line,i,1)
        if (quoted) {
          if (escaped) escaped=0
          else if (c=="\\") escaped=1
          else if (c=="\"") quoted=0
        } else if (c=="\"") quoted=1
        else if (c=="{" || c=="[") depth++
        else if (c=="}" || c=="]") { depth--; if (depth<0) bad=1 }
      }
    }
    END {
      if (bad || depth!=0 || quoted || !closing || closing!=NR) exit 2
      if (mode=="check") { print values["model"] "|" values["advisorModel"]; exit }
      if (locations["model"] && values["model"]!="sonnet") sub(/:[[:space:]]*"[^"\\]*"/, ": \"sonnet\"", lines[locations["model"]])
      if (locations["advisorModel"] && values["advisorModel"]!="opus") sub(/:[[:space:]]*"[^"\\]*"/, ": \"opus\"", lines[locations["advisorModel"]])
      print lines[1]
      if (!locations["model"]) printf "  \"model\": \"sonnet\"%s\n", (properties || !locations["advisorModel"] ? "," : "")
      if (!locations["advisorModel"]) printf "  \"advisorModel\": \"opus\"%s\n", (properties ? "," : "")
      for (i=2; i<=NR; i++) print lines[i]
    }
  ' "$settings"
}

snippet_present() {
  [ -f "$instructions" ] && grep -Eq '^#{1,6}[[:space:]]+Executing plans \(routing-mod\)[[:space:]]*$' "$instructions"
}

if [ "${1-}" = --check ]; then
  failed=0
  if claude plugin list --json 2>/dev/null | grep -Eq '"id"[[:space:]]*:[[:space:]]*"routing-mod@routing-mod-claude"'; then
    echo 'PASS plugin installed'
  else echo 'FAIL plugin installed'; failed=1; fi
  if snippet_present; then echo 'PASS snippet present'; else echo 'FAIL snippet present'; failed=1; fi
  values=$(settings_data check 2>/dev/null) || values='unsupported|unsupported'
  if [ "${values%%|*}" = sonnet ]; then echo 'PASS model set'; else echo 'FAIL model set (missing, incorrect, or unsupported settings shape)'; failed=1; fi
  if [ "${values#*|}" = opus ]; then echo 'PASS advisor set'; else echo 'FAIL advisor set (missing, incorrect, or unsupported settings shape)'; failed=1; fi
  # LIFECYCLE.md must contain: Known-good Claude Code version: 2.1.286
  known=$(sed -n 's/^Known-good Claude Code version: \([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)$/\1/p' "$repo_dir/LIFECYCLE.md" 2>/dev/null) || known=''
  actual=$(claude --version 2>/dev/null | sed -n 's/^\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*$/\1/p') || actual=''
  if [[ "$known" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ "$actual" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] &&
    awk -v actual="$actual" -v known="$known" 'BEGIN { split(actual,a,"."); split(known,k,"."); for(i=1;i<=3;i++) { if(a[i]+0>k[i]+0) exit 0; if(a[i]+0<k[i]+0) exit 1 } }'; then
    echo "PASS Claude Code version ($actual >= $known)"
  else echo "FAIL Claude Code version (installed: ${actual:-unknown}; LIFECYCLE known-good: ${known:-missing})"; failed=1; fi
  exit "$failed"
fi

command -v claude >/dev/null || { echo 'Claude Code CLI is required.' >&2; exit 1; }
[ -f "$repo_dir/templates/CLAUDE-snippet.md" ] || { echo 'Missing snippet template.' >&2; exit 1; }
# Preflight the settings shape before making any installation changes.
if [ -e "$settings" ]; then
  values=$(settings_data check) || { echo 'Unsupported settings shape; use outer braces on separate lines and string model settings.' >&2; exit 1; }
else values='|'; fi

if claude plugin marketplace list --json | grep -Eq '"name"[[:space:]]*:[[:space:]]*"routing-mod-claude"'; then
  claude plugin marketplace update routing-mod-claude
else claude plugin marketplace add blackmath88/routing-mod-claude; fi
if claude plugin list --json | grep -Eq '"id"[[:space:]]*:[[:space:]]*"routing-mod@routing-mod-claude"'; then
  claude plugin update "$plugin" --scope user --yes
else claude plugin install "$plugin" --scope user --yes; fi

mkdir -p "$HOME/.claude"
if ! snippet_present; then
  printf '\n' >> "$instructions"
  cat "$repo_dir/templates/CLAUDE-snippet.md" >> "$instructions"
fi
if [ "$values" != 'sonnet|opus' ]; then
  temporary=$(mktemp "$HOME/.claude/settings.json.XXXXXX")
  trap 'rm -f -- "$temporary"' EXIT
  if [ -e "$settings" ]; then
    settings_data edit > "$temporary"
    # mktemp gives collision-free timestamped backup names, even within a second.
    backup=$(mktemp "$settings.backup.$(date +%Y%m%d-%H%M%S).XXXXXX")
    cp -p "$settings" "$backup"
    chmod "$(stat -f '%Lp' "$settings" 2>/dev/null || stat -c '%a' "$settings")" "$temporary"
    echo "Settings backup: $backup"
  else printf '{\n  "model": "sonnet",\n  "advisorModel": "opus"\n}\n' > "$temporary"; fi
  mv -- "$temporary" "$settings"
  trap - EXIT
fi
echo 'Setup complete. Restart Claude Code to apply plugin changes.'
