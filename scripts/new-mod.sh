#!/usr/bin/env bash
set -euo pipefail

usage() { echo "usage: $0 <mod-name> [\"Title\"] [\"one line description\"] [dest-dir]" >&2; exit 2; }
[ $# -ge 1 ] || usage
name=$1
[[ $name =~ ^[a-z0-9][a-z0-9-]{0,63}$ ]] || { echo "mod name must be lowercase letters, digits and hyphens" >&2; exit 2; }
title=${2:-$name}
desc=${3:-"A Claude Code mod."}
root=$(cd "$(dirname "$0")/.." && pwd)
dest=${4:-$root/mods}/$name
for v in "$title" "$desc"; do
  [[ $v == *[\\\'\"\`]* ]] && { echo "title and description may not hold a backslash, quote or backtick" >&2; exit 2; }
done
author=$(git config user.name 2>/dev/null || echo "you")

[ -e "$dest" ] && { echo "$dest already exists" >&2; exit 1; }
mkdir -p "$(dirname "$dest")"
cp -R "$root/template/mod-starter" "$dest"
find "$dest" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 |
  MOD=$name TITLE=$title DESC=$desc AUTHOR=$author xargs -0 perl -pi -e \
    's/__MOD__/$ENV{MOD}/g; s/__TITLE__/$ENV{TITLE}/g; s/__DESC__/$ENV{DESC}/g; s/__AUTHOR__/$ENV{AUTHOR}/g'
cat > "$dest/README.md" <<README
# $title

$desc

## Use

Run \`/$name\` to open or close its pane. A band above the prompt shows a short summary
once there is something to show, with a button that opens the pane and one that hides the band.

## Develop

\`\`\`
claude plugin validate ./$name
claude plugin test ./$name
claude --plugin-dir ./$name
\`\`\`

Built from the mod-starter template: UI helpers live in \`hooks/kit.tsx\`, the state
contract in \`types/index.d.ts\`, and tests in \`tests/\`.
README

echo "created $dest"
echo "next: claude plugin validate $dest && claude plugin test $dest"
echo "load: claude --plugin-dir $dest"
