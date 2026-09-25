# Novel Workspace

An encrypted, local-first workspace for beginner novel writers. Organize chapters, outlines, characters and reference materials, then find and connect them while writing.

[中文](README.md) · [MIT](LICENSE)

Python 3.10+ is required. No runtime package installation; the MIT-licensed Yjs browser bundle is included:

```sh
python3 scripts/serve.py
```

Open http://127.0.0.1:8765/ and create a vault passphrase of at least 12 characters. Keep it safe: there is no password recovery. Existing local data is migrated atomically to an encrypted vault. Back up before upgrading. Full JSON backups are encrypted; explicit TXT exports are plaintext.

Version 0.3.1 keeps story ideas, titles and material categories optional so writers can save first and organize later. The material shelf now includes character, plot, setting, clue/timeline, inspiration and reference categories, with an inbox for undecided notes. See the [field guide](docs/FIELD_GUIDE.md) (Chinese). Optional user-funded, OpenAI-compatible Chat Completions and Embeddings calls use a loopback-only Python gateway. Enter your own endpoint, API key and model IDs in the app. Users pay their provider; local token limits are advisory rather than billing guarantees. Credentials remain in process memory and are excluded from backups.

Features include incremental vector indexing, semantic retrieval, cited RAG answers, classification previews with undo, related-material suggestions and draft generation. Optional WebDAV transfers encrypted snapshots using conditional writes. Whole-workspace snapshots remain manual. Optional chapter collaboration polls WebDAV about every three seconds and merges concurrent body edits with Yjs. It does not synchronize titles, tasks, classifications, or deletions. HTTPS public endpoints on port 443 are required.

Local encryption, transaction rollback, retention planning and service failure behavior have synthetic tests. Real paid accounts, real WebDAV providers, physical devices and destructive hardware faults have not been verified. The main workspace is Chinese; English covers only the starting flow and templates.

For offline checks, install Node.js 22+ and run `python3 -B scripts/check.py`. Run the browser integration pages separately. See the Chinese [requirements](docs/REQUIREMENTS.md), [test report](docs/TEST_REPORT.md), [privacy](PRIVACY.md) and [security](SECURITY.md) documents for exact boundaries. Static hosting supports local writing; optional services require the local Python gateway.
