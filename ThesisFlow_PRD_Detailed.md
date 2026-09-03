# ThesisFlow 科研协作智能体 (Demo) 详细产品方案 (PRD)

> **Demo 范围说明**：本文档描述 ThesisFlow 的完整产品方案，Demo 版本覆盖全部四大核心功能模块（领域知识库、文献筛选矩阵、沉浸式精读、多模式写作工作台），以验证"防幻觉 + 长效记忆"的核心产品假设。后续迭代方向包括多人协作、移动端适配等。
>
> **文档结构说明**：本文档已将原独立的《上下文工程全流程》文档整体并入——第七章描述上下文工程的**设计意图**，第九章描述其**工程实现**（含模块级配置参数与代码锚点，9.7 节为增量机制与关键链路），第十章为与实现同步的迭代记录。凡标注「规划版」的内容为完整产品愿景，标注「Demo 实现」的为当前代码实际状态，二者差异见第十章章首口径说明。

## 一、 产品定位与核心价值
*   **一句话定位**：一款专为广大科研工作者打造的学术写作与文献工作台，通过深度知识管理、智能问题梳理、多维文献筛选与全链路引用溯源，全面提升从选题、文献整理到论文起草的整体科研效率。
*   **目标用户**：各学科高校师生、科研院所研究人员及各类学术工作者。
*   **核心理念**：将传统的“单向辅助”升级为“个性化共生”，系统通过长效记忆与知识沉淀，越用越懂研究者的学术脉络与写作偏好。

## 二、 用户画像与典型旅程 (User Personas & Journey)

### 典型用户画像
*   **Persona A - 博士生小林**：经济学博三，正在撰写博士论文，需要同时管理 100+ 篇文献，经常苦于引用溯源困难、文献间对比混乱，以及写作过程中 AI 生成的内容与引用文献不符。
*   **Persona B - 青年教师张老师**：信息管理方向助理教授，同时指导 3 名硕士生，需要快速掌握新领域的宏观脉络，并对学生的文献阅读与写作质量进行把关。
*   **Persona C - 独立研究员 Dr. Chen**：在海外研究机构从事跨学科研究（NLP + 社会科学），需要中英文双语写作支持，频繁在两个学科领域间切换上下文。

> **Demo 演示人设说明**：Demo 种子数据采用「小林」的同构实例——AI 领域博士生（研究方向：上下文工程与长上下文 RAG），以《AI 长上下文管理的工程化措施综述与展望》为演示课题，便于种子文献与演示剧本自成体系；产品设计本身面向多学科通用。

### 典型用户旅程（以 Persona A 为例）
1. **Onboarding**：小林设定身份为"经济学博士生"，核心领域为"平台经济与信息行为"，偏好 APA 格式。
2. **领域知识积累**：上传 5 篇核心综述至领域知识库，AI 生成领域图景报告并沉淀小林的研究偏好（如：偏好因果推断方法论）。
3. **新建项目**：创建项目"平台治理中的算法偏见研究"，AI 自动关联领域知识库中已有的背景材料。
4. **文献导入与筛选**：批量导入 40 篇 PDF，AI 自动四维打分，小林重点精读 Top 10 文献并打标批注。
5. **写作工作台**：进入起草模式与 AI 讨论大纲 → 切换写作模式逐段撰写，AI 生成的每句引用自动带溯源角标 → 切换审查模式获取修改建议。
6. **导出与迭代**：导出为 Word/LaTeX，根据导师反馈修改后重新导入审查。

## 三、 竞品分析与差异化定位 (Competitive Landscape)

| 竞品 | 核心定位 | ThesisFlow 的差异化优势 |
|------|---------|----------------------|
| **Elicit** | 基于 LLM 的文献检索与摘要工具 | Elicit 仅覆盖"文献发现"环节，缺少精读批注、写作工作台和引用溯源闭环；ThesisFlow 提供从选题到成稿的全链路支持 |
| **Scite** | 以引用上下文分析为核心的文献平台 | Scite 侧重引用计量分析，不具备写作辅助能力；ThesisFlow 的防幻觉溯源机制在写作阶段实现 Chunk 级引用绑定 |
| **Notion AI** | 通用 AI 写作助手 | 缺乏学术领域深度优化（四维文献打分、RAG 权重路由、学术格式规范）；无长效知识记忆体系 |
| **Overleaf + AI 插件** | LaTeX 协作编辑平台 | Overleaf 的 AI 功能为轻量级补全/润色，不具备文献管理、知识沉淀和防幻觉溯源能力 |
| **Consensus / Semantic Scholar** | 学术搜索引擎 | 仅提供检索层能力，不覆盖精读、写作与引用追踪环节 |

**核心差异化总结**：ThesisFlow 是目前唯一将"长效记忆 + 防幻觉溯源 + 全链路写作"三者深度融合的科研工具，形成从"领域认知积累 → 文献结构化 → 精准写作"的完整闭环。

## 四、 全局信息架构与空间划分 (Information Architecture)
为了保证复杂科研任务的有序性，系统在全局架构上采用“用户身份 -> 知识管理域 -> 独立项目空间”的分层设计。

### 1. 个性化上下文初始化 (User Onboarding & Context Setting)
*   **身份与偏好设定**：用户首次登录时，设定学术身份（如：博士生、博士后、独立研究员）、核心研究领域与子领域。这些信息将作为全局 System Prompt 的底层 Context，确保 AI 的输出口吻和建议深度契合用户学术阶段。
*   **写作习惯选择**：可设定默认偏好的学术规范（如 APA、MLA、芝加哥格式）和惯用的写作语言环境。

### 2. 长效知识管理域 (Domain Knowledge Base)
*   **定位**：独立于单一项目的宏观知识沉淀池，充当研究者的“第二大脑”。

### 3. 独立项目空间 (Project Workspaces)
*   **定位**：以具体的“研究问题（Research Question）”或“论文（Paper）”为边界的独立工作流容器。
*   **功能**：每个项目空间内包含从“选题 -> 搜集 -> 精读 -> 写作”的完整闭环，项目间的文献与草稿相互隔离，但都可以从“长效知识管理域”中调用背景知识或更新领域动态。

## 五、 核心功能模块设计与交互细节

### 模块一：领域知识库与深层研究管理 (Domain Knowledge & Deep Research)
*   **功能描述**：结合用户的长效关注点，对特定子领域进行宏观动态跟踪、知识结构化梳理与个性化记忆沉淀。
*   **交互细节**：
    *   **领域图景生成 (Landscape Overview)**：AI 定期或按需生成该领域的宏观报告（研究边界/热点/前沿三段式），并输出**横向思维导图**：根节点 → 3-5 个主方向 → 子节点，每个节点含 80-150 字进展解读与关联文献，强制包含 ≥2 个「研究缺口」节点。
    *   **动态个人记忆库 (Personalized Memory Context)**：
        *   **隐式记忆**：AI 自动记录用户在过往项目起草、文献梳理和写作中反复强调的细节（例如："用户偏好使用双重差分法分析社交媒体数据"），沉淀为该领域的个人偏好标签。
        *   **显式管理**：用户可手动录入记忆，或上传经典教材、核心综述等作为领域知识库基础资料；支持手动修改或微调 AI 提取的记忆条目。
        *   **冲突裁决**：新旧记忆语义倾向冲突时弹出裁决卡（保留新/保留旧/合并），由用户定夺。
    *   **知识挖掘动态流**：知识库文献入库后自动生成 ≤80 字知识增量提示，主页按时间流呈现；项目主页展示项目进展 AI 摘要（签名缓存，指标变化才调用 LLM）。
    *   **文献导入来源**：Demo 支持 PDF / Word(.docx) / Markdown 手动上传；浏览器插件一键抓取（兼容 Google Scholar、Semantic Scholar、arXiv、知网等平台）与 DOI/ISBN 批量检索导入为规划版。
    *   **记忆生命周期管理**：隐式记忆支持用户查看、编辑和删除；系统每月生成"记忆健康报告"，标记过期或低频引用的记忆条目供用户确认清理；当新旧记忆冲突时（如用户研究方向转移），系统主动提示用户裁决。

### 模块二：动态文献筛选、矩阵 (Screening & Matrix)
*   **功能描述**：实现"质量过滤 + 结构化矩阵 + 可视化脉络"的立体化文献整理。
*   **交互细节**：
    *   **批量导入与去重**：支持 PDF / Word(.docx) / Markdown 批量上传，DOI 精确匹配或标题向量相似度自动查重；内置标题识别链路（字号聚类 + 横幅黑名单 + 大小写边界切分 + LLM 兜底 + 手动纠正）。
    *   **四维打分过滤**：导入文献后，AI 自动进行"质量、相关性、方法论严谨度、创新性"四维评估，低分文献自动折叠。
        *   **评分标准**：每维度 1-5 分。**质量**——期刊/会议等级、被引量、写作规范性；**相关性**——与当前项目研究问题的语义匹配度；**方法论严谨度**——实验设计完整性、样本量、统计方法合理性；**创新性**——是否提出新理论/新方法/新数据集。评分模型根据用户所属学科动态校准（学科锚点样例注入）。
        *   **自定义维度**：用户可在内置四维之外增加自定义维度（≤4 个），并可对现有文献一键重打分。
        *   **人工校正与反馈学习**：矩阵页分数格内联改分 + 填写校正理由（显示「人工」徽标，加权总分即时重算）；校正记录作为 few-shot 样例注入该用户后续评分 Prompt，实现"越校正越准"。
    *   **加权排序与折叠**：各维度权重可调（默认等权），按加权总分排序；总分 < 2.5 的文献自动折叠。
    *   **脉络知识图谱**：对全库文献做主题聚类，生成关系标签边（扩展/支持/对照/背景/同主题）与 200-350 字脉络叙述；新文献就绪后提示用户主动更新（缓存防重复消耗）。
    *   **结构化对比矩阵（规划版）**：一键生成多篇文献的横向对比表格（研究对象、核心变量、结论等可自定义字段）。

### 模块三：沉浸式单篇文献精读 (Deep Reading & Annotation)
*   **功能描述**：提供沉浸式阅读空间，通过交互式批注为写作积累高权重上下文素材。
*   **交互细节**：
    *   **AI 预读与评价**：侧边栏生成一页纸结构化预读卡（核心问题/方法/结论/贡献/局限四分区），并展示深入到痛点层面的四维评分理由。
    *   **原文划选批注**：PDF 原视图（HiDPI 高清渲染 + 自绘文本层）划选后打标（🟢 重点论据 / 🔵 借鉴方法 / 🔴 存疑 / 🟣 背景）或划线 / 备注（支持多行选区）；Word/Markdown 文献以结构化文档视图呈现，同样支持划选批注；批注自动绑定原文 Chunk 并提升检索权重（Top Tier）。
    *   **伴读问答**：限定本文档证据的问答，回复经 Markdown 渲染，引用 `[cN]` 来源标记，点击跳转 PDF 对应页（闪烁轮廓）或结构化视图来源块定位——同时覆盖术语/公式通俗解析的需求。
    *   **AI 自动划线（规划版）**：AI 提炼核心论点/转折并自动划线。
    *   **PDF 解析策略**：文本型 PDF 采用启发式结构化解析（字号聚类识别标题层级，绑定页码与原文坐标）；扫描版 PDF 的 OCR + 版面分析、公式 LaTeX 还原为规划版（Demo 对无文本层文献提示转 Word/Markdown 精读）。

