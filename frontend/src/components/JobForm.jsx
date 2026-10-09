
import { useState } from "react";
import { createJob } from "../services/jobService";

export default function JobForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    required_skills: "",
    min_experience: "0",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function handleChange(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const skills = form.required_skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);

    if (!skills.length) {
      setError("Enter at least one required skill.");
      return;
    }

    if (form.description.trim().length < 10) {
      setError("Description must contain at least 10 characters.");
      return;
    }

    try {
      setSaving(true);

      const createdJob = await createJob({
        title: form.title.trim(),
        description: form.description.trim(),
        required_skills: skills,
        min_experience: Number(form.min_experience),
      });

      await onCreated(createdJob);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        Array.isArray(detail)
          ? detail.map((item) => item.msg).join(", ")
          : typeof detail === "string"
            ? detail
            : "Unable to create job."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel form-grid" onSubmit={handleSubmit}>
      <div className="panel-heading">
        <div>
          <h2>Create job opening</h2>
          <p>Define the role and skills required for screening.</p>
        </div>
        <button type="button" className="button button-light" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <label>
        Job title
        <input
          name="title"
          value={form.title}
          onChange={handleChange}
          placeholder="e.g. Frontend Engineer"
          required
          maxLength={200}
        />
      </label>

      <label>
        Job description
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          placeholder="Describe the role and responsibilities..."
          minLength={10}
          rows={4}
          required
        />
      </label>

      <label>
        Required skills
        <input
          name="required_skills"
          value={form.required_skills}
          onChange={handleChange}
          placeholder="React, JavaScript, REST APIs"
          required
        />
        <span className="field-hint">Separate each skill with a comma.</span>
      </label>

      <label>
        Minimum experience (years)
        <input
          type="number"
          name="min_experience"
          value={form.min_experience}
          onChange={handleChange}
          min="0"
          max="60"
          step="0.5"
          required
        />
      </label>

      {error && <p className="error-message">{error}</p>}

      <div className="form-actions">
        <button className="button button-primary" disabled={saving}>
          {saving ? "Creating job..." : "Create job"}
        </button>
      </div>
    </form>
  );
}
