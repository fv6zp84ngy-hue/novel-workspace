#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 -B scripts/launch.py "$@"
fi
printf '%s\n' '需要 Python 3.10+。安装后运行 sh Start.sh。'
exit 1
