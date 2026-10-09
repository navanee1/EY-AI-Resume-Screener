import asyncio
import unittest
from unittest.mock import patch

from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import main
import models
from database import Base


MOCK_EVALUATION = {
    "match_score": 82,
    "matched_skills": ["Python"],
    "missing_skills": ["SQL"],
    "summary": "Good Python experience; SQL was not identified.",
    "recommendation": "strong",
}


class CandidateScoringEndpointTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine,
            autocommit=False,
            autoflush=False,
        )

        def override_get_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        main.app.dependency_overrides[main.get_db] = override_get_db

    def post(self, url, **kwargs):
        async def send_request():
            async with AsyncClient(
                transport=ASGITransport(app=main.app),
                base_url="http://test",
            ) as client:
                return await client.post(url, **kwargs)

        return asyncio.run(send_request())

    def tearDown(self):
        main.app.dependency_overrides.clear()
        self.engine.dispose()

    def create_job(self, title, skills="Python,SQL"):
        with self.session_factory() as db:
            job = models.Job(
                title=title,
                description=f"{title} role requiring Python and SQL.",
                required_skills=skills,
                min_experience=2,
            )
            db.add(job)
            db.commit()
            db.refresh(job)
            return job.id

    def test_resume_upload_uses_mock_evaluator_and_returns_saved_score(self):
        job_id = self.create_job("Backend Engineer")

        with patch.object(
            main,
            "evaluate_resume",
            return_value=MOCK_EVALUATION,
        ) as evaluator:
            response = self.post(
                f"/jobs/{job_id}/candidates",
                files={
                    "file": (
                        "navaneetha.txt",
                        b"Python developer with 3 years of experience.",
                        "text/plain",
                    )
                },
                data={"candidate_name": "Navaneetha"},
            )

        self.assertEqual(response.status_code, 201)
        candidate = response.json()
        self.assertEqual(candidate["name"], "Navaneetha")
        self.assertEqual(candidate["match_score"], 82)
        self.assertEqual(candidate["matched_skills"], ["Python"])
        self.assertEqual(candidate["evaluation_status"], "completed")
        evaluator.assert_called_once_with(
            resume_text="Python developer with 3 years of experience.",
            job_description="Backend Engineer role requiring Python and SQL.",
            required_skills=["Python", "SQL"],
            min_experience=2.0,
        )

    def test_rescore_creates_job_specific_candidate_without_changing_original(self):
        original_job_id = self.create_job("Backend Engineer", "Python")
        target_job_id = self.create_job("Data Analyst", "SQL,Excel")
        with self.session_factory() as db:
            candidate = models.Candidate(
                job_id=original_job_id,
                name="Navaneetha",
                email="candidate@example.com",
                resume_text="Python and SQL developer.",
                years_experience=3,
                status="shortlisted",
            )
            db.add(candidate)
            db.flush()
            db.add(
                models.Evaluation(
                    candidate_id=candidate.id,
                    match_score=61,
                    matched_skills='["Python"]',
                    missing_skills="[]",
                    summary="Original evaluation.",
                    recommendation="maybe",
                    evaluation_status="completed",
                )
            )
            db.commit()
            original_candidate_id = candidate.id

        with patch.object(
            main,
            "evaluate_resume",
            return_value=MOCK_EVALUATION,
        ) as evaluator:
            response = self.post(
                f"/candidates/{original_candidate_id}/rescore",
                json={"target_job_id": target_job_id},
            )

        self.assertEqual(response.status_code, 200)
        rescored = response.json()
        self.assertNotEqual(rescored["id"], original_candidate_id)
        self.assertEqual(rescored["job_id"], target_job_id)
        self.assertEqual(rescored["status"], "new")
        self.assertEqual(rescored["match_score"], 82)
        evaluator.assert_called_once_with(
            resume_text="Python and SQL developer.",
            job_description="Data Analyst role requiring Python and SQL.",
            required_skills=["SQL", "Excel"],
            min_experience=2.0,
        )

        with self.session_factory() as db:
            original = db.get(models.Candidate, original_candidate_id)
            self.assertEqual(original.job_id, original_job_id)
            self.assertEqual(original.status, "shortlisted")
            self.assertEqual(original.evaluation.match_score, 61)


if __name__ == "__main__":
    unittest.main()
