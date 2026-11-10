# 检索反馈与执行中需求修订 · v2.4

## 检索反馈

`node <skill>/scripts/memory.mjs feedback --project <project> --card <id> --query "原查询" --rating irrelevant --reason "具体原因" --actor user --input <evidence.json>`

rating 为 correct / irrelevant / outdated，actor 为 user / agent；输入JSON形如 `{"quote":"这个结果无关","source":{"path":"项目相对原文路径","startLine":2,"endLine":2}}`。必须真实引文、准确来源及行号；脚本验证引文与定位，不验证说话人身份和理由的语义，协调者负责核对。用户未评价时不能以user身份记录Agent猜测。

独立JSON保存在 .project-memory/feedback/，带来源片段哈希、时间与原查询，不改原卡。recall只附带同卡、同规范化查询的反馈统计和最近3条原因；显示来源失效状态。不做近义查询跨范围传播，不自动降权/升权、不自动删除或改变事实状态。不同意见可以并存，数量不是事实证明。

闭环：出现明确纠正→保存来源与feedback→核对原文及当前要求→必要时remember新卡（补别名/情境，或已确认替代关系）→用原查询再次recall验收。不明确的反馈只保留记录，不改变卡片。不要为收集反馈反复询问用户。备份自动包含feedback目录。

## 固定任务修订

将修订输入写为 `{"revision":"r1","sources":[".project-memory/requirements.md"]}`，source路径为项目内相对路径，可包含多个需求/接口文件。

```text
node <skill>/scripts/memory.mjs task-pin --project <project> --task visual-r1 --input <pin.json>
node <skill>/scripts/memory.mjs task-check --project <project> --task visual-r1
```

pin以独占创建保存 tasks/<id>/revision.json，拒绝覆盖；不要把会变化的current或成果日志作为需求来源。每个Worker简报包含任务ID/修订号/固定来源，回传须带相同标识。

需求中途改变时：

1. 主Agent先保存用户确切新要求、来源和修订号，更新有效需求；不把仅有的设想当成批准变更。
2. 识别影响范围，及时通知相关Worker；明确旧修订不再验收。工具支持时停止过期任务，否则指示停止写入旧成果；不影响的分支保留。
3. 旧稿保留并在报告/交接索引标为superseded，不覆盖伪装成新稿。用新任务ID与新pin创建r2，在独占新路径重做。
4. Worker收到通知后读取新要求；回传修订号。主Agent集成前检查task-check和实际内容；迟到的r1即使声称成功也不得直接接受。

task-check比较固定源字节哈希，源改变/丢失或路径越界会失败，CLI非零退出。它不自动向Worker发消息、不负责取消进程、不验证成果确实遵循需求，也不是实时文件锁；通知和验收仍由协调Agent实际执行。新建pin并不代表用户批准其revision字符串。不要只更新标签而继续采纳旧内容。
