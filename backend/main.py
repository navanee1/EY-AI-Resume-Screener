
import json
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import (
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

import models
from database import Base, engine, get_db
from services.resume_parser import extract_resume_text, extract_years_experience
from services.ai_evaluator import evaluate_resume, extract_email


logger = logging.getLogger(__name__)


def _evaluation_error_message(exc: Exception) -> str:
    message = str(exc).strip() or type(exc).__name__
    api_key = os.getenv("GEMINI_API_KEY")
    if api_key:
        message = message.replace(api_key, "[redacted]")
    return message[:300]


async def _evaluate_candidate(
    candidate_id: int,
    db: Session,
) -> dict:
    candidate = (
        db.query(models.Candidate)
        .filter(models.Candidate.id == candidate_id)
        .first()
    )
    evaluation = candidate.evaluation

    # Keep the CPU-bound scorer off the async request loop and persist either
    # its result or a visible failure state for the recruiter.
    try:
        required_skills = [
            skill.strip()
            for skill in candidate.job.required_skills.split(",")
            if skill.strip()
        ]
        result = await run_in_threadpool(
            evaluate_resume,
            resume_text=candidate.resume_text,
            job_description=candidate.job.description,
            required_skills=required_skills,
            min_experience=candidate.job.min_experience,
        )

        evaluation.match_score = result["match_score"]
        evaluation.matched_skills = json.dumps(result["matched_skills"])
        evaluation.missing_skills = json.dumps(result["missing_skills"])
        evaluation.summary = result["summary"]
        evaluation.recommendation = result["recommendation"]
        evaluation.evaluation_status = "completed"
        db.commit()
        db.refresh(candidate)
    except Exception as exc:
        db.rollback()
        error_message = _evaluation_error_message(exc)
        logger.warning(
            "Resume evaluation failed for candidate %s: %s: %s",
            candidate_id,
            type(exc).__name__,
            error_message,
        )
        candidate = (
            db.query(models.Candidate)
            .filter(models.Candidate.id == candidate_id)
            .first()
        )
        evaluation = candidate.evaluation
        evaluation.evaluation_status = "failed"
        evaluation.summary = (
            f"Local mock evaluation failed: {error_message}. "
            "The resume was saved. Check the backend configuration and retry."
        )
        db.commit()
        db.refresh(candidate)

    return serialize_candidate(candidate)


# Initialize database tables when the application starts.
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="Recruiter Desk API",
    description="Job and candidate review API with local mock evaluations",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Request schemas
class JobCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=10)
    required_skills: list[str] = Field(min_length=1)
    min_experience: float = Field(default=0, ge=0, le=60)


class CandidateStatusUpdate(BaseModel):
    status: str


class CandidateRescoreRequest(BaseModel):
    target_job_id: int = Field(gt=0)


# Response serialization
def serialize_job(job: models.Job) -> dict:
    return {
        "id": job.id,
        "title": job.title,
        "description": job.description,
        "required_skills": [
            skill
            for skill in job.required_skills.split(",")
            if skill
        ],
        "min_experience": job.min_experience,
    }


def serialize_candidate(candidate: models.Candidate) -> dict:
    evaluation = candidate.evaluation

    return {
        "id": candidate.id,
        "job_id": candidate.job_id,
        "name": candidate.name,
        "email": candidate.email,
        "years_experience": candidate.years_experience,
        "status": candidate.status,
        "match_score": (
            evaluation.match_score if evaluation else None
        ),
        "matched_skills": (
            json.loads(evaluation.matched_skills)
            if evaluation and evaluation.matched_skills
            else []
        ),
        "missing_skills": (
            json.loads(evaluation.missing_skills)
            if evaluation and evaluation.missing_skills
            else []
        ),
        "summary": (
            evaluation.summary if evaluation else None
        ),
        "recommendation": (
            evaluation.recommendation if evaluation else None
        ),
        "evaluation_status": (
            evaluation.evaluation_status
            if evaluation
            else "pending"
        ),
    }


# Health check
@app.get("/health")
def health_check():
    return {"status": "ok"}


# Create a job
@app.post(
    "/jobs",
    status_code=status.HTTP_201_CREATED,
)
def create_job(
    payload: JobCreate,
    db: Session = Depends(get_db),
):
    title = payload.title.strip()

    skills = list(dict.fromkeys(
        skill.strip()
        for skill in payload.required_skills
        if skill.strip()
    ))

    description = payload.description.strip()

    if not title or not skills or not description:
        raise HTTPException(
            status_code=400,
            detail="Job title, description and required skills are needed.",
        )

    job = models.Job(
        title=title,
        description=description,
        required_skills=",".join(skills),
        min_experience=payload.min_experience,
    )

    db.add(job)
    db.commit()
    db.refresh(job)

    return serialize_job(job)


# List jobs
@app.get("/jobs")
def list_jobs(db: Session = Depends(get_db)):
    jobs = (
        db.query(models.Job)
        .order_by(models.Job.id.desc())
        .all()
    )

    return [serialize_job(job) for job in jobs]


