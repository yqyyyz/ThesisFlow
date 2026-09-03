from pydantic import BaseModel


class ProfileOut(BaseModel):
    id: int
    email: str
    name: str
    identity: str
    discipline: str
    sub_discipline: str
    citation_style: str
    language_pref: str


class ProfileUpdate(BaseModel):
    name: str | None = None
    identity: str | None = None
    discipline: str | None = None
    sub_discipline: str | None = None
    citation_style: str | None = None
    language_pref: str | None = None
