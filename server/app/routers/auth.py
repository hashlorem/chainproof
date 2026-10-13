from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_token, current_user, hash_password, login_limiter, require_role, verify_password
from app.db import get_db
from app.models import User
from app.schemas import LoginIn, PasswordChangeIn, PasswordResetIn, UserCreate
from app.serializers import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    keys = (f"email:{email}", f"ip:{request.client.host if request.client else '?'}")
    if wait := login_limiter.retry_after(*keys):
        raise HTTPException(429, f"Too many failed attempts. Try again in {wait // 60 + 1} min.", headers={"Retry-After": str(wait)})
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(user.password_hash, body.password):
        login_limiter.failed(*keys)
        raise HTTPException(401, "Wrong email or password")
    login_limiter.succeeded(keys[0])
    return {"token": create_token(user), "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.get("/users")
def list_users(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.name))]


@router.post("/users", status_code=201)
def create_user(body: UserCreate, _: User = Depends(require_role("supervisor")), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email already registered")
    user = User(email=body.email.lower(), name=body.name, role=body.role, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    return user_out(user)


@router.post("/password")
def change_password(body: PasswordChangeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(user.password_hash, body.current_password):
        raise HTTPException(400, "Current password is wrong")
    if body.new_password == body.current_password:
        raise HTTPException(400, "Choose a different password")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/password")
def reset_password(
    user_id: str, body: PasswordResetIn, _: User = Depends(require_role("supervisor")), db: Session = Depends(get_db)
):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found")
    target.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}
