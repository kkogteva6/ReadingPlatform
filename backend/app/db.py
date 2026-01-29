import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "app.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    with get_conn() as conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS profile_meta (
            reader_id TEXT PRIMARY KEY,
            test_count INTEGER NOT NULL DEFAULT 0,
            text_count INTEGER NOT NULL DEFAULT 0,
            last_update_at TEXT,
            last_source TEXT,
            last_test_at TEXT,
            last_text_at TEXT
        );
        """)
        conn.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reader_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            type TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            profile_after_json TEXT NOT NULL
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_reader_id ON events(reader_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);")
        conn.execute("""
        CREATE TABLE IF NOT EXISTS recommendation_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reader_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            source TEXT NOT NULL,        -- "test" | "text" | "manual"
            top_n INTEGER NOT NULL DEFAULT 5,
            age TEXT,
            event_id INTEGER,
            gaps_json TEXT,
            profile_json TEXT,
            recs_json TEXT NOT NULL
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recs_reader_id ON recommendation_snapshots(reader_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_recs_created_at ON recommendation_snapshots(created_at);")

        conn.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
        reader_id TEXT PRIMARY KEY,
        age TEXT NOT NULL,
        concepts_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
        );
        """)


def upsert_meta(reader_id: str, source: str) -> None:
    at = now_iso()
    with get_conn() as conn:
        conn.execute("""
        INSERT INTO profile_meta (reader_id, last_update_at, last_source)
        VALUES (?, ?, ?)
        ON CONFLICT(reader_id) DO UPDATE SET
          last_update_at=excluded.last_update_at,
          last_source=excluded.last_source;
        """, (reader_id, at, source))

        if source == "test":
            conn.execute("""
            UPDATE profile_meta
            SET test_count = test_count + 1,
                last_test_at = ?
            WHERE reader_id = ?;
            """, (at, reader_id))
        elif source == "text":
            conn.execute("""
            UPDATE profile_meta
            SET text_count = text_count + 1,
                last_text_at = ?
            WHERE reader_id = ?;
            """, (at, reader_id))

def log_event(reader_id: str, event_type: str, payload: dict[str, Any], profile_after: dict[str, Any]) -> None:
    with get_conn() as conn:
        conn.execute("""
        INSERT INTO events (reader_id, created_at, type, payload_json, profile_after_json)
        VALUES (?, ?, ?, ?, ?);
        """, (
            reader_id,
            now_iso(),
            event_type,
            json.dumps(payload, ensure_ascii=False),
            json.dumps(profile_after, ensure_ascii=False),
        ))

def get_meta(reader_id: str) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM profile_meta WHERE reader_id = ?;", (reader_id,)).fetchone()
        return dict(row) if row else None

def get_history(reader_id: str, limit: int = 20) -> list[dict[str, Any]]:
    limit = max(1, min(100, int(limit)))
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT id, reader_id, created_at, type, payload_json, profile_after_json
            FROM events
            WHERE reader_id = ?
            ORDER BY created_at DESC
            LIMIT ?;
        """, (reader_id, limit)).fetchall()

    out: list[dict[str, Any]] = []
    for r in rows:
        out.append({
            "id": r["id"],
            "reader_id": r["reader_id"],
            "created_at": r["created_at"],
            "type": r["type"],
            "payload": json.loads(r["payload_json"]),
            "profile_after": json.loads(r["profile_after_json"]),
        })
    return out


def save_recommendation_snapshot(
    reader_id: str,
    source: str,
    top_n: int,
    age: str | None,
    recs: Any,
    event_id: int | None = None,
    gaps: Any | None = None,
    profile: Any | None = None,
) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO recommendation_snapshots
              (reader_id, created_at, source, top_n, age, event_id, gaps_json, profile_json, recs_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (
                reader_id,
                now_iso(),
                source,
                int(top_n),
                age,
                event_id,
                json.dumps(gaps, ensure_ascii=False) if gaps is not None else None,
                json.dumps(profile, ensure_ascii=False) if profile is not None else None,
                json.dumps([to_jsonable(r) for r in recs], ensure_ascii=False),
            ),
        )
        return int(cur.lastrowid)

def get_last_recommendation_snapshot(reader_id: str) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute(
            """
            SELECT id, reader_id, created_at, source, top_n, age, event_id, gaps_json, profile_json, recs_json
            FROM recommendation_snapshots
            WHERE reader_id = ?
            ORDER BY created_at DESC
            LIMIT 1;
            """,
            (reader_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "reader_id": row["reader_id"],
            "created_at": row["created_at"],
            "source": row["source"],
            "top_n": row["top_n"],
            "age": row["age"],
            "event_id": row["event_id"],
            "gaps": json.loads(row["gaps_json"]) if row["gaps_json"] else None,
            "profile": json.loads(row["profile_json"]) if row["profile_json"] else None,
            "recs": json.loads(row["recs_json"]) if row["recs_json"] else [],
        }


def save_profile(reader_id: str, age: str, concepts: dict[str, Any]) -> None:
    with get_conn() as conn:
        conn.execute("""
        INSERT INTO profiles (reader_id, age, concepts_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(reader_id) DO UPDATE SET
          age=excluded.age,
          concepts_json=excluded.concepts_json,
          updated_at=excluded.updated_at;
        """, (reader_id, age, json.dumps(concepts, ensure_ascii=False), now_iso()))

def load_profile(reader_id: str) -> Optional[dict[str, Any]]:
    with get_conn() as conn:
        row = conn.execute("SELECT reader_id, age, concepts_json FROM profiles WHERE reader_id=?;", (reader_id,)).fetchone()
        if not row:
            return None
        return {
            "id": row["reader_id"],
            "age": row["age"],
            "concepts": json.loads(row["concepts_json"]),
        }

def to_jsonable(x: Any) -> Any:
    # Pydantic v2
    if hasattr(x, "model_dump"):
        return x.model_dump()
    # Pydantic v1
    if hasattr(x, "dict"):
        return x.dict()
    # dataclass / objects with __dict__
    if hasattr(x, "__dict__"):
        return x.__dict__
    return x
