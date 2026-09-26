#!/bin/sh
cd -- "$(dirname -- "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  python3 -B scripts/launch.py "$@"
else
  printf '%s\n' '需要先安装 Python 3.10+。安装后重新双击 Start.command。' '请查看 开始使用.txt。'
fi
printf '%s\n' '按回车关闭此窗口。'
read -r answer
