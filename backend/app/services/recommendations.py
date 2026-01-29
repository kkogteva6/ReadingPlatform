from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Literal

from ..schemas import (
    ReaderProfile,
    Work,
    GapItem,
    WhyBlock,
    ExplainedRecommendation,
)
from ..store import WORKS
from .targets import TARGET_PROFILES, CONCEPT_ALIASES
from ..services.profiles import get_profile

# ----------------------------- Age helpers -----------------------------

def parse_min_age(age: str) -> Optional[int]:
    try:
        return int(age.replace("+", "").strip())
    except Exception:
        return None


def is_age_compatible(reader_age: str, work_age: str) -> bool:
    r_min = parse_min_age(reader_age)
    w_min = parse_min_age(work_age)
    if r_min is None or w_min is None:
        return False
    return r_min >= w_min


# ----------------------------- Gaps / scoring / explaining -----------------------------

def compute_gaps(profile: ReaderProfile, target: Dict[str, float]) -> List[Dict[str, Any]]:
    """
    gap = target - current
    direction:
      - below: gap > 0  (не хватает)
      - above: gap < 0  (выражено выше целевого)
    """
    gaps: List[Dict[str, Any]] = []
    all_keys = set(target.keys()) | set(profile.concepts.keys())
    for k in all_keys:
        t = float(target.get(k, 0.0))
        c = float(profile.concepts.get(k, 0.0))
        gap = t - c
        if abs(gap) < 1e-9:
            continue
        gaps.append(
            {
                "concept": k,
                "target": t,
                "current": c,
                "gap": gap,
                "direction": "below" if gap > 0 else "above",
            }
        )
    return gaps


def iter_concept_weights_for_work(core_concept: str, work: Work) -> List[Tuple[str, float, Optional[str]]]:
    """
    Возвращает список (concept_name, effective_weight, via_core_or_None)
    - core_concept -> вес как есть, via=None
    - алиасы -> вес * coef, via=core_concept
    """
    items: List[Tuple[str, float, Optional[str]]] = []
    base_w = float(work.concepts.get(core_concept, 0.0))
    if base_w > 0:
        items.append((core_concept, base_w, None))

    aliases = CONCEPT_ALIASES.get(core_concept, {})
    for alias, coef in aliases.items():
        w = float(work.concepts.get(alias, 0.0)) * float(coef)
        if w > 0:
            items.append((alias, w, core_concept))
    return items


def work_score_by_gaps_with_explain(
    gaps: List[Dict[str, Any]],
    work: Work,
    mode: Literal["correction", "deepening"],
) -> Tuple[float, List[GapItem]]:
    """
    ВАЖНО: алиасы участвуют ДВУМЯ способами:
      - в score
      - в explain (gaps[]) отдельными строками, с via=core
    """
    score = 0.0
    why_items: List[GapItem] = []

    for g in gaps:
        gap = float(g["gap"])

        if mode == "correction" and gap <= 0:
            continue
        if mode == "deepening" and gap >= 0:
            continue

        core = str(g["concept"])
        target = float(g["target"])
        current = float(g["current"])
        direction: Literal["below", "above"] = g["direction"]

        # коэффициент для углубления (чтобы не “перекачивать” сильные темы)
        deep_k = 0.45

        for concept_name, w_eff, via in iter_concept_weights_for_work(core, work):
            if w_eff <= 0:
                continue

            if mode == "correction":
                contrib = gap * w_eff  # gap > 0
                shown_gap = gap
            else:
                contrib = abs(gap) * w_eff * deep_k  # gap < 0
                shown_gap = gap  # оставляем отрицательным, чтобы direction=above было честно

            if contrib <= 0:
                continue

            score += contrib
            why_items.append(
                GapItem(
                    concept=concept_name,
                    target=target,
                    current=current,
                    gap=shown_gap,
                    direction=direction,
                    weight=float(w_eff),
                    via=via,
                )
            )

    # сортируем по влиянию
    why_items.sort(key=lambda x: abs(x.gap) * x.weight, reverse=True)
    return score, why_items[:10]


def has_meaningful_profile_data(profile: ReaderProfile) -> bool:
    """
    Данные есть, если:
    - concepts не пустой
    - и сумма значений > очень малого порога
    """
    if not profile.concepts:
        return False
    return sum(float(v) for v in profile.concepts.values()) > 1e-6


def recommend_works_explain(
    profile: ReaderProfile,
    works: List[Work],
    top_n: int = 5,
) -> List[ExplainedRecommendation]:
    if not has_meaningful_profile_data(profile):
        return []

    target = TARGET_PROFILES.get(profile.age)
    if not target:
        return []

    gaps = compute_gaps(profile, target)

    has_below = any(float(g["gap"]) > 0 for g in gaps)
    mode: Literal["correction", "deepening"] = "correction" if has_below else "deepening"

    scored: List[Tuple[float, Work, List[GapItem]]] = []
    for w in works:
        if not is_age_compatible(profile.age, w.age):
            continue

        s, why_items = work_score_by_gaps_with_explain(gaps, w, mode)
        if s > 0:
            scored.append((s, w, why_items))

    scored.sort(key=lambda x: x[0], reverse=True)

    return [
        ExplainedRecommendation(
            work=w,
            why=WhyBlock(mode=mode, score=float(s), gaps=why_items),
        )
        for s, w, why_items in scored[:top_n]
    ]


# ----------------------------- Public API used by routers -----------------------------

def get_recommendations_explain(reader_id: str, top_n: int = 5):
    profile = get_profile(reader_id)  # ДОЛЖЕН быть ReaderProfile

    # защита от случайной порчи типов
    if isinstance(profile, str):
        raise TypeError(f"get_profile() returned str, expected ReaderProfile. value={profile!r}")

    return recommend_works_explain(profile, WORKS, top_n=top_n)