### 模块四：多模式防幻觉协作工作台 (Multi-Mode AI Workspace)
*   **功能描述**：适配科研长文本写作，提供三种场景化模式，动态调整 AI 介入程度；核心交互为**对话驱动的修改提案卡**——AI 永不直接落笔编辑器，用户采纳才写入。
*   **交互细节**：
    *   **状态 1：起草模式 (Drafting Mode)**：对话框形态。通过与 AI 商讨（回复经 Markdown 渲染），基于文献库梳理出逻辑大纲并敲定摘要，确认后一键同步至左侧大纲（大纲以 Markdown 为底座，可编辑/预览）；商讨对话持久化，每满 4 轮触发隐式记忆提取。
    *   **状态 2：写作模式 (Writing Mode)**：富文本编辑器主体。全部写作操作经右侧写作助手对话完成：输入指令（续写/修改/删除，可划选段落注入）→ AI 生成修改提案卡（追加/修改/删除三模式 + 改动说明）→ 引用经校验门标注蓝/黄/红三态徽标 → 用户采纳后经统一写入工具原子落笔（锚点定位 + 写入校验），拒绝则继续对话迭代。引用以 **APA 文内格式**呈现（如（Liu et al., 2023）），点击角标跳转精读页定位原文片段。
    *   **状态 3：审查模式 (Review Mode)**：AI 切换为同行评审视角。按五维度 17 检查点生成建议卡片（含锚点定位与三级严重度），勾选后「AI 一键修改」：重写 + 引用完整性校验 + LLM 语义双重校验 → 逐条 Diff 卡审核采纳，已修复卡片置灰闭环。
    *   **高优上下文融合 (RAG Weighting)**：在起草和写作中，AI 自动赋予"模块三"中用户的划线、标签和备注更高的检索权重；同时在写作界面侧边栏提供"素材引料区"，支持用户勾选精读笔记注入写作上下文。
    *   **版本历史与回退**：系统自动保存每次编辑快照，支持按时间线浏览历史版本并一键回退至任意历史节点。
    *   **导出与格式兼容**：支持导出为 Word (.docx)、LaTeX (.tex) 与 Markdown，导出时按用户设定的引用规范（APA 等）生成参考文献列表（Demo 为内置格式模板）。
    *   **多语言写作支持（规划版）**：AI 根据目标期刊语言自动切换输出语言，并提供中英对照润色建议。
    *   **用户反馈闭环**：用户对 AI 内容的采纳/拒绝写入反馈表，聚合数据用于下调高频被拒来源的检索权重、积累重排模型微调样本与幻觉率 KPI 埋点。

## 六、 核心页面布局描述 (UI Layout & Wireframe Concept)

### 页面 1：全局控制台与领域知识域 (Global Dashboard & Domain Base)
*   **左侧导航栏**：用户信息区；“我的领域知识库”入口；“项目空间”列表（折叠树状结构）。
*   **主体内容区**：
    *   **领域图景视图**：展示 AI 梳理的最新领域脉络图、关注追踪的热点卡片。
    *   **知识沉淀池**：用户上传的基础资料、AI 提炼的个人研究偏好画像（以标签或简述形式展现）。

### 页面 2：项目空间首页 (Project Workspace Home)
*   **顶部栏**：项目名称，当前所处阶段进度条（选题明晰 -> 文献整理 -> 论文写作）。
*   **主体内容**：交互式诊断输入框（用于输入想法并由 AI 进行问题诊断）；快捷进入文献矩阵或写作工作台的入口。

### 页面 3：文献工作台与阅读器 (Literature & Reader Studio)
*   **上方工具栏**：视图切换（矩阵 / 图谱）。
*   **左侧边栏**：当前项目的文献目录树。
*   **中部主视图区**：矩阵横向宽表或引文图谱全屏画布。
*   **单篇精读页 (Reader)**：点击特定文献进入，左栏为结构化预读卡，中栏为 PDF 阅读器（支持划选打标）或 Word/Markdown 结构化文档视图，右栏为上 1/3 批注沉淀 + 下 2/3 伴读问答区（固定布局）。

### 页面 4：沉浸式协作工作台 (Writing Copilot Studio)
*   **顶部状态栏**：起草 / 写作 / 审查 模式切换 Tabs。
*   **左侧栏 (Context Panel)**：全文大纲（Markdown 编辑/预览切换），以及"精读高亮/批注"素材区（支持勾选注入）。
*   **中栏 (Editor Panel)**：核心富文本撰写区，支持各类学术语法与格式、APA 引用角标节点（点击溯源）。
*   **右侧栏 (AI Assistant Panel)**：随模式切换形态（起草时的聊天流 / 写作时的提案卡流 / 审查时的建议卡 + 一键修改 Diff 卡）。

## 七、 重点：上下文工程设计 (Context Engineering Design)

ThesisFlow 的核心壁垒在于对科研工作流中海量信息的精准调度与记忆管理，即上下文工程。以下说明系统在不同阶段如何组织传递 Prompt Context，避免 AI 迷失或产生幻觉。

### 1. 全局分层系统提示 (Layered System Prompts)
系统级 Prompt 根据用户的层级信息进行动态拼接：
*   `[Base_Persona]` = 始终保持专业学术审稿人与科研助手的语气，严谨、客观。
*   `[User_Context]` = 抽取用户 Onboarding 设定的身份与研究领域（例如：经济学硕士，关注点在信息管理与平台经济交叉领域）。
*   `[Domain_Memory]` = 从“知识管理域”提取的用户隐式偏好（例如：该用户强调倾向得分匹配 (PSM) 的实验设计严谨性）。
*   *合成*：在每次全局响应时，这三层信息隐式加入，使 AI 具备持久的研究默契。

### 2. 动态 RAG 与权重路由 (Dynamic RAG & Weight Routing)
在具体项目的交互中，AI 面临着如何从海量文献中提取信息的挑战。系统采用分层权重检索策略：
*   **高权重索引 (Top Tier)**：用户在精读阶段（模块三）主动划线的段落、添加的 `[重点论据]` 标签、以及手动录入的备注。在执行写作指令时，AI 会强制优先匹配这部分向量片段，保证生成内容的强相关性。
*   **中权重索引 (Mid Tier)**：通过四维评分系统（模块二）得分为 4 分及以上的文献摘要和核心结论提取段。
*   **低权重索引 (Base Tier)**：未深入阅读或评分较低文献的基础元数据（标题、关键词），仅在全局宏观提问时作为补充召回。
*   *路由机制*：当用户指令明确（如：“请依据文献 A 扩写该段”），执行精准匹配检索（Exact Match，强制 `doc_id` 过滤）；当指令模糊时，结合语义检索（Semantic Search）并依据权重分配 Attention。查询入口先做**意图三分类**——事实问答 / 多跳推理 / 全局概览，分别走“精准检索 / 聚类定点 / 物化摘要”三条装配路线（工程实现见 9.7.7）。

### 3. 严格的防幻觉溯源追踪 (Anti-Hallucination Traceability)
解决“所写即所引”的核心在于 Prompt 工程与数据结构的深度结合：
*   **Chunk 级元数据绑定**：在文献入库时，切片（Chunking）的过程必须绑定原文的具体页码和段落 ID (`doc_id`, `page_no`, `chunk_id`)。
*   **强约束 Prompt 设计**：在写作模式下，给 AI 的提示词必须强制包含以下要求：“基于提供的上下文进行续写或修改，并在引用事实论据时，严格使用角标内联标记（Prompt 中以具体示例 `[1:3]` 表述）。绝对禁止编造未在上下文中出现的引文和结论；证据不足处显式输出证据缺口标记。”
*   **生成后校验门**：引用标记须通过存在性检查（必须在本次送入模型的证据列表内）与语义一致性检查（引用句与被引 Chunk 的向量相似度达标），中间地带由轻量模型 NLI 语义判定兜底——形成“生成约束 + 双重校验”闭环（实现见 9.2.4）。
*   **前端逆向映射**：前端解析 AI 返回的角标标记，将其渲染为 **APA 文内引用格式**（如（Liu et al., 2023），三态配色保留校验结果）。当用户点击时，前端通过 `chunk_id` 跳转精读页，定位并高亮原始 PDF 对应位置。

### 4. 模式感知上下文切换 (Mode-Aware Context Switching)
在写作工作台（模块四）中，随着模式的切换，送入大模型的上下文窗口会进行动态裁剪：
*   **起草模式下**：喂给模型的是项目内所有文献的骨干摘要以及模块一中敲定的“研究问题诊断”，以促进发散和逻辑梳理。
*   **写作模式下**：由于重点是单段落的精准撰写，喂给模型的是当前段落上下文 (Window Size 内)、素材区中勾选的精读笔记、大纲路径与起草商讨摘要，以及被高权重路由召回的特定 Chunk，以收敛焦点；生成结果为带校验徽标的修改提案卡，采纳才落笔。
*   **审查模式下**：喂给模型的是整篇已写完的文章或选中长段，Prompt 切换为“Critical Review”模式，要求从论证充分性、逻辑连贯性、结构完整性、学术规范性、方法严谨性五个维度进行挑刺，不再引入外部新文献。

### 5. 记忆生命周期与上下文溢出管理 (Memory Lifecycle & Context Overflow)
*   **隐式记忆生命周期**：起草商讨每满 4 轮触发一次隐式记忆提取（轻量模型从近 8 轮对话中抽取候选偏好）；每条隐式记忆附带"置信度"（基于触发频次）和"时效性"（基于最后触发时间）两个元属性。系统每月自动生成记忆健康报告，将置信度低于阈值或超过 6 个月未触发的记忆条目标记为"待确认"，由用户决定保留、合并或删除。当检测到新旧记忆冲突时（如用户研究方向由因果推断转向深度学习），系统主动弹出提示，由用户裁决更新。
*   **上下文窗口溢出策略**：当项目文献量或写作内容超出模型上下文窗口限制时，系统按以下优先级梯度压缩：(1) 优先保留当前段落直接相关的 Chunk 和高权重精读笔记；(2) 压缩中低权重索引为摘要级粒度；(3) 对超出部分采用滑动窗口机制，仅加载最近 N 轮交互的完整上下文，更早的交互退化为摘要。系统会在界面上明确提示"当前上下文已裁剪，点击展开完整检索范围"。

## 八、 成功指标与关键绩效 (Success Metrics & KPIs)

| 指标类别 | 具体指标 | Demo 阶段目标 |
|---------|---------|-------------|
| **产品价值** | 引用溯源准确率（AI 生成的引用与原文 Chunk 的匹配度） | ≥ 95% |
| **产品价值** | 用户写作效率提升（对比无 AI 辅助的同类论文，单位字数耗时降低比例） | ≥ 30% |
| **用户粘性** | 7 日留存率 | ≥ 40% |
| **用户粘性** | 领域知识库活跃用户占比（每月至少使用 1 次知识库的用户比例） | ≥ 60% |
| **AI 质量** | AI 生成内容的用户采纳率（审查模式建议被采纳的比例） | ≥ 50% |
| **AI 质量** | 幻觉率（用户标注的"虚构引用"占全部引用的比例） | ≤ 2% |
| **系统性能** | 单次续写/润色响应时间 (P95) | ≤ 5s |
| **系统性能** | 文献 PDF 解析成功率 | ≥ 90% |

## 九、技术实现设计 (Technical Implementation Design)

> 本章将前述产品设计转化为 Demo 阶段可直接落地的工程方案，覆盖总体架构与技术选型、核心管线详细设计、数据模型、接口设计、Prompt 模板与非功能设计。第七章描述上下文工程的**设计意图**，本章描述其**工程实现**，二者交叉引用、互为补充。

