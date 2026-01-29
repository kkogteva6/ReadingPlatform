from pydantic import BaseModel
import os


class Settings(BaseModel):
    # API
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # Neo4j
    neo4j_uri: str = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user: str = os.getenv("NEO4J_USER", "neo4j")
    neo4j_password: str = os.getenv("NEO4J_PASSWORD", "neo4j12345")

    # SBERT
    sbert_model_name: str = os.getenv(
        "SBERT_MODEL_NAME",
        "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    )

    # Admin
    admin_emails: list[str] = [
        "admin@test.ru",      # основной администратор
        # "teacher@test.ru",  # можно добавить потом
    ]


settings = Settings()
