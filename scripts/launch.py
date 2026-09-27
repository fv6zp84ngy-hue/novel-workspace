#!/usr/bin/env python3
"""User launcher. Uses the selected origin; never silently chooses another port."""
import argparse
from pathlib import Path
import subprocess
import sys


def parse_port(value):
    try:
        port = int(value)
    except (TypeError, ValueError) as error:
        raise argparse.ArgumentTypeError('请输入 1024–65535 之间的数字。') from error
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError('请输入 1024–65535 之间的数字。')
    return port


def main(argv=None):
    if sys.version_info < (3, 10):
        print('需要 Python 3.10 或更新版本。请先更新 Python，再重新打开启动文件。')
        return 1
    parser = argparse.ArgumentParser(description='启动未完待续 · Novel Workspace')
    parser.add_argument('--port', type=parse_port)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    print('未完待续 · Novel Workspace ' + (root / 'VERSION').read_text().strip(), flush=True)
    print('保留此窗口即可继续使用；退出时先确认文字已保存，再按 Ctrl+C。', flush=True)
    port = args.port
    if port is None:
        print('新用户直接回车。升级用户请输入原网址的端口数字，例如旧网址末尾 :8777 就填 8777。')
        print('请继续使用原浏览器；更换端口或浏览器不会自动带走旧稿件。')
        while port is None:
            try:
                value = input('启动端口 [8765]：').strip()
                port = parse_port(value or '8765')
            except argparse.ArgumentTypeError as error:
                print(error)
            except EOFError:
                print('无法读取选择。请用 --port 指定原端口后重试。')
                return 1
            except KeyboardInterrupt:
                print('\n已取消启动。')
                return 0
    command = [sys.executable, '-B', str(root / 'scripts' / 'serve.py'), '--port', str(port)]
    if not args.no_browser:
        command.append('--open')
    try:
        return subprocess.run(command, cwd=root).returncode
    except KeyboardInterrupt:
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