### 9.1 总体技术架构与选型

#### 9.1.1 系统分层架构

```
┌─────────────────────────────────────────────────────────────┐
│ 前端层 (Next.js + TipTap + PDF.js)                            │
│  全局控制台 / 项目空间 / 文献矩阵 / 阅读器 / 写作工作台          │
├─────────────────────────────────────────────────────────────┤
│ API 层 (FastAPI + JWT 鉴权 + 限流)                            │
├─────────────────────────────────────────────────────────────┤
│ 业务服务层                                                     │
│  项目服务 │ 文献服务 │ 知识库服务 │ 写作服务 │ 记忆服务          │
├─────────────────────────────────────────────────────────────┤
│ AI 编排层                                                     │
│  Context Builder │ RAG Router │ Citation Verifier │ 模型适配器 │
├─────────────────────────────────────────────────────────────┤
│ 异步任务层 (Celery + Celery Beat)                             │
│  PDF解析 │ 四维打分 │ 图景报告 │ 记忆健康报告 │ 导出编译          │
├─────────────────────────────────────────────────────────────┤
│ 数据层                                                        │
│  PostgreSQL 16 + pgvector │ Redis │ MinIO 对象存储             │
├─────────────────────────────────────────────────────────────┤
│ LLM 层 (模型适配层，厂商可切换)                                 │
│  强模型(写作/审查) │ 轻量模型(评分/摘要) │ Embedding │ Reranker  │
└─────────────────────────────────────────────────────────────┘
```

#### 9.1.2 技术选型决策

| 环节 | 选型 | 选型理由 | 备选 |
|------|------|---------|------|
| 后端框架 | **Python 3.12 + FastAPI + Pydantic v2** | AI 生态主场（解析/embedding/编排均为 Python 原生），异步高性能且类型安全 | Node.js NestJS |
| 富文本编辑器 | **TipTap（ProseMirror 内核）** | 自定义 Mark/Node（引用角标节点、划线标注）成熟；内置 Yjs 协同内核，为多人协作迭代预留 | Slate.js / Lexical |
| 前端框架 | **Next.js (App Router) + TypeScript + Zustand + Tailwind** | SSR/静态资源一体；Zustand 轻量，适合工作台多面板状态同步 | Vue 3 + Vite |
| PDF 渲染 | **PDF.js** | 支持文本层坐标 (bbox) 提取，可实现引用角标点击后的页级跳转与区域高亮 | react-pdf 封装层 |
| 主数据库 | **PostgreSQL 16 + pgvector** | 业务数据与向量同库，Demo 阶段零额外运维；HNSW 索引支撑千级文献规模绰绰有余；JSONB 承载评分、矩阵等灵活数据 | Qdrant / Milvus（chunk 超千万级时再拆） |
| 缓存与队列 | **Redis 7** | Celery Broker + 检索结果缓存 + SSE 会话状态 | RabbitMQ |
| 对象存储 | **MinIO（S3 兼容）** | 存放 PDF 原件、解析产物、导出文件，Docker 本地可起 | 云 S3 / OSS |
| 异步任务 | **Celery 5 + Celery Beat** | 解析/打分/报告类长任务异步化，支持重试、并发限速与定时调度 | arQ / Dramatiq |
| 文本型 PDF 解析 | **PyMuPDF + GROBID** | PyMuPDF 负责文本层与 bbox 坐标；GROBID 是学术文档结构化解析事实标准（标题层级、摘要、参考文献），可本地部署 | marker / Nougat / Mathpix(商业) |
| 扫描版与公式 | **PaddleOCR（版面分析+识别）+ pix2tex（公式还原）** | 开源版面分析+OCR 组合成熟；pix2tex 将公式图片还原为 LaTeX | Tesseract / MinerU |
| Embedding | **bge-m3（自部署 Sentence-Transformers）** | 中英双语原生支持且稠密/稀疏双向量，契合双语论文场景；本地部署成本可控 | text-embedding-3-large / Qwen3-Embedding |
| Reranker | **bge-reranker-v2-m3** | 与 bge-m3 同源配套，top-K 精排显著提升召回精度 | Cohere Rerank |
| LLM | **模型适配器 + 厂商解耦**：写作/审查走强模型（Claude Sonnet / GPT-4o / Qwen-Max 级别，运行时可切换）；评分/摘要/记忆提取走轻量模型 | 成本分级控制；适配层屏蔽厂商差异，便于灰度与 A/B | 自部署 Qwen3-32B |
| LLM 编排 | **直接 SDK 调用 + 轻量自建 Context Builder** | Demo 链路清晰可控、便于调试与观测，避免重框架黑盒 | LangChain / LlamaIndex |
| 观测 | **Langfuse（自部署）** | Prompt/token/时延/引用全链路 trace，支持用户反馈回流 | LangSmith |
| 导出 | **Pandoc + citeproc（CSL）** | docx/LaTeX 原生支持，配合 CSL 样式自动生成 APA/MLA/芝加哥参考文献 | python-docx 直出 |

> **Demo 实际选型**（规划版的轻量落地，映射关系见第十章章首口径）：
>
> | 能力槽 | Demo 实际模型 | 分工 |
> |--------|--------------|------|
> | STRONG | deepseek-v4-pro | 写作提案 / 审查 / 伴读问答 / 图景（质量敏感） |
> | LIGHT | deepseek-v4-flash | 打分 / 摘要 / 记忆提取 / 语义判定 / 进展摘要（成本敏感） |
> | EMBED | text-embedding-v4（百炼按量，1024 维） | chunk / 标题 / 查询向量化 |
> | RERANK | gte-rerank-v2（百炼原生 SDK） | 检索精排，失败自动降级为纯加权排序 |
>
> 对应关系：SQLite + 暴力余弦 ↔ PostgreSQL + pgvector ｜ FastAPI BackgroundTasks ↔ Celery ｜ 本地磁盘 ↔ MinIO ｜ PyMuPDF 启发式解析 ↔ GROBID/PaddleOCR（扫描版走兜底提示）｜ `user_logs` 表 ↔ Langfuse 本地降级。

> **模型适配器设计**：`LLMProvider` 统一抽象 `chat / chat_stream / embed / rerank` 四类能力，厂商与型号由配置文件切换；业务层只绑定"能力槽"（STRONG / LIGHT / EMBED / RERANK），不感知具体模型。代码锚点：`backend/app/core/llm.py`。

### 9.2 核心管线详细设计

#### 9.2.1 文献入库管线 (Ingestion Pipeline)

Celery 异步任务驱动，状态机：`uploaded → dedup_checked → parsing → chunked → embedding → scored → ready`，任一步失败转 `failed`。

1. **去重检查**：DOI 精确匹配优先；无 DOI 时以标题 embedding 余弦相似度 > 0.95 判重，重复文献自动关联已有记录，不重复解析。
2. **类型检测**：PyMuPDF 探测文本层，可提取文本量达阈值判为文本型，否则扫描型；混合型按页级路由。
3. **结构化解析**：
   - 文本型：GROBID 输出结构化 XML（标题/作者/摘要/章节层级/参考文献）；PyMuPDF 补充页级文本与 bbox；表格经版面规则识别后转 Markdown；公式区域截图送 pix2tex 还原 LaTeX。
   - 扫描型：PaddleOCR 版面分析（文本/表格/图片区域分离）→ 逐区 OCR → 归一为同一结构化格式。
   - 图表区域单独截图存储，图片说明文字由轻量模型生成描述性摘要，保证模块三精读时 Chunk 元数据完整。
4. **分层 Chunking**：
   - 以 GROBID 章节标题为首选切分单位，段落为次级单位；目标 chunk 300–800 tokens，超长按句边界切分，相邻 chunk 保留 10% overlap。
   - **每个 chunk 绑定元数据**：`{doc_id, chunk_id, page_no, section_title, char_range, bbox, tier}`；`chunk_id` 全局唯一（格式 `doc_id:seq`），是引用溯源的唯一键（对应第七章第 3 节）。
   - 特殊 typed chunk：摘要、核心结论、参考文献列表独立存储并打标，供打分与低权重召回直接取用。
5. **向量化**：bge-m3 批量 embed（batch=64）写入 `chunks.embedding`，建 HNSW 索引（`m=16, ef_construction=64`）。
6. **失败兜底**：记录失败步骤与重试次数（最多 3 次自动重试）；最终失败文献在前端展示"解析失败"入口，支持用户手动粘贴正文后重新入库。

> **Demo 实现**：状态机与去重逻辑同上；解析按扩展名分流——`.pdf` 走 PyMuPDF 启发式解析（字号聚类识别章节 + bbox 定位），`.docx` 走 python-docx 段落样式判定（Heading/标题/Title），`.md` 按 `#{1,6}` 标题行切章，三者统一产出 `sections + full_text + content_struct` 后共享同一套切片/向量化/打分/检索管线；向量检索为暴力余弦（千级 chunk 毫秒级），全文索引为 SQLite FTS5（jieba 分词）；标题识别链路见 9.7.4。代码锚点：`backend/app/services/parsing.py`、`chunking.py`、`ingestion.py`。

#### 9.2.2 四维打分管线

- **触发**：文档进入 `chunked` 状态后自动入队，单项目并发上限 4 以控制 LLM 成本；评分完成前前端先展示"评分中"骨架态。
- **输入装配**：该文献的摘要 chunk + 结论 chunk + 元数据（期刊/会议、被引量）+ 项目研究问题 + 学科锚点样本。
- **输出契约**：结构化输出（function calling / JSON Schema），模型为轻量模型：

```json
{
  "quality":    {"score": 4, "reason": "..."},
  "relevance":  {"score": 5, "reason": "..."},
  "methodology":{"score": 3, "reason": "..."},
  "novelty":    {"score": 4, "reason": "..."},
  "confidence": 0.82
}
```

- **学科动态校准**：Prompt 注入学科锚点样例（如经济学强调识别策略与样本量，计算机学科强调基准完备性与可复现性）；锚点库由运营按学科维护、支持热更新。
- **消费侧**：分数 JSONB 写入 `documents.scores`；矩阵视图按加权总分排序（默认四维等权 0.25，用户可调整权重重排）；总分 < 2.5 的文献自动折叠。
- **自定义维度**：用户可增加自定义维度（≤4 个），对现有文献一键重打分。
- **人工校正与反馈学习**：矩阵页分数格内联改分 + 填写校正理由 → 覆写 `scores[dim]`（`user_edited` 标记）并写入 `score_feedback` 表（维度/模型分/人工分/理由）；此后同用户入库打分或重打分时，取**最近 6 条校正记录**作为 few-shot 校准样例注入 Prompt（只含「维度-分值-理由」三元组，不携带文献身份）——实现"越校正越准"，同时为轻量模型微调积累标注集。代码锚点：`backend/app/services/scoring.py`。

> **Demo 实现参数**：模型 LIGHT，temp=0.1，json_mode；输出契约 `{dim: {score: 1-5, reason: ≤40字}}`，缺失维度兜底 3 分；上下文 = 文档元数据 + 摘要 chunk + 结论 chunk（≤2000 字）+ 研究问题 + 学科锚点（经济学/计算机/通用三套）+ 人工校正样例。

#### 9.2.3 RAG 检索与权重路由

对应第七章第 2 节的工程实现（Demo 实际：稠密检索为暴力余弦 top 4k，稀疏检索为 SQLite FTS5 bm25 top 4k，其余同下）：

