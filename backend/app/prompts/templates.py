SYSTEM_PROMPTS = {
    "scoring": (
        "你是 {{discipline}} 学科的资深审稿人与科研助手，评估严谨、客观。\n"
        "【用户背景】{{user_context}}\n"
        "【领域记忆】{{domain_memory}}"
    ),
    "writing": (
        "你是 {{discipline}} 领域的资深学术审稿人与写作助手，语气严谨客观。\n"
        "【用户背景】{{user_context}}\n"
        "【领域记忆】{{domain_memory}}\n"
        "引用规范：{{citation_style}}；写作语言：{{language}}。"
    ),
    "review": (
        "你是一位严格的同行评审专家，从逻辑连贯性、证据支持度和学术用语规范"
        "三个维度对文本提出建设性批评。"
    ),
}


def scoring_prompt(doc_meta: str, abstract: str, conclusion: str, research_question: str) -> str:
    return f"""请依据以下文献信息，从四个维度对该文献进行 1-5 分的整数打分，并给出每个维度的简要理由（每条不超过 40 字）。

评分维度：
- quality：期刊/会议等级、被引量、写作规范性
- relevance：与当前项目研究问题的语义匹配度
- methodology：实验设计完整性、样本量、统计方法合理性
- novelty：是否提出新理论/新方法/新数据集

当前项目研究问题：
{research_question or "（未设定，按通用学术价值评估）"}

文献元数据：
{doc_meta}

文献摘要：
{abstract or "（缺失）"}

文献结论片段：
{conclusion or "（缺失）"}

只输出一个 JSON 对象，不要输出其他内容，格式如下：
{{"quality": {{"score": 0, "reason": ""}}, "relevance": {{"score": 0, "reason": ""}}, "methodology": {{"score": 0, "reason": ""}}, "novelty": {{"score": 0, "reason": ""}}}}"""


def pre_read_prompt(title: str, abstract: str, full_text_head: str) -> str:
    return f"""请提炼以下学术文献的核心内容，只输出 JSON（不要 markdown 代码块、不要任何标题性前缀文字）。

文献标题：{title}

摘要：
{abstract or "（缺失）"}

正文开头：
{full_text_head}

JSON 格式：
{{"core_question": "核心研究问题，1-2 句", "methods": ["方法与数据要点1", "要点2"], "conclusions": ["主要结论1", "结论2"], "contributions": "贡献，1-2 句", "limitations": "局限，1-2 句"}}

要求：方法/结论各 2-4 条要点，每条不超过 50 字；只基于给定材料。"""


def concept_explain_prompt(term: str, context: str) -> str:
    return f"""用户正在精读学术文献，对以下内容感到难以理解，请用通俗易懂的语言解释其原理，
先给出一句话直觉解释，再展开必要细节，最后说明它在论文语境中的作用。

待解释内容：
{term}

所在上下文：
{context or "（无）"}"""


REVIEW_RUBRIC = {
    "dimensions": [
        {
            "key": "evidence",
            "name": "论证充分性",
            "indicators": [
                "断言无引用或证据支撑",
                "证据强度与断言强度不匹配",
                "忽略反面证据或替代解释",
                "引用与原文事实不符",
            ],
        },
        {
            "key": "logic",
            "name": "逻辑连贯性",
            "indicators": [
                "因果链断裂或跳跃推理",
                "循环论证",
                "段落间过渡缺失",
                "前后结论矛盾",
            ],
        },
        {
            "key": "structure",
            "name": "结构完整性",
            "indicators": [
                "相对研究问题缺少必要部分",
                "研究贡献表述不清晰",
                "摘要与正文不一致",
            ],
        },
        {
            "key": "academic_norm",
            "name": "学术规范性",
            "indicators": [
                "口语化或模糊量词",
                "术语使用不精确或不一致",
                "引用格式不合规",
            ],
        },
        {
            "key": "methodology",
            "name": "方法严谨性",
            "indicators": [
                "变量操作化未说明",
                "样本与数据描述缺失",
                "稳健性或局限性未交代",
            ],
        },
    ],
    "severity_anchors": {
        "high": "不修改则论证不成立或存在事实性错误，投稿前必须解决",
        "medium": "削弱论证说服力，投稿前应当修改",
        "low": "表达润色级别，可选修改",
    },
}


