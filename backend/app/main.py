from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.settings import settings
from .core.neo4j import close_driver
from .routers.health import router as health_router
from .routers.profile import router as profile_router
from .routers.analysis import router as analysis_router
from .routers.recommendations import router as rec_router
from .routers.test import router as test_router
from .routers.gaps import router as gaps_router
from .routers.history import router as history_router
from .routers.admin import router as admin_router

from .store import WORKS
from .services.graph import get_works_from_neo4j

from .db import init_db



app = FastAPI(title="ReadingPlatform backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(profile_router)
app.include_router(analysis_router)
app.include_router(rec_router)
app.include_router(test_router)
app.include_router(gaps_router)
app.include_router(history_router)
app.include_router(admin_router)


@app.on_event("shutdown")
def _shutdown():
    close_driver()

@app.on_event("startup")
def _startup():
    init_db()

    # 1) пробуем загрузить книги из Neo4j
    try:
        works = get_works_from_neo4j()
        WORKS.clear()
        WORKS.extend(works)
        print("WORKS size after neo4j:", len(WORKS))
    except Exception as e:
        print("FAILED to load WORKS from neo4j:", repr(e))
        print("WORKS size after neo4j:", len(WORKS))