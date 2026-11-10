# Project Continuity

**当前版本：v2.5**

一个面向 Codex 的项目协作与本地长期记忆 Skill。它将详细对话、执行报告和原始证据留在本地，通过特征线索按需找回旧记忆，并根据任务边界组织多 Agent 协作，减少主对话反复携带大量背景材料。

## 核心能力

### 特征线索优先的记忆

以有独立含义的对话片段建立记忆卡，提取关键词、别名、人物/地点/物件与情境线索，记录原文位置、引文和状态。例如，原文讨论“猫、宫殿、水墨”，卡片可补充“猫咪、墨绘”等别名，帮助后续通过不同叫法找回讨论。

恢复顺序是：**特征线索 → 少量记忆卡 → 核对原文 → 按需读取事件记录**。“目标、完成、验证、下一步”保留为执行辅助，不是创建记忆的前提。旧方案可以被找回，但会显示其替代关系，不能直接当作当前有效要求。

### 按工种组织多 Agent

主 Agent 负责需求、接口、整合、验收和规范记忆；独立执行任务按交付物拆分给专业子 Agent。Worker 接收最少必要背景，写入独占目录，详细报告落盘，最终简短回传成果路径与验证结果。简单或强依赖任务保持单 Agent。

具备适当工具与授权时，可使用临时生图 Worker，将参考材料和提示词过程尽量留在执行侧，主对话展示最终图片与必要状态；图片工具无法跨 Agent 使用时明确降级。

### 本地保存与增量维护

- 原文归档：保留导入字节、来源、覆盖范围、大小和 SHA-256。
- 入口体检：发现缺失或过旧的项目入口，提供修复建议。
- 增量建卡：定位归档中尚未被卡片覆盖的行范围，由 Agent 按语义提取特征。
- 重复检测：等价卡片跳过，同 ID 内容冲突拒绝覆盖。
- 来源核验：提示卡片来源变化或丢失，区分建议、确认及被替代记录。
- 本地备份：复制记忆目录及项目规则，检查复制前后的文件清单与哈希。

## 安装

将本仓库内容放入名为 `project-continuity` 的文件夹，并安装到当前账号的 Skill 目录：

```text
设置了 CODEX_HOME：<CODEX_HOME>/skills/project-continuity/
默认位置：~/.codex/skills/project-continuity/
```

目标目录中应直接包含 `SKILL.md`、`scripts/`、`references/` 等，避免重复嵌套文件夹。已有版本先备份并比较自定义内容。按客户端支持的方式重新加载 Skill，必要时新开聊天。

脚本推荐 **Node.js 18+**，无第三方 npm 依赖。旧 Python 初始化器保留兼容，新功能使用 Node 脚本。

## 快速开始

在目标项目聊天中输入：

> 使用 $project-continuity 接入当前项目，检查已有规则与记忆。先按特征线索恢复相关原文，再继续当前任务；适合独立交付的工作按需安排子 Agent。

手动初始化（把路径替换为实际安装目录与项目路径）：

```bash
node /path/to/project-continuity/scripts/memory.mjs init --project /path/to/project --dry-run
node /path/to/project-continuity/scripts/memory.mjs init --project /path/to/project
```

Windows 路径包含空格时，请给路径加双引号。初始化只创建缺失模板、追加缺失入口，不覆盖已有项目记忆；旧入口需要读取后做最小修改。

## 常用命令

以下命令均运行本仓库的 `scripts/memory.mjs`：

| 命令 | 用途 |
| --- | --- |
| `doctor --project <项目>` | 只读检查项目入口、核心文件和卡片来源，返回修复建议 |
| `archive --project <项目> --input <文件> --kind excerpt --source "来源" --coverage "范围及缺口"` | 保存原始导出、对话片段或报告 |
| `coverage --project <项目>` | 查看归档中尚未建卡的行范围及失效来源 |
| `remember --project <项目> --input <cards.json>` | 校验并保存 Agent 提取的记忆卡，跳过等价重复 |
| `recall --project <项目> --query "猫咪 墨绘" --limit 5` | 按特征和别名检索候选记忆 |
| `recall --project <项目> --query "色彩" --current-only` | 过滤被替代的卡片；仍须核对当前要求与来源 |
| `search --project <项目> --query "关键词"` | 原文字面检索，作为无卡片命中时的后备 |
| `verify --project <项目>` | 检查归档原文完整性 |
| `cue-verify --project <项目>` | 检查记忆卡与原文定位 |
| `backup --project <项目> --output <不存在的备份目录>` | 备份本地记忆及项目 AGENTS.md |

