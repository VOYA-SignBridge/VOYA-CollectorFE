import axios from "axios";

const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000", // Vite env var
  // Do not set a global Content-Type here. Let axios/browser set it per-request.
});

export default axiosClient;
