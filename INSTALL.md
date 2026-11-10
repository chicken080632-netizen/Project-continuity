# 安装与迁移 · v2.3

本包提供按工种协作与本地项目记忆。推荐 Node.js 18+，无 npm 依赖；旧 Python 3.9+ 初始化器仍保留，但新增归档等功能使用 Node 脚本。

## 安装与更新

复制整个文件夹到当前账号的 skill 目录（设置 CODEX_HOME 时为其中 skills，否则为用户目录 .codex/skills）。已有同名版本时先比较并备份，不覆盖未检查的定制文件。本次工作副本在 `D:\D_Codex\AI相关\project-continuity`，本机已安装位置为 `C:\Users\msi\.codex\skills\project-continuity`；其他机器不要复用本机绝对路径。按客户端支持方式重新载入，必要时开启新聊天；不保证当前聊天中已注入的旧说明自动更新。

## 初始化与使用

> 使用 $project-continuity 初始化当前项目，检查已有记忆与规则，从已知事实填入记录。适合独立交付的任务可按工种安排子 agent，必要时使用临时生图 worker，主对话展示最终成果与简短状态。

```text
node <本包绝对路径>/scripts/memory.mjs init --project <项目绝对路径> --dry-run
node <本包绝对路径>/scripts/memory.mjs init --project <项目绝对路径>
```

初始化只补缺失文件。已有记忆系统优先接入；旧 AGENTS 标记块和偏好不会自动升级或新增永久授权。需要长期按工种协作时，明确让 agent 把此偏好及适用范围记录到目标项目。适用宿主限制始终优先。

## 保留对话与恢复

> 将当前可见、尚未归档的对话保存到本项目，精确保留我的要求和纠正，注明范围及缺口；更新检查点。若有项目聊天导出接口，读取本项目明确范围；无法取得的历史不要补写。

详见 [本地记忆协议](references/local-memory.md)。可用 archive 保存导出原字节，search 按词定位，verify 检查完整性，backup 复制整个记忆目录。没有后台监听、账号日志扫描或自动备份任务；不能承诺捕获全量历史。图片生成过程的隔离依赖宿主实际工具能力。

新聊天接续：

> 使用 $project-continuity，先读 <项目绝对路径>/.project-memory/INDEX.md，提取当前话题特征词执行 recall 并核对原文；需要执行状态时再读 current.md。

换账号/机器携带项目 AGENTS.md、完整 .project-memory 和相关成果/素材，再安装 Skill。只复制 Skill 不会复制项目历史；外部素材不包含在 memory backup 中。其他 AI 工具需按其支持的入口显式接入，不能假定自动读取 AGENTS.md。

## 本地验证

```text
node --test <本包绝对路径>/scripts/test_memory.mjs <本包绝对路径>/scripts/test_recall.mjs
```

测试在当前目录临时创建隔离夹并清理，只验证本地脚本；不代表真实生图/多 agent 集成或完整对话采集已验证。

## 特征记忆优先（v2.1）

> 先保存可见原文，为每段有独立含义的记忆提取关键词、别名、人地物与情境线索，创建可追溯记忆卡；之后按需要更新目标、完成、验证和下一步。恢复时先用线索唤回，再查事件记录。

[特征唤回协议](references/cue-memory.md)包含卡片格式、remember / recall / cue-verify 命令和旧档渐进回填方法。特征提取由 Agent 执行，本地脚本负责校验、保存与匹配；不是自动 embedding 模型。旧项目 INDEX/AGENTS 需要显式最小修改，init 不覆盖既有文件。

## v2.3 入口体检与增量建卡

首次接入/路径异常先运行 doctor；每批原文归档后运行 coverage，按未覆盖范围提取特征并remember，再用cue-verify核对。旧INDEX/AGENTS只做最小修复，不整文件覆盖。详见 references/incremental-workflow.md。

完整脚本回归：node --test <skill>/scripts/test_memory.mjs <skill>/scripts/test_recall.mjs <skill>/scripts/test_incremental.mjs。
