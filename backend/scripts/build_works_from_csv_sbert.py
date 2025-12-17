import csv
import json
import re
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer


def slugify(s: str) -> str:
    s = s.lower().strip()
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"[^\w_]+", "", s, flags=re.UNICODE)
    return s[:60] or "work"


def load_concepts(path: Path) -> list[str]:
    items = []
    for line in path.read_text(encoding="utf-8").splitlines():
        t = line.strip()
        if t and not t.startswith("#"):
            items.append(t)
    if not items:
        raise ValueError("concepts.txt пустой")
    return items


def main():
    data_dir = Path(__file__).resolve().parents[1] / "data"
    inp = data_dir / "input_books.csv"
    concepts_path = data_dir / "concepts.txt"
    out = data_dir / "works.json"

    if not inp.exists():
        raise FileNotFoundError(f"Нет файла: {inp}")
    if not concepts_path.exists():
        raise FileNotFoundError(f"Нет файла: {concepts_path}")

    concepts = load_concepts(concepts_path)

    model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    concept_emb = model.encode(concepts, normalize_embeddings=True, batch_size=64)

    works = []
    with inp.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)

        needed = {"title", "author", "annotation"}
        missing = needed - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"В CSV не хватает колонок: {sorted(missing)}")

        for idx, row in enumerate(reader, start=1):
            csv_id = (row.get("id") or "").strip()
            title = (row.get("title") or "").strip()
            author = (row.get("author") or "").strip()
            age = (row.get("age") or "").strip() or "12+"
            ann = (row.get("annotation") or "").strip()

            if not title or not author:
                continue

            work_id = csv_id or f"{slugify(title)}_{idx}"

            concepts_dict = {}
            if ann:
                text_emb = model.encode([ann], normalize_embeddings=True)[0]
                sims = concept_emb @ text_emb  # cosine similarity

                top_k = 20
                top_idx = np.argsort(-sims)[:top_k]
                top_vals = sims[top_idx]

                # нормировка в 0..1
                minv = float(top_vals.min())
                maxv = float(top_vals.max())
                weights = (top_vals - minv) / (maxv - minv + 1e-9)

                for i2, w in zip(top_idx, weights):
                    concepts_dict[concepts[i2]] = float(round(float(w), 4))

            works.append(
                {
                    "id": work_id,
                    "title": title,
                    "author": author,
                    "age": age,
                    "concepts": concepts_dict,
                }
            )

    out.write_text(json.dumps(works, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: {out} (works={len(works)})")


if __name__ == "__main__":
    main()
