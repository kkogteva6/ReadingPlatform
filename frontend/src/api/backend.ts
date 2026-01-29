// src/api/backend.ts
// Единый helper jsonFetch + автоматическая передача X-User-Email (для admin_guard).
// Предполагается, что в vite настроен proxy: "/api" -> "http://127.0.0.1:8000"

import { getUser } from "../auth";

/** Приводим любой путь к виду /api/... (если это не абсолютный URL). */
function normalizeUrl(url: string): string {
  // абсолютный URL оставляем как есть (на будущее)
  if (/^https?:\/\//i.test(url)) return url;

  // уже правильно
  if (url.startsWith("/api/")) return url;

  // "/profile/.." -> "/api/profile/.."
  if (url.startsWith("/")) return `/api${url}`;

  // "profile/.." -> "/api/profile/.."
  return `/api/${url}`;
}

/** Собираем headers, добавляя X-User-Email, но не затирая переданные */
function withAuthHeaders(initHeaders?: HeadersInit): Headers {
  const h = new Headers(initHeaders || {});
  const u = getUser();
  if (u?.email) h.set("X-User-Email", u.email);
  return h;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const fullUrl = normalizeUrl(url);
  const headers = withAuthHeaders(init?.headers);

  const r = await fetch(fullUrl, { ...init, headers });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(txt || `${init?.method ?? "GET"} ${fullUrl} → ${r.status}`);
  }

  // 204 No Content
  if (r.status === 204) return undefined as unknown as T;

  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await r.text().catch(() => "");
    return txt as unknown as T;
  }

  return (await r.json()) as T;
}

/* -------------------------------- Types ------------------------------ */

export type Work = {
  id: string;
  title: string;
  author: string;
  age: string;
  concepts: Record<string, number>;
};

export type ReaderProfile = {
  id: string;
  age: string;
  concepts: Record<string, number>;
};

/* ------------------------------ Profile ------------------------------ */

export async function apiGetProfile(readerId: string): Promise<ReaderProfile> {
  return jsonFetch<ReaderProfile>(`profile/${encodeURIComponent(readerId)}`);
}

export async function apiUpsertProfile(profile: ReaderProfile): Promise<ReaderProfile> {
  return jsonFetch<ReaderProfile>(`profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
}

/* --------------------------- Recommendations ------------------------- */

export async function apiGetRecommendations(readerId: string, topN = 5): Promise<Work[]> {
  return jsonFetch<Work[]>(`recommendations/${encodeURIComponent(readerId)}?top_n=${topN}`);
}

/* ------------------------------ Analyze ------------------------------ */

export async function apiAnalyzeText(readerId: string, text: string) {
  return jsonFetch<any>(`analyze_text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reader_id: readerId, text }),
  });
}

/* -------------------- Explainable recommendations -------------------- */

export type ExplainMatch = {
  concept: string;
  deficit: number;
  weight: number;
};

export type ExplainWhy = {
  deficits: ExplainMatch[];
  score: number;
};

export type ExplainedRecommendation = {
  work: Work;
  why: ExplainWhy;
};

export async function apiGetRecommendationsExplain(readerId: string, topN = 5) {
  return jsonFetch<ExplainedRecommendation[]>(
    `recommendations_explain/${encodeURIComponent(readerId)}?top_n=${topN}&use_saved=1`
  );
}

/* ----------------------------- Apply test ---------------------------- */

export type ApplyTestRequest = {
  reader_id: string;
  age?: string;
  test_concepts: Record<string, number>;
};

export async function apiApplyTest(req: ApplyTestRequest): Promise<ReaderProfile> {
  return jsonFetch<ReaderProfile>(`apply_test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
}

/* -------------------------------- Gaps ------------------------------- */

export type GapSummaryItem = {
  concept: string;
  target: number;
  current: number;
  gap: number;
  direction: "below" | "above";
};

export async function apiGetGaps(readerId: string): Promise<GapSummaryItem[]> {
  return jsonFetch<GapSummaryItem[]>(`gaps/${encodeURIComponent(readerId)}`);
}

/* ----------------------- Profile meta + history ---------------------- */

export type ProfileMeta = {
  reader_id: string;
  test_count: number;
  text_count: number;
  last_update_at: string | null;
  last_source: string | null;
  last_test_at: string | null;
  last_text_at: string | null;
};

export type ProfileEvent = {
  id: number;
  reader_id: string;
  created_at: string;
  type: "test" | "text";
  payload: any;
  profile_after: any;
};

export async function apiGetProfileMeta(readerId: string): Promise<ProfileMeta> {
  return jsonFetch<ProfileMeta>(`profile_meta/${encodeURIComponent(readerId)}`);
}

export async function apiGetProfileHistory(readerId: string, limit = 20): Promise<ProfileEvent[]> {
  return jsonFetch<ProfileEvent[]>(`profile_history/${encodeURIComponent(readerId)}?limit=${limit}`);
}

/* ------------------------ Saved recommendations ---------------------- */

export type RecommendationSnapshot = {
  id: number;
  reader_id: string;
  created_at: string;
  source: "test" | "text" | "manual";
  top_n: number;
  gaps?: any;
  profile?: any;
  recs: any;
};

export async function apiGetRecommendationSaved(readerId: string, limit = 20): Promise<RecommendationSnapshot[]> {
  return jsonFetch<RecommendationSnapshot[]>(
    `recommendations_saved/${encodeURIComponent(readerId)}?limit=${limit}`
  );
}

/* ------------------------------- Admin ------------------------------- */

export type AdminBookIn = {
  id: string;
  title: string;
  author: string;
  age?: string;
  annotation?: string;
};

export async function apiAdminListBooks(): Promise<any[]> {
  return jsonFetch<any[]>(`admin/books`);
}

export async function apiAdminAddBook(book: AdminBookIn): Promise<any> {
  return jsonFetch<any>(`admin/books`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(book),
  });
}

export async function apiAdminRebuildWorks(): Promise<any> {
  return jsonFetch<any>(`admin/rebuild_works`, { method: "POST" });
}

export async function apiAdminImportWorksNeo4j(): Promise<any> {
  return jsonFetch<any>(`admin/import_works_neo4j`, { method: "POST" });
}

export async function apiAdminPublish(): Promise<any> {
  return jsonFetch<any>(`admin/publish`, { method: "POST" });
}
