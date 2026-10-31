import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta
from functools import lru_cache

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.models import User, utcnow

_hasher = PasswordHasher()
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


@lru_cache
def jwt_secret() -> str:
    """Uses CHAINPROOF_JWT_SECRET if set, otherwise a random secret created once and kept next to the server key."""
    if settings.jwt_secret:
        if len(settings.jwt_secret) < 32:
            raise RuntimeError("CHAINPROOF_JWT_SECRET must be at least 32 characters")
        return settings.jwt_secret
    path = settings.storage_dir / "jwt_secret"
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(secrets.token_urlsafe(48))
        path.chmod(0o600)
    return path.read_text().strip()


class LoginLimiter:
    """
    Locks an email (and separately an IP) after too many failed logins in the lockout window.
    In memory, so it resets on restart and is per process. Use Redis for several API instances.
    """

    def __init__(self):
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        window = settings.login_lockout_minutes * 60
        q = self._failures[key]
        while q and q[0] < now - window:
            q.popleft()
        return q

    def retry_after(self, *keys: str) -> int:
        """Seconds until login is allowed again, or 0."""
        now = time.monotonic()
        with self._lock:
            waits = [
                int(q[0] + settings.login_lockout_minutes * 60 - now) + 1
                for k in keys
                if len(q := self._recent(k, now)) >= self._limit(k)
            ]
        return max(waits, default=0)

    @staticmethod
    def _limit(key: str) -> int:
        # A whole class or office can share one IP, so the IP limit is looser than the per-account one.
        return settings.login_max_failures * (4 if key.startswith("ip:") else 1)

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()

    def failed(self, *keys: str) -> None:
        now = time.monotonic()
        with self._lock:
            for k in keys:
                self._recent(k, now).append(now)

    def succeeded(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


login_limiter = LoginLimiter()


class RateLimiter:
    """At most `limit` requests per key in any 60 seconds. In memory, like LoginLimiter."""

    def __init__(self):
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def hit(self, key: str, limit: int) -> int:
        """Counts a request. Returns 0 if allowed, else seconds until the next one is."""
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] < now - 60:
                q.popleft()
            if len(q) >= limit:
                return int(q[0] + 60 - now) + 1
            q.append(now)
            return 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


public_limiter = RateLimiter()


def client_ip(request: Request) -> str:
    """The visitor's address. Behind the demo tunnel, Cloudflare's header; otherwise the TCP peer."""
    if settings.trust_cf_connecting_ip and (cf := request.headers.get("cf-connecting-ip")):
        return cf.strip()
    return request.client.host if request.client else "?"


def create_token(user: User) -> str:
    now = utcnow()
    payload = {"sub": user.id, "role": user.role, "iat": now, "exp": now + timedelta(minutes=settings.jwt_ttl_minutes)}
    return jwt.encode(payload, jwt_secret(), algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    try:
        payload = jwt.decode(creds.credentials, jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, payload["sub"])
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")
    return user


def require_role(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role: {', '.join(roles)}")
        return user

    return dep