`remember` 接收单张卡或卡片数组，格式见[特征唤回协议](references/cue-memory.md)。`archive` 的 kind 支持 `transcript`、`excerpt`、`summary` 和 `report`。

## 项目记忆结构

```text
项目目录/
├── AGENTS.md
└── .project-memory/
    ├── INDEX.md             检索入口及少量主题导航
    ├── current.md           当前执行状态
    ├── requirements.md      有效要求
    ├── decisions.md         决策及变更依据
    ├── preferences.md       偏好与适用范围
    ├── cues/                分片存储的特征记忆卡
    ├── archive/             原始记录及元数据
    └── tasks/               Worker 简报、报告与成果
```

新聊天或迁移后，明确提供项目路径，先读 INDEX 并按话题执行 recall。换机器/账号时需要携带项目记忆及相关成果；仅复制 Skill 不会复制项目历史。

## 能力边界

- 特征提取由运行中的 Agent 完成；本地脚本负责保存、校验和词匹配排序。目前没有 embedding 向量模型，也没有后台自动监听。
- 已安装不等于每次聊天都会自动加载。主动读取与委派规则在 Skill 被宿主加载后生效，并始终服从当前用户指令和宿主权限。
- 无法自行恢复不可见、已压缩或未导出的完整聊天，缺失历史须明确登记，不得补写成事实。
- 文件保存在磁盘时不占模型上下文，读取后仍占用；Skill 无法清除已经进入主对话的内容，也不保证多 Agent 一定降低总成本。
- 检索命中和来源哈希不能证明事实仍有效；覆盖行数不等于语义已完整提取。需要核对原文、最新要求与实际产物。
- 不保存凭据，不自动扫描整个账号或其他项目；外部处理与生图沿用用户授权。备份前应暂停其他写入，外部素材和项目其他源文件不在记忆备份范围内。

## 验证

在仓库目录运行：

```bash
node --test scripts/test_memory.mjs scripts/test_recall.mjs scripts/test_incremental.mjs
```

v2.3 开发时记录：11 项通过、1 项因系统不允许创建测试链接而跳过。原生 Agent 场景验证了复杂任务恢复已确认约束并实际委派，以及简单任务无需额外委派。这些结果不代表已验证宿主自动加载、真实生图、执行中用户改需求或大规模检索性能。

## 详细文档

- [Skill 执行规范](SKILL.md)
- [安装与迁移](INSTALL.md)
- [特征记忆与唤回](references/cue-memory.md)
- [入口体检与增量维护](references/incremental-workflow.md)
- [本地归档与备份](references/local-memory.md)
- [多 Agent 协作](references/delegation.md)
- [临时生图 Worker](references/image-workers.md)

## v2.4 更新

- 检索反馈：feedback记录correct/irrelevant/outdated、用户或Agent归因、查询、理由和可核对原文。recall附带同查询反馈及来源状态，不自动改变排名或事实。
- 任务修订：task-pin固定需求来源，task-check在验收前检查变化；协调Agent负责把新要求转发给Worker、标旧稿失效并用新任务ID重做。
- 验证：完整脚本回归新增 scripts/test_feedback_revision.mjs；v2.4共13项通过、1项因系统链接权限跳过。原生Worker测试在旧稿完成后注入测试变更，实际通知并重做；这不是对真实用户中途输入、自动取消进程或多分支并发的一般保证。

协议与命令：[检索反馈与任务修订](references/feedback-revisions.md)。

## v2.5 完善与恢复

- 损坏记录隔离：recall保留有效结果并返回warnings，doctor统一检查入口、归档、卡片、反馈、处理记录与任务。
- 反馈闭环：查询词序归一，feedback-resolve记录待处理后的核对、纠正、无需修改或不采纳事件；纠正须关联实际卡片并重新检索。
- 范围管理：review-skip记录已检查无需建卡的片段及理由，来源变化后自动重新待处理。
- 成果绑定：task-bind/task-verify核对任务修订、来源与成果哈希；严格拒绝空来源和异常任务清单。
- 故障测试：24项中22通过，2项因系统链接权限跳过；包括中断残留、损坏文件、备份恢复、迟到旧分支拒收、新分支通过及不受影响分支继续有效。这些是确定性状态测试，不代表本轮真实多Worker并发已验证。

完整协议、输入格式与六份测试文件的运行命令见 [v2.5完整性协议](references/integrity-v2.5.md)。
