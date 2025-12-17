#.\Activate.ps1
# uvicorn app.main:app --reload --host 127.0.0.1 --port 7666
#uvicorn app.main:app --reload --host 127.0.0.1 --port 8000


import numpy as np
from sentence_transformers import SentenceTransformer

from pathlib import Path
import json
from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from neo4j import GraphDatabase


# Подключение к базе данных Neo4j
uri = "bolt://localhost:7687"  # Адрес сервера Neo4j
username = "neo4j"  # Имя пользователя
password = "neo4j12345"  # Пароль

driver = GraphDatabase.driver(uri, auth=(username, password))


# Инициализация приложения
app = FastAPI(title="ReadingPlatform backend")

# Разрешаем запросы с фронтенда
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,       # с каких адресов можно
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Модели данных

# Произведение
class Work(BaseModel):
    id: str
    title: str
    author: str
    age: str
    concepts: Dict[str, float] # ценностные маркеры и их вес

# Профиль читателя
class ReaderProfile(BaseModel):
    id: str
    age: str
    concepts: Dict[str, float] # ценностные маркеры и их вес

class AnalyzeTextRequest(BaseModel):
    reader_id: str
    text: str


# Глобальный список произведений
WORKS: List[Work] = []
# Список профилей читателей
PROFILES: Dict[str, ReaderProfile] = {}

# Глобальное создание модели
SBERT_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
sbert = SentenceTransformer(SBERT_MODEL_NAME)


# Эталонные профили по возрастным группам
TARGET_PROFILES: Dict[str, Dict[str, float]] = {
    "16+": {
        "патриотизм": 0.4,
        "нравственный_выбор": 0.7,
        "смысл_жизни": 0.7,
        "честь_и_достоинство": 0.6,
        "любовь": 0.5,
        "коллективизм": 0.5,
    },
    "12+": {
        "честь_и_достоинство": 0.6,
        "любовь": 0.6,
        "дружба": 0.6,
    },
}


CONCEPT_ALIASES: Dict[str, Dict[str, float]] = {
    "любовь": {
        "любовь_и_прощение": 1.0,
        "любовь_и_верность": 1.0,
        "любовь_и_страсть": 1.0,
        "любовь_и_разочарование": 1.0,
        "любовь_и_долг": 1.0,
    },
    "коллективизм": {
        "народная_жизнь": 1.0,
        "народная_судьба": 1.0,
    },
}



# Словарь якорных фраз для концептов
CONCEPT_ANCHORS: Dict[str, List[str]] = {
    "патриотизм": [
        "любовь к Родине", "служение Отечеству", "гордость за страну", "защита Родины"
    ],
    "любовь": [
        "чувство любви", "любовь и забота", "верность в отношениях", "прощение близких"
    ],
    "ответственность": [
        "отвечать за поступки", "выполнять обещания", "принятие последствий", "долг"
    ],
    "совесть": [
        "муки совести", "стыд за поступок", "внутренний моральный закон", "раскаяние"
    ],
    "свобода": [
        "свобода выбора", "право на решение", "независимость личности", "самостоятельность"
    ],
}

def get_works_from_neo4j() -> List[Work]:
    query = """
    MATCH (w:Work)
    OPTIONAL MATCH (w)-[r:HAS_CONCEPT]->(c:Concept)
    RETURN
      w.id    AS id,
      w.title AS title,
      w.author AS author,
      w.age   AS age,
      collect({name: c.name, weight: r.weight}) AS concepts
    ORDER BY w.title
    """
    works: List[Work] = []
    with driver.session() as session:
        for rec in session.run(query):
            concepts_dict = {
                item["name"]: float(item["weight"])
                for item in rec["concepts"]
                if item["name"] is not None and item["weight"] is not None
            }
            works.append(
                Work(
                    id=rec["id"],
                    title=rec["title"],
                    author=rec["author"],
                    age=rec["age"],
                    concepts=concepts_dict,
                )
            )
    return works


def compute_deficits(profile: ReaderProfile, target: Dict[str, float]) -> Dict[str, float]:
    """
    Дефицит = target - current, если > 0
    """
    deficits: Dict[str, float] = {}
    all_keys = set(target.keys()) | set(profile.concepts.keys())
    for k in all_keys:
        t = float(target.get(k, 0.0))
        c = float(profile.concepts.get(k, 0.0))
        d = t - c
        if d > 0:
            deficits[k] = d
    return deficits

def parse_min_age(age: str) -> Optional[int]:
    """
    Поддерживает формат:
    - '16+'
    - '12+'
    - '16'
    """
    try:
        return int(age.replace("+", "").strip())
    except Exception:
        return None


