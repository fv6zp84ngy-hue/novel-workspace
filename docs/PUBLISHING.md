# GitHub 发布步骤

仅使用当前版本独立源码 ZIP。ZIP 不含 Git 历史、提交姓名/邮箱、浏览器数据或作者备份。不要上传上级目录、旧发布包或自己的导出文件。

## 本地检查

```sh
python3 -B scripts/check.py
python3 -B scripts/build_release.py
```

输出为 `dist/novel-workspace-0.3.1.zip`、同名目录与 `SHA256SUMS`。固定清单见 `release-manifest.json`。在干净解压目录重复检查与启动，运行浏览器验收。

## 独立 Git

在解压后的独立目录创建仓库，使用你打算公开的 Git 名称和邮箱；不继承其他工程的 Git 历史。可使用自己 GitHub 账号提供的 noreply 邮箱，不要编造他人身份。

```sh
git init -b main
git add -- .
git commit -m "Release Novel Workspace 0.3.1"
```

只有这个经核对的新目录适合 `git add .`。先用 `git log -1 --format=fuller` 检查提交元数据，再连接你的真实远程仓库地址并推送。

## 静态网页

保留根目录 index.html 和 .nojekyll，可按 [GitHub Pages 官方文档](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)从源码分支的根目录发布。正式发布后验证 Actions 与两条开始路径；当前没有预设线上网址或远程成功声明。

不同路径的 GitHub Pages 项目可能共用同一 origin；隐私稿件应放在单独受信任的 origin。地址变化前先备份。发布源码不代表上传浏览器稿件，但托管方仍会处理网页访问请求。

0.3.1 的模型和 WebDAV 功能需要运行本机 Python 网关。GitHub Pages 只托管基础界面；不要公开监听网关或放入任何默认 key。真实账号和设备验收未通过前，请将发布说明标为个人试用版本。

0.3.1 的浏览器协作模块已随发布包附带；从源码重新构建需 Node、`npm ci`、`npm run build:crdt`。发布包无需安装依赖。第三方许可见 `THIRD_PARTY_LICENSES.md`。
