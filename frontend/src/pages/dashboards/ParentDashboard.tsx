import { clearUser, getUser } from "../../auth";
import { useNavigate } from "react-router-dom";

export default function Parent() {
  const nav = useNavigate();
  const u = getUser();

  return (
    <div className="container">
      <div className="card" style={{ padding: 28 }}>
        <h2 style={{ marginTop: 0 }}>Кабинет родителя</h2>
        <p style={{ color: "var(--muted)" }}>
          {u?.name} • {u?.email}
        </p>

        <ul style={{ color: "var(--muted)", lineHeight: 1.6 }}>
          <li>Отчёты и динамика (моки)</li>
          <li>Рекомендации поддержки чтения (моки)</li>
        </ul>

        <button className="primaryBtn" onClick={() => { clearUser(); nav("/login", { replace: true }); }}>
          Выйти
        </button>
      </div>
    </div>
  );
}
