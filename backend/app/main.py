from pathlib import Path
import json
from typing import Dict, List

from fastapi import FastAPI
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

class Work(BaseModel):
    """Литературное произведение в эталонном графе"""
    id: str
    title: str
    author: str
    age: str
    concepts: Dict[str, float] #ценностные маркеры и их вес

# Хранилище произведений

WORKS: List[Work] = []

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