@app.delete("/jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
):
    job = (
        db.query(models.Job)
        .filter(models.Job.id == job_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    db.delete(job)
    db.commit()


# Upload, extract and evaluate a resume
@app.post(
    "/jobs/{job_id}/candidates",
    status_code=status.HTTP_201_CREATED,
)
async def upload_candidate(
    job_id: int,
    file: UploadFile = File(...),
    candidate_name: str | None = Form(default=None),
    db: Session = Depends(get_db),
):
    job = (
        db.query(models.Job)
        .filter(models.Job.id == job_id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    return await _save_and_evaluate_resume(
        job=job,
        file=file,
        candidate_name=candidate_name,
        db=db,
    )


async def _save_and_evaluate_resume(
    job: models.Job,
    file: UploadFile | None,
    db: Session,
    candidate_name: str | None = None,
    source_candidate: models.Candidate | None = None,
) -> dict:
    """Create a job-specific candidate record, then save its evaluation."""
    if source_candidate:
        resume_text = source_candidate.resume_text
    elif file:
        resume_text = await extract_resume_text(file)
    else:
        raise RuntimeError("A resume file is required for a new candidate.")

    if source_candidate:
        name = source_candidate.name
        email = source_candidate.email
        years_experience = source_candidate.years_experience
    else:
        filename = Path(file.filename or "candidate.txt").stem
        name = (candidate_name or "").strip()
        if len(name) > 200:
            raise HTTPException(
                status_code=400,
                detail="Candidate name must not exceed 200 characters.",
            )
        name = name or filename.replace("_", " ").replace("-", " ").strip()
        name = name or "Unknown candidate"
        email = extract_email(resume_text)
        years_experience = extract_years_experience(resume_text)

    candidate = models.Candidate(
        job_id=job.id,
        name=name,
        email=email,
        resume_text=resume_text,
        years_experience=years_experience,
        status="new",
    )

    # Each job gets its own candidate/evaluation row so re-scoring never
    # overwrites the source job's score or hiring status.
    db.add(candidate)
    db.flush()
    db.add(
        models.Evaluation(
            candidate_id=candidate.id,
            evaluation_status="pending",
        )
    )
    db.commit()
    db.refresh(candidate)
    return await _evaluate_candidate(candidate.id, db)


@app.post("/candidates/{candidate_id}/evaluate")
async def retry_candidate_evaluation(
    candidate_id: int,
    db: Session = Depends(get_db),
):
    candidate = (
        db.query(models.Candidate)
        .filter(models.Candidate.id == candidate_id)
        .first()
    )
    if not candidate:
        raise HTTPException(
            status_code=404,
            detail="Candidate not found.",
        )

    if candidate.evaluation.evaluation_status == "completed":
        return serialize_candidate(candidate)

    candidate.evaluation.evaluation_status = "pending"
    db.commit()
    return await _evaluate_candidate(candidate_id, db)


@app.post("/candidates/{candidate_id}/rescore")
async def rescore_candidate_for_job(
    candidate_id: int,
    payload: CandidateRescoreRequest,
    db: Session = Depends(get_db),
):
    """Evaluate a saved resume for another job while preserving its original."""
    source_candidate = (
        db.query(models.Candidate)
        .filter(models.Candidate.id == candidate_id)
        .first()
    )
    if not source_candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    target_job = (
        db.query(models.Job)
        .filter(models.Job.id == payload.target_job_id)
        .first()
    )
    if not target_job:
        raise HTTPException(status_code=404, detail="Target job not found.")
    if target_job.id == source_candidate.job_id:
        raise HTTPException(
            status_code=400,
            detail="Choose a different job to rescore this candidate.",
        )

    return await _save_and_evaluate_resume(
        job=target_job,
        file=None,
        db=db,
        source_candidate=source_candidate,
    )


# Retrieve candidates, ranked by match score
@app.get("/jobs/{job_id}/candidates")
def list_candidates(
    job_id: int,
    status_filter: str | None = Query(
        default=None,
        alias="status",
    ),
    min_score: int | None = Query(
        default=None,
        ge=0,
        le=100,
    ),
    db: Session = Depends(get_db),
):
    job = (
        db.query(models.Job)
        .filter(models.Job.id == job_id)
        .first()
    )

    if not job:
        raise HTTPException(
            status_code=404,
            detail="Job not found.",
        )

    allowed_statuses = {"new", "shortlisted", "rejected"}

    if status_filter and status_filter not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Status must be new, shortlisted, or rejected.",
        )

    query = (
        db.query(models.Candidate)
        .outerjoin(models.Candidate.evaluation)
        .filter(models.Candidate.job_id == job_id)
    )

    if status_filter:
        query = query.filter(
            models.Candidate.status == status_filter
        )

    if min_score is not None and min_score > 0:
        query = query.filter(
            models.Evaluation.match_score >= min_score
        )

    candidates = query.order_by(
        models.Evaluation.match_score.desc(),
        models.Candidate.id.asc(),
    ).all()

    return [
        serialize_candidate(candidate)
        for candidate in candidates
    ]


@app.delete(
    "/candidates/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
):
    candidate = (
        db.query(models.Candidate)
        .filter(models.Candidate.id == candidate_id)
        .first()
    )
    if not candidate:
        raise HTTPException(
            status_code=404,
            detail="Candidate not found.",
        )

    db.delete(candidate)
    db.commit()


# Shortlist or reject a candidate
@app.patch("/candidates/{candidate_id}")
def update_candidate_status(
    candidate_id: int,
    payload: CandidateStatusUpdate,
    db: Session = Depends(get_db),
):
    allowed_statuses = {"new", "shortlisted", "rejected"}

    if payload.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Status must be new, shortlisted, or rejected.",
        )

    candidate = (
        db.query(models.Candidate)
        .filter(models.Candidate.id == candidate_id)
        .first()
    )

    if not candidate:
        raise HTTPException(
            status_code=404,
            detail="Candidate not found.",
        )

    candidate.status = payload.status
    db.commit()
    db.refresh(candidate)

    return serialize_candidate(candidate)
