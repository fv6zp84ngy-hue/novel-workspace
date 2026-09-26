# 分步开发与复验

| 步骤 | 实现 | 状态 |
| --- | --- | --- |
| 1 | 作品、章节、大纲、资料、任务与本机事务存储 | 保留并回归 |
| 2 | 自动保存、版本冲突、副本、历史、回收站 | 保留并回归 |
| 3 | 导入、规则归类、关键词与章节引用 | 保留并回归 |
| 4 | 新故事/已有稿件、场景轮播、开放表达、模板预览 | 保留并回归 |
| 5 | AES-GCM、密码门禁、原子迁移、默认加密备份 | 已实现，浏览器合成验证 |
| 6 | BYOK 本机网关、内存凭据、限流和费用可见 | 已实现，模拟协议验证 |
| 7 | 分片增量向量、语义查找、出处 RAG、分类/联想、草稿 | 已实现，合成服务验收；真实账户待验 |
| 8 | WebDAV 密文快照、条件写入、恢复副本、重复快照识别 | 已实现，合成协议验证；真实网盘待验 |
| 9 | 历史保留预览、备份后清理、向量缓存整理 | 已实现，合成验证 |
| 10 | 章节 CRDT、加密协作文件、WebDAV 条件轮询和自动合并 | 已实现，合成双窗口通过；真实两设备待验 |
| 11 | 实体设备、实际服务、极端故障、真人新手任务 | 待执行，见验收清单 |
| 12 | 脱敏、文档、MIT、白名单源码 ZIP | 本地准备；远程发布及 CI 待验 |

## 0.4.0 首次使用漏斗实施

| 步骤 | Commit | 交付 | 状态 |
| --- | --- | --- | --- |
| 1 | `feat: add local funnel analytics store` | 独立 IndexedDB、属性白名单、会话与 URL 变体 | 已提交 |
| 2 | `chore: instrument current onboarding as control` | 旧链路基线事件 | 已提交 |
| 3 | `feat: split onboarding into new-story and migration routes` | 新故事与已有内容两条 Treatment 路径 | 已提交 |
| 4 | `feat: add deterministic natural-language fallback` | 无模型时本地保存原文并创建可编辑产物 | 已提交 |
| 5 | `feat: derive first value and deep interaction events` | 路径级首次价值、深度交互和刷新重放 | 已提交 |
| 6 | `feat: add local funnel debug and export page` | 会话漏斗表、TTFA/TTFV、导出和二次确认清空 | 已提交 |
| 7 | `test: cover privacy and activation state machine` | 隐私、会话、fallback、漏斗状态自动测试 | 已提交 |
| 8 | `docs: bump project metadata to v0.4.0` | 项目规格、需求、发布清单与离线汇总工具更新 | 已完成；人工新手验收待执行 |

本轮不新增云端分析、用户账号、服务端实验、向量检索、知识图谱、PDF/DOCX 导入或 WebDAV/Yjs 功能。模型调用仍由作者显式发起；本地首次交付不自动上传创作输入。

复验顺序：`scripts/check.py` → 随机浏览器数据测试 → 加密迁移测试 → 独立 QA UI → 合成模型/网盘 → 白名单构建 → 干净解压检查 → 真实服务与设备。不要在真实稿件库上做配额、断电或删除试验。
