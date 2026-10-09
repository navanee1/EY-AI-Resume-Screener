
import api from "../api";

export async function getJobs() {
  const { data } = await api.get("/jobs");
  return data;
}

export async function createJob(jobData) {
  const { data } = await api.post("/jobs", jobData);
  return data;
}

export async function deleteJob(jobId) {
  await api.delete(`/jobs/${jobId}`);
}
