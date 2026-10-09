import { useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { uploadResume } from "../services/candidateService";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES_PER_BATCH = 20;
const ALLOWED_EXTENSIONS = ["pdf", "txt"];

function validateFile(file) {
  const extension = file.name.split(".").pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return "Unsupported file type. Select a PDF or TXT resume.";
  }
  if (file.size === 0) return "The selected file is empty.";
  if (file.size > MAX_FILE_SIZE) return "The file exceeds the 5 MB limit.";
  return "";
}

export default function ResumeUpload({ jobId, onUploaded }) {
  const [candidateName, setCandidateName] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const uploadInProgress = useRef(false);
  const fileInputRef = useRef(null);
  const validFiles = files.filter((item) => !item.error);

  function handleFileChange(event) {
    const selectedFiles = Array.from(event.target.files || []);
    const nextFiles = selectedFiles.map((file, index) => ({
      file,
      error:
        index >= MAX_FILES_PER_BATCH
          ? `Only the first ${MAX_FILES_PER_BATCH} files can be uploaded at once.`
          : validateFile(file),
      status: "queued",
      message: "",
    }));

    setFiles(nextFiles);
    setError("");
    setSuccess("");
    setProgress(null);
    if (nextFiles.length > 1) setCandidateName("");
  }

  function handleRemoveFile(fileToRemove) {
    const remainingFiles = files.filter((item) => item.file !== fileToRemove);
    setFiles(remainingFiles);
    setError("");
    setSuccess("");
    if (remainingFiles.length === 0 && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (remainingFiles.length <= 1) setCandidateName("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (uploadInProgress.current || !jobId || validFiles.length === 0) return;

    uploadInProgress.current = true;
    setUploading(true);
    setError("");
    setSuccess("");
    setProgress({ completed: 0, total: validFiles.length, current: "" });

    let results = [...files];
    const uploadedCandidates = [];

    // Process files sequentially so each result can be shown and one bad file
    // does not prevent the remaining resumes from being reviewed.
    for (const item of validFiles) {
      const fileName = item.file.name;
      setProgress((current) => ({ ...current, current: fileName }));
      results = results.map((result) =>
        result.file === item.file
          ? { ...result, status: "uploading", message: "Extracting and evaluating…" }
          : result
      );
      setFiles(results);

      try {
        const candidate = await uploadResume(
          jobId,
          item.file,
          validFiles.length === 1 ? candidateName.trim() : ""
        );
        uploadedCandidates.push(candidate);
        results = results.map((result) =>
          result.file === item.file
            ? {
                ...result,
                status:
                  candidate.evaluation_status === "failed"
                    ? "evaluation-failed"
                    : "completed",
                message:
                  candidate.evaluation_status === "failed"
                    ? "Resume saved, but evaluation failed."
                    : "Resume evaluated.",
                candidate,
              }
            : result
        );
      } catch (err) {
        const detail = err.response?.data?.detail;
        const message =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((entry) => entry.msg).join(", ")
              : err.response
                ? `Upload failed (${err.response.status}).`
                : "Cannot reach the backend. Check that FastAPI is running.";
        results = results.map((result) =>
          result.file === item.file
            ? { ...result, status: "failed", message }
            : result
        );
      }

      setFiles(results);
      setProgress((current) => ({
        ...current,
        completed: current.completed + 1,
      }));
    }

    if (uploadedCandidates.length > 0) {
      setCandidateName("");
      try {
        await onUploaded(uploadedCandidates);
      } catch (err) {
        setError(
          err instanceof Error
            ? `Resumes were saved, but the candidate list could not be refreshed: ${err.message}`
            : "Resumes were saved, but the candidate list could not be refreshed."
        );
      }
    }

    const successful = results.filter(
      (item) => item.status === "completed" || item.status === "evaluation-failed"
    ).length;
    const failed = results.length - successful;
    setSuccess(
      `${successful} resume${successful === 1 ? "" : "s"} saved; ` +
        `${failed} failed.`
    );
    setProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    uploadInProgress.current = false;
    setUploading(false);
  }

  return (
    <form className="upload-panel" onSubmit={handleSubmit}>
      <div className="upload-icon">
        <Sparkles size={22} aria-hidden="true" />
      </div>

      <h3>Upload candidate resumes</h3>
      <p>
        Select up to {MAX_FILES_PER_BATCH} PDF or TXT files, up to 5 MB each.
        Resumes are processed one at a time using the local mock scorer.
      </p>

      <label className="candidate-name-field">
        Candidate name <span className="field-hint">(optional, for one file)</span>
        <input
          type="text"
          value={candidateName}
          onChange={(event) => setCandidateName(event.target.value)}
          maxLength={200}
          disabled={uploading || !jobId || files.length > 1}
          placeholder="Uses the file name if blank"
        />
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt"
        multiple
        onChange={handleFileChange}
        disabled={uploading || !jobId}
        aria-label="Choose one or more candidate resumes"
      />

      {files.length > 0 && (
        <ul className="upload-results" aria-label="Selected resume upload results">
          {files.map((item, index) => (
            <li
              className={`upload-result upload-result-${item.error ? "failed" : item.status}`}
              key={`${item.file.name}-${index}`}
            >
              <span className="upload-result-name">{item.file.name}</span>
              <span>{item.error || item.message || "Ready to upload"}</span>
              {!uploading && (
                <button
                  type="button"
                  className="upload-remove"
                  onClick={() => handleRemoveFile(item.file)}
                  aria-label={`Remove ${item.file.name}`}
                  title={`Remove ${item.file.name}`}
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}
      {success && <p className="success-message" role="status">{success}</p>}

      <button
        type="submit"
        className="button button-primary"
        disabled={uploading || !jobId || validFiles.length === 0}
      >
        <Sparkles size={15} aria-hidden="true" />
        {uploading
          ? "Processing resumes..."
          : `Upload and evaluate ${validFiles.length || ""}`}
      </button>

      {uploading && progress && (
        <div className="evaluation-loading" role="status" aria-live="polite">
          <Sparkles className="evaluation-sparkle" size={19} aria-hidden="true" />
          <span>
            <strong>
              Reviewing resume {progress.completed + 1} of {progress.total}
            </strong>
            <span>{progress.current}</span>
          </span>
          <span className="evaluation-loading-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
    </form>
  );
}
