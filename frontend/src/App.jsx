
import { useCallback, useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { deleteJob, getJobs } from "./services/jobService";
import { getCandidates } from "./services/candidateService";
import JobForm from "./components/JobForm";
import JobList from "./components/JobList";
import ResumeUpload from "./components/ResumeUpload";
import CandidateList from "./components/CandidateList";
import "./index.css";

export default function App() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("recruiter-desk-theme") || "light"
  );
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [candidates, setCandidates] = useState([]);
  const [highlightedCandidateId, setHighlightedCandidateId] = useState(null);
  const [showJobForm, setShowJobForm] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [jobError, setJobError] = useState("");
  const [candidateError, setCandidateError] = useState("");
  const [status, setStatus] = useState("");
  const [minScore, setMinScore] = useState(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("recruiter-desk-theme", theme);
  }, [theme]);

  const loadJobs = useCallback(async (preferredJobId = "") => {
    try {
      setJobError("");
      const data = await getJobs();
      setJobs(data);
      setSelectedJobId((current) => {
        if (data.some((job) => String(job.id) === String(preferredJobId))) {
          return String(preferredJobId);
        }
        if (data.some((job) => String(job.id) === String(current))) {
          return current;
        }
        return data.length ? String(data[0].id) : "";
      });
      return data;
    } catch (err) {
      setJobError(
        err.response?.data?.detail || "Unable to load jobs. Is the backend running?"
      );
      return null;
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  const loadCandidates = useCallback(async ({
    statusFilter = status,
    minimumScore = minScore,
  } = {}) => {
    if (!selectedJobId) {
      setCandidates([]);
      return;
    }

    try {
      setLoadingCandidates(true);
      setCandidateError("");

      const filters = { min_score: minimumScore };
      if (statusFilter) filters.status = statusFilter;

      const data = await getCandidates(selectedJobId, filters);
      setCandidates(data);
    } catch (err) {
      setCandidateError(
        err.response?.data?.detail || "Unable to load candidates."
      );
    } finally {
      setLoadingCandidates(false);
    }
  }, [selectedJobId, status, minScore]);

  useEffect(() => {
    if (highlightedCandidateId == null) return undefined;

    const timeoutId = window.setTimeout(() => {
      setHighlightedCandidateId(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedCandidateId]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadJobs();
    });
    return () => {
      cancelled = true;
    };
  }, [loadJobs]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void loadCandidates();
    });
    return () => {
      cancelled = true;
    };
  }, [loadCandidates]);

  async function handleJobCreated(job) {
    setShowJobForm(false);
    await loadJobs(job.id);
  }

  async function handleJobDeleted(job) {
    const confirmed = window.confirm(
      `Permanently delete "${job.title}" and all of its candidates and evaluations?`
    );
    if (!confirmed) return;

    try {
      setJobError("");
      const remainingJobs = await deleteJob(job.id).then(() => getJobs());
      setJobs(remainingJobs);

      if (String(selectedJobId) === String(job.id)) {
        const nextJobId = remainingJobs.length
          ? String(remainingJobs[0].id)
          : "";
        setSelectedJobId(nextJobId);
        setCandidates([]);
        setHighlightedCandidateId(null);
        setStatus("");
        setMinScore(0);
      }
    } catch (err) {
      setJobError(
        err.response?.data?.detail || "Unable to delete this job opening."
      );
    }
  }

  async function handleCandidateUploaded(candidate) {
    const mostRecentCandidate = candidate[candidate.length - 1];
    setHighlightedCandidateId(mostRecentCandidate.id);
    setStatus("");
    setMinScore(0);
    await loadCandidates({ statusFilter: "", minimumScore: 0 });
  }

  async function handleCandidateRescored(candidate) {
    const targetJobId = String(candidate.job_id);
    setStatus("");
    setMinScore(0);
    setSelectedJobId(targetJobId);
    setHighlightedCandidateId(candidate.id);
    setLoadingCandidates(true);
    setCandidateError("");
    try {
      const data = await getCandidates(targetJobId, { min_score: 0 });
      setCandidates(data);
    } catch (err) {
      setCandidateError(
        err.response?.data?.detail || "Unable to load the re-scored candidate."
      );
    } finally {
      setLoadingCandidates(false);
    }
  }

  const selectedJob = jobs.find(
    (job) => String(job.id) === String(selectedJobId)
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Recruiter Desk home">
          <span className="brand-mark">R</span>
          <span>Recruiter Desk</span>
        </a>
        <div className="topbar-tools">
          <span className="topbar-label">Hiring workspace</span>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
            <span>{theme === "light" ? "Dark theme" : "Light theme"}</span>
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome-section">
          <div>
            <span className="eyebrow">RECRUITER WORKSPACE</span>
            <h1>Candidate review</h1>
            <p>Keep every role and applicant organized, so your team can make thoughtful hiring decisions.</p>
          </div>
          <div className="overview-stat">
            <span>Job openings</span>
            <strong>{jobs.length}</strong>
          </div>
        </section>

        {jobError && <p className="error-message">{jobError}</p>}

        {showJobForm && (
          <JobForm
            onCreated={handleJobCreated}
            onCancel={() => setShowJobForm(false)}
          />
        )}

        {loadingJobs ? (
          <section className="panel"><p>Loading job openings...</p></section>
        ) : (
          <JobList
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelect={(id) => {
              setSelectedJobId(String(id));
              setStatus("");
              setMinScore(0);
            }}
            onCreate={() => setShowJobForm(true)}
            onDelete={handleJobDeleted}
          />
        )}

        {selectedJob && (
          <>
            <section className="selected-job-banner">
              <div>
                <span className="eyebrow">CURRENTLY SCREENING</span>
                <h2>{selectedJob.title}</h2>
                <p>{selectedJob.description}</p>
              </div>
              <span className="job-id">JOB-{selectedJob.id}</span>
            </section>

            <ResumeUpload
              key={selectedJobId}
              jobId={selectedJobId}
              onUploaded={handleCandidateUploaded}
            />

            <CandidateList
              candidates={candidates}
              jobs={jobs}
              highlightedCandidateId={highlightedCandidateId}
              loading={loadingCandidates}
              error={candidateError}
              status={status}
              setStatus={setStatus}
              minScore={minScore}
              setMinScore={setMinScore}
              onRefresh={loadCandidates}
              onRescored={handleCandidateRescored}
            />
          </>
        )}
      </main>

      <footer className="app-footer">
        Recruiter Desk · A practical workspace for thoughtful hiring
      </footer>
    </div>
  );
}
