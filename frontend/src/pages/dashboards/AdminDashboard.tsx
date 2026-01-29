import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout } from "../../auth";

import {
  apiAdminListBooks,
  apiAdminAddBook,
  apiAdminRebuildWorks,
  apiAdminImportWorksNeo4j,
  apiAdminPublish,
  type AdminBookIn,
} from "../../api/backend";

/**
 * AdminDashboard:
 * - показывает книги из CSV (/admin/books)
 * - добавляет книгу (/admin/books POST)
 * - пересчитывает works.json (/admin/rebuild_works)
 * - импортирует в Neo4j (/admin/import_works_neo4j)
 * - publish всё разом (/admin/publish)
 *
 * ВАЖНО: запросы идут через api/* из backend.ts,
 * там автоматически добавляется X-User-Email.
 */

type BookRow = {
  id: string;
  title: string;
  author: string;
  age?: string;
  annotation?: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string };

const emptyBook: BookRow = {
  id: "",
  title: "",
  author: "",
  age: "12+",
  annotation: "",
};

function slugifyId(input: string) {
  const map: Record<string, string> = {
    а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"e", ж:"zh", з:"z", и:"i", й:"y",
    к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r", с:"s", т:"t", у:"u", ф:"f",
    х:"h", ц:"ts", ч:"ch", ш:"sh", щ:"sch", ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya",
  };

  const s = (input || "").trim().toLowerCase();

  const translit = Array.from(s)
    .map((ch) => map[ch] ?? ch)
    .join("");

  return translit
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")   // всё кроме латиницы/цифр -> _
    .replace(/^_+|_+$/g, "")       // убрать _ по краям
    .replace(/_+/g, "_")           // схлопнуть ___ в _
    .slice(0, 60) || "work";
}


function statusBoxStyle(status: Status): React.CSSProperties {
  if (status.kind === "idle") return {};
  if (status.kind === "error") {
    return {
      marginTop: 12,
      color: "#b91c1c",
      background: "rgba(185, 28, 28, 0.08)",
      border: "1px solid rgba(185, 28, 28, 0.18)",
      padding: "10px 12px",
      borderRadius: 12,
      fontSize: 13,
      whiteSpace: "pre-wrap",
    };
  }
  if (status.kind === "ok") {
    return {
      marginTop: 12,
      background: "rgba(15,118,110,0.08)",
      border: "1px solid rgba(15,118,110,0.20)",
      padding: "10px 12px",
      borderRadius: 12,
      fontSize: 13,
      whiteSpace: "pre-wrap",
    };
  }
  return {
    marginTop: 12,
    background: "rgba(29,78,216,0.06)",
    border: "1px solid rgba(29,78,216,0.18)",
    padding: "10px 12px",
    borderRadius: 12,
    fontSize: 13,
    whiteSpace: "pre-wrap",
  };
}

