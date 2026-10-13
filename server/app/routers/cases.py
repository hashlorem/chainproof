from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.chain import append_entry, load_chain
from app.core.security import current_user, require_role
from app.core.signing import server_public_key_hex
from app.db import get_db
from app.models import Case, Evidence, User
from app.schemas import CaseIn, TransferIn
from app.serializers import case_out, evidence_out

router = APIRouter(prefix="/cases", tags=["cases"])


def get_case(db: Session, case_id: str) -> Case:
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(404, "Case not found")
    return case


@router.get("")
def list_cases(_: User = Depends(current_user), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(Evidence.case_id, func.count()).group_by(Evidence.case_id)).all())
    cases = db.scalars(select(Case).order_by(Case.created_at.desc()))
    return [case_out(c, counts.get(c.id, 0)) for c in cases]


@router.post("", status_code=201)
def create_case(body: CaseIn, user: User = Depends(require_role("investigator", "supervisor")), db: Session = Depends(get_db)):
    case = Case(title=body.title, description=body.description, created_by=user.id, custodian_id=user.id)
    db.add(case)
    db.flush()
    append_entry(db, case.id, "CASE_OPENED", user.id, details={"title": case.title})
    db.commit()
    return case_out(case, 0)


@router.get("/{case_id}")
def case_detail(case_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    case = get_case(db, case_id)
    evidence = db.scalars(select(Evidence).where(Evidence.case_id == case_id).order_by(Evidence.received_at)).all()
    return case_out(case, len(evidence)) | {"evidence": [evidence_out(e) for e in evidence]}


@router.get("/{case_id}/custody")
def custody(case_id: str, _: User = Depends(current_user), db: Session = Depends(get_db)):
    get_case(db, case_id)
    return {"server_public_key_hex": server_public_key_hex(), "entries": load_chain(db, case_id)}


@router.post("/{case_id}/transfer")
def transfer(case_id: str, body: TransferIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = get_case(db, case_id)
    if user.role != "supervisor" and case.custodian_id != user.id:
        raise HTTPException(403, "Only the current custodian or a supervisor can transfer custody")
    to = db.get(User, body.to_user_id)
    if to is None or to.role == "auditor":
        raise HTTPException(400, "Custody can only go to an investigator or supervisor")
    details = {"from_user_id": case.custodian_id, "to_user_id": to.id, "reason": body.reason}
    case.custodian_id = to.id
    append_entry(db, case.id, "TRANSFERRED", user.id, details=details)
    db.commit()
    return case_out(case)