1. **混合检索**：稠密向量（pgvector 余弦，top-100）+ 稀疏全文（PostgreSQL FTS，中文用 zhparser 分词，top-100），经 **RRF 融合（k=60）** 合并。
2. **分层权重路由**：`final_score = RRF_score × tier_weight`：

| Tier | 内容来源 | 权重 |
|------|---------|------|
| Top Tier | 用户精读划线所在 chunk、`[重点论据]` 等标签、手动备注 | × 2.0 |
| Mid Tier | 四维总分 ≥ 4 的文献摘要/结论 typed chunk | × 1.2 |
| Base Tier | 其余文献的普通 chunk 与元数据 | × 0.8 |

3. **路由判断**：指令中显式出现文献编号或标题（正则+元数据匹配）→ 强制 `doc_id` 过滤走精确匹配；模糊指令 → 混合检索 + 加权后 top-30 送精排（规划版 bge-reranker-v2-m3 / Demo 百炼 gte-rerank-v2，失败降级为纯加权排序），取 top-K。查询入口先经意图路由三分类（fact / multi_hop / global），multi_hop 走 docmap 聚类定点、global 走物化聚类摘要——详见 9.7.7。
4. **模式感知 Token 预算**（按 100k 上下文窗口测算，小窗口模型等比压缩）：

| 模式 | 系统层 persona | 对话/正文上下文 | RAG chunks | 输出预留 |
|------|--------------|----------------|-----------|---------|
| 起草 | Base+User+Domain ≈2k | 近 10 轮对话 ≈6k | 12 篇骨干摘要 ≈8k | 4k |
| 写作 | Base+User+Domain ≈2k | 当前段落前后 2000 字 ≈2k | 选中笔记 + 高权重 chunks ≈8k | 2k |
| 审查 | Base+User ≈1k | 全文或选中长段 ≈12k | 不引入新文献 | 4k |

> Demo 实现参数：drafting 12k 字 / 12 条骨干摘要，writing 9k 字 / 8 条证据块，review 0（禁引入新文献）。

5. **溢出压缩执行顺序**：按第七章第 5 节三级梯度——先砍 Base Tier（降为摘要粒度），再压缩 Mid Tier，最后对话历史滑动窗口化（保留最近 N 轮全文、更早退化为摘要）；每次装配计算总 tokens，发生裁剪时在响应中标记 `context_truncated: true`，前端显示"当前上下文已裁剪"提示入口。
6. **检索结果缓存**：Result Cache（query 指纹，TTL 12h，含 provenance）与 Context Cache（物化摘要，TTL 3 天）；失效钩子见 9.7.8。代码锚点：`backend/app/services/rag.py`、`core/cache.py`、`core/intent.py`。

#### 9.2.4 防幻觉溯源闭环

对应第七章第 3 节，工程闭环五层：

1. **生成侧强约束**：写作 Prompt 强制句末内联角标标记（以具体示例 `[1:3]` 表述），明令禁止输出 `[doc_id:chunk_id]`/`[NO_SUPPORT]` 字面占位符字样；上下文不支持的事实处以中文说明证据不足并标注人工补充（模板见 9.5 ③）。
2. **流式标记解析**：SSE 流式输出中，后端 `CitationParser` 状态机以 `[` 缓冲增量扫描完整标记（防止 streaming 分片切碎）；完整标记经 `citation` 事件下发角标序号，前端按序重建角标并维护会话级映射表。
3. **生成后校验门 (Citation Verifier，异步不阻塞用户)**：
   - **存在性检查**：每个引用标记必须能在本次送入模型的上下文 chunk 列表中找到，未找到判 `invalid`；
   - **一致性检查（双阶段）**：引用所在句与被引 chunk 计算 embedding 余弦相似度——<0.50 判 `invalid`、≥0.70 判 `pass`、中间带触发 LIGHT 模型 NLI 语义判定（entail→normal，contradict→invalid，neutral→weak）；数值/百分比/p 值/因果类高风险断言经正则识别后阈值收紧 +0.1 且强制 NLI；
   - 校验结果落 `citations` 表（含 `verify_method` 与 `nli_verdict`），聚合后直接支撑第八章"幻觉率 ≤ 2%"与"溯源准确率 ≥ 95%"两项 KPI 的埋点口径。
4. **清洗层兜底**：生成后对替换/修复文本正则清洗字面占位符与英文检查点代码——Prompt 约束之外的最后防线。
5. **前端逆向映射（呈现层）**：`CitationMark` 由 NodeView React 组件渲染为 **APA 文内引用格式**（如（Liu et al., 2023），作者年份由 `citationMetaStore` 客户端构造，元数据缺失回退数字格式），三态配色保留校验结果；点击角标 → 以 `chunk_id` 查 `(doc_id, page_no)` → 跳转精读页，PDF 跳页闪烁 / Word·Markdown 滚动到来源块闪烁。

代码锚点：`backend/app/services/verification.py`、`prompts/templates.py`、`api/writing.py`。

#### 9.2.5 记忆系统实现

对应第七章第 5 节与模块一"记忆生命周期管理"：

- **记忆结构**（`domain_memories` 表核心字段）：`content`、`type`(implicit/explicit)、`confidence`、`last_triggered_at`、`trigger_count`、`source_ref`(来源项目/会话)、`conflict_with`、`status`(active/pending_review/archived/deleted)。
- **隐式记忆提取**：起草商讨每满 4 轮用户发言触发一次轻量模型专项 Prompt（取近 8 轮对话）抽取候选记忆（JSON 数组），随后：
  - 与现存记忆语义相似度 ≥ 0.90 → 合并（`trigger_count + 1`，置信度 +0.1）；
  - 相似度落在 [0.60, 0.90] 且语义倾向冲突 → 置 `conflict_with`，前端弹出裁决卡片（保留新/保留旧/合并）；
  - 全新记忆 `confidence` 初始 0.5，每次有效触发 +0.1（上限 1.0），按月未触发衰减 ×0.95；新记忆立即进入 `[Domain_Memory]` 层影响后续全部会话。
- **记忆注入**：`[Domain_Memory]` 层装配时按 `confidence × 时近系数`（30 天内 1.0 / 30–180 天 0.6 / 180 天以上 0.3）取 top-10 条，总量不超 1500 tokens。
- **月度健康报告**：Celery Beat 每月 1 日触发；`confidence < 0.35` 或 180 天未触发的条目标记 `pending_review`，生成前端确认清单（逐条保留/合并/批量归档）。

代码锚点：`backend/app/services/memory.py`、`api/writing.py`（drafting-chat 记忆触发）。

#### 9.2.6 写作工作台实现

- **编辑器 Schema（TipTap 扩展）**：
  - `CitationMark`：不可编辑行内节点，attrs `{doc_id, chunk_id, status: normal|weak|invalid}`，NodeView 渲染为 APA 文内格式角标（作者年份），三态配色；
  - `Highlight`：划词高亮与颜色标注；`Comment`：审查建议卡锚点；
  - 学术扩展：标题/列表/表格/数学公式（KaTeX 渲染）。
- **对话驱动提案卡（核心交互）**：写作操作全部经右侧写作助手对话完成，AI 永不直接落笔。`writing_chat_prompt`（STRONG，json_mode，temp=0.4）输入 = 用户指令（可划选段落注入）+ 编辑上下文（全文 ≤8000 字或选段）+ 大纲标题链 + 起草商讨摘要 + 素材勾选 + RAG 证据块；输出契约四选一：`reply`（讨论回复）/ `append`（新增正文 + 可选 anchor_text）/ `replace`（锚点 + occurrence + 改后内容）/ `delete`（锚点 + occurrence）；生成后、应用前执行 Citation Verifier（与 9.2.4 同门槛），前端提案卡展示引用校验徽标（蓝/黄/红），用户「采纳」才写入、「拒绝」继续讨论迭代。
- **统一写入工具（applyContentChange）**：提案文本解析为完整段落 JSON 节点（段内文本与 citation 行内节点交替）后原子写入——追加 = 锚点所在文本块尾插入（无锚点才文末）、替换/删除 = 锚点选区原子替换/删除；锚点定位三级回退（精确 → 空白归一 → 前 20 字前缀），文本构建将 citation 节点按 attrs 还原为 `[docId:chunkSeq]` 字面文字参与匹配，多处出现且无序号时明确报错不静默；应用后读回校验，失败即提示（不再静默失败）。
- **审查模式与一键修改**：五维度 17 检查点建议卡（锚点 + 三级严重度）；勾选后 `review-apply` 逐条重写（硬规则：原引用角标全部原样保留、禁止新增、纯中文），双重校验 = ① 引用标记完整性（规则判定，零成本）② LIGHT 语义判定（是否解决问题且未改变原意）→ 逐条 Diff 卡（✓ 校验通过 / ⚠ 需人工复核）采纳；采纳成功后卡片置灰「✓ 已修复」闭环；同一段落多卡锚点冲突时提供「基于当前文本重试」（`current_text` 参数以已采纳后的新段落重新生成修复）。
- **大纲 Markdown 底座**：大纲以 Markdown 字符串持久化于 `drafts.outline_json.markdown`；「同步到大纲」由 STRONG 直接输出 Markdown 大纲；「同步到编辑器」前端解析 md 为 TipTap 节点；写作提案从大纲抽取前 6 个标题拼为「大纲路径」注入上下文。
- **版本历史**：快照策略 = 打开文档时 + 30 秒防抖 + 显式保存；存储 TipTap JSON；Diff 用 prosemirror-changes 计算；回退 = 恢复快照内容，历史快照永不删除。
- **反馈闭环**：用户对 AI 内容的采纳/拒绝/修改写入 `ai_feedback`（含 prompt 哈希、召回 chunk id 列表、动作类型）；每周聚合后用于 ① 下调高频被拒来源 chunk 的 tier 权重；② 积累 reranker 微调样本；③ 汇总幻觉标注进入 KPI 看板。

代码锚点：`backend/app/services/writing.py`、`api/writing.py`。

#### 9.2.7 精读与领域管线（Demo 实现）

- **结构化预读卡**：摘要 + 结论 + 前 3 chunk（≤3000 字）→ `pre_read_prompt`（LIGHT，json_mode）输出 `{core_question, methods[], conclusions[], contributions, limitations}`，哨兵缓存于 `summary_cache`（重复打开零 LLM 开销）；前端四分区卡片渲染。
- **伴读问答**：限定本文档——查询向量化 → 文档内全 chunk 余弦 top4 → 证据块 `[c1]..[c4]`（各 ≤900 字）→ STRONG 生成，回答内 `[cN]` 标记随 refs（chunk_key + page_no）返回；前端整体渲染 Markdown 后按标记转为链接徽标，点击 PDF 跳页闪烁 / 结构化视图滚动定位。
- **主页动态流**：知识洞察 = 事件触发（知识库文献入库 ready）或手动挖掘，注入文献标题/元数据/预读摘要（≤600 字）→ LIGHT 生成 ≤80 字知识增量提示；项目进展摘要 = 签名缓存（md5(文献数, 批注数, 草稿字数, 引用数, 阶段, updated_at)），签名未变直接读缓存零 LLM 开销，变化才调用 LIGHT。
- **领域图景（报告 + 思维导图）**：材料装配 = 近 15 篇文献（KB + 项目，各带 ≤150 字摘要）+ 活跃记忆 Top6 + 用户领域；报告 STRONG 三段式（研究边界/热点/前沿），材料不足处强制如实标注（防幻觉同构设计）；思维导图 STRONG json_mode：root → 3-5 主方向 → 每方向 2-4 子节点，每节点 `label + 80-150 字进展解读 + related_doc_ids（只准引用材料内 id）+ is_gap`，强制 ≥2 个研究缺口节点。

