from fastapi import Header, HTTPException
from .settings import settings

def require_admin(x_user_email: str | None = Header(default=None)):
    if not x_user_email:
        raise HTTPException(status_code=401, detail="Missing X-User-Email")

    email = x_user_email.strip().lower()
    allowed = {e.strip().lower() for e in (settings.admin_emails or [])}

    if email not in allowed:
        raise HTTPException(status_code=403, detail="Admin access denied")

    return email
