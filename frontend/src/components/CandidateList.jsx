
import CandidateCard from "./CandidateCard";

export default function CandidateList({
  candidates,
  jobs,
  highlightedCandidateId,
  loading,
  error,
  status,
  setStatus,
  minScore,
  setMinScore,
  onRefresh,
  onRescored,
}) {
  return (
    <section className="panel candidate-section">
      <div className="panel-heading">
        <div>
          <h2>Candidate pipeline</h2>
          <p>Ranked by match score, highest first.</p>
        </div>
        <button className="button button-light" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      <div className="filters">
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="new">New</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <label>
          Minimum score: {minScore}%
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
          />
        </label>
      </div>

      {loading && <p className="loading-message">Loading candidates...</p>}
      {error && <p className="error-message">{error}</p>}

      {!loading && !error && candidates.length === 0 && (
        <div className="empty-state">
          <h3>No candidates found</h3>
          <p>Upload a resume or adjust your filters.</p>
        </div>
      )}

      <div className="candidate-grid">
        {candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            jobs={jobs}
            isRecentlyUploaded={candidate.id === highlightedCandidateId}
            onStatusUpdated={onRefresh}
            onRescored={onRescored}
          />
        ))}
      </div>
    </section>
  );
}
