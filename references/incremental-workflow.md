# 入口体检与增量记忆 · v2.3

## 入口

`node <skill>/scripts/memory.mjs doctor --project <project>` 不修改文件，检查AGENTS标记/recall入口、INDEX的recall/cues导航、核心文件和卡片原文定位，返回 findings、cueHealth 和修复建议。ok=false会以非零退出。它是结构体检，不是自然语言规则完整性证明；不验证宿主是否发现Skill，不检查所有Markdown链接，也不代替 archive verify。

缺失文件可 init 补齐；已有入口过旧则由agent读取全文、准备最小diff，保留用户内容与权限限制。不要将初始化成功说成旧项目自动升级完成。自定义路径/其他记忆布局应人工接入，不强制迁移。

## 增量

1. 保存当前可见原文并archive，注明覆盖范围和缺口。
2. `coverage --project <project>` 检查archive中的UTF-8 payload，列出非空未覆盖行范围及来源失效的卡；大文件/非文本返回error，不计作已处理。
3. Agent只读取需要处理的范围，按语义而非逐行提取卡片。含多个独立话题的行应拆节选，不能用覆盖数字证明所有话题都被理解。
4. `remember --project <project> --input <cards.json>` 预检并入库，返回saved/skipped。去重比较来源位置/哈希、引文、状态、摘要、特征与关联；不把相似主题或不同来源自动合并。卡片title不参与等价判定。
5. cue-verify及相关查询核验；同ID冲突用新ID及明确替代关系处理。语义提取仍由运行中的Agent完成，不是常驻自动模型。

coverage从现有卡片推导，无独立覆盖台账，因此卡片删改/来源变化不会留下虚假的完成标记。只涵盖archive，不扫描整个项目或账号。默认返回未覆盖范围，不返回对话全文；大批档案按批处理避免输出膨胀。

## 可重复测试

`node --test <skill>/scripts/test_memory.mjs <skill>/scripts/test_recall.mjs <skill>/scripts/test_incremental.mjs`

脚本覆盖缺失入口、旧入口不被覆盖、同义线索、重复入库、待处理范围、来源变化、矛盾/替代、相对路径迁移与备份恢复。合成输入不等于实际用户历史。

原生Agent行为测试必须另做：隔离项目中给出普通任务与明确项目路径，显式加载Skill，但不提示记忆答案或逐项读取步骤。观察它是否读入口、核对证据、按独立交付范围实际委派；另以简单任务测试不委派。用户中途变更约束时，还应检查转发与旧产物失效；未执行的场景只能列为待测。测试没有生图授权时不得调用生图。保留成果和工具证据，不能用角色名单冒充协作。
