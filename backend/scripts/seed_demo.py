"""构建演示种子数据：画像 + 记忆 + 项目 + 20+ 篇文献（PDF/Word/Markdown）全量入库 + 图谱 + 快照导出。
用法: uv run python scripts/download_demo_papers.py && uv run python scripts/seed_demo.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import DATA_DIR, UPLOAD_DIR
from app.database import SessionLocal, init_db
from app.models import (
    AiFeedback,
    Annotation,
    ChatMessage,
    ChatSession,
    Chunk,
    ChunkEntity,
    Citation,
    ComparisonMatrix,
    Document,
    DocumentMap,
    DomainLandscape,
    DomainMemory,
    Draft,
    DraftSnapshot,
    GraphEdge,
    HealthReport,
    Project,
    User,
)
from app.services.demo import export_fixture
from app.services.docmap import regenerate_doc_map
from app.services.ingestion import run_pipeline

DEMO_PAPERS_DIR = DATA_DIR / "demo_papers"

MEMORIES = [
    ("重点关注长上下文语言模型中的注意力衰减与中段性能退化现象（Lost in the Middle 效应）", 0.95),
    ("偏好从 KV Cache 内存开销视角分析长上下文处理的效率问题", 0.92),
    ("关注 GraphRAG 等结构化知识组织对检索增强的提升", 0.90),
    ("认同混合检索（稠密+稀疏、RRF 融合）优于单一检索路径", 0.88),
    ("重视 NLI 蕴含判定等生成内容校验方法在质量保障中的作用", 0.88),
    ("偏好使用 LongBench、RULER 等基准评测长上下文能力", 0.86),
    ("关注智能体系统中的记忆机制设计（工作记忆/长期记忆分层）", 0.85),
    ("对上下文窗口扩展的位置编码方法（RoPE 插值/NTK 缩放）有持续兴趣", 0.84),
    ("倾向从注意力机制可解释性角度分析工程改进的有效性", 0.82),
    ("偏好从因果推断与机制分析视角解释性能差异，重视方法背后的作用机制", 0.90),
]

PROJECT_NAME = "AI 长上下文管理的工程化措施综述与展望"
RESEARCH_QUESTION = (
    "哪些工程化措施能系统性提升大模型对超长上下文的管理能力？"
    "上下文窗口扩展、GraphRAG、混合检索（RRF）与 NLI 校验等方法在长上下文场景下的"
    "效果如何相互比较与组合？"
)

# 元数据补全：arXiv 下载不含 venue/cited_by，补上以免「质量」维度系统性偏低
DOC_META = {
    "2005.11401": ("NeurIPS 2020", 2020, 5000),
    "2312.10997": ("arXiv", 2023, 2400),
    "2311.05232": ("arXiv", 2023, 1500),
    "2303.08896": ("arXiv", 2023, 800),
    "2305.14251": ("arXiv", 2023, 1000),
    "2309.15217": ("arXiv", 2023, 600),
    "2307.03172": ("TACL 2024", 2024, 800),
    "2308.14508": ("ACL 2024", 2024, 1200),
    "2309.17453": ("ICML 2024", 2024, 700),
    "2402.13753": ("ACL 2024", 2024, 300),
    "2404.06654": ("arXiv", 2024, 300),
    "2404.16130": ("arXiv", 2024, 500),
    "2310.11511": ("ICLR 2024", 2024, 1000),
    "2401.15884": ("NeurIPS 2024", 2024, 500),
    "2410.05779": ("arXiv", 2024, 200),
    "2404.13501": ("arXiv", 2024, 250),
    "2404.14294": ("arXiv", 2024, 300),
    "2306.15595": ("arXiv", 2023, 900),
    "2307.11088": ("NeurIPS 2023", 2023, 300),
    "2402.14848": ("arXiv", 2024, 150),
}

# 标题兜底：个别 PDF 首页无标题行时解析可能误抓章节名
TITLE_OVERRIDES = {
    "2312.10997": "Retrieval-Augmented Generation for Large Language Models: A Survey",
    "2404.06654": "RULER: What's the Real Context Size of Your Long-Context Language Models?",
    "2002.07310": "Neutral Hydrogen in Nearby Dwarf Galaxies",
}


def reset_all(db):
    for model in [
        Citation, ChatMessage, ChatSession, AiFeedback, DraftSnapshot, Draft,
        Annotation, ComparisonMatrix, HealthReport, DomainLandscape, DocumentMap,
        GraphEdge, ChunkEntity, Chunk, Document, Project, DomainMemory, User,
    ]:
        db.query(model).delete(synchronize_session=False)
    db.commit()


def main():
    sys.stdout.reconfigure(line_buffering=True)
    init_db()
    if not DEMO_PAPERS_DIR.exists() or not list(DEMO_PAPERS_DIR.glob("*.pdf")):
        print("请先运行 scripts/download_demo_papers.py 下载论文")
        sys.exit(1)

    with SessionLocal() as db:
        print("1. 清空数据库…")
        reset_all(db)

        print("2. 创建小林的画像…")
        user = User(
            email="xiaolin@thesisflow.local",
            name="小林",
            identity="博士生",
            discipline="人工智能",
            sub_discipline="上下文工程与长上下文 RAG、Agent 记忆体系",
            citation_style="APA",
            language_pref="中文",
        )
        db.add(user)
        db.commit()

        print(f"3. 写入 {len(MEMORIES)} 条高置信记忆…")
        for content, conf in MEMORIES:
            db.add(
                DomainMemory(
                    user_id=user.id,
                    content=content,
                    type="explicit",
                    confidence=conf,
                    trigger_count=3,
                    source_ref="demo_seed",
                    status="active",
                )
            )
        db.commit()

        print("4. 创建演示项目…")
        project = Project(
            user_id=user.id,
            name=PROJECT_NAME,
            description="演讲演示项目：AI 长上下文管理的工程化措施综述",
            research_question=RESEARCH_QUESTION,
            stage="literature",
        )
        db.add(project)
        db.commit()

        files = sorted(
            DEMO_PAPERS_DIR.glob("*.*"),
            key=lambda p: (p.suffix not in {".pdf", ".docx", ".md"}, p.name),
        )
        files = [p for p in files if p.suffix in {".pdf", ".docx", ".md"}]
        print(
            f"5. 入库 {len(files)} 篇文献"
            f"（{sum(1 for p in files if p.suffix == '.pdf')} PDF / "
            f"{sum(1 for p in files if p.suffix == '.docx')} Word / "
            f"{sum(1 for p in files if p.suffix == '.md')} Markdown，约 20-30 分钟）…"
        )
        for i, pdf in enumerate(files, 1):
            rel = f"1/demo_{pdf.name}"
            dest = UPLOAD_DIR / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(pdf.read_bytes())
            aid = pdf.name.split("_", 1)[0]
            meta = DOC_META.get(aid)
            doc = Document(
                user_id=user.id,
                project_id=project.id,
                file_key=rel,
                file_name=pdf.name,
                title=TITLE_OVERRIDES.get(aid),
                venue=meta[0] if meta else None,
                year=meta[1] if meta else None,
                cited_by=meta[2] if meta else None,
                status="uploaded",
            )
            db.add(doc)
            db.commit()
            print(f"  [{i}/{len(files)}] {pdf.name[:60]} …")
            run_pipeline(doc.id)
            db.expire_all()
            doc = db.get(Document, doc.id)
            override = TITLE_OVERRIDES.get(aid)
            if override and doc and doc.title != override:
                doc.title = override
                db.commit()
                print(f"    标题兜底: {override[:50]}")
            status = doc.status if doc else "missing"
            if status != "ready":
                print(f"    ⚠ 入库未就绪: {status}")

        print("6. 生成文献脉络图谱…")
        graph = regenerate_doc_map(db, project)
        print(f"   聚类 {len(graph.get('clusters', []))} 个 / 边 {len(graph.get('edges', []))} 条")

        ready = db.query(Document).filter(Document.status == "ready").count()
        n_chunks = db.query(Chunk).count()
        print(f"7. 就绪文献 {ready}/{len(files)}，总 chunk 数 {n_chunks}")
        low_score = 0
        for d in db.query(Document).all():
            total = (
                sum(v["score"] for v in (d.scores or {}).values())
                / max(len(d.scores or {}), 1)
            )
            if total < 2.5:
                low_score += 1
        print(f"   低分折叠样本（四维总分 < 2.5）：{low_score} 篇")

    print("8. 导出演示快照…")
    path = export_fixture()
    print(f"快照已导出: {path}")
    print("演示种子构建完成！")


if __name__ == "__main__":
    main()
