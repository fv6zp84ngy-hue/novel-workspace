# 0.4.1 测量口径

这是本地原型测量修复，不是业务效果结论。没有新增模型能力、云分析、账户或服务端实验。

## 主动行为与首次价值

`source` 位于 `event.props`。开始页自动创建和保存均为 `onboarding`；编辑保存为 `editor`，资料收集/关联为 `library`，搜索打开为 `search`。`is_user_action` 要求来源是明确允许的用户操作入口，排除 `onboarding`、缺失/未知来源、失败结果；编辑还要求 `save_state=saved`。缺来源数据不能证明主动性，按无效处理。

- 新故事：先有 `first_artifact_ready`，随后主动 `edit_saved`（标题或正文有实际变化且保存成功）或 `material_captured`。自动保存创作起点不计数。
- 已有稿件：先成功 `import_succeeded` 或 `paste_saved`，随后主动 `search_result_opened` 或 `material_linked`。这两个保存事件对应需求中的概念 `import_completed`，不额外记录重名事件。
- 深度交互：同一会话主动完成 edit_saved、material_captured、search_result_opened、material_linked 中至少三类。多次保存只算一类；系统产物不计数。
- 两个派生事件每会话最多一次；重放保持去重。旧版事件不参与 0.4.1 状态机。派生事件写入失败会释放标记，供后续事件/刷新重试。

## 会话、时间和分母

进入开始页建立新的随机 session ID，刷新保持。测量版本或变体变化会换 ID，避免同一组混入另一组。会话不代表去重真人，也不代表回访。未做跨设备识别。

TTFA/TTFV 从 `onboarding_view` 计到产物/价值事件，**不含设置密码的时间**；真人手册另外记录打开网址后的全流程耗时。事件按毫秒时间排序，同一页面连续事件使用单调时间戳。指标按 all、control/treatment 及各路径输出；中位数只包含完成事件的会话。

离线脚本只纳入 0.4.1、有开始页、变体唯一有效的会话；按事件 ID 去重重复导出，内容冲突的同 ID 拒绝分析；异常时间戳拒绝分析。保留的 0.4.0 记录不改写、不回算。路径采用首次产物的路径；无产物时取最后选路，否则采用开始页默认路径。最多保留 10,000 个事件，缺少开始页的截断会话会排除并显示排除事件数。

## 开放表达

`natural_language 新故事会话数 / new_story 会话数`。分子必须存在自然语言 `intent_submitted`，选中入口不等于提交。模板原文提交也记录 intent_submitted，`entry_mode=template`。保留既有 `entry_mode` 作为需求 `input_mode` 的规范字段，避免两个字段含义冲突。

每会话取第一次开始页提交方式；分别展示 natural_language、template、blank、no_submission 的人数与比例，分母均是该组 new_story 会话。后续资料箱粘贴不会改变入口分类。迁移会话不进入分母。纯点击模板但未提交归 no_submission。

## 场景效果

固定枚举：starter、character、outline、migration、world、timeline、clues、research；任意自定义名称被清洗，不保存内容。

- `scenario_impression`：页面前台时卡片至少 50% 可见；折叠或横向滚动范围之外的不计数。一次开始页会话每卡最多记录一次。点击卡片本身亦确认曝光，以避免观察器回调时序丢失。
- `scenario_selected`：用户点击卡片。离线点击量按每会话、每场景去重，要求此前已有同卡曝光。
- 提交与价值归因：首次 intent_submitted 前最后选择的场景，且提交携带相同 scenario_id。每会话至多一个场景获得后续价值归因；切换路径清除场景归因。
- CTR = 有效选择会话数 / 曝光会话数；Value Conversion = 归因首次价值会话数 / 有效选择会话数。完整输出曝光 → 点击 → 意图提交 → 首次价值。零分母显示 n/a。空白开始无意图提交，不计场景的后续价值。

卡片位置、折叠、路径差异会影响曝光；这些指标用于找阻塞点，不能证明卡片的因果效果。当前英文本地入口也不代表已有海外用户样本。

## 验证

[调试页](../debug/funnel.html) 的 Case A/B 按钮只做不落库的合成状态机检验。Case A 自动创建不能激活；Case B 后续主动编辑保存才激活。真实按钮、标题保存、资料收集与搜索链路由可选 `tests/measurement-browser.cjs` 在一次性浏览器中回归；这是合成浏览器测试，不是真人研究。

真人研究见 [任务手册](REAL_USER_VALIDATION.md)，当前完成 0 人。历史业务提升数字必须保留独立证据来源；原型不能宣称“首次价值提升 12%”。
