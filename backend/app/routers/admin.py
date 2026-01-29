# app/routers/admin.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from pathlib import Path
import csv
import subprocess
import sys

from ..core.admin_guard import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])

# backend/app/routers/admin.py -> parents[0]=routers, [1]=app, [2]=backend
DATA_DIR = Path(__file__).resolve().parents[2] / "data"
SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"

CSV_PATH = DATA_DIR / "input_books.csv"
WORKS_JSON = DATA_DIR / "works.json"

BUILD_SCRIPT = SCRIPTS_DIR / "build_works_from_csv_sbert.py"
IMPORT_SCRIPT = SCRIPTS_DIR / "import_generated_works_to_neo4j.py"


class BookIn(BaseModel):
    id: str
    title: str
    author: str
    age: str = "12+"
    annotation: str = ""


def _ensure_csv_exists() -> None:
    if not CSV_PATH.exists():
        raise HTTPException(status_code=404, detail=f"Нет файла {CSV_PATH}")


def _csv_fieldnames() -> list[str]:
    return ["id", "title", "author", "age", "annotation"]


def _run_script(script_path: Path) -> dict:
    if not script_path.exists():
        raise HTTPException(status_code=500, detail=f"Нет скрипта: {script_path}")

    proc = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(script_path.parent),
        capture_output=True,
        text=True,
    )

    if proc.returncode != 0:
        # stderr чаще полезнее, но иногда скрипт пишет в stdout
        msg = (proc.stderr or proc.stdout or "").strip()
        raise HTTPException(status_code=500, detail=f"Script failed: {script_path.name}\n{msg}")

    return {"ok": True, "stdout": (proc.stdout or "").strip()}


@router.get("/books")
def list_books(_admin=Depends(require_admin)):
    _ensure_csv_exists()
    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        return list(reader)


@router.post("/books")
def add_book(book: BookIn, _admin=Depends(require_admin)):
    _ensure_csv_exists()

    bid = (book.id or "").strip()
    if not bid:
        raise HTTPException(status_code=400, detail="id пустой")

    title = (book.title or "").strip()
    author = (book.author or "").strip()
    if not title or not author:
        raise HTTPException(status_code=400, detail="title/author обязательны")

    # читаем существующие id
    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        existing_ids = {(r.get("id") or "").strip() for r in rows}

    if bid in existing_ids:
        raise HTTPException(status_code=400, detail=f"id уже существует: {bid}")

    # дописываем строку
    with CSV_PATH.open("a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=_csv_fieldnames())
        # на случай, если файл пустой (обычно нет)
        if CSV_PATH.stat().st_size == 0:
            writer.writeheader()

        writer.writerow(
            {
                "id": bid,
                "title": title,
                "author": author,
                "age": (book.age or "12+").strip() or "12+",
                "annotation": (book.annotation or "").strip(),
            }
        )

    return {"ok": True, "added": bid}


@router.post("/rebuild_works")
def rebuild_works(_admin=Depends(require_admin)):
    # генерит data/works.json на основе data/input_books.csv и data/concepts.txt
    return _run_script(BUILD_SCRIPT)


@router.post("/import_works_neo4j")
def import_works_neo4j(_admin=Depends(require_admin)):
    if not WORKS_JSON.exists():
        raise HTTPException(status_code=400, detail="Нет works.json. Сначала вызови POST /admin/rebuild_works")
    return _run_script(IMPORT_SCRIPT)


@router.post("/publish")
def publish(_admin=Depends(require_admin)):
    # полный цикл: CSV -> works.json -> Neo4j
    a = rebuild_works(_admin=_admin)
    b = import_works_neo4j(_admin=_admin)
    return {"ok": True, "rebuild": a, "import": b}
