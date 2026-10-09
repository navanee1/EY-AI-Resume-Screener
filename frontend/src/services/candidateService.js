
import api from "../api";

export async function uploadResume(jobId, file, candidateName) {
  const formData = new FormData();
  formData.append("file", file);
  if (candidateName) formData.append("candidate_name", candidateName);

  const { data } = await api.post(
    `/jobs/${jobId}/candidates`,
    formData
  );

  return data;
}

export async function getCandidates(jobId, filters = {}) {
  const { data } = await api.get(
    `/jobs/${jobId}/candidates`,
    { params: filters }
  );

  return data;
}

export async function updateCandidateStatus(candidateId, status) {
  const { data } = await api.patch(
    `/candidates/${candidateId}`,
    { status }
  );

  return data;
}

export async function retryCandidateEvaluation(candidateId) {
  const { data } = await api.post(`/candidates/${candidateId}/evaluate`);
  return data;
}

export async function rescoreCandidate(candidateId, targetJobId) {
  const { data } = await api.post(`/candidates/${candidateId}/rescore`, {
    target_job_id: Number(targetJobId),
  });
  return data;
}

export async function deleteCandidate(candidateId) {
  await api.delete(`/candidates/${candidateId}`);
}
