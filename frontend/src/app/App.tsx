import { Link, Route, Routes, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import Protected from "../Protected";
import { loginMock, roleHome, setUser, getUser, type Role, MOCK_ACCOUNTS } from "../auth";

import Student from "../pages/dashboards/StudentDashboard";
import Parent from "../pages/dashboards/ParentDashboard";
import Teacher from "../pages/dashboards/TeacherDashboard";
import Admin from "../pages/dashboards/AdminDashboard";

const ROLE_CARDS: Array<{ role: Role; title: string; desc: string }> = [
  { role: "student", title: "Ученик", desc: "Персональные рекомендации и траектория чтения" },
  { role: "parent", title: "Родитель", desc: "Поддержка чтения и отчёты по динамике" },
  { role: "teacher", title: "Учитель", desc: "Мониторинг класса и подборки" },
  { role: "admin", title: "Администратор", desc: "Пользователи и контент" },
];

function BrandHeader(props: { title: string; subtitle: string }) {
  return (
    <div className="header">
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
            {props.title}
          </h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {props.subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className="container">
      <div className="card">
        <BrandHeader
          title="Платформа развивающего чтения"
          subtitle="Персонализированная траектория чтения с объяснимыми рекомендациями и поддержкой педагога/родителя."
        />

        <div className="content">
          <div className="panel">
            <div className="panelTitle">Старт</div>

            <div className="actions">
              <Link className="btn btnPrimary" to="/login">
                <span className="btnText">
                  <span className="btnLabel">Вход</span>
                  <span className="btnHint">Если аккаунт уже создан</span>
                </span>
                <span className="arrow">→</span>
              </Link>

              <Link className="btn" to="/register">
                <span className="btnText">
                  <span className="btnLabel">Регистрация</span>
                  <span className="btnHint">Создать профиль и выбрать роль</span>
                </span>
                <span className="arrow">→</span>
              </Link>
            </div>

            <div className="footerNote">
              В дальнейшем здесь будет: выбор роли (ученик/родитель/учитель/админ), рекомендации «почему», мониторинг динамики.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Login() {
  const nav = useNavigate();
  const loc = useLocation() as any;

  const presets = useMemo(() => MOCK_ACCOUNTS, []);
  const [role, setRole] = useState<Role>("student");
  const [email, setEmail] = useState(presets.student.email);
  const [pass, setPass] = useState(presets.student.pass);

  const [error, setError] = useState<string | null>(null);

  function fillPreset(r: Role) {
    setRole(r);
    setEmail(presets[r].email);
    setPass(presets[r].pass);
  }

  function doLogin() {
    setError(null);
    const res = loginMock(email, pass, role);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setUser(res.user);
    const from = (loc?.state?.from as string | undefined) ?? null;
    nav(from ?? roleHome(role), { replace: true });
  }

  return (
    <div className="container">
      <div className="card">
        <BrandHeader title="Вход" subtitle="Выберите роль и войдите в систему (сейчас — моковые аккаунты)." />

        <div className="content">
          <div className="panel" style={{ maxWidth: 680 }}>
            <div className="panelTitle">Роль</div>

            <div className="roleGrid">
              {ROLE_CARDS.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  className={`roleCard ${role === r.role ? "roleCardActive" : ""}`}
                  onClick={() => setRole(r.role)}
                >
                  <div className="roleTitle">{r.title}</div>
                  <div className="roleDesc">{r.desc}</div>
                </button>
              ))}
            </div>

            <div style={{ height: 14 }} />

            <div className="panelTitle">Данные для входа</div>

            <div className="formGrid">
              <label className="field">
                <span>Email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </label>

              <label className="field">
                <span>Пароль</span>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="1234" />
              </label>
            </div>

            <div className="hintBox" style={{ marginTop: 12 }}>
              <div className="hintTitle">Быстрый вход (тестовые данные)</div>
              <div className="hintActions">
                <button type="button" className="chip" onClick={() => fillPreset("student")}>
                  Ученик
                </button>
                <button type="button" className="chip" onClick={() => fillPreset("parent")}>
                  Родитель
                </button>
                <button type="button" className="chip" onClick={() => fillPreset("teacher")}>
                  Учитель
                </button>
                <button type="button" className="chip" onClick={() => fillPreset("admin")}>
                  Админ
                </button>
              </div>
              <div className="hintText">
                Пароль у всех: <b>{presets.student.pass}</b>
              </div>
            </div>

            {error && <div style={{ color: "crimson", marginTop: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button className="primaryBtn" type="button" onClick={doLogin}>
                Войти
              </button>

              <Link to="/register" className="linkBtn">
                Нет аккаунта? Зарегистрироваться
              </Link>
            </div>

            <div style={{ marginTop: 10 }}>
              <Link to="/" className="linkBtn">
                ← На главную
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Register() {
  const nav = useNavigate();

  const [role, setRole] = useState<Role>("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");

  function doRegister() {
    // мок-режим
    setUser({ email: email.trim(), role, name: name.trim() || "Пользователь" });
    nav(roleHome(role), { replace: true });
  }

  return (
    <div className="container">
      <div className="card">
        <BrandHeader
          title="Регистрация"
          subtitle="Создайте профиль и выберите роль для доступа к нужному кабинету."
        />

        <div className="content">
          <div className="panel" style={{ maxWidth: 680 }}>
            <div className="panelTitle">Роль</div>

            <div className="roleGrid">
              {ROLE_CARDS.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  className={`roleCard ${role === r.role ? "roleCardActive" : ""}`}
                  onClick={() => setRole(r.role)}
                >
                  <div className="roleTitle">{r.title}</div>
                  <div className="roleDesc">{r.desc}</div>
                </button>
              ))}
            </div>

            <div style={{ height: 14 }} />

            <div className="panelTitle">Данные</div>
            <div className="formGrid">
              <label className="field">
                <span>ФИО</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Иванова Анна Александровна"
                />
              </label>

              <label className="field">
                <span>Email</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
              </label>

              <label className="field">
                <span>Пароль</span>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Минимум 4 символа" />
              </label>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button className="primaryBtn" type="button" onClick={doRegister}>
                Создать аккаунт
              </button>

              <Link to="/login" className="linkBtn">
                Уже есть аккаунт? Войти
              </Link>
            </div>

            <div className="footerNote">
              Сейчас это мок-режим. Позже кнопка будет вызывать backend и сохранять профиль читателя.
            </div>

            <div style={{ marginTop: 10 }}>
              <Link to="/" className="linkBtn">
                ← На главную
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const u = getUser();

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={u ? <Navigate to={roleHome(u.role)} replace /> : <Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<Protected />}>
        <Route path="/student" element={<Student />} />
        <Route path="/parent" element={<Parent />} />
        <Route path="/teacher" element={<Teacher />} />
        <Route path="/admin" element={<Admin />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
