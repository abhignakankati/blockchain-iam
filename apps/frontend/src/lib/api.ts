import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: API_BASE_URL,
});

/**
 * Attaches the JWT to every outgoing request if one is stored. Reads from
 * localStorage on each request (not a module-level variable) so a fresh
 * login in another tab is picked up without requiring a page reload.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("iam_jwt");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * On a 401, the token is invalid or expired - clear it so the app falls
 * back to the logged-out state rather than repeatedly sending a dead token.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("iam_jwt");
    }
    return Promise.reject(error);
  }
);