def writing_chat_prompt(
    editor_text: str,
    selection: str,
    outline_path: str,
    drafting_summary: str,
    selected_notes: str,
    evidence_block: str,
    instruction: str,
    citation_style: str,
) -> str:
    return f"""你是学术写作协作助手。用户提出了一条写作指令，请判断意图并产出结果。

当前文稿（可能为空）：
{editor_text[:8000] or "（空）"}

用户当前选中的段落（若有）：
{selection or "（无选中内容）"}

大纲：{outline_path or "（未设置）"}

起草商讨结论（若有）：
{drafting_summary or "（无）"}

用户勾选的精读素材：
{selected_notes or "（无）"}

检索证据（每条有唯一 id，格式 doc_id:chunk序号）：
{evidence_block or "（无证据）"}

用户指令：
{instruction}

请判断：
- 若用户在讨论问题、征求意见（不要求修改文稿）→ 输出 {{"type":"reply","content":"你的讨论回复"}}
- 若用户要求新增/续写内容 → 输出 {{"type":"append","content":"新增正文（含引用标记）","anchor_text":"新内容应紧接其后的现有段落原文精确片段（15-60字，必须与文稿原文完全一致）","reason":"一句话说明"}}
- 若用户要求改写现有内容 → 输出 {{"type":"replace","anchor_text":"被修改原文的精确片段（15-60字，必须与文稿原文完全一致）","content":"修改后的内容（含引用标记）","reason":"一句话说明"}}
- 若用户要求删除现有内容 → 输出 {{"type":"delete","anchor_text":"待删除原文的精确片段（15-60字，必须与文稿原文完全一致）","reason":"一句话说明"}}

硬性规则：
1. content 中引用事实论据必须在句末使用引用角标（形如 [3:12]，具体数字取自上方证据列表），只允许引用上方检索证据中出现的内容；
2. 严禁编造证据列表中不存在的引用与结论；严禁输出 [doc_id:chunk_id] 或 [NO_SUPPORT] 形式的占位符字样；证据不足时在正文中以中文说明并标注需人工补充；
3. append 的 content 只输出纯正文段落：禁止附带章节编号、标题编号或大纲标题（如 "2.1"、"（三）" 等）；
4. append 的位置规则：若用户指令指明了插入位置（如「在引言部分续写」「续写第二段」）或用户有划选内容，必须在 anchor_text 中给出新内容应紧接其后的现有段落精确片段（取该段落末尾 15-60 字）；若用户未指定位置（如笼统的「继续写」），anchor_text 输出空字符串 ""，表示追加到文稿末尾；
5. 语气符合 {citation_style} 学术规范；
6. 只输出 JSON，不要任何其他文字。"""


def review_fix_prompt(anchor: str, issue: str, suggestion: str) -> str:
    return f"""请依据审查意见修改下面的学术段落。

原段落：
{anchor}

审查发现的问题：{issue}
修改建议：{suggestion}

硬性规则：
1. 原段落中实际出现的引用角标（形如 [1:3]，具体数字）必须全部原样保留，不得删除或篡改数字；
2. 不得引入原段落中不存在的引用角标；严禁输出 [doc_id:chunk_id]、[NO_SUPPORT] 形式的占位符字样；
3. 保持原段落的核心观点不变，只解决审查指出的问题；
4. 输出纯中文段落，禁止附带章节编号或标题；
5. 只输出修改后的完整段落，不要任何解释或前缀。"""


def review_check_prompt(anchor: str, fixed: str, issue: str) -> str:
    return f"""判断下面的修改是否合格。

原段落：
{anchor}

修改后：
{fixed}

原审查问题：{issue}

请输出 JSON：{{"passed": true或false, "reason": "20字以内理由"}}
判定标准：① 原段落中的全部引用标记在修改后仍然存在；② 修改解决了审查问题；③ 未改变原文核心观点。
只输出 JSON。"""


def review_prompt_v2(text: str) -> str:
    dim_lines = []
    for d in REVIEW_RUBRIC["dimensions"]:
        inds = "；".join(d["indicators"])
        dim_lines.append(f"- {d['key']}（{d['name']}）检查点：{inds}")
    sev = REVIEW_RUBRIC["severity_anchors"]
    return f"""切换为严格的同行评审视角。仅评审所给文本本身，不引入任何外部文献。

评审维度与检查点：
{chr(10).join(dim_lines)}

严重度判据：
- high：{sev['high']}
- medium：{sev['medium']}
- low：{sev['low']}

输出要求：
1. 输出 JSON 数组，每个元素格式：
{{"dimension": "evidence|logic|structure|academic_norm|methodology", "indicator": "检查点中文名（必须从上方对应维度的检查点清单中原样选取）", "anchor_text": "原文中的锚点短语（10-40字，必须与原文一致）", "issue": "问题描述（纯中文，禁止出现英文单词或代码）", "suggestion": "具体修改建议（纯中文）", "severity": "high|medium|low", "fix_effort": "small|large"}}
2. 输出前逐条对照严重度判据复核，确保 severity 与判据一致，避免一刀切全部标 high；
3. 若某维度无问题则不输出该维度的条目；无任何问题时输出空数组；
4. issue 与 suggestion 中禁止出现任何英文标识、代码标签或 [doc_id:chunk_id] 形式的占位符字样；
5. 只输出 JSON 数组。

待评审文本：
{text}"""


