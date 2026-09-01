import { useState, useEffect } from "react";
import { supabase } from "./supabase";
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
    fetchRegistrations();

    // Listen to changes on both registration tables
    const channel = supabase
      .channel("admin-registrations-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations_internal" },
        () => fetchRegistrations()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registrations_external" },
        () => fetchRegistrations()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { registrations, setRegistrations, loading, refresh: fetchRegistrations };
}

/**
 * Hook to fetch all users (participants) and keep them in sync with the database via Realtime.
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

    // Listen to changes on both split participant tables
    const channel = supabase
      .channel("admin-users-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_participants" },
        () => fetchUsers()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "external_participants" },
        () => fetchUsers()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { users, loading, refresh: fetchUsers };
}