def is_age_compatible(reader_age: str, work_age: str) -> bool:
    r_min = parse_min_age(reader_age)
    w_min = parse_min_age(work_age)

    if r_min is None or w_min is None:
        return False

    # книга подходит, если её минимальный возраст
    # НЕ превышает возраст читателя
    return r_min >= w_min



def work_utility(deficits: Dict[str, float], work: Work) -> float:
    score = 0.0
    for concept, deficit in deficits.items():
        # прямое совпадение
        score += deficit * float(work.concepts.get(concept, 0.0))

        # алиасы (если есть)
        aliases = CONCEPT_ALIASES.get(concept)
        if aliases:
            for wc, w in aliases.items():
                score += deficit * w * float(work.concepts.get(wc, 0.0))
    return score


def recommend_works(profile: ReaderProfile, works: List[Work], top_n: int = 5) -> List[Work]:
    target = TARGET_PROFILES.get(profile.age)
    if not target:
        return []

    deficits = compute_deficits(profile, target)

    scored = []
    for w in works:
        if not is_age_compatible(profile.age, w.age):
            continue
        s = work_utility(deficits, w)
        if s > 0:
            scored.append((s, w))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [w for _, w in scored[:top_n]]



def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    na = np.linalg.norm(a)
    nb = np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))

def analyze_text_to_concepts(text: str) -> Dict[str, float]:
    """
    1) строим embedding текста
    2) для каждого концепта считаем similarity к усреднённому embedding его якорей
    3) приводим к шкале 0..1
    """
    text_vec = sbert.encode([text], normalize_embeddings=True)[0]

    scores: Dict[str, float] = {}
    raw_vals: List[float] = []

    for concept, anchors in CONCEPT_ANCHORS.items():
        anchor_vecs = sbert.encode(anchors, normalize_embeddings=True)
        anchor_mean = np.mean(anchor_vecs, axis=0)
        sim = _cosine(text_vec, anchor_mean)  # примерно [-1..1], на практике чаще 0..1
        scores[concept] = sim
        raw_vals.append(sim)

    # Нормализация в 0..1 (простая): сдвиг+масштаб
    mn = min(raw_vals) if raw_vals else 0.0
    mx = max(raw_vals) if raw_vals else 1.0
    if mx - mn < 1e-9:
        return {k: 0.0 for k in scores}

    normalized = {k: float((v - mn) / (mx - mn)) for k, v in scores.items()}
    return normalized


# Эндпоинты

@app.on_event("startup")
def startup_event():
    global WORKS
    WORKS = get_works_from_neo4j()




@app.get("/")
def root():
    return {"message": "ReadingPlatform backend is running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/works", response_model=List[Work])
def get_works() -> List[Work]:
    """Вернуть все произведения из Neo4j"""
    works = get_works_from_neo4j()
    return works

# Создать/обновить профиль читателя
@app.post("/profile", response_model=ReaderProfile)
async def create_or_update_profile(profile: ReaderProfile) -> ReaderProfile:
    PROFILES[profile.id] = profile
    return profile

# Получить профиль читателя по id
@app.get("/profile/{profile_id}", response_model=ReaderProfile)
def get_profile(profile_id: str) -> ReaderProfile:
    profile = PROFILES.get(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    return profile


# Рекомендации
@app.get("/recommendations/{reader_id}", response_model=List[Work])
def get_recommendations(reader_id: str, top_n: int = 5) -> List[Work]:
    profile = PROFILES.get(reader_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Профиль не найден")

    return recommend_works(profile, WORKS, top_n=top_n)


@app.post("/analyze_text")
def analyze_text(req: AnalyzeTextRequest):
    # 1) достаем профиль или создаем новый (если нет)
    profile = PROFILES.get(req.reader_id)
    if profile is None:
        # если профиля нет — создаём “пустой” (возраст можно потом обновлять отдельно)
        profile = ReaderProfile(id=req.reader_id, age="16+", concepts={})

    # 2) считаем концепты из текста
    new_concepts = analyze_text_to_concepts(req.text)

    # 3) агрегируем: простое среднее старого и нового
    updated: Dict[str, float] = {}
    keys = set(profile.concepts.keys()) | set(new_concepts.keys())
    for k in keys:
        old = float(profile.concepts.get(k, 0.0))
        new = float(new_concepts.get(k, 0.0))
        updated[k] = (old + new) / 2.0

    # 4) сохранить профиль
    profile = ReaderProfile(id=profile.id, age=profile.age, concepts=updated)
    PROFILES[req.reader_id] = profile

    return {
        "concepts": new_concepts,
        "profile": profile
    }
