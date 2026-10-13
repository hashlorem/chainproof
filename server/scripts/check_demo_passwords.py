"""Exit code 1 if any account still uses the public demo password. demo.sh runs this before going online."""

import sys

from sqlalchemy import select

from app.core.security import verify_password
from app.db import SessionLocal, init_db
from app.models import User
from scripts.seed import DEMO_PASSWORD

if __name__ == "__main__":
    init_db()
    with SessionLocal() as db:
        weak = [u.email for u in db.scalars(select(User)) if verify_password(u.password_hash, DEMO_PASSWORD)]
    if weak:
        print("\n".join(weak))
        sys.exit(1)