def writing_strong_prompt(
    outline_path: str,
    window_text: str,
    selected_notes: str,
    evidence_block: str,
    instruction: str,
    citation_style: str,
    drafting_context: str | None = None,
) -> str:
    drafting_section = ""
    if drafting_context and drafting_context.strip():
        drafting_section = f"""
起草商讨结论（与用户讨论后达成的共识，续写必须承接）：
{drafting_context}
"""
    return f"""任务：基于大纲与检索材料，对当前段落执行 {instruction or "续写"}。
大纲路径：{outline_path or "（未指定）"}
{drafting_section}段落上下文：
{window_text or "（当前为空文档，请根据大纲开始撰写）"}

用户选中的精读素材：
{selected_notes or "（无）"}

检索证据（每条有唯一 id，格式 doc_id:chunk序号，如 1:3）：
{evidence_block or "（无证据）"}

硬性规则：
1. 只能使用上方证据列表中出现的内容；引用事实性论据时必须在句末以引用角标格式插入内联标记（形如 [1:3]，具体数字取自证据列表）；
2. 严禁编造列表中不存在的引用与结论；严禁输出 [doc_id:chunk_id] 或 [NO_SUPPORT] 形式的占位符字样；证据不足时用中文说明并标注需人工补充；
3. 输出纯正文段落，禁止附带章节编号、标题编号或大纲标题（如 "2.1"、"（三）" 等）；
4. 语气符合 {citation_style} 学术规范；只输出正文，不输出解释性语句与元评论。"""


def review_prompt(text: str) -> str:
    return f"""切换为严格的同行评审视角。仅评审所给文本本身，不引入任何外部文献。
从三个维度输出建议：(a) 论证充分性 (b) 逻辑连贯性 (c) 学术用语规范。
每条建议输出 JSON 数组，元素格式：{{"dimension": "a|b|c", "anchor_text": "原文锚点", "issue": "问题", "suggestion": "建议", "severity": "high|medium|low"}}
只输出 JSON 数组。

待评审文本：
{text}"""


def edit_action_prompt(action: str, selection: str, extra: str | None) -> str:
    tasks = {
        "polish": "润色以下学术段落：保持原意与引用标记不变，提升表达准确性与学术规范性。",
        "rewrite": "重写以下段落：改善逻辑组织与论证结构，保持引用标记与核心观点不变。",
        "logic": "审查以下段落的逻辑问题：指出论证跳跃、证据缺失或因果不当之处，并给出修改后的版本。",
    }
    task = tasks.get(action, tasks["polish"])
    return f"""{task}
要求：原文中实际出现的引用角标（形如 [1:3]，具体数字）必须原样保留；严禁输出 [doc_id:chunk_id] 或 [NO_SUPPORT] 形式的占位符字样；只输出处理后的正文（logic 动作时先输出"问题："要点再输出"修改："正文）。
{("补充要求：" + extra) if extra else ""}

原文：
{selection}"""


def drafting_chat_prompt(research_question: str, doc_summaries: str) -> str:
    return f"""你正在协助研究者梳理论文大纲。基于以下文献骨干与研究问题进行讨论：
研究问题：{research_question or "（未设定）"}

文献骨干信息：
{doc_summaries or "（项目内暂无文献）"}

请与用户商讨章节逻辑、论点组织与摘要要点。回应需结构化、可执行。"""


def memory_extract_prompt(conversation: str) -> str:
    return f"""分析以下研究对话，提取值得长期记住的用户研究偏好（方法论倾向、关注变量、写作习惯等）。
每条记忆一句话，只提取稳定偏好，不提取一次性任务。若无值得沉淀的内容，输出空数组。
只输出 JSON 数组（字符串数组），不要其他内容。

对话：
{conversation}"""