代码锚点：`backend/app/services/reading.py`、`home.py`、`landscape.py`。

### 9.3 数据模型 (核心表结构)

实体关系总览：

```
users 1─N domain_memories
users 1─N projects 1─N documents 1─N chunks
documents 1─N annotations
projects 1─N drafts 1─N draft_snapshots
drafts 1─N citations ──> chunks
projects 1─N chat_sessions 1─N chat_messages
drafts 1─N ai_feedback
```

| 表 | 关键字段 | 说明 |
|----|---------|------|
| `users` | id, email, password_hash, identity, discipline, sub_discipline, citation_style, language_pref | Onboarding 画像，驱动 `[User_Context]` |
| `domain_memories` | user_id, content, type, confidence, last_triggered_at, trigger_count, source_ref, conflict_with, status | 记忆池（见 9.2.5） |
| `projects` | user_id, name, research_question, stage(topic/literature/writing), created_at | 项目空间 |
| `documents` | project_id(可空=领域知识库级), file_key, doi, title, venue, cited_by, pdf_type, status, scores(jsonb), summary_cache | 文献元数据 + 四维评分 |
| `chunks` | doc_id, chunk_id, tier, typed_label(body/abstract/conclusion/refs), content, section_title, page_no, char_range, bbox(jsonb), embedding(vector(1024)) | RAG 最小单元 |
| `annotations` | doc_id, chunk_id, user_id, kind(highlight/tag/note), tag_label, text | 精读批注，驱动 Top Tier 权重 |
| `comparison_matrices` | project_id, field_config(jsonb), cell_content(jsonb) | 结构化对比矩阵 |
| `drafts` | project_id, title, content_jsonb(TipTap 文档), outline_jsonb, word_count, updated_at | 论文主体 |
| `draft_snapshots` | draft_id, content_jsonb, note, created_at | 版本历史 |
| `citations` | draft_id, chunk_id, sentence_text, verify_score, verify_method, nli_verdict, status(normal/weak/invalid), created_at | 引用溯源与校验记录 |
| `score_feedback` | document_id, dimension, model_score, user_score, reason | 评分人工校正（few-shot 校准样例 + 微调标注集） |
| `document_maps` | project_id, narrative, clusters, edges, _sig(逐文献 updated_at 指纹) | 脉络图谱物化缓存 |
| `context_cache` / `result_cache` | scope+kind(3 天) / query 指纹+provenance(12h) | 二层缓存（见 9.7.8） |
| `chat_sessions` / `chat_messages` | project_id, mode, role, content, rag_chunk_ids(jsonb) | 起草对话与上下文留档 |
| `ai_feedback` | draft_id, message_id, action(accept/reject/edit), diff_summary, created_at | 反馈闭环 |

> **索引策略**：`chunks.embedding` 建 HNSW 索引；`(doc_id, tier)`、`annotations(doc_id)`、`citations(draft_id)` 复合索引；`documents` 标题/摘要建 GIN 全文索引（zhparser）。

### 9.4 关键接口设计

RESTful 前缀 `/api/v1`；流式响应使用 `text/event-stream`。鉴权：JWT（access 15 分钟 + refresh 7 天）。**Demo 简化**：单用户模式（无 JWT、无 v1 前缀），DOI 导入端点已移除（MVP 范围外）。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/projects` | 创建项目（含研究问题诊断与知识库素材自动关联） |
| POST | `/projects/{id}/documents:batch-import` | PDF / Word / Markdown 批量上传，返回异步任务 id（状态机流转） |
| GET | `/projects/{id}/documents?view=matrix&sort=relevance` | 文献列表/矩阵视图（含评分与折叠标记） |
| PUT | `/documents/{id}/scores` | 人工校正评分（覆写分数 + 写 score_feedback，few-shot 校准） |
| GET | `/documents/{id}/pre-read` | AI 预读：结构化预读卡 + 四维评分理由 |
| POST | `/documents/{id}/chunks/{chunk_id}/annotations` | 新增划线/标签/备注（批注升权 Top Tier） |
| GET | `/documents/{id}/chunks/{chunk_key}/locate` | 引用溯源：返回 chunk 页码/位置，供跳转定位 |
| POST | `/projects/{id}/rag:query` (**SSE**) | 项目内问答（起草模式聊天后端） |
| POST | `/drafts/{id}/writing-chat` (**SSE**) | 写作助手对话：生成修改提案卡（append/replace/delete/reply） |
| POST | `/drafts/{id}/review` | 审查模式，生成五维 17 检查点建议卡片列表 |
| POST | `/drafts/{id}/review-apply` | 一键修改所选问题（双重校验 + 逐条 Diff，支持 current_text 冲突重试） |
| GET / POST | `/drafts/{id}/snapshots` · `/snapshots/{sid}:restore` | 版本时间线 / Diff / 一键回退 |
| POST | `/drafts/{id}/citations/{cid}/feedback` | 角标"虚构引用"反馈（幻觉埋点） |
| POST | `/drafts/{id}/export?format=docx\|tex\|md` | 异步导出，轮询任务后返回下载 URL |
| GET / PATCH / DELETE | `/memory` · `/memory/{mid}` | 记忆查看、编辑、删除 |
| GET | `/memory/health-report` | 月度记忆健康报告 |
| POST | `/domain/landscape:generate` | 按需生成领域图景报告与思维导图 |
| POST | `/rechunk` | 切片结构迁移（Parent-Child 双粒度重建） |
| GET | `/api/observability/summary` | 观测端点：LLM 统计/路由分布/缓存命中/校验分布 |
| POST | `/api/admin/demo-reset` | 演示数据秒级复位（快照恢复，不重跑 LLM） |

> **SSE 事件协议**：`token`（增量文本）、`citation`（完整引用标记 + 角标序号）、`verify_result`（弱支持/失效预警）、`done`（含 token 用量与 trace_id）。

### 9.5 关键 Prompt 模板设计

**① 分层 System Prompt 合成**（所有模式注入）：

```
[Base_Persona]
你是资深学术审稿人与科研协作者，表达严谨、客观、克制，
优先依据证据而非修辞，绝不编造引用与结论。

[User_Context]
用户身份：{{identity}}；研究领域：{{discipline}}/{{sub_discipline}}；
引用规范偏好：{{citation_style}}；写作语言：{{language_pref}}。

[Domain_Memory]
用户长期研究中沉淀的偏好（经确认，信任但可被新指令覆盖）：
- {{memory_i}}（置信度 {{confidence_i}}）
```

**② 四维评分**（轻量模型，仅输出符合 Schema 的 JSON）：

```
你是 {{discipline}} 学科审稿人。请基于文献材料，从质量/相关性/方法论严谨度/
创新性四个维度各打 1-5 整数分，并各给一句评分理由。
学科评分锚点：{{anchors}}
当前项目研究问题：{{research_question}}
文献材料：{{title + 摘要chunk + 结论chunk + 元数据}}
```

**③ 写作助手对话（提案卡契约）**（强模型，json_mode，见 9.2.4/9.2.6）：

```
任务：基于大纲与检索材料，响应用户的写作指令（续写/修改/删除/讨论）。
大纲路径：{{outline_path}}
编辑上下文：{{window_text}}
用户勾选的精读素材：{{selected_notes}}
检索证据（每条有唯一 id，引用时使用 [1:3] 形式的角标）：
[C1] {{chunk_content}}
...
硬性规则：
1. 只能使用上方证据列表中出现的内容；引用事实性论据时必须在句末
   插入角标（形如 [1:3]）；
2. 严禁编造列表中不存在的引用与结论；证据不足处以中文说明并标注人工补充；
3. 语气符合 {{citation_style}} 学术规范；修改类操作必须给出精确锚点原文。
输出契约（四选一 JSON）：
{"type":"reply","content":"讨论回复"}
{"type":"append","content":"新增正文(含角标)","anchor_text":"新内容应紧接其后的原文片段","reason":"…"}
{"type":"replace","anchor_text":"原文精确片段","anchor_occurrence":n,"content":"改后内容","reason":"…"}
{"type":"delete","anchor_text":"待删除原文精确片段","anchor_occurrence":n,"reason":"…"}
```

**④ 审查模式 Critical Review**：

```
切换为严格的同行评审视角。仅评审所给文本本身，不引入任何外部文献。
从五个维度输出建议：(a) 论证充分性 (b) 逻辑连贯性 (c) 结构完整性
(d) 学术规范性 (e) 方法严谨性，每条对应具名中文检查点。
每条建议输出 JSON：{dimension, indicator, anchor_text, anchor_occurrence,
issue, suggestion, severity, fix_effort}。
待评审文本：{{full_text_or_selection}}
```

**⑤ 审查一键修复（硬规则）**（强模型）：

```
针对建议逐条重写对应文本：原文实际出现的引用角标（形如 [1:3]）
必须全部原样保留，禁止新增角标，禁止输出占位符字样，
不改核心观点，输出纯中文正文（不带章节编号）。
```

> 其余模板（记忆提取、预读卡、伴读问答、领域图景、进展摘要、打分、NLI 校验等）全部集中于 `backend/app/prompts/templates.py`，与上述契约同步维护。

### 9.6 非功能设计

- **性能（续写/润色 P95 ≤ 5s）**：流式输出，首 token 目标 ≤ 1.5s；检索与生成解耦，可在用户输入时预取候选 chunk；embedding 与检索结果 LRU 缓存（TTL 10 分钟）；解析/打分全异步 + SSE 进度推送，前端不阻塞。Demo 已知：写作提案为非流式整卡生成（约 10-20 秒），流式预览为后续优化项。
- **成本控制**：强弱模型分级（写作/审查走强模型，评分/摘要/记忆提取走轻量模型）；单项目 token 用量看板；批量化 embed 与 rerank；二层缓存（9.7.8）与签名缓存（预读卡/进展摘要/图谱）将重复 LLM 调用降到零；演示全流程成本在个位数元级。
- **安全与隐私**：所有查询强制 `user_id + project_id` 作用域过滤实现数据隔离；PDF 对象存储开启服务端加密；支持用户数据全量导出与账号删除；LLM 请求不含除研究内容外的个人身份信息。
- **可观测性**：所有 LLM 调用（槽位/模型/时延/tokens）写入 `user_logs` 表（Langfuse 的本地降级），记录 `prefix_hash` 与 TTFT 支撑前缀复用率统计；`citations` 表聚合溯源校验通过率与幻觉率；`GET /api/observability/summary` 提供 LLM 统计（STRONG 占比/TTFT/前缀复用率）、路由分布、缓存命中、引用校验分布口径，直接支撑第八章 KPI 统计；解析成功率、任务失败率配置告警。
- **导出实现**：TipTap JSON → Pandoc AST → `.docx` / `.tex` / `.md`；参考文献由 `documents` 元数据经 citeproc + CSL 样式（APA 7th / MLA / Chicago）生成，正文角标编号与文末列表自动对齐；PDF 走 xelatex 编译（中文支持），失败时降级 headless Chrome 打印（Demo 参考文献为内置格式模板，非完整 CSL）。
- **Demo 工程简化**：单体 FastAPI + BackgroundTasks，不做微服务拆分；SQLite 单实例；无 Docker 依赖，`python3 serve.py` 守护启动。

### 9.7 增量机制与关键链路（Demo 实际实现）

> 本节汇总自原《上下文工程全流程》文档，覆盖各轮迭代沉淀的机制级设计；与 9.2 各管线交叉引用，代码锚点以 `backend/app/` 为根。

#### 9.7.1 写作对话驱动：提案卡链路

```
用户指令（续写/修改/讨论，可划选段落注入）
   + 编辑上下文（全文≤8000字 或 选段）+ 大纲 + 起草商讨摘要 + 素材勾选 + RAG 证据
   ↓
