export type Role = "student" | "parent" | "teacher" | "admin";

export type AuthUser = {
  email: string;
  role: Role;
  name?: string;
};

const KEY = "rp_auth_user_v1";

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function setUser(user: AuthUser) {
  localStorage.setItem(KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(KEY);
}

export const MOCK_ACCOUNTS: Record<Role, { email: string; pass: string; name: string }> = {
  student: { email: "student@test.ru", pass: "1234", name: "Ученик" },
  parent: { email: "parent@test.ru", pass: "1234", name: "Родитель" },
  teacher: { email: "teacher@test.ru", pass: "1234", name: "Учитель" },
  admin: { email: "admin@test.ru", pass: "1234", name: "Администратор" },
};

export function loginMock(email: string, pass: string, role: Role): { ok: true; user: AuthUser } | { ok: false; error: string } {
  const acc = MOCK_ACCOUNTS[role];
  if (email.trim().toLowerCase() !== acc.email.toLowerCase() || pass !== acc.pass) {
    return { ok: false, error: "Неверный email/пароль или роль." };
  }
  return { ok: true, user: { email: acc.email, role, name: acc.name } };
}

export function roleHome(role: Role) {
  if (role === "student") return "/student";
  if (role === "parent") return "/parent";
  if (role === "teacher") return "/teacher";
  return "/admin";
}
