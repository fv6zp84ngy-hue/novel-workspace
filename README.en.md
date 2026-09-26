# Novel Workspace

An encrypted, local-first workspace for beginner novel writers. Organize chapters, outlines, characters and reference materials, then find and connect them while writing.

[中文](README.md) · [MIT](LICENSE)

Python 3.10+ is required. No runtime package installation; the MIT-licensed Yjs browser bundle is included:

```sh
python3 scripts/serve.py
```

Open http://127.0.0.1:8765/ and create a vault passphrase of at least 12 characters. Keep it safe: there is no password recovery. Existing local data is migrated atomically to an encrypted vault. Back up before upgrading. Full JSON backups are encrypted; explicit TXT exports are plaintext.

Version 0.4.1 keeps story ideas, titles and material categories optional so writers can save first and organize later. It adds control and treatment first-use paths, with separate routes for new stories and scattered existing drafts. The treatment path creates an editable local workspace without requiring a model account; your original idea stays in a starting-point note and is not sent automatically. See the [field guide](docs/FIELD_GUIDE.md) (Chinese). Optional user-funded, OpenAI-compatible Chat Completions and Embeddings calls use a loopback-only Python gateway. Enter your own endpoint, API key and model IDs in the app. Users pay their provider; local token limits are advisory rather than billing guarantees. Credentials remain in process memory and are excluded from backups.

The [local funnel page](debug/funnel.html) shows session-level steps and TTFA / TTFV. Events stay in a separate IndexedDB and exclude manuscript text, prompts, names, search terms, file paths and credentials. Testers can export event JSON and summarize multiple exports offline with `python3 scripts/analyze_funnel.py ./exports`. There is no third-party analytics, account system or server-side experiment. No real-user conversion results are claimed.

Features include incremental vector indexing, semantic retrieval, cited RAG answers, classification previews with undo, related-material suggestions and draft generation. Optional WebDAV transfers encrypted snapshots using conditional writes. Whole-workspace snapshots remain manual. Optional chapter collaboration polls WebDAV about every three seconds and merges concurrent body edits with Yjs. It does not synchronize titles, tasks, classifications, or deletions. HTTPS public endpoints on port 443 are required.

Local encryption, transaction rollback, retention planning and service failure behavior have synthetic tests. Real paid accounts, real WebDAV providers, physical devices and destructive hardware faults have not been verified. The main workspace is Chinese; English covers only the starting flow and templates.

For offline checks, install Node.js 22+ and run `python3 -B scripts/check.py`. Run the browser integration pages separately. See the Chinese [requirements](docs/REQUIREMENTS.md), [test report](docs/TEST_REPORT.md), [privacy](PRIVACY.md) and [security](SECURITY.md) documents for exact boundaries. Static hosting supports local writing; optional services require the local Python gateway.

Measurement 0.4.1 excludes automatic onboarding actions from activation and deep interaction. Offline analysis reports new-story-only open intent penetration and scenario funnels, isolates older versions, and deduplicates event IDs. [Measurement specification](docs/MEASUREMENT.md) and [real-user protocol](docs/REAL_USER_VALIDATION.md) are in Chinese. Real-user validation: 0 completed out of at least 5 required; no prototype uplift claim.

[Download the latest full package](https://github.com/fv6zp84ngy-hue/novel-workspace/releases/latest/download/novel-workspace-latest.zip). The latest GitHub Release supplies the current version under the fixed filename `novel-workspace-latest.zip`. See the [Chinese README](README.md) for iteration and measurement flowcharts. With Python 3.10+ installed, double-click `Start.command` on macOS or `Start.bat` on Windows; Linux users can run `sh Start.sh`. No npm install/build is needed. Back up first, stop the previous server, merge the files into the old root, and keep the same browser and URL/port. See [start and upgrade instructions](开始使用.txt) and [release effects](更新说明.md) (Chinese). Windows launch is provided but not yet validated on a Windows device.