Prompt: writing_chat_prompt（意图自判定）→ STRONG（json_mode，temp=0.4）
   ↓
输出契约（四选一）：reply / append(+anchor_text) / replace(锚点+occurrence) / delete
   ↓
后端后处理：占位符字样清洗 + append 首行章节编号剥离
   ↓
生成后、应用前执行 Citation Verifier（与直写模式同门槛）
   ↓
前端提案卡：内容预览 + 引用校验徽标（蓝/黄/红）
   ↓
采纳 → 经统一写入工具落笔（append 按锚点插入块尾之后 / replace 锚点选区原子替换 / delete 锚点删除）；
锚点定位：后端按送模型文本计算 anchor_occurrence（有划选时优先取选区内出现）→ 前端取第 N 处；
无 occurrence 且锚点出现多处 → 明确报错"锚点存在多处，请人工核对"而非静默替换；
替换前校验当前位置文本与锚点一致（不一致即中止）→ 快照 + feedback(accept)
拒绝 → feedback(reject)，对话继续迭代
```

关键设计：**AI 永不直接落笔编辑器**；校验前置到采纳决策之前，用户在提案卡上即可看到弱/无效引用。

**统一写入工具（applyContentChange，根治写入失败）**：早期版本把「裸字符串+引用节点」混合数组插入文档根部，ProseMirror 视为非法插入、命令静默失败。现行工具：① 提案内容按换行切分为完整段落节点（段内 `text` 与 `citation` 行内节点交替）；② 追加 = 锚点所在文本块尾 `insertContentAt`（无锚点才文末）；替换/删除 = `setTextSelection` + 原子替换/删除；③ 文档位置映射为 `pos+i`（曾因 `pos+i+1` off-by-one 导致替换后残留首字）；④ 应用后读回校验是否包含新内容，失败即提示，不再静默。

#### 9.7.2 审查一键修改与双重校验

```
建议卡勾选 → POST review-apply（≤10 条/次）
逐条：review_fix_prompt（STRONG，硬规则：原文实际出现的引用角标必须全部原样保留、
禁止新增角标、禁止输出占位符字样、不改核心观点、输出纯中文不带章节编号）
   ↓
后处理：占位符清洗 + 首行编号剥离
校验①：引用标记完整性（重写后集合 ⊇ 重写前集合）——规则判定，零成本
校验②：review_check_prompt（LIGHT，temp=0.1）→ {"passed":bool,"reason":"≤20字"}
   ↓
前端逐条 Diff：✓校验通过 / ⚠需人工复核（含原因）→ 采纳才写入（按 anchor_occurrence 定位）
```

**采纳冲突处理**：同一段落多张建议卡时，先采纳的修改会覆盖后卡锚点。采纳定位失败且与已采纳锚点重叠/包含 → 卡片置「冲突」态，提供「基于当前文本重试」（`review-apply` 支持 `current_text` 参数，以已采纳后的当前段落重新生成修复）。**角标匹配一致性**：前端锚点匹配的文本构建将 citation 行内节点按 attrs 还原为 `[docId:chunkSeq]` 字面文字（后端 `_plain_text` 兼容 camelCase/snake_case/chunkKey 三种属性拼写），含角标锚点可精确命中。

#### 9.7.3 文献脉络图谱与 Lazy GraphRAG

- 材料装配：全部就绪文献（标题 + ≤180 字摘要）+ 文献间向量相似度对（≥0.35 才提供参考）+ 研究问题；
- STRONG 输出：`narrative`（200-350 字脉络叙述）+ `clusters`（2-4 个，每文献唯一归属）+ `edges`（≤8 条，关系限定 extends/supports/contrasts/background/same_topic）+ `nodes`（含加权分）；
- **缓存策略**：`document_maps` 表存 `_sig`（逐文献 updated_at 指纹）；读取接口只返回缓存 + `stale` 标记，**任何场景不自动重算**，重算仅由用户显式触发（前端提示条或手动按钮）——防 token 浪费；
- **Lazy GraphRAG（零 LLM 离线索引）**：入库时 jieba textrank 每子块 top5 实体短语 → `chunk_entities`；聚类 `summary`（40-80 字）+ `summary_l1`（120-200 字）物化；新文献就绪 → 嵌入相似度选最近聚类 → LIGHT 合并摘要 + doc_ids 追加（flag_modified 提交，不重算全社区）；深抽取按需触发 `docmap:deep-extract`（查询实体重叠度选 top6 文献 → STRONG 抽边含 evidence 短语 → `graph_edges` 带 provenance，读图时与生成边按对去重合并）。

#### 9.7.4 标题识别算法（v2）

优先级链：元数据标题（黑名单过滤后）→ 字号聚类（第 1 页 ≥85% 最大字号的连续块，合并多行，黑名单过滤 20+ 横幅词条如 NBER/arXiv/版权页）→ 全大写标题与作者列表的大小写边界切分 → 加粗/大号文本块启发式 → 首段回退（低置信度）。置信度 `low` 时触发 LIGHT 模型从正文前 800 字抽取（入库管线内，每篇至多一次）；矩阵页提供手动纠正（✎ 内联编辑）。

#### 9.7.5 多格式文献解析与 PDF 渲染架构

- 入库管线按扩展名分流：`.pdf` PyMuPDF 结构化解析（字号启发式章节 + bbox 定位）；`.docx` python-docx 遍历段落，`Heading*/标题*/Title` 样式判定章节，标题取 core_properties.title 或首个标题；`.md` 按 `#{1,6}` 标题行切章；三者统一产出 `sections + full_text + title_guess + content_struct`，共享同一套切片/向量化/打分/检索管线；
- `content_struct`（章节+段落）存入 `documents` 表，阅读器中栏对非 PDF 文献渲染结构化文档视图（划选即批注，绑定 `chunk_key`；高亮按引文锚点 `<mark>` 渲染）；
- **PDF 阅读器渲染架构**：纯命令式（页面容器脱离 React 渲染树，杜绝协调破坏）+ 文本层自绘（`getTextContent()` 条目经 `Util.transform(viewport.transform, item.transform)` 计算绝对定位透明 span，选区即可命中）+ HiDPI 超采样（Retina 下物理像素 1/4 模糊根治）+ 高亮层 `pointer-events:none`（对齐 Hypothesis 做法，保证选区不被阻断）；文本层 0 span 时告警（疑似扫描版）。

#### 9.7.6 大纲上下文工程（Markdown 底座）

- 大纲以 Markdown 字符串持久化于 `drafts.outline_json.markdown`；
- 「同步到大纲」：起草对话历史（≤16 轮）→ STRONG 直接输出 Markdown 大纲（# 章节、## 小节、- 要点），不再走 JSON 中转；
- 「同步到编辑器」：前端解析 md 为 TipTap 节点（#→H1-3、-→bulletList、其余→段落）；
- 写作提案上下文：从大纲 md 抽取前 6 个标题拼为「大纲路径」注入 `writing_chat_prompt`；大纲与商讨结论（`drafting_context`，近 8 轮摘要 ≤2500 字）共同保证续写/修改承接既定结构。

#### 9.7.7 意图路由与检索矩阵（P0）

```
查询 → classify_intent（规则词表/句式 → 歧义时 LIGHT JSON 判定，带进程内缓存）
  ├─ fact      → 混合检索（dense+FTS RRF）→ tier 加权 → rerank → top-K
  ├─ multi_hop → docmap 聚类关键词定位（top2 聚类）→ 成员文献摘要/结论/正文定点块
  └─ global    → 物化聚类摘要（narrative + summary_l1）+ 文献骨干摘要（不查原文细节块）
每次决策写 route_decision 日志（intent / source / route / clusters_used）
```

multi_hop/global 检索失败（聚类缺失）时自动降级 fact 路由。

#### 9.7.8 二层缓存与失效（P0）

- **Result Cache**：`scope + fingerprint(query+上下文指纹)` → 答案+provenance，TTL 12h；应用于伴读问答与事实/全局查询；写作提案不缓存（编辑器上下文高度可变）；
- **Context Cache**：scope+kind → 物化材料（聚类摘要等），TTL 3 天；
- **失效钩子**：文献就绪 → `reading:doc:{id}` + `project:{id}`；批注升权 → `reading:doc:{id}`；记忆变更 → 全量 result cache；命中记录 `cache_hit` 事件供观测端点统计。

#### 9.7.9 Parent-Child 装配（P1）

- 切片双粒度：父块 600-1500 tokens（`parent_key=NULL`，不向量化，仅装配）；子块 200-400 tokens（`parent_key→父块`，向量化+FTS，检索单元）；摘要/结论/参考文献为单粒度 typed 块；
- 键空间：typed 块 `{doc}:1..k`、子块 `{doc}:101..`、父块 `{doc}:9001..`（全数字，兼容引用解析）；
- 装配：子块命中 → 取父块全文（≤2400 字）入证据块，同父块去重；引用标记仍指向子块（溯源精度不变，证据上下文扩大，减少断章取义）；`POST /rechunk` 迁移端点。

#### 9.7.10 双阶段引用校验（P1）

```
引用标记 → 存在性检查（不在证据列表 → invalid）
        → 句-块余弦：<0.50 invalid ｜ ≥0.70 pass ｜中间带 → LIGHT NLI
NLI：前提=被引片段 / 假设=引用句 → entail→normal，contradict→invalid，neutral→weak
高风险断言（数值/百分比/p值/因果词 正则识别）：阈值收紧为 0.60/0.80 且强制 NLI
citations 记录 verify_method（vector/nli）与 nli_verdict，观测端点聚合
```

（后续 P2 规划：HITL 抽样标注 + 归因标签回流至评测集。）

#### 9.7.11 评分人工反馈校准

```
矩阵页分数格 ✎ → PUT /documents/{id}/scores
   ├─ 覆写 scores[dim]（score + reason + user_edited 标记，加权总分即时重算）
   └─ 写 score_feedback（dim / model_score / user_score / reason）
        ↓
后续同用户入库打分或重打分（score_document）：
   取最近 6 条校正 → 注入 Prompt「人工评分校正样例」段（few-shot 校准）
   → LIGHT 依据人工尺度校准输出，避免重复同类偏差
```

设计要点：校正样例只描述「维度-分值-理由」三元组，不携带具体文献身份，防止模型照抄而失校准意义；校准样例与学科锚点互补（锚点给先验尺度，校正样例给个人尺度）；`score_feedback` 即标注集，规模足够后可转轻量模型微调。

#### 9.7.12 起草回复渲染与演示模式

