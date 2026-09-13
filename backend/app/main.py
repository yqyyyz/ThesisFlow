from contextlib import asynccontextmanager
import uuid

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import (
    admin,
    domain,
    documents,
    health,
    home,
    memory,
    observability,
    profile,
    projects,
    reading,
    writing,
)
from app.config import settings
from app.core.llm import reset_evaluation_context, set_evaluation_context
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)


@app.middleware("http")
async def evaluation_trace_context(request, call_next):
    request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
    token = set_evaluation_context(
        request.headers.get("X-Evaluation-Run-Id"),
        request.headers.get("X-Evaluation-Task-Id"),
        request_id,
    )
    try:
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response
    finally:
        reset_evaluation_context(token)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(profile.router)
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(reading.router)
app.include_router(writing.router)
app.include_router(memory.router)
app.include_router(domain.router)
app.include_router(home.router)
app.include_router(observability.router)
app.include_router(admin.router)
