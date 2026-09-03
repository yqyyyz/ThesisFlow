from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import ProfileOut, ProfileUpdate

router = APIRouter(prefix="/api/profile", tags=["profile"])


def get_current_user(db: Session) -> User:
    user = db.query(User).first()
    if not user:
        user = User()
        db.add(user)
        db.commit()
        db.refresh(user)
    return user


@router.get("", response_model=ProfileOut)
def read_profile(db: Session = Depends(get_db)):
    return get_current_user(db)


@router.put("", response_model=ProfileOut)
def update_profile(payload: ProfileUpdate, db: Session = Depends(get_db)):
    user = get_current_user(db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
