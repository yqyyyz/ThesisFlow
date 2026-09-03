from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
EXPORT_DIR = DATA_DIR / "exports"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    app_name: str = "ThesisFlow Demo"
    database_url: str = f"sqlite:///{DATA_DIR / 'thesisflow.db'}"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_api_key: str = ""
    bailian_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    dashscope_api_key: str = ""

    model_strong: str = "deepseek-v4-pro"
    model_light: str = "deepseek-v4-flash"
    model_embed: str = "text-embedding-v4"
    model_rerank: str = "gte-rerank-v2"
    rerank_enabled: bool = True
    thinking_enabled: bool = False
    embed_dim: int = 1024

    chunk_min_tokens: int = 300
    chunk_max_tokens: int = 800
    chunk_overlap: float = 0.10
    score_fold_threshold: float = 2.5
    citation_similarity_threshold: float = 0.55
    dedup_similarity_threshold: float = 0.95

    llm_timeout: int = 120
    scoring_concurrency: int = 4


settings = Settings()

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
