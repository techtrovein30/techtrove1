import { useState, useEffect } from "react";
import { adminListRegistrations, adminListUsers } from "./adminApi";
import type { Registration, User } from "./api";

/**
 * Hook to fetch all registrations and keep them in sync with the database via Realtime.
 */
export function useAdminRegistrations() {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchRegistrations() {
    try {
      const data = await adminListRegistrations();
      setRegistrations(data);
      return data;
    } catch (err) {
      console.error("fetchRegistrations error:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const data = await adminListRegistrations();
        if (!cancelled) setRegistrations(data);
      } catch (err) {
        console.error("fetchRegistrations error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const handleFocus = () => {
      fetchRegistrations().catch(() => {});
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return { registrations, setRegistrations, loading, refresh: fetchRegistrations };
}

/**
 * Hook to fetch all users (participants) and refresh on focus or manual trigger.
 */
export function useAdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  function fetchUsers() {
    adminListUsers()
      .then(setUsers)
      .finally(() => setLoading(false))
      .catch((err) => {
        console.error("fetchUsers failed:", err);
      });
  }

  useEffect(() => {
    fetchUsers();

    const handleFocus = () => {
      fetchUsers();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return { users, loading, refresh: fetchUsers };
}