export default function AdminDashboard() {
  const nav = useNavigate();

  const [books, setBooks] = useState<BookRow[]>([]);
  const [form, setForm] = useState<BookRow>(emptyBook);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [query, setQuery] = useState("");

  const isBusy = status.kind === "loading";

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => {
      const hay = `${b.id} ${b.title} ${b.author} ${b.age ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [books, query]);

  function setLoading(text: string) {
    setStatus({ kind: "loading", text });
  }
  function setOk(text: string) {
    setStatus({ kind: "ok", text });
  }
  function setErr(e: unknown) {
    setStatus({
      kind: "error",
      text: e instanceof Error ? e.message : String(e),
    });
  }

  async function loadBooks() {
    try {
      setStatus({ kind: "idle" });
      const data = await apiAdminListBooks();
      setBooks(data as BookRow[]);
    } catch (e) {
      setErr(e);
    }
  }

  useEffect(() => {
    loadBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addBook() {
    const id = (form.id || "").trim();
    const title = (form.title || "").trim();
    const author = (form.author || "").trim();
    const age = (form.age || "12+").trim();
    const annotation = (form.annotation || "").trim();

    if (!id || !title || !author) {
      setErr("id, title и author обязательны");
      return;
    }

    const payload: AdminBookIn = { id, title, author, age, annotation };

    try {
      setLoading("Добавляем книгу…");
      await apiAdminAddBook(payload);
      setForm(emptyBook);
      await loadBooks();
      setOk("Книга добавлена");
    } catch (e) {
      setErr(e);
    }
  }

  async function rebuild() {
    try {
      setLoading("Пересчёт концептов (SBERT)…");
      await apiAdminRebuildWorks();
      setOk("works.json пересчитан");
    } catch (e) {
      setErr(e);
    }
  }

  async function importNeo4j() {
    try {
      setLoading("Импорт в Neo4j…");
      await apiAdminImportWorksNeo4j();
      setOk("Импорт в Neo4j завершён");
    } catch (e) {
      setErr(e);
    }
  }

  async function publishAll() {
    try {
      setLoading("Пересчёт + импорт…");
      await apiAdminPublish();
      setOk("Опубликовано (rebuild + import)");
    } catch (e) {
      setErr(e);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 1200 }}>
        <div className="header">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div className="brandRow">
              <div className="bookLogo" aria-hidden>
                <svg className="bookSvg" viewBox="0 0 64 64">
                  <path
                    d="M6 14h20c6 0 10 4 10 10v28c-2-3-6-4-10-4H6c-3 0-6 2-6 6V20c0-3 3-6 6-6z"
                    fill="rgba(255,255,255,0.25)"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M58 14H38c-6 0-10 4-10 10v28c2-3 6-4 10-4h20c3 0 6 2 6 6V20c0-3-3-6-6-6z"
                    fill="rgba(255,255,255,0.25)"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                  <line x1="32" y1="18" x2="32" y2="52" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>

              <div>
                <h1 className="title" style={{ margin: 0 }}>
                  Админ-панель
                </h1>
                <p className="subtitle" style={{ marginBottom: 0 }}>
                  Добавляй книги → пересчитывай концепты → импортируй в Neo4j.
                </p>
              </div>
            </div>

            <button
              className="tabBtn"
              type="button"
              onClick={() => {
                logout();
                nav("/login", { replace: true });
              }}
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="content" style={{ display: "block" }}>
          {/* публикация */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panelTitle">Публикация</div>

            <div className="actions" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" as any }}>
              <button className="btn" type="button" onClick={rebuild} disabled={isBusy}>
                <span className="btnText">
                  <span className="btnLabel">Пересчитать концепты</span>
                  <span className="btnHint">Сформировать works.json</span>
                </span>
                <span className="arrow">→</span>
              </button>

              <button className="btn" type="button" onClick={importNeo4j} disabled={isBusy}>
                <span className="btnText">
                  <span className="btnLabel">Импорт в Neo4j</span>
                  <span className="btnHint">Залить works.json в граф</span>
                </span>
                <span className="arrow">→</span>
              </button>

              <button className="btn btnPrimary" type="button" onClick={publishAll} disabled={isBusy}>
                <span className="btnText">
                  <span className="btnLabel">Опубликовать</span>
                  <span className="btnHint">Пересчитать и импортировать</span>
                </span>
                <span className="arrow">→</span>
              </button>
            </div>

            {status.kind !== "idle" && <div style={statusBoxStyle(status)}>{status.text}</div>}
          </div>

          {/* добавить книгу */}
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="panelTitle">Добавить книгу</div>

            <div className="formGrid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <label className="field">
                <span>ID (уникальный)</span>
                <input
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  placeholder="например: war_and_peace"
                />
                <span className="footerNote" style={{ marginTop: 0 }}>
                  Можно нажать «Сгенерировать» из названия.
                </span>
              </label>

              <div style={{ display: "grid", alignContent: "end" }}>
                <button
                  type="button"
                  className="primaryBtn"
                  onClick={() => setForm((f) => ({ ...f, id: slugifyId(f.title || f.id) }))}
                  disabled={isBusy}
                >
                  Сгенерировать ID из названия
                </button>
              </div>

              <label className="field">
                <span>Название</span>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Война и мир" />
              </label>

              <label className="field">
                <span>Автор</span>
                <input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="Л.Н. Толстой" />
              </label>

              <label className="field">
                <span>Возраст</span>
                <input value={form.age ?? "12+"} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="12+" />
              </label>

              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Аннотация</span>
                <textarea
                  className="bigTextarea"
                  rows={6}
                  value={form.annotation ?? ""}
                  onChange={(e) => setForm({ ...form, annotation: e.target.value })}
                  placeholder="Короткое описание книги (по нему считаются концепты)."
                />
              </label>
            </div>

            <div className="navRow" style={{ justifyContent: "flex-start" }}>
              <button className="primaryBtn" type="button" onClick={addBook} disabled={isBusy}>
                Добавить книгу
              </button>
              <button className="fileBtn" type="button" onClick={() => setForm(emptyBook)} disabled={isBusy}>
                Очистить
              </button>
            </div>

            <div className="footerNote">
              После добавления книги нажми <b>Опубликовать</b> — тогда концепты пересчитаются и книга появится в рекомендациях.
            </div>
          </div>

          {/* список книг */}
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="panelTitle" style={{ marginBottom: 6 }}>
                  Книги
                </div>
                <div className="footerNote" style={{ marginTop: 0 }}>
                  Всего: <b>{books.length}</b>
                  {query.trim() ? (
                    <>
                      {" "}
                      • Показано: <b>{filteredBooks.length}</b>
                    </>
                  ) : null}
                </div>
              </div>

              <label className="field" style={{ minWidth: 260 }}>
                <span>Поиск</span>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="по названию, автору или id" />
              </label>
            </div>

            <div style={{ height: 12 }} />

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={thStyle}>ID</th>
                    <th style={thStyle}>Название</th>
                    <th style={thStyle}>Автор</th>
                    <th style={thStyle}>Возраст</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBooks.map((b) => (
                    <tr key={b.id}>
                      <td style={tdStyle}>{b.id}</td>
                      <td style={tdStyle}>{b.title}</td>
                      <td style={tdStyle}>{b.author}</td>
                      <td style={tdStyle}>{b.age ?? ""}</td>
                    </tr>
                  ))}

                  {filteredBooks.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={4}>
                        Ничего не найдено
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="navRow" style={{ justifyContent: "flex-start" }}>
              <button className="fileBtn" type="button" onClick={loadBooks} disabled={isBusy}>
                Обновить список
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  color: "var(--muted)",
  fontSize: 13,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  fontSize: 14,
  verticalAlign: "top",
};
