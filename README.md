# AI Resume Screener

A small recruiter workspace for managing job openings, uploading PDF/TXT
resumes, reviewing ranked candidate evaluations, and updating candidate
statuses.

Resume files can be selected in batches of up to 20. The app uploads them one
at a time and displays an outcome for each file. A candidate can also be
evaluated for another job opening; this creates a separate candidate and
evaluation record for that job, leaving the original evaluation unchanged.

## Local evaluator

Resume scoring uses a deterministic local mock evaluator. It matches required
skills, compares resume words with the job description, and considers stated
years of experience. It does not call Gemini or any other external LLM, and no
API key is required. The evaluation is only a demo aid; recruiters make all
candidate decisions.

## Run locally

1. Install backend dependencies and run the API:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8010
   ```

2. In another terminal, install frontend dependencies and start Vite:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

   Set `VITE_API_URL` if the backend is not running at
   `http://127.0.0.1:8010`.

The backend stores persistent data in `backend/resume_screener.db`. Completed
evaluations are saved and not recomputed when candidate lists are loaded.
Failed evaluations remain visible and can be retried from the candidate card.
Recruiters can permanently delete an individual candidate or delete a job
opening; deleting a job also removes its candidates and evaluations. The UI
asks for confirmation before either destructive action.

## Run with Docker

Install Docker Desktop, then run from the repository root:

```powershell
docker compose up --build
```

Open `http://localhost:8080`. The SQLite database persists in the
`resume_data` Docker volume. The containers run the same local mock scorer as
the non-Docker setup; they do not call Gemini, save LLM prompts/responses, or
stream model-generated tokens. The upload UI displays per-file processing
progress instead.

Stop the containers with `Ctrl+C`, or run `docker compose down`. The named
database volume is retained by `docker compose down`.

## Run backend endpoint tests

```powershell
cd backend
pip install -r requirements-dev.txt
python -m unittest discover -s tests
```

The endpoint tests use an isolated in-memory SQLite database and mock the
scorer; they do not need Gemini or the persistent application database.

## Checks

```powershell
cd frontend
npm run lint
npm run build
```

The API is documented at `http://127.0.0.1:8010/docs` while the backend runs.
