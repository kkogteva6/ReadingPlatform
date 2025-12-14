from pathlib import Path
import json
from typing import Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel


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

# Глобальный список произведений
WORKS: List[Work] = []
# Список профилей читателей
PROFILES: Dict[str, ReaderProfile] = {}



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


def load_works_from_json() -> List[Work]:
    """Загрузка списка произведений из JSON-файла при старте сервера"""
    data_path = Path(__file__).resolve().parent.parent / "data" / "works.json"
    with data_path.open("r", encoding="utf-8") as f:
        raw_list = json.load(f)
    return [Work(**item) for item in raw_list]


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



# Список книг грзится один раз при старте сервера
@app.on_event("startup")
def startup_event():
    global WORKS
    WORKS = load_works_from_json()


# Эндпоинты

@app.get("/")
def root():
    return {"message": "ReadingPlatform backend is running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/works", response_model=List[Work])
def get_works() -> List[Work]:
    """Вернуть весь список эталонных произведений"""
    return WORKS

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
