import numpy as np

from app.config import settings


def vec_to_blob(vec: np.ndarray) -> bytes:
    return vec.astype(np.float32).tobytes()


def blob_to_vec(blob: bytes) -> np.ndarray:
    return np.frombuffer(blob, dtype=np.float32).copy()


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def brute_force_search(
    query_vec: np.ndarray,
    corpus: list[tuple[str, np.ndarray]],
    top_k: int = 100,
) -> list[tuple[str, float]]:
    if not corpus:
        return []
    keys = [k for k, _ in corpus]
    mat = np.vstack([v for _, v in corpus])
    norms = np.linalg.norm(mat, axis=1)
    norms[norms == 0] = 1.0
    qnorm = np.linalg.norm(query_vec)
    if qnorm == 0:
        return []
    scores = mat @ query_vec / (norms * qnorm)
    order = np.argsort(-scores)[:top_k]
    return [(keys[i], float(scores[i])) for i in order]


def chunk_search_window(dim: int = None) -> int:
    return dim or settings.embed_dim
