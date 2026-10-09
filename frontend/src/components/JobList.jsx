
export default function JobList({
  jobs,
  selectedJobId,
  onSelect,
  onCreate,
  onDelete,
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Job openings</h2>
          <p>Select a job to review its candidates.</p>
        </div>
        <button className="button button-primary" onClick={onCreate}>
          + Create job
        </button>
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state">
          <h3>No job openings yet</h3>
          <p>Create your first job to start screening resumes.</p>
          <button className="button button-primary" onClick={onCreate}>
            Create your first job
          </button>
        </div>
      ) : (
        <div className="job-grid">
          {jobs.map((job) => {
            const skills = Array.isArray(job.required_skills)
              ? job.required_skills
              : String(job.required_skills || "")
                  .split(",")
                  .map((skill) => skill.trim())
                  .filter(Boolean);

            return (
              <article
                key={job.id}
                className={`job-card ${
                  String(selectedJobId) === String(job.id)
                    ? "job-card-selected"
                    : ""
                }`}
              >
                <button
                  type="button"
                  className="job-card-select"
                  onClick={() => onSelect(job.id)}
                >
                  <div className="job-card-top">
                    <span className="job-icon">J</span>
                    <span className="job-id">JOB-{job.id}</span>
                  </div>

                  <h3>{job.title}</h3>
                  <p className="job-description">{job.description}</p>

                  <div className="skill-list">
                    {skills.map((skill) => (
                      <span className="skill-tag" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>

                  <div className="job-footer">
                    <span>{job.min_experience} years minimum</span>
                    <span>
                      {String(selectedJobId) === String(job.id)
                        ? "Selected ✓"
                        : "View candidates →"}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  className="button button-danger job-delete-button"
                  onClick={() => onDelete(job)}
                  aria-label={`Delete ${job.title} job`}
                >
                  Delete job
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
