import hashlib

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.anchor import anchor_if_intact
from app.core.chain import append_entry, load_chain
from app.core.security import current_user
from app.db import get_db
from app.models import Evidence, Report, User, fmt_ts, utcnow
from app.reports.pdf import build_report
from app.routers.cases import get_case
from app.routers.verify import verify_case

router = APIRouter(tags=["reports"])


@router.post("/cases/{case_id}/report")
def export_report(case_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    case = get_case(db, case_id)
    evidence = db.scalars(select(Evidence).where(Evidence.case_id == case_id).order_by(Evidence.received_at)).all()
    users = {u.id: u for u in db.scalars(select(User))}
    anchor_if_intact(db, case_id, user.id)  # before the PDF, so the report prints the anchor that covers it
    pdf = build_report(case, evidence, load_chain(db, case_id), verify_case(db, case_id), users, user, fmt_ts(utcnow()))
    sha = hashlib.sha256(pdf).hexdigest()
    db.add(Report(case_id=case_id, sha256=sha, created_by=user.id))
    append_entry(db, case_id, "EXPORTED", user.id, details={"report_sha256": sha})
    db.commit()
    filename = f"chainproof-{case.id[:8]}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "X-Content-SHA256": sha})
