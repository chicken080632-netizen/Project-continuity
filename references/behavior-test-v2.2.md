# v2.2 行为测试记录

日期：2026-11-10。

隔离项目：output/continuity-behavior-test。测试请求提供Skill入口与项目位置，要求沿用前期约定完成海报文字稿及视觉规格，没有逐项提示读取哪些记忆文件。允许按Skill自主委派。

结果：执行Agent读取AGENTS、INDEX，recall为空后读取requirements等记忆与evidence原文，恢复标题“山间旧梦”、青绿色、禁用红色。实际调用原生spawn_agent创建visual_spec，子Agent交付visual-spec.md及visual-report.md，协调Agent完成poster-copy.md并核验。主测试Agent的委派由工具状态实际观察到，非模拟客户端。

限制：显式加载Skill后的行为测试通过；不能由此证明新聊天会自动发现/选择Skill。当前宿主声明没有可用的已选环境Skills，因此本次通过绝对路径显式加载。旧项目的AGENTS不会因更新Skill自动重写，需最小增补入口。未测试真实生图、无人值守执行或跨账号恢复。

回归：node --test scripts/test_memory.mjs scripts/test_recall.mjs，9通过、1因OS链接权限跳过。
