import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const STATUS_OPTIONS = [
  "all",
  "new",
  "contacted",
  "scheduled",
  "in progress",
  "completed",
  "canceled",
];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function NerdiDashboardApp() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    async function loadRequests() {
      if (!supabase) {
        setError("Supabase is not configured. Add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("service_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message || "Failed to load requests.");
        setRequests([]);
      } else {
        setRequests(data || []);
      }

      setLoading(false);
    }

    loadRequests();
  }, [refreshTick]);

  const filteredRequests = useMemo(() => {
    const term = search.trim().toLowerCase();

    return requests.filter((request) => {
      const statusMatch = statusFilter === "all" || request.status === statusFilter;

      const haystack = [
        request.id,
        request.full_name,
        request.phone,
        request.email,
        request.service_type,
        request.description,
        request.address,
        request.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchMatch = !term || haystack.includes(term);
      return statusMatch && searchMatch;
    });
  }, [requests, search, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: requests.length,
      newCount: requests.filter((item) => item.status === "new").length,
      openCount: requests.filter((item) =>
        ["contacted", "scheduled", "in progress"].includes(item.status)
      ).length,
      completedCount: requests.filter((item) => item.status === "completed").length,
    };
  }, [requests]);

  async function updateStatus(id, nextStatus) {
    if (!supabase) return;

    const previous = requests;
    setRequests((current) =>
      current.map((item) => (item.id === id ? { ...item, status: nextStatus } : item))
    );

    const { error } = await supabase
      .from("service_requests")
      .update({ status: nextStatus })
      .eq("id", id);

    if (error) {
      setRequests(previous);
      setError(error.message || "Failed to update status.");
    }
  }

  return (
    <div style={styles.app}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>NERDI Dashboard</h1>
            <p style={styles.subtitle}>Manage incoming service requests.</p>
          </div>
          <button style={styles.secondaryButton} onClick={() => setRefreshTick((v) => v + 1)}>
            Refresh
          </button>
        </div>

        <div style={styles.metricGrid}>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Total</div>
            <div style={styles.metricValue}>{counts.total}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>New</div>
            <div style={styles.metricValue}>{counts.newCount}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Open</div>
            <div style={styles.metricValue}>{counts.openCount}</div>
          </div>
          <div style={styles.metricCard}>
            <div style={styles.metricLabel}>Completed</div>
            <div style={styles.metricValue}>{counts.completedCount}</div>
          </div>
        </div>

        <div style={styles.toolbar}>
          <input
            style={styles.input}
            placeholder="Search by name, email, phone, issue, or ticket ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            style={styles.select}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : status}
              </option>
            ))}
          </select>
        </div>

        {error ? <div style={styles.errorBox}>{error}</div> : null}

        {loading ? (
          <div style={styles.card}>Loading requests...</div>
        ) : filteredRequests.length === 0 ? (
          <div style={styles.card}>No requests found.</div>
        ) : (
          filteredRequests.map((request) => (
            <div key={request.id} style={styles.requestCard}>
              <div style={styles.requestTopRow}>
                <div>
                  <div style={styles.requestName}>{request.full_name || "Unnamed Request"}</div>
                  <div style={styles.requestMeta}>Ticket ID: {request.id}</div>
                </div>
                <span style={{ ...styles.statusBadge, ...badgeStyle(request.status) }}>
                  {request.status}
                </span>
              </div>

              <div style={styles.detailsGrid}>
                <div><strong>Phone:</strong> {request.phone || "—"}</div>
                <div><strong>Email:</strong> {request.email || "—"}</div>
                <div><strong>Service:</strong> {request.service_type || "—"}</div>
                <div><strong>Created:</strong> {formatDate(request.created_at)}</div>
                <div><strong>Preferred Date:</strong> {request.preferred_date || "—"}</div>
                <div><strong>Preferred Time:</strong> {request.preferred_time || "—"}</div>
                <div style={{ gridColumn: "1 / -1" }}><strong>Address:</strong> {request.address || "—"}</div>
                <div style={{ gridColumn: "1 / -1" }}><strong>Description:</strong> {request.description || "—"}</div>
              </div>

              <div style={styles.statusRow}>
                <label style={styles.statusLabel}>Update Status</label>
                <select
                  style={styles.select}
                  value={request.status || "new"}
                  onChange={(e) => updateStatus(request.id, e.target.value)}
                >
                  {STATUS_OPTIONS.filter((status) => status !== "all").map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function badgeStyle(status) {
  switch (status) {
    case "new":
      return { background: "#dbeafe", color: "#1d4ed8" };
    case "contacted":
      return { background: "#fef3c7", color: "#92400e" };
    case "scheduled":
      return { background: "#ede9fe", color: "#6d28d9" };
    case "in progress":
      return { background: "#e0f2fe", color: "#0369a1" };
    case "completed":
      return { background: "#dcfce7", color: "#166534" };
    case "canceled":
      return { background: "#fee2e2", color: "#b91c1c" };
    default:
      return { background: "#e5e7eb", color: "#374151" };
  }
}

const styles = {
  app: {
    minHeight: "100vh",
    background: "#f4f7fb",
    fontFamily: "Arial, sans-serif",
    padding: "24px",
    boxSizing: "border-box",
  },
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "16px",
    marginBottom: "20px",
    flexWrap: "wrap",
  },
  title: {
    margin: 0,
    fontSize: "32px",
    color: "#0f172a",
  },
  subtitle: {
    margin: "6px 0 0",
    color: "#64748b",
  },
  metricGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "16px",
    marginBottom: "20px",
  },
  metricCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "18px",
  },
  metricLabel: {
    fontSize: "14px",
    color: "#64748b",
    marginBottom: "6px",
  },
  metricValue: {
    fontSize: "28px",
    fontWeight: 700,
    color: "#0f172a",
  },
  toolbar: {
    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gap: "12px",
    marginBottom: "16px",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    boxSizing: "border-box",
    background: "#fff",
  },
  select: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    fontSize: "14px",
    boxSizing: "border-box",
    background: "#fff",
  },
  secondaryButton: {
    padding: "12px 16px",
    borderRadius: "12px",
    border: "1px solid #cbd5e1",
    background: "#fff",
    color: "#0f172a",
    cursor: "pointer",
  },
  errorBox: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    padding: "12px 14px",
    marginBottom: "16px",
  },
  card: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "18px",
  },
  requestCard: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "20px",
    marginBottom: "16px",
  },
  requestTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    marginBottom: "14px",
    flexWrap: "wrap",
  },
  requestName: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#0f172a",
  },
  requestMeta: {
    fontSize: "12px",
    color: "#64748b",
    marginTop: "4px",
    wordBreak: "break-all",
  },
  statusBadge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    textTransform: "capitalize",
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "10px 16px",
    fontSize: "14px",
    color: "#334155",
    lineHeight: 1.5,
    marginBottom: "16px",
  },
  statusRow: {
    display: "grid",
    gridTemplateColumns: "140px 1fr",
    gap: "12px",
    alignItems: "center",
  },
  statusLabel: {
    fontWeight: 700,
    color: "#0f172a",
  },
};
