// ─── CivicConnect API Service ─────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

class ApiService {
  private token: string | null = localStorage.getItem("cc_token");

  private headers(): HeadersInit {
    const h: HeadersInit = { "Content-Type": "application/json" };
    if (this.token) h["Authorization"] = `Bearer ${this.token}`;
    return h;
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("cc_token", token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_user");
  }

  getUser() {
    const u = localStorage.getItem("cc_user");
    return u ? JSON.parse(u) : null;
  }

  setUser(user: any) {
    localStorage.setItem("cc_user", JSON.stringify(user));
  }

  // ── Auth ──
  async login(email: string, password: string) {
    const res = await fetch(`${API_BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");
    this.setToken(data.token);
    this.setUser(data);
    return data;
  }

  async register(name: string, email: string, password: string, role = "citizen") {
    const res = await fetch(`${API_BASE}/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password, role }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Registration failed");
    this.setToken(data.token);
    this.setUser(data);
    return data;
  }

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: this.headers() });
    if (!res.ok) { this.clearToken(); return null; }
    return res.json();
  }

  // ── Incidents ──
  async getIncidents(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await fetch(`${API_BASE}/incidents${qs}`, { headers: this.headers() });
    return res.json();
  }

  async createIncident(data: any) {
    const res = await fetch(`${API_BASE}/incidents`, { method: "POST", headers: this.headers(), body: JSON.stringify(data) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message);
    return result;
  }

  // ── Alerts ──
  async getAlerts(params?: Record<string, string>) {
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    const res = await fetch(`${API_BASE}/alerts${qs}`, { headers: this.headers() });
    return res.json();
  }

  // ── Complaints ──
  async getComplaints() {
    const res = await fetch(`${API_BASE}/complaints`, { headers: this.headers() });
    return res.json();
  }

  async createComplaint(data: any) {
    const res = await fetch(`${API_BASE}/complaints`, { method: "POST", headers: this.headers(), body: JSON.stringify(data) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message);
    return result;
  }

  // ── Location ──
  async updateLocation(lat: number, lng: number) {
    await fetch(`${API_BASE}/locations`, { method: "POST", headers: this.headers(), body: JSON.stringify({ lat, lng }) });
  }

  // ── Dashboard ──
  async getDashboardStats() {
    const res = await fetch(`${API_BASE}/dashboard/stats`, { headers: this.headers() });
    return res.json();
  }

  // ── Health ──
  async health() {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  }
}

export const api = new ApiService();
export default api;
