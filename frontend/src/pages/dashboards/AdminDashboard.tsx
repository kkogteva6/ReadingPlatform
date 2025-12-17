import { clearUser, getUser } from "../../auth";
import { useNavigate } from "react-router-dom";

export default function Admin() {
  const nav = useNavigate();
  const u = getUser();

  return (
    <div className="container">
      <div className="card" style={{ padding: 28 }}>
        <h2 style={{ marginTop: 0 }}>Админ-панель</h2>
        <p style={{ color: "var(--muted)" }}>
          {u?.name} • {u?.email}
        </p>

        <ul style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          <li>Пользователи (моки)</li>
          <li>Каталог книг и теги (моки)</li>
        </ul>

        <button className="primaryBtn" onClick={() => { clearUser(); nav("/login", { replace: true }); }}>
          Выйти
        </button>
      </div>
    </div>
  );
}
