from contextlib import asynccontextmanager

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
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

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
