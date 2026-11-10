# v2.5 完整性、反馈闭环与恢复

## 损坏记录与统一体检

recall 对卡片、反馈和处理记录逐文件读取；无效JSON、结构异常或未完成临时文件形成 warnings，有效候选继续返回。不要将带警告的部分结果宣称为全部历史。doctor 汇总入口/核心文件、cue-verify、archive verify、memory-health、task-health；任一异常则ok=false，CLI非零。过期任务也会报告失败，需区分历史失效与存储损坏，不能据此删除旧记录。

发现故障先备份，按警告路径核对原文/独立副本；恢复到新目录并重新体检再接续。不自动删除坏记录或声称可恢复从未保存的字节。task元数据先写入并刷新临时文件再独占发布；意外终止可能留下临时文件或不完整目标，health会诊断。其他记忆文件也可能部分写入；容错读取不是完整的文件系统事务。

## 查询归一与反馈处理

查询按Unicode规范化、英文小写、空格/逗号分词、去重排序来关联反馈；“猫 宫殿”和“宫殿 猫”共享记录。不是任意近义理解，也不合并不同语义实体。

`feedback-resolve --project <project> --input <resolution.json>` 输入示例：

```json
{
  "feedback": "真实feedback记录ID",
  "state": "corrected",
  "cards": ["已存在且能被原查询找回的卡ID"],
  "query": "原查询词",
  "reason": "已核对纠正并补充线索",
  "quote": "纠正原话",
  "source": {"path": "项目内证据相对路径", "startLine": 2, "endLine": 2}
}
```

state 为 reviewed（已核对但未闭环）、corrected（已补卡/替代）、no-change（核对后无需修改）、dismissed（已说明不采纳）。没有事件时是pending。cards用数组，无需修改时可为空。corrected要求非空已有卡，并实际以原查询recall且来源未变化；只改状态不会自动建卡。脚本不证明新卡语义确实正确，主Agent仍须核对。每次处理写独立resolutions事件，保留历史；recall显示当前处理状态、关联卡和事件ID，不改变排名。凭据、心理推断和虚构用户评价禁止入库。

## 已检查但无需建卡

`review-skip --project <project> --input <review.json>` 输入为 `{"quote":"你好","reason":"纯问候，无可提取项目特征","source":{"path":".project-memory/archive/真实ID/payload","startLine":1,"endLine":1}}`。

只允许归档原文、准确引文与具体理由。coverage区分coveredLines、reviewedSkippedLines和pending；原文片段哈希变化则跳过记录失效，范围重新进入pending。跳过不是删除、不代表语义提取完成；不得用它掩盖未读取内容。

## 成果版本绑定

1. task-pin固定需求后下发Worker；源路径统一使用项目相对路径及 `/`。
2. 获得文件并验收后执行 `task-bind --project <project> --task <id> --input <delivery-input.json>`，输入 `{"revision":"r2","artifacts":["tasks-output/visual-r2.md"]}`。必须与pin修订一致，需求检查通过；不允许空来源/空产物、危险路径、无效哈希或覆盖旧交付清单。
3. 集成前执行 `task-verify --project <project> --task <id>`，核对task ID、修订、pin字节哈希、来源及每份成果哈希。来源变更、文件被改、清单被篡改时失败。新修订用新任务ID与新成果路径。

哈希只能证明所绑定的文件未变化，不能判断旧内容被误贴新标签；实际内容验收仍必需。task-check只查需求；task-verify还查交付。旧版pin可继续读取，但空列表或异常结构会拒绝。task-health允许普通未pin任务目录，孤立delivery、坏清单和临时文件报异常。单任务异常不阻断其余任务检查。

## 可重复验证

```text
node --test scripts/test_memory.mjs scripts/test_recall.mjs scripts/test_incremental.mjs scripts/test_feedback_revision.mjs scripts/test_tasks_v25.mjs scripts/test_recovery_v25.mjs
```

v2.5测试涵盖损坏反馈/部分卡写入、备份恢复、来源丢失、词序互换、反馈关联与原查询复检、跳过片段后原文变化、异常pin、临时文件、成果篡改，以及r1迟到成果拒收/r2通过/不受影响分支继续有效。此轮是确定性的故障与多分支状态模拟，非真实并发Worker执行证明；真实受控Worker变更测试见v2.4验证记录。链接拒绝用例依赖系统权限，不可将跳过说成通过。

来源变化后的处理状态：recall会重新核对最新处理事件及关联卡来源，失效时保留recordedState并显示needs-review及warnings，不继续把旧corrected状态当作有效闭环。
