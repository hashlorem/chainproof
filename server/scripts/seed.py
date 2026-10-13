"""Creates demo accounts. Run: uv run python -m scripts.seed"""

from sqlalchemy import select

from app.config import settings
from app.core.security import hash_password
from app.db import SessionLocal, init_db
from app.models import User

DEMO_PASSWORD = "chainproof123"
USERS = [
    ("supervisor@chainproof.dev", "Sam Supervisor", "supervisor"),
    ("investigator@chainproof.dev", "Ivy Investigator", "investigator"),
    ("auditor@chainproof.dev", "Alex Auditor", "auditor"),
]

if __name__ == "__main__":
    settings.storage_dir.mkdir(parents=True, exist_ok=True)
    init_db()
    with SessionLocal() as db:
        for email, name, role in USERS:
            if not db.scalar(select(User).where(User.email == email)):
                db.add(User(email=email, name=name, role=role, password_hash=hash_password(DEMO_PASSWORD)))
                print(f"created {role}: {email} / {DEMO_PASSWORD}")
        db.commit()
