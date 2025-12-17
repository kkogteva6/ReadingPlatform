import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "system-ui" }}>
      <h1>Платформа развивающего чтения</h1>
      <p>
        Каркас фронтенда: роли (ученик/родитель/учитель/админ), вход/регистрация, кабинеты.
        Данные сейчас моковые, дальше подключим backend.
      </p>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <Link to="/login">Вход</Link>
        <Link to="/register">Регистрация</Link>
      </div>

      <hr style={{ margin: "24px 0" }} />

      <p style={{ opacity: 0.8 }}>
        Тестовые аккаунты: student@test.ru / parent@test.ru / teacher@test.ru / admin@test.ru, пароль 1234
      </p>
    </div>
  );
}
