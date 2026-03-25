import axios from "axios";

export async function demoHealth() {
  const { data } = await axios.get("/api/v1/demo/health");
  return data;
}

export async function demoSetup() {
  const { data } = await axios.post("/api/v1/demo/setup");
  return data;
}
