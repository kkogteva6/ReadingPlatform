from fastapi import APIRouter, HTTPException
from ..schemas import ReaderProfile
from ..services.profiles import get_profile, upsert_profile

router = APIRouter()

@router.post("/profile", response_model=ReaderProfile)
def post_profile(profile: ReaderProfile):
    return upsert_profile(profile)

@router.get("/profile/{profile_id}", response_model=ReaderProfile)
def get_profile_api(profile_id: str):
    try:
        return get_profile(profile_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="profile not found")
