from pathlib import Path
import json
from typing import Dict, List

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

def load_works_from_json() -> List[Work]:
    """Загрузка списка произведений из JSON-файла при старте сервера"""
    data_path = Path(__file__).resolve().parent.parent / "data" / "works.json"
    with data_path.open("r", encoding="utf-8") as f:
        raw_list = json.load(f)
    return [Work(**item) for item in raw_list]


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
@app.post("/profile/{profile_id}", response_model=ReaderProfile)
async def get_profile(profile_id: str) -> ReaderProfile:
    profile = PROFILES.get(profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Профиль не найден")
    return profile


