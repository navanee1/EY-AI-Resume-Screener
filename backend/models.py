
from sqlalchemy import Column, Integer, String, Text, Float, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    required_skills = Column(Text, nullable=False)
    min_experience = Column(Float, default=0)

    candidates = relationship(
        "Candidate",
        back_populates="job",
        cascade="all, delete-orphan",
    )


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    name = Column(String(200), nullable=False)
    email = Column(String(255), nullable=True)
    resume_text = Column(Text, nullable=False)
    years_experience = Column(Float, default=0)
    status = Column(String(30), default="new", nullable=False)

    job = relationship("Job", back_populates="candidates")

    evaluation = relationship(
        "Evaluation",
        back_populates="candidate",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Evaluation(Base):
    __tablename__ = "evaluations"

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(
        Integer,
        ForeignKey("candidates.id"),
        unique=True,
        nullable=False,
    )
    match_score = Column(Integer, nullable=True)
    matched_skills = Column(Text, nullable=True)
    missing_skills = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    recommendation = Column(String(20), nullable=True)
    evaluation_status = Column(String(30), default="pending", nullable=False)

    candidate = relationship("Candidate", back_populates="evaluation")
