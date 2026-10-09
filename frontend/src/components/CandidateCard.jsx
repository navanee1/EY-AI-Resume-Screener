
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  deleteCandidate,
  rescoreCandidate as rescoreCandidateRequest,
  retryCandidateEvaluation,
  updateCandidateStatus,
} from "../services/candidateService";

export default function CandidateCard({
  candidate,
  isRecentlyUploaded,
  jobs,
  onStatusUpdated,
  onRescored,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [targetJobId, setTargetJobId] = useState("");
  const cardRef = useRef(null);

  // Your API returns evaluation fields directly on the candidate.
  const score = candidate.match_score;
  const matchedSkills = candidate.matched_skills || [];
  const missingSkills = candidate.missing_skills || [];
  const recommendation = candidate.recommendation || "pending";
  const evaluationStatus = candidate.evaluation_status || "pending";

  useEffect(() => {
    if (isRecentlyUploaded) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isRecentlyUploaded]);

  async function changeStatus(status) {
    try {
      setSaving(true);
      setError("");

      await updateCandidateStatus(candidate.id, status);
      await onStatusUpdated();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to update candidate status."
      );
    } finally {
      setSaving(false);
    }
  }

  async function retryEvaluation() {
    try {
      setSaving(true);
      setError("");
      await retryCandidateEvaluation(candidate.id);
      await onStatusUpdated();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to retry the evaluation."
      );
    } finally {
      setSaving(false);
    }
  }

  async function rescoreForAnotherJob() {
    if (!targetJobId) return;

    try {
      setSaving(true);
      setError("");
      const rescoredCandidate = await rescoreCandidateRequest(
        candidate.id,
        targetJobId
      );
      setTargetJobId("");
      // Show the new job's evaluation in the pipeline; the source record stays intact.
      await onRescored(rescoredCandidate);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to evaluate this resume for the selected job."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeCandidate() {
    const confirmed = window.confirm(
      `Permanently delete ${candidate.name}'s profile and evaluation?`
    );
    if (!confirmed) return;

    try {
      setSaving(true);
      setError("");
      await deleteCandidate(candidate.id);
      await onStatusUpdated();
    } catch (err) {
      setError(
        err.response?.data?.detail ||
          "Unable to delete this candidate."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <article
      ref={cardRef}
      className={`candidate-card ${
        isRecentlyUploaded ? "candidate-card-recently-uploaded" : ""
      }`}
    >
      <div className="candidate-header">
        <div className="candidate-avatar">
          {(candidate.name || "C").charAt(0).toUpperCase()}
        </div>

        <div className="candidate-identity">
          <h3>{candidate.name || "Unnamed candidate"}</h3>
          <p>{candidate.email || "Email not found"}</p>

          <span className={`status-badge status-${candidate.status}`}>
            {candidate.status}
          </span>
          {isRecentlyUploaded && (
            <span className="recent-upload-badge">Just uploaded</span>
          )}
        </div>

        <div className="score-block">
          <div
            className={`score-circle ${
              score == null ? "score-circle-pending" : ""
            }`}
            style={{
              "--score-percent": `${Math.max(0, Math.min(100, score ?? 0))}%`,
            }}
            role="progressbar"
            aria-label="Candidate match score"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={score == null ? undefined : score}
            aria-valuetext={score == null ? "Not evaluated" : `${score}% match`}
          >
            <strong>{score == null ? "—" : `${score}%`}</strong>
          </div>
          <span className="score-label">
            <Sparkles size={12} aria-hidden="true" />
            Match
          </span>
        </div>
      </div>

      <div className="recommendation-row">
        <span
          className={`recommendation recommendation-${recommendation}`}
        >
          {recommendation}
        </span>

        <span>
          {candidate.years_experience ?? 0} years experience
        </span>
      </div>

      {evaluationStatus !== "completed" && (
        <p className="field-hint">
          Evaluation status: {evaluationStatus}
        </p>
      )}

      <div className="skills-section">
        <h4>Matched skills</h4>

        <div className="skill-list">
          {matchedSkills.length > 0 ? (
            matchedSkills.map((skill) => (
              <span className="skill-tag skill-matched" key={skill}>
                ✓ {skill}
              </span>
            ))
          ) : (
            <span className="field-hint">None identified</span>
          )}
        </div>
      </div>

      <div className="skills-section">
        <h4>Missing skills</h4>

        <div className="skill-list">
          {missingSkills.length > 0 ? (
            missingSkills.map((skill) => (
              <span className="skill-tag skill-missing" key={skill}>
                {skill}
              </span>
            ))
          ) : (
            <span className="field-hint">None identified</span>
          )}
        </div>
      </div>

      <p className="candidate-summary">
        {candidate.summary || "Evaluation is pending or unavailable."}
      </p>

      {error && <p className="error-message">{error}</p>}

      <div className="candidate-actions">
        {jobs.some((job) => String(job.id) !== String(candidate.job_id)) && (
          <div className="rescore-action">
            <label className="field-hint" htmlFor={`rescore-job-${candidate.id}`}>
              Re-score for another job
            </label>
            <select
              id={`rescore-job-${candidate.id}`}
              value={targetJobId}
              onChange={(event) => setTargetJobId(event.target.value)}
              disabled={saving}
            >
              <option value="">Choose job opening</option>
              {jobs
                .filter((job) => String(job.id) !== String(candidate.job_id))
                .map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
            </select>
            <button
              className="button button-light"
              disabled={saving || !targetJobId}
              onClick={rescoreForAnotherJob}
            >
              <Sparkles size={14} aria-hidden="true" />
              {saving ? "Evaluating..." : "Evaluate for job"}
            </button>
          </div>
        )}

        {evaluationStatus === "failed" && (
          <button
            className="button button-light"
            disabled={saving}
            onClick={retryEvaluation}
          >
            <Sparkles size={14} aria-hidden="true" />
            {saving ? "Retrying..." : "Retry evaluation"}
          </button>
        )}

        <button
          className="button button-success"
          disabled={saving || candidate.status === "shortlisted"}
          onClick={() => changeStatus("shortlisted")}
        >
          {saving ? "Updating..." : "Shortlist"}
        </button>

        <button
          className="button button-danger"
          disabled={saving || candidate.status === "rejected"}
          onClick={() => changeStatus("rejected")}
        >
          {saving ? "Updating..." : "Reject"}
        </button>
        <button
          className="button button-delete"
          disabled={saving}
          onClick={removeCandidate}
        >
          {saving ? "Please wait..." : "Delete"}
        </button>
      </div>
    </article>
  );
}
