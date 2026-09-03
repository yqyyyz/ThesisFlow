export interface DemoAction {
  label: string;
  kind: "goto" | "openDoc" | "setMode" | "copy" | "reset";
  path?: string;
  docTitle?: string;
  mode?: "drafting" | "writing" | "review";
  copyText?: string;
}

export interface DemoStage {
  id: number;
  name: string;
  duration: string;
  steps: string[];
  actions: DemoAction[];
}

export const DEMO_STAGES: DemoStage[] = [
  {
    id: 1,
    name: "初始化与长期记忆唤醒",
    duration: "约 2 分钟",
    steps: [
      "展示全局控制台：系统已自动装载小林的 [User_Context]（AI 博士生 · 上下文工程与长上下文 RAG）",
      "进入「个人记忆库」：展示 10 条高置信度沉淀记忆（如 Lost-in-the-Middle 现象与注意力衰减机制关注、KV Cache 开销视角、因果推断与机制分析偏好）",
      "讲解分层 System Prompt：[Base_Persona] + [User_Context] + [Domain_Memory] 三层挂载，开题即带学术默契",
    ],
    actions: [
      { label: "打开记忆库", kind: "goto", path: "/domain/memory" },
      { label: "回到控制台", kind: "goto", path: "/" },
      { label: "重置演示数据", kind: "reset" },
    ],
  },
  {
    id: 2,
    name: "20+ 篇文献高效筛选与矩阵构建",
    duration: "约 3 分钟",
    steps: [
      "进入项目《AI 长上下文管理的工程化措施综述与展望》的文献工作台：展示 20+ 篇文献（PDF / Word / Markdown 三格式入库）",
      "讲解四维打分矩阵：LIGHT 模型完成质量/相关性/方法论/创新性评估，低分文献自动折叠（< 2.5 分），高分摘要标为 Mid Tier",
      "演示权重滑块实时重排 · 折叠/展开低分文献 · 快速锁定 Top 10 核心文献 · 切换「文献脉络图谱」看聚类与关系边",
    ],
    actions: [
      { label: "进入文献矩阵", kind: "goto", path: "/projects/demo/documents" },
    ],
  },
  {
    id: 3,
    name: "沉浸式精读与权重路由沉淀",
    duration: "约 3 分钟",
    steps: [
      "打开核心文献《Lost in the Middle》：左栏看一页纸结构化总结（核心问题/方法/结论/局限）",
      "划选关键结论并打「重点论据」标 → 该片段实时升权 Top Tier（×2.0），写作时优先 Attention",
      "右栏伴读问答提问「该文献的注意力衰减实验结论是什么？」→ 模型基于内部 Chunk top4 回答并附带 [c1] 锚点 → 点击跳页高亮定位",
    ],
    actions: [
      {
        label: "打开《Lost in the Middle》",
        kind: "openDoc",
        docTitle: "Lost in the Middle",
      },
      {
        label: "复制提问示例",
        kind: "copy",
        copyText: "该文献的注意力衰减实验结论是什么？",
      },
    ],
  },
  {
    id: 4,
    name: "起草商讨与长期记忆隐式进化",
    duration: "约 2 分钟",
    steps: [
      "进入写作工作台的「起草模式」，与 AI 商讨论文大纲；对话持久化，刷新不丢",
      "讲解：对话满 4 轮后，系统后台唤醒轻量模型提取讨论中表达的新偏好（如「分析长上下文时需引入 KV Cache 内存开销视角」），余弦比对后增量合并入长效记忆池",
      "点击「同步到大纲」一键提炼 Markdown 结构化大纲",
    ],
    actions: [
      { label: "进入起草模式", kind: "setMode", mode: "drafting" },
      {
        label: "复制商讨开场",
        kind: "copy",
        copyText:
          "我要写一篇《AI 长上下文管理的工程化措施综述与展望》，请帮我设计大纲：需要覆盖上下文窗口扩展、GraphRAG、混合检索与幻觉校验四条主线，并突出工程化措施的比较框架。",
      },
    ],
  },
  {
    id: 5,
    name: "提案式写作与双重防幻觉校验",
    duration: "约 4 分钟",
    steps: [
      "在写作模式输入指令「/续写 结合 Top 10 文献与我的批注，撰写关于注意力机制在超长上下文下的局限性」",
      "讲解提案卡机制：AI 永不直接修改编辑器，输出包含完整引用标记 [doc_id:chunk_id] 的提案卡供审核",
      "讲解三色引用徽标：蓝 = 校验通过（相似度 ≥ 0.70 或 NLI 蕴含）、黄 = 弱支持、红 = 无效引用/不存在",
      "点击「采纳」→ 基于 ProseMirror 的 applyContentChange 引擎将段落与引用节点原子化写入编辑器",
    ],
    actions: [
      { label: "进入写作模式", kind: "setMode", mode: "writing" },
      {
        label: "复制续写指令",
        kind: "copy",
        copyText:
          "/续写 结合 Top 10 文献与我的批注，撰写关于注意力机制在超长上下文下的局限性",
      },
    ],
  },
  {
    id: 6,
    name: "多维同行审查与一键修复闭环",
    duration: "约 1 分钟",
    steps: [
      "切审查模式点「审查全文」→ 五维建议卡（论证充分性/逻辑连贯性/结构完整性/学术规范性/方法严谨性），点击锚点定位对应段落",
      "勾选问题卡 →「AI 一键修改所选问题」→ 双重校验（引用标记完整性 + LIGHT 语义判定）→ 逐条 Diff 审核采纳",
      "展示采纳后建议卡置灰防重复 · 版本历史快照",
    ],
    actions: [{ label: "进入审查模式", kind: "setMode", mode: "review" }],
  },
];

export const WRITE_WORKSPACE_PATH = "/projects/demo/writing";
export const PROJECTS_LIST_PATH = "/projects/demo/documents";