- 起草商讨的助手回复经 `react-markdown + remark-gfm` 渲染（列表/小标题/代码/表格），与伴读问答一致的紧凑排版样式；用户消息保持纯文本；
- **演示模式**：六阶段演讲剧本（记忆唤醒→筛选矩阵→沉浸精读→起草商讨→提案式写作→一键审查修复）；种子数据 = 小林画像（AI 博士生·上下文工程与长上下文 RAG·APA·中文）+ 10 条高置信记忆 + 演示项目《AI 长上下文管理的工程化措施综述与展望》+ 24 篇真实 arXiv 论文（四大主题域 + 4 篇低相关样本演示自动折叠，PDF/Word/Markdown 三格式）+ 预生成脉络图谱；快照机制 = `data/demo_fixture.json`（含向量）+ uploads 快照，`POST /api/admin/demo-reset` 秒级恢复（纯数据恢复，不重跑 LLM）；跨页联动经 zustand `useDemoStore`（pendingOpenDocTitle / pendingMode）；完整台词卡与技术动线见 `ThesisFlow_Demo_Technical_Flow.md`。

#### 9.7.13 代码锚点索引

| 域 | 文件 | 职责 |
|----|------|------|
| 模型适配 | `backend/app/core/llm.py` | STRONG/LIGHT/EMBED/RERANK 能力槽路由 |
| Prompt 模板 | `backend/app/prompts/templates.py` | 全部 Prompt 契约（写作提案/审查/打分/记忆提取/预读/问答/图景） |
| 入库管线 | `backend/app/services/parsing.py` / `chunking.py` / `ingestion.py` | 多格式解析 / 分层切片 / 状态机与去重 |
| 打分 | `backend/app/services/scoring.py` | 四维+自定义维度打分、学科锚点、人工校正校准 |
| 检索 | `backend/app/services/rag.py` | RRF 混合检索、tier 权重、精排 |
| 意图与缓存 | `backend/app/core/intent.py` / `core/cache.py` | 查询三分类 / 二层缓存与失效 |
| 写作 | `backend/app/services/writing.py` / `api/writing.py` | 提案卡契约、三层 System Prompt、审查、清洗兜底 |
| 引用校验 | `backend/app/services/verification.py` | 双阶段校验（vector + NLI） |
| 记忆 | `backend/app/services/memory.py` | 隐式提取、合并/冲突裁决、注入排序 |
| 精读 | `backend/app/services/reading.py` | 预读卡、伴读问答、溯源定位 |
| 图谱 | `backend/app/services/docmap.py` | 聚类、关系边、脉络叙述、Lazy GraphRAG |
| 图景 | `backend/app/services/landscape.py` | 领域报告 + 思维导图 |
| 主页 | `backend/app/services/home.py` | 知识挖掘流、进展摘要（签名缓存） |
| 观测 | `backend/app/api/observability.py` | LLM/路由/缓存/校验口径聚合 |

## 十、迭代记录（Demo 阶段，与实现同步维护）

> 约定：每轮迭代 = 代码 + 文档双交付。本章记录各轮改动的产品设计变更；技术细节同步更新于第九章（含 9.7 增量机制）。
>
> **Demo 实际技术栈**（与 9.1 规划版差异）：后端 FastAPI + SQLite + BackgroundTasks + 本地文件存储（非 Celery/PG/MinIO）；聊天模型 DeepSeek v4-pro（写作/审查/图景）与 DeepSeek v4-flash（评分/摘要/校验），向量化与重排走百炼按量 text-embedding-v4 / gte-rerank-v2；单用户模式（无 JWT）。

### 10.1 第一轮：核心功能搭建

交付四大模块完整闭环（对应 PRD 第五、六章）：

- **模块二**：PDF 批量导入 → 启发式章节解析 → 分层 Chunking（300-800 tokens，元数据绑定 `doc_id/chunk_id/page_no`）→ 向量化 + jieba 全文索引 → 四维打分（质量/相关性/方法论/创新性，学科锚点校准）→ 矩阵排序、低分折叠、权重可调。
- **模块三**：PDF.js 阅读器 + AI 一页纸预读 + 划选打标（重点论据/借鉴方法/存疑之处/背景知识）/划线/备注 + 概念降维解析 + 批注自动升权（Top Tier）。
- **模块四**：起草/写作/审查三模式；`/续写` 强约束生成 `[doc_id:chunk_id]` 角标；Citation Verifier 生成后校验（存在性 + 余弦相似度 ≥0.55，三色角标）；快照与回退；docx/tex/md 导出。
- **模块一**：领域知识库入库、领域图景报告、隐式记忆提取（每 4 轮对话）+ 语义去重合并（≥0.90）+ 冲突裁决（0.60-0.90）、月度健康报告（置信度 <0.35 或 180 天未触发）。
- **上下文工程**：三层 System Prompt、RRF 混合检索、三档权重路由（2.0/1.2/0.8）、模式感知预算（设计意图见第七章，工程实现见第九章）。

### 10.2 第二轮：界面与交互重构（9 项反馈）

| # | 变更 | 设计决策 |
|---|------|---------|
| 1 | 侧边栏副标题改为「一站式科研工作台」 | 弱化单一卖点表述 |
| 2 | 侧边栏上下均分：项目空间（列表+区内置新建入口）/ 领域知识库（研究图景、个人记忆库、文献库）；研究画像移至左下角个人设置弹窗 | 导航层级与产品架构对齐 |
| 3 | 研究图景改为横向思维导图：根→3-5 主方向→子节点，节点含 80-150 字进展解读 + 关联文献，≥2 个「研究缺口」特殊节点 | STRONG 模型结构化 JSON 生成 |
| 4 | 主页双层动态流：上侧知识挖掘（入库事件触发 + 手动），下侧项目进展摘要（签名缓存，指标变化才调 LLM） | 事件触发 + 按需，控制成本 |
| 5 | 项目管理：项目设置弹窗（标题/研究目标/描述/阶段/删除） | 研究目标影响打分与写作上下文 |
| 6 | 起草闭环：「同步到大纲」提炼商讨共识为结构化大纲；起草对话持久化；续写携带商讨上下文 | 续写严格承接商讨结论 |
| 7 | 素材勾选按批注 ID 唯一标识（修复同 chunk 多条批注联动勾选）+ 全选/清空 | 缺陷修复 |
| 8 | 写作流式插入重写：缓冲批量插入（90ms）+ 接收/插入计数校验 + 兜底全量补插 | 缺陷修复 |
| 9 | 文献脉络图谱：主题聚类 + 关系标签边（扩展/支持/对照/背景/同主题）+ 200-350 字脉络叙述；签名缓存 + 手动重算 | 从相似度图升级为知识图谱 |
| - | 审查模式重设计：五维度（论证充分性/逻辑连贯性/结构完整性/学术规范性/方法严谨性）× 17 检查点 + 三级严重度锚定（不强制占比）+ 维度分组/筛选 | 修复严重度全 high 问题 |
| - | 删除 DOI 导入（MVP 范围外）；查重命中即删除条目（不再留失败行） | 范围收敛 |

### 10.3 第三轮：深度打磨（8 项反馈）

| # | 变更 | 实现方案 |
|---|------|---------|
| 1 | PDF 模糊与无法批注 | 根因：画布未按 devicePixelRatio 超采样（Retina 下物理像素仅 1/4）；TextLayer 渲染失败被静默吞错。修复：官方 HiDPI transform 方案 + TextLayer 加固（getTextContent + 显式错误上报）+ 高亮层 `pointer-events:none`（对齐 Hypothesis 做法，保证选区不被阻断） |
| 2 | 一页纸总结改版 | 模型输出改为结构化 JSON（核心问题/方法/结论/贡献/局限），四分区卡片渲染；剥离「一页纸结构化总结」标题字样（Prompt 禁止 + 后处理剥离） |
| 3 | 精读右栏布局 | 上 1/3 批注沉淀（可滚动）+ 下 2/3 伴读问答（固定高度）；概念降维解析入口删除（由伴读问答覆盖） |
| 4 | 标题识别加强 | 字号聚类候选（≥85% 最大字号）+ 横幅黑名单（NBER/arXiv/版权页等 20+ 词条）+ 全大写标题与作者名的大小写边界切分 + 低置信度 LIGHT 模型兜底 + 矩阵页手动纠正入口 + 「标题重识别」批量按钮 |
| 5 | 脉络图谱缓存策略 | `GET docmap` 只读缓存绝不自动重算；新文献仅提示条（「N 篇新文献未纳入」），用户主动点击才重算；防 token 浪费 |
| 6 | **写作工作台对话驱动改造** | 移除 AI 续写按钮与划词快捷栏；全部写作操作经右侧写作助手对话完成：AI 生成**修改提案卡**（续写追加/替换原文，含引用角标与校验徽标），用户「采纳」后才写入编辑器，「拒绝」可继续讨论迭代；替换类提案按锚点文本定位；对话持久化（刷新不丢） |
| 7 | 审查一键修改 | 建议卡勾选 → 「AI 一键修改所选问题」→ 逐条重写（硬规则：原引用标记必须保留）→ 双重校验（① 引用标记完整性 ② LIGHT 语义判定「是否解决问题且未改变原意」）→ 逐条 Diff 卡（✓ 校验通过 / ⚠ 需人工复核）→ 采纳即替换并留快照 |
| 8 | 文档维护机制 | 本章即为执行结果；此后每轮改动必须同步更新 PRD（含第九章实现细节）与 README |

### 10.4 第四轮：精读重构与写入根治（6 项反馈）

| # | 变更 | 实现方案 |
|---|------|---------|
| 1 | **精读页彻底重构** | ① PDF 渲染改为纯命令式架构（页面容器脱离 React 渲染树，杜绝协调破坏）+ 文本层自绘（直接消费 `getTextContent()` 条目，用 `Util.transform(viewport, item.transform)` 计算 span 位置，不再依赖 pdf.js TextLayer 内部实现，可选 `?debugtl` 调试显示）+ HiDPI 保持；文本层渲染数量有 console 日志（0 span 时告警扫描版）。② 删除「正文文本」视图切换。③ **新增 Word/Markdown 文献支持**：上传接受 `.pdf/.docx/.md`；docx 用 python-docx 解析标题层级（Heading/标题/Title 样式），md 按 `#` 层级解析；统一进入切片-向量化-打分管线；非 PDF 文献阅读器中栏展示结构化文档视图（章节化排版），划选即批注（绑定 chunk_key），高亮按引文锚点以 `<mark>` 渲染 |
| 2 | 伴读问答 Markdown 渲染 | AI 回复经 react-markdown + remark-gfm 渲染（保留 `[cN]` 来源跳转按钮），配套聊天气泡内紧凑排版样式 |
| 3 | 标题重识别按钮移除 | 按用户要求移除批量重识别入口；保留每篇文献 ✎ 手动改标题；后端批量端点保留未挂载 |
| 4 | **大纲 Markdown 化** | 大纲以 Markdown 源码为底座（存储 `outline_json.markdown`）；大纲面板编辑区（等宽字体）+ 预览切换（markdown 渲染）；「同步到大纲」AI 直接输出 Markdown 大纲；「同步到编辑器」解析 md（`#`→H1-H3、`-`→列表、其余→段落）写入 TipTap；写作提案上下文读取大纲标题链 |
| 5 | **写入失败根治 + 提案三模式** | 根因：原实现在 ProseMirror 文档根层级插入裸文本/行内节点（非法位置，命令静默失败）。新建统一写入工具 `applyContentChange`：提案文本解析为**完整段落 JSON 节点**（文本+引用节点）后插入；追加=文末插入段落、修改=锚点选区原子替换、删除=锚点选区删除；锚点三级回退（精确→空白归一→前 20 字前缀）；应用后校验写入结果，失败明确报错（不再静默）。提案契约增加 `delete` 类型（后端 Prompt + 前端红色「删除原文」提案卡） |
| 6 | 审查写入修复 | 「采纳此修改」改走统一写入工具（与提案同一套解析/定位/校验逻辑），修复此前审查修改写入不正确问题 |

