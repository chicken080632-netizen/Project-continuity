# 本地记忆、原文归档与恢复

## 路径与覆盖范围

项目内 `.project-memory/` 是默认唯一入口；INDEX 使用相对路径方便迁移，交接使用绝对路径。不在账号全局记忆里复制项目历史。已有外部记忆库时记录其入口、权限与项目对应关系；脚本不跟随记忆目录中的链接/junction。

```text
.project-memory/
  INDEX.md / current.md / requirements.md / decisions.md / preferences.md
  archive/<时间-随机ID>/record.json   来源、覆盖范围及哈希
  archive/<时间-随机ID>/payload       导入的原始字节
  tasks/<task-id>/brief.md / report.md / artifacts/
```

原文优先来自用户提供的聊天导出，或本次授权且能够读取的项目会话接口。不要遍历账号全部聊天、猜测私有日志位置或把模型隐藏推理当对话。仅导出本项目明确范围，不自动上传任何服务。

没有完整导出能力时，将当前可见且尚未记录的用户原话、助手回答和必要工具结果保存为 UTF-8 文件后归档。不可恢复的历史、已压缩内容和不可用附件要登记缺口。摘要标为 summary，不能冒充 transcript。每批写明 session/thread ID（如可得）、时间/消息范围、来源与缺口。

重要约束出现时立即写规范记忆；阶段结束/交接保存尚未归档的对话批次，不重复抄写旧批次。规范事实引用归档 ID、源消息/文件或验证命令；修正以新记录和 supersedes 关系表达，不篡改原文。

## 命令（Node 18+，无第三方依赖）

使用本包真实路径：

```text
node <skill>/scripts/memory.mjs init --project <project> [--dry-run]
node <skill>/scripts/memory.mjs archive --project <project> --input <export-file> --kind transcript --source "聊天导出/会话ID" --coverage "消息1至80；缺少附件"
node <skill>/scripts/memory.mjs search --project <project> --query "屋顶" --limit 10
node <skill>/scripts/memory.mjs verify --project <project>
node <skill>/scripts/memory.mjs backup --project <project> --output <new-backup-directory>
```

kind 为 transcript / excerpt / summary / report。archive 保存原字节、SHA-256、大小、导入时间、原文件名、来源和覆盖范围；不验证原文真实性/完整性，调用者须先排除凭据。搜索限 UTF-8 文本和元数据，输出路径、行号与有限片段；不支持语义检索，不解读 PDF、Office、图片或压缩文件。先定位再按行读取，避免全文载入。

verify 校验元数据及 payload，不能证明同盘文件未遭恶意篡改。backup 复制整个记忆目录和项目 AGENTS.md 到不存在的新目录，不含整个项目或外部素材；失败目录可能不完整，须检查命令结果。不是后台备份计划。

默认不自动过期或删除。长期可靠性仍需独立备份；重要阶段/迁移前在允许目录建立副本，另一个物理介质更能抵御单盘损坏。恢复先 verify，再检查 current 与真实产物。只复制 Skill 不会携带项目记忆。无检索命中不代表历史不存在，需检查覆盖范围。

## 旧项目升级

初始化只补缺失文件，不覆盖已有 current、偏好或规则。检查旧 INDEX 是否发现 archive/tasks，必要时最小增补链接。已有 AGENTS 标记块不自动替换；不擅自变更旧授权，不迁移、删除或合并旧档案。详细原文落盘不占模型上下文，读取仍占用；完整导出依赖宿主实际能力，Skill 不提供自动全量监听。

备份前暂停 worker 和其他写入；脚本比较复制前后的文件清单、源及副本哈希，发现变化即报失败。它不提供文件系统事务锁，不能取代静止状态下的快照。

search 为避免巨型文件占满内存，跳过超过16 MiB的单文件并返回 skipped；对这些文件用 rg 定位或专用读取器，不可把无命中视为没有记录。

## 特征索引（优先入口）

原文归档后先按 [特征唤回协议](cue-memory.md) 给语义片段创建 cues/<id>.json，恢复时先 recall 再按来源读取，最后按需查 current 等事件记录。search 仍是字面查找的后备，不承担别名联想。verify 检查归档，cue-verify 检查卡片和原文定位；备份包含 cues/，但卡片引用的项目其他文件须随项目携带。