### 10.5 第五轮：P0+P1 架构升级（成本-质量平衡体系）

| 域 | 变更 | 实现方案 |
|----|------|---------|
| **意图路由** | 查询入口三分类路由 | 规则层（全局词表/多跳句式）→ 歧义时 LIGHT JSON 判定，`fact / multi_hop / global`；fact→现行混合检索+精排，multi_hop→docmap 聚类定位+定点块，global→物化聚类摘要+文献骨干（不取原文细节块）；每次决策写 `route_decision` 日志 |
| **二层缓存** | Context Cache + Result Cache | 新表 `context_cache`（scope+kind，TTL 3 天）/ `result_cache`（query 指纹+provenance，TTL 12h）；应用：伴读问答 + 事实/全局查询（写作提案不缓存）；失效钩子：文献就绪/批注升权→对应 scope，记忆变更→全清 |
| **前缀工程** | 静态前缀/动态后缀分层 | 三层 System Prompt 确定性排序（置信度+ID 双键、保留 2 位小数）；所有调用记录 `prefix_hash` 与 TTFT，供应商侧 KV cache 命中自动受益 |
| **Parent-Child Chunking** | 双粒度检索装配 | 父块 600-1500 tokens（装配单元，不向量化）+ 子块 200-400 tokens（检索单元，`parent_key` 关联）；typed 块（摘要/结论/参考文献）单粒度；装配阶段子块命中自动扩展父块上下文并去重；`POST /rechunk` 迁移端点 |
| **Lazy GraphRAG** | 建图成本控制 | 入库时 jieba textrank 零 LLM 实体索引（`chunk_entities`）；聚类 `summary_l1` 物化（TTL）；新文献 delta 增量合入（就近聚类+LIGHT 合并摘要，不重算全社区）；深抽取按需触发：`docmap:deep-extract`（查询实体重叠选 top6 文献，STRONG 抽边写 `graph_edges` 带 provenance，读时合并） |
| **双阶段引用校验** | vector→NLI→（人工） | `<0.50` invalid ｜ `≥0.70` pass ｜中间带触发 LIGHT NLI（entail/contradict/neutral→正常/无效/弱）；数值/因果类断言正则识别后阈值收紧 +0.1 且强制 NLI；`citations` 记录 `verify_method` 与 `nli_verdict` |
| **观测端点** | `/api/observability/summary` | LLM 调用统计（STRONG 占比、TTFT 均值、前缀复用率）、路由分布、缓存命中、引用校验分布与幻觉率口径 |

**验收口径**（对应升级提案指标）：前缀复用率（目标 ≥0.4）、缓存命中率、deep-extract 触发率（目标 <5%）、STRONG 占比（`llm_calls.strong_ratio`）、NLI 捕获边缘幻觉数（`by_method.nli`）。

### 10.6 第六轮：精读问答与审查闭环修复（2 项反馈）

| # | 变更 | 实现方案 |
|---|------|---------|
| 1 | 伴读问答换行错乱 + 引用无法溯源 | 根因：回复按 `[cN]` 标记切段后逐段独立渲染 Markdown，列表/段落连续性被破坏；且跳转查找传入带括号的 `"[c2]"` 与 refs 的 `"c2"` 不匹配，点击恒失败。修复：回复中 `[cN]` 统一转为 Markdown 链接后**单一文档整体渲染**（列表/段落恢复连续）；链接渲染为蓝色徽标按钮，点击传裸 ID 修复查找；溯源增强：PDF 滚动到对应页并闪烁页面轮廓 1.6s，Word/Markdown 滚动到来源块并闪烁背景 |
| 2 | 审查已修复问题可重复修改 | 新增 `resolvedCards` 状态：采纳修改成功后对应建议卡置灰（`opacity-50`）+「✓ 已修复」徽标替换复选框，勾选/一键修改入口禁用，全选计数排除；「放弃」不置灰允许重试；重新审查时重置 |

### 10.7 第七轮：演讲演示模式

| 项 | 实现方案 |
|----|---------|
| 演示剧本 | 六阶段演讲流程（初始化记忆唤醒→20+ 篇筛选→精读 Lost in the Middle→起草隐式记忆→提案式写作→一键审查修复），对应系统全部已上线能力；台词卡与技术动线见 `ThesisFlow_Demo_Technical_Flow.md` |
| 种子数据 | `scripts/seed_demo.py`：小林画像（AI 博士生·上下文工程与长上下文 RAG·APA·中文）+ 10 条高置信记忆（Lost-in-the-Middle 关注、KV Cache 开销、因果推断与机制分析偏好等）+ 演示项目《AI 长上下文管理的工程化措施综述与展望》+ 20+ 篇真实 arXiv 论文全量入库（四大主题域 + 4 篇低相关样本演示 <2.5 分自动折叠；PDF/Word/Markdown 三格式）+ 脉络图谱 |
| 快照机制 | 种子完成后导出 `data/demo_fixture.json`（含向量数据）+ uploads 快照；`POST /api/admin/demo-reset` 秒级恢复（纯数据恢复，不重跑 LLM） |
| 演示模式 UI | 侧边栏左上角「🎬 演示」按钮开关；浮动引导面板（可折叠）：阶段卡 = 步骤清单 + 一键跳转/一键复制指令/重置按钮；无台词（由演讲者口述）、无计时器 |
| 跨页联动 | zustand `useDemoStore`：pendingOpenDocTitle（引导打开《Lost in the Middle》）/ pendingMode（自动切起草/写作/审查）；文献页与写作台各自消费对应标志 |

### 10.8 第八轮：评分反馈学习与写作/审查精度修复（6 项反馈）

| # | 变更 | 实现方案 |
|---|------|---------|
| 1 | **评分人工校正 + 模型学习人类反馈** | 新增 `score_feedback` 表（维度/模型分/人工分/理由）；`PUT /documents/{id}/scores` 覆写分数与理由并记录校正历史；矩阵页分数格 ✎ 内联编辑（1-5 分 + 校正理由），校正维度显示「人工」徽标、加权总分即时重算；`score_document` 注入该用户最近 6 条校正作为 **few-shot 校准样例**（只含维度-分值-理由，不携带文献身份），入库打分与重打分均受益——实现「越校正越准」；反馈管道为后续轻量模型微调预留数据 |
| 2 | 起草商讨回复 Markdown 渲染 | 起草助手消息经 `react-markdown + remark-gfm` 渲染（列表/小标题/表格/代码），沿用伴读问答紧凑排版样式；用户消息保持纯文本 |
| 3 | 大纲面板标题 | 「全文大纲（Markdown）」→「全文大纲」（去掉实现细节后缀） |
| 4 | 续写追加携带编号 | Prompt 硬规则：append 只输出纯正文段落，禁附章节编号/标题编号；后端兜底：首行为「2.1」「（三）」等标题样式时剥离编号 |
| 5 | 审查卡英文说明 | REVIEW_RUBRIC 17 检查点去除英文代码；`review_prompt_v2` 的 indicator 改为输出中文检查点名；issue/suggestion 强制纯中文（Prompt 禁令 + 后端正则清洗 17 个英文码与全/半角括号变体） |
| 6 | **替换错位 + 占位符字样** | ① 后端为提案/审查卡计算 `anchor_occurrence`（有划选时优先取选区内出现）；前端按序号定位第 N 处，无序号且多处出现 → 明确报错「锚点存在多处，请人工核对」而非静默替换；替换前校验当前位置文本与锚点一致（文稿变更即中止）；20 字前缀回退仅在全文唯一匹配时生效。② 全部引用相关 Prompt 改用具体角标示例（`形如 [1:3]`）并明令禁止输出 `[doc_id:chunk_id]`/`[NO_SUPPORT]` 占位符字样；后端对生成结果做占位符正则清洗兜底 |

### 10.9 第九轮：追加定位与采纳校验修复（2 项反馈）

| # | 变更 | 实现方案 |
|---|------|---------|
| 1 | 续写追加一律加在文末 | append 提案契约新增可选 `anchor_text`（新内容应紧接其后的现有段落精确片段，用户指令指明位置或有划选时必须输出）；后端计算 `anchor_occurrence`（划选优先）；前端写入工具按锚点定位所在文本块，**插入块尾之后**；定位失败明确报错不静默丢文末 |
| 2 | 审查采纳报「锚点与当前文稿内容不一致」 | 根因：① 锚点匹配的文本构建只含纯文本节点，引用角标（行内节点）文字缺失，含角标锚点永远匹配失败且 `textBetween` 校验恒不相等；② 同一段落多张建议卡时，先采纳的修改覆盖后卡锚点。修复：① 前端文本构建将 citation 节点按 attrs 还原为 `[docId:chunkSeq]` 字面文字参与匹配，校验改用匹配切片比对；② 后端 `_plain_text` 兼容 camelCase/snake_case/chunkKey 三种角标属性拼写（此前把角标渲染成 `[:]`）；③ 采纳冲突时提示「该段落已被先前采纳的修改覆盖」+「基于当前文本重试」按钮（`review-apply` 支持 `current_text`，基于当前段落重新生成修复） |

### 10.10 第十轮：替换残留修复与标准引文格式（2 项反馈）

| # | 变更 | 实现方案 |
|---|------|---------|
| 1 | 替换/审查采纳残留段落首字 + 多出换行 | 根因：`findAnchorRange` 位置映射 off-by-one（文本字符 i 的文档位置应为 `pos+i`，误写 `pos+i+1`），选区起点落在锚点首字之后 → 首字幸存、新段落节点替换其余部分产生换行。修复：映射改为 `pos+i`，写作 replace/delete 与审查采纳（共用写入工具）同步修复 |
| 2 | 引文角标改标准文内引用格式 + 点击溯源 | 编辑器引文由 `[doc_id:chunk_id]` 改为 APA 文内格式（如（Liu et al., 2023）/（Wei & Ming, 2022）/（Rogers, 2023），中文作者用「等」，元数据缺失回退数字格式）；`CitationMark` 由静态 renderHTML 改造为 **NodeView React 组件**：标签由 `citationMetaStore`（项目文献列表 authors/year 客户端构造）渲染期计算，旧草稿自动兼容、三态配色保留；点击角标 → 携 `?doc={id}&chunk={chunk_key}` 跳转文献工作台并打开对应精读页 → 新增 `GET /documents/{id}/chunks/{chunk_key}/locate` 返回页码 → PDF 跳页闪烁 / Word·Markdown 滚动到 `[data-chunkkey]` 块闪烁（复用伴读问答溯源机制）；写作提案卡预览同步渲染作者年份标签 |

### 10.11 已知局限（当前版本）

- 扫描版/纯图 PDF 无文本层，无法选区批注（文本层自绘时输出 0 span 告警；可转 Word/Markdown 后精读）；高亮坐标与固定渲染缩放绑定；
- 写作提案为非流式整卡生成（约 10-20 秒），未做 token 级流式预览；
- 锚点无法唯一定位（多处出现且无序号/前缀不唯一）时降级为人工定位修改提示；
- 评分校准为 few-shot 注入而非微调，校正样例仅影响同用户后续评分；
- 向量化/重排依赖百炼账户余额（欠费时入库停在 embedding 步骤，充值后重新上传即可）；
- rechunk 后历史批注的 chunk_key 可能失效（批注本身保留，引用绑定需重新打标）；
- 图谱 delta 增量合入仅对已生成过图谱的项目生效；
- 单人单项目视图无多人协作；导出参考文献格式为内置模板（非完整 CSL）。
