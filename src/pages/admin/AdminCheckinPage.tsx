import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Search,
  CheckCircle2,
  Undo2,
  Loader2,
  UserCheck,
  CalendarDays,
  ScanLine,
  QrCode,
  Maximize2,
  Minimize2,
  Printer,
  Download,
  Copy,
  Check,
  Trophy,
  Cpu,
  Sparkles,
  MapPin,
  Clock,
  RefreshCw,
  X,
  Layers,
} from "lucide-react";
import QRCode from "qrcode";
import { useAllEvents } from "../../lib/useEvents";
import { supabase } from "../../lib/supabase";
import type { TechEvent } from "../../data/techtrove";
import {
  useCheckinMembers,
  adminTogglePlayerGroup,
  type CheckinMember,
  shouldDeferCheckinReload,
  markCheckinReload,
} from "../../lib/checkin";
import { adminScanCheckin, type ScanResult } from "../../lib/checkinQr";
import {
  getAttendanceEventStats,
  CANONICAL_EVENT_TOKENS,
  UNIFIED_SPORTS_TOKEN,
} from "../../lib/coordinatorApi";
import { adminUpdateEvent } from "../../lib/eventStore";
import { buildEventQrPayload } from "../../lib/qrToken";
import { QrScanner } from "../../components/qr/QrScanner";
import { ScanErrorPanel, ScanResultPanel } from "../../components/qr/ScanResultPanel";
import { cn } from "../../lib/utils";
import { useToast } from "../../components/ui/toastContext";

type ViewMode = "qr_passes" | "desk_scanner";
type CategoryFilter = "all" | "sports" | "technical" | "non_technical";

interface EventQrItem {
  id: string;
  name: string;
  category: string;
  dayId: string;
  venue?: string;
  time?: string;
  token: string;
  qrDataUrl: string;
  url: string;
  isSportsGroup?: boolean;
  subEvents?: TechEvent[];
}

function getEventUnitLabel(ev?: TechEvent): string {
  if (!ev) return "";
  if (ev.registrationType === "individual") {
    return "players";
  }
  if (ev.registrationType === "solo_team") {
    return "entries";
  }
  if (ev.registrationType === "team") {
    return "teams";
  }
  const name = (ev.name || "").toLowerCase();
  if (name.includes("chess")) return "players";
  if (name.includes("carrom")) return "entries";
  if (
    name.includes("cricket") ||
    name.includes("football") ||
    name.includes("volleyball") ||
    name.includes("kabaddi") ||
    name.includes("kho-kho") ||
    name.includes("khokho") ||
    name.includes("throwball") ||
    name.includes("hackathon")
  ) {
    return "teams";
  }
  return "participants";
}

const STATIC_QR_MAP: Record<string, string> = {
  // Master Unified Sports Pass
  "sports-unified-master": "/checkin%20qr's/sports-pass.png",

  // Technical Events
  hackathon: "/checkin%20qr's/hackathon.png",
  "tech-hackathon": "/checkin%20qr's/hackathon.png",
  debugging: "/checkin%20qr's/debugging.png",
  "tech-debugging": "/checkin%20qr's/debugging.png",
  "paper-presentation": "/checkin%20qr's/paper-presentation.png",
  "tech-paper-presentation": "/checkin%20qr's/paper-presentation.png",
  "tech-maze": "/checkin%20qr's/tech-maze.png",
  quiz: "/checkin%20qr's/quiz.png",
  "tech-quiz": "/checkin%20qr's/quiz.png",
  "logo-making": "/checkin%20qr's/logo-making.png",
  "tech-logo-making": "/checkin%20qr's/logo-making.png",

  // Non-Technical Events
  dance: "/checkin%20qr's/dance.png",
  "nontech-dance": "/checkin%20qr's/dance.png",
  singing: "/checkin%20qr's/singing.png",
  "nontech-singing": "/checkin%20qr's/singing.png",
  gaming: "/checkin%20qr's/gaming.png",
  "nontech-mobile-gaming": "/checkin%20qr's/gaming.png",
  "ramp-walk": "/checkin%20qr's/ramp-walk.png",
  "nontech-ramp-walk": "/checkin%20qr's/ramp-walk.png",
  "treasure-hunt": "/checkin%20qr's/treasure-hunt.png",
  "nontech-treasure-hunt": "/checkin%20qr's/treasure-hunt.png",
  connexion: "/checkin%20qr's/connexion.png",
  "nontech-connexion": "/checkin%20qr's/connexion.png",
  adaptune: "/checkin%20qr's/adaptune.png",
  "nontech-adaptune": "/checkin%20qr's/adaptune.png",
  tunetopia: "/checkin%20qr's/tunetopia.png",
  "nontech-tunetopia": "/checkin%20qr's/tunetopia.png",

  // Sports Events
  cricket: "/checkin%20qr's/cricket.png",
  "sport-cricket": "/checkin%20qr's/cricket.png",
  football: "/checkin%20qr's/football.png",
  "sport-football": "/checkin%20qr's/football.png",
  volleyball: "/checkin%20qr's/volleyball.png",
  "sport-volleyball": "/checkin%20qr's/volleyball.png",
  kabaddi: "/checkin%20qr's/kabaddi.png",
  "sport-kabaddi": "/checkin%20qr's/kabaddi.png",
  "kho-kho": "/checkin%20qr's/kho-kho.png",
  "sport-khokho": "/checkin%20qr's/kho-kho.png",
  "sport-khokho-girls": "/checkin%20qr's/kho-kho.png",
  throwball: "/checkin%20qr's/throwball.png",
  "sport-throwball-girls": "/checkin%20qr's/throwball.png",
  chess: "/checkin%20qr's/chess.png",
  "sport-chess": "/checkin%20qr's/chess.png",
  "sport-chess-girls": "/checkin%20qr's/chess.png",
  carrom: "/checkin%20qr's/carrom.png",
  "sport-carrom": "/checkin%20qr's/carrom.png",
  "sport-carrom-girls": "/checkin%20qr's/carrom.png",
};

export function AdminCheckinPage({ viewOnly = false }: { viewOnly?: boolean } = {}) {
  const { events, loading: eventsLoading } = useAllEvents();
  const toast = useToast();

  // Top Tabs
  const [viewMode, setViewMode] = useState<ViewMode>("qr_passes");

  // QR Pass Filters & State
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [eventSearch, setEventSearch] = useState("");
  const [loadingQrs, setLoadingQrs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tokens & QR Data
  const [sportsToken, setSportsToken] = useState<string>("");
  const [sportsQrUrl, setSportsQrUrl] = useState<string>("");
  const [eventTokens, setEventTokens] = useState<Record<string, string>>({});
  const [eventQrUrls, setEventQrUrls] = useState<Record<string, string>>({});
  const [attendanceStats, setAttendanceStats] = useState<
    Record<string, { total: number; attended: number }>
  >({});

  // Modals
  const [presentItem, setPresentItem] = useState<EventQrItem | null>(null);
  const [printItem, setPrintItem] = useState<EventQrItem | null>(null);
  const [batchPrintOpen, setBatchPrintOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Desk Scanner State
  const [search, setSearch] = useState("");
  const [eventId, setEventId] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "internal" | "external">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "checked" | "pending">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

const { players, loading: playersLoading, refresh, applyScan } = useCheckinMembers(
    eventId || undefined,
    search
  );

  // Categorize events
  const { sportsEvents, techEvents, nonTechEvents } = useMemo(() => {
    const sports: TechEvent[] = [];
    const tech: TechEvent[] = [];
    const nonTech: TechEvent[] = [];

    for (const ev of events) {
      const cat = (ev.category ?? "").toLowerCase();
      if (ev.dayId === "day-1" || cat.startsWith("sport")) {
        sports.push(ev);
      } else if (cat === "technical") {
        tech.push(ev);
      } else {
        nonTech.push(ev);
      }
    }

    return { sportsEvents: sports, techEvents: tech, nonTechEvents: nonTech };
  }, [events]);

  // QR cache to prevent unnecessary re-generation
  const qrCacheRef = useRef<Map<string, string>>(new Map());
  const processedSignatureRef = useRef<string>("");

  // Load attendance statistics
  const loadStats = useCallback(async () => {
    try {
      const stats = await getAttendanceEventStats();
      setAttendanceStats(stats);
    } catch {
      // Ignore errors silently
    }
  }, []);

  // Generate QR for a token with caching
  const generateQrData = useCallback(async (token: string): Promise<string> => {
    if (!token) return "";
    const cached = qrCacheRef.current.get(token);
    if (cached) return cached;

    const payload = buildEventQrPayload(token);
    if (!payload) return "";
    const attendanceUrl = `${window.location.origin}/attendance?token=${encodeURIComponent(payload)}`;
    try {
      const dataUrl = await QRCode.toDataURL(attendanceUrl, {
        width: 512,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      });
      qrCacheRef.current.set(token, dataUrl);
      return dataUrl;
    } catch (e) {
      console.error("QR render error:", e);
      return "";
    }
  }, []);

  // Live realtime sync: update stats and attendee list whenever attendance or registrations change
  //
  // Coalesced, not per-event. Both loadStats() and refresh() re-read whole
  // tables, and every desk scan writes rows to both of these tables, so a
  // 250ms trailing debounce still fired continuously through a queue and
  // re-downloaded everything dozens of times. The scanned row itself is already
  // reflected instantly by applyScan(), so this only needs to keep other desks
  // and the header counters in step — 5s trailing / 20s ceiling is plenty.
  useEffect(() => {
    const REALTIME_DEBOUNCE_MS = 5000;
    const REALTIME_MAX_WAIT_MS = 20000;
    const RESCAN_DEFER_MS = 2000;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let firstQueuedAt = 0;

    const runSync = () => {
      debounceTimer = null;
      // Stand down while this desk is mid-queue. loadStats() and refresh() both
      // re-read whole tables, so running them between scans is what makes the
      // desk feel like it is loading rather than scanning. The scanned row is
      // already correct via applyScan(), and the starve ceiling in
      // shouldDeferCheckinReload() still forces a refresh at least once a minute.
      if (shouldDeferCheckinReload()) {
        debounceTimer = setTimeout(runSync, RESCAN_DEFER_MS);
        return;
      }
      firstQueuedAt = 0;
      markCheckinReload();
      loadStats();
      refresh();
    };

    const debouncedSync = () => {
      const now = Date.now();
      if (!firstQueuedAt) firstQueuedAt = now;
      const wait = Math.max(
        0,
        Math.min(REALTIME_DEBOUNCE_MS, REALTIME_MAX_WAIT_MS - (now - firstQueuedAt))
      );
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runSync, wait);
    };

    const channel = supabase
      .channel("admin-checkin-attendance-stats-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, debouncedSync)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "registration_members" },
        debouncedSync
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [loadStats, refresh]);

  // Resolve token for an event matching the verified generated cards
  const resolveToken = useCallback((ev: TechEvent): string => {
    if (CANONICAL_EVENT_TOKENS[ev.id]) {
      return CANONICAL_EVENT_TOKENS[ev.id];
    }
    const cleanId = ev.id.replace(/^(tech-|nontech-|sport-)/, "");
    if (CANONICAL_EVENT_TOKENS[cleanId]) {
      return CANONICAL_EVENT_TOKENS[cleanId];
    }
    if (ev.attendanceToken && /^[0-9a-f]{32}$/i.test(ev.attendanceToken.trim())) {
      return ev.attendanceToken.trim().toLowerCase();
    }
    const cacheKey = `techtrove_ev_token_${ev.id}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached && /^[0-9a-f]{32}$/i.test(cached.trim())) {
        return cached.trim().toLowerCase();
      }
    } catch {}
    let h1 = 0xdeadbeef,
      h2 = 0x41c6ce57;
    for (let i = 0; i < cleanId.length; i++) {
      const ch = cleanId.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const hex = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(16, "0");
    return (hex + hex).slice(0, 32);
  }, []);

  // Resolve the single master token for sports
  const resolveSports = useCallback((_sports: TechEvent[]): string => {
    return UNIFIED_SPORTS_TOKEN;
  }, []);

  // Fast, non-blocking QR initialization (runs purely in-memory)
  useEffect(() => {
    if (events.length === 0) return;

    // Check if events have changed
    const signature = events.map((e) => `${e.id}:${e.attendanceToken || ""}`).join(";");
    if (processedSignatureRef.current === signature) {
      return;
    }
    processedSignatureRef.current = signature;

    let cancelled = false;
    setLoadingQrs(true);

    const initQrs = async () => {
      try {
        // 1. Unified Sports Pass
        const sToken = resolveSports(sportsEvents);
        const sQr = STATIC_QR_MAP["sports-unified-master"] || (await generateQrData(sToken));
        if (cancelled) return;
        setSportsToken(sToken);
        setSportsQrUrl(sQr);

        // 2. Individual Sports, Tech & Non-Tech QRs in parallel
        const allOther = [...sportsEvents, ...techEvents, ...nonTechEvents];
        const tokensMap: Record<string, string> = {};
        const qrsMap: Record<string, string> = {};

        await Promise.all(
          allOther.map(async (ev) => {
            const tok = resolveToken(ev);
            tokensMap[ev.id] = tok;
            const cleanId = ev.id.replace(/^(tech-|nontech-|sport-)/, "");
            const qrUrl =
              STATIC_QR_MAP[ev.id] ||
              STATIC_QR_MAP[cleanId] ||
              STATIC_QR_MAP[`sport-${cleanId}`] ||
              (await generateQrData(tok));
            qrsMap[ev.id] = qrUrl;
          })
        );

        if (cancelled) return;
        setEventTokens(tokensMap);
        setEventQrUrls(qrsMap);
      } catch (err) {
        console.error("Error generating QR passes:", err);
      } finally {
        if (!cancelled) setLoadingQrs(false);
      }
    };

    initQrs();
    loadStats();

    return () => {
      cancelled = true;
    };
  }, [
    events,
    sportsEvents,
    techEvents,
    nonTechEvents,
    resolveSports,
    resolveToken,
    generateQrData,
    loadStats,
  ]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    processedSignatureRef.current = ""; // force re-generation
    qrCacheRef.current.clear();
    await Promise.all([loadStats(), refresh()]);
    setRefreshing(false);
    toast.success("Check-in data & QR passes refreshed.");
  };

  // Copy attendance deep-link
  const copyLink = (token: string, key: string) => {
    const payload = buildEventQrPayload(token);
    if (!payload) return;
    const url = `${window.location.origin}/attendance?token=${encodeURIComponent(payload)}`;
    navigator.clipboard.writeText(url);
    setCopiedId(key);
    toast.success("Attendance link copied to clipboard!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Download QR code PNG
  const downloadQr = (dataUrl: string, fileName: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${fileName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("QR code downloaded.");
  };

  // Fullscreen presentation toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  // Esc key listener for presentation modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (presentItem) setPresentItem(null);
        if (printItem) setPrintItem(null);
        if (batchPrintOpen) setBatchPrintOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presentItem, printItem, batchPrintOpen]);

  // Aggregate Sports Stats
  const sportsStats = useMemo(() => {
    if (
      attendanceStats["sports-unified-master"] &&
      attendanceStats["sports-unified-master"].total > 0
    ) {
      return attendanceStats["sports-unified-master"];
    }
    let total = 0;
    let attended = 0;
    const countedEvents = new Set<string>();

    for (const ev of sportsEvents) {
      const clean = ev.id.replace(/^(tech-|nontech-|sport-)/, "");
      if (countedEvents.has(clean)) continue;
      countedEvents.add(clean);

      const s =
        attendanceStats[ev.id] || attendanceStats[clean] || attendanceStats[`sport-${clean}`];
      if (s) {
        total += s.total;
        attended += s.attended;
      }
    }
    return { total, attended };
  }, [sportsEvents, attendanceStats]);

  // Unified Sports QR Item
  const unifiedSportsItem: EventQrItem = useMemo(() => {
    const payload = sportsToken ? buildEventQrPayload(sportsToken) : "";
    const url = payload
      ? `${window.location.origin}/attendance?token=${encodeURIComponent(payload)}`
      : "";
    return {
      id: "sports-unified-master",
      name: "All Sports Events (Unified Pass)",
      category: "Sports - Day 1",
      dayId: "day-1",
      venue: "Main Sports Grounds & Arenas",
      time: "Day 1 (Full Day)",
      token: sportsToken,
      qrDataUrl: sportsQrUrl,
      url,
      isSportsGroup: true,
      subEvents: sportsEvents,
    };
  }, [sportsToken, sportsQrUrl, sportsEvents]);

  // Technical QR Items
  const techItems: EventQrItem[] = useMemo(() => {
    return techEvents.map((ev) => {
      const token = eventTokens[ev.id] || "";
      const qrDataUrl = eventQrUrls[ev.id] || "";
      const payload = token ? buildEventQrPayload(token) : "";
      const url = payload
        ? `${window.location.origin}/attendance?token=${encodeURIComponent(payload)}`
        : "";
      return {
        id: ev.id,
        name: ev.name,
        category: ev.category || "Technical",
        dayId: ev.dayId || "day-2",
        venue: ev.venue || "Tech Lab / Campus Arena",
        time: ev.time || "Day 2",
        token,
        qrDataUrl,
        url,
      };
    });
  }, [techEvents, eventTokens, eventQrUrls]);

  // Non-Technical QR Items
  const nonTechItems: EventQrItem[] = useMemo(() => {
    return nonTechEvents.map((ev) => {
      const token = eventTokens[ev.id] || "";
      const qrDataUrl = eventQrUrls[ev.id] || "";
      const payload = token ? buildEventQrPayload(token) : "";
      const url = payload
        ? `${window.location.origin}/attendance?token=${encodeURIComponent(payload)}`
        : "";
      return {
        id: ev.id,
        name: ev.name,
        category: ev.category || "Non-Technical",
        dayId: ev.dayId || "day-2",
        venue: ev.venue || "Auditorium / Open Stage",
        time: ev.time || "Day 2",
        token,
        qrDataUrl,
        url,
      };
    });
  }, [nonTechEvents, eventTokens, eventQrUrls]);

  // Filtered technical items
  const filteredTech = useMemo(() => {
    if (!eventSearch.trim()) return techItems;
    const q = eventSearch.toLowerCase();
    return techItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || (item.venue && item.venue.toLowerCase().includes(q))
    );
  }, [techItems, eventSearch]);

  // Filtered non-technical items
  const filteredNonTech = useMemo(() => {
    if (!eventSearch.trim()) return nonTechItems;
    const q = eventSearch.toLowerCase();
    return nonTechItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || (item.venue && item.venue.toLowerCase().includes(q))
    );
  }, [nonTechItems, eventSearch]);

  // Individual Sports QR Items
  const sportsItems: EventQrItem[] = useMemo(() => {
    return sportsEvents.map((ev) => {
      const cleanId = ev.id.replace(/^(tech-|nontech-|sport-)/, "");
      const token = eventTokens[ev.id] || resolveToken(ev) || sportsToken;
      const qrDataUrl =
        eventQrUrls[ev.id] ||
        STATIC_QR_MAP[ev.id] ||
        STATIC_QR_MAP[cleanId] ||
        STATIC_QR_MAP[`sport-${cleanId}`] ||
        sportsQrUrl;
      const payload = token ? buildEventQrPayload(token) : "";
      const url = payload
        ? `${window.location.origin}/attendance?token=${encodeURIComponent(payload)}`
        : "";
      return {
        id: ev.id,
        name: ev.name,
        category: ev.category || "Sports - Day 1",
        dayId: ev.dayId || "day-1",
        venue: ev.venue || "Sports Grounds & Arenas",
        time: ev.time || "Day 1",
        token,
        qrDataUrl,
        url,
      };
    });
  }, [sportsEvents, eventTokens, eventQrUrls, resolveToken, sportsToken, sportsQrUrl]);

  // Filtered sports items
  const filteredSports = useMemo(() => {
    if (!eventSearch.trim()) return sportsItems;
    const q = eventSearch.toLowerCase();
    return sportsItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) || (item.venue && item.venue.toLowerCase().includes(q))
    );
  }, [sportsItems, eventSearch]);

  // Desk Scanner Handler
  const handleScan = useCallback(
    async (raw: string) => {
      setScanning(true);
      setScanError(null);

      // Check if user accidentally scanned an Event Attendance QR Code instead of a student pass
      if (raw.includes("TTE1:") || raw.includes("tte1:") || raw.includes("/attendance?token=")) {
        setScanError(
          "⚠️ That is an Event Attendance QR Code (for students to scan with their mobile phone cameras). For Desk Check-in, please scan the student's personal check-in pass (starts with TTQ1 from their profile page)."
        );
        setScanning(false);
        return;
      }

      try {
        const result = await adminScanCheckin(raw);
        setScanResult(result);
        if (result.ok) {
// Flip the row in place. This used to re-read every registration_members
          // row in the schema after each scan, which is what made a long venue
          // queue crawl: the RPC had already done the work, so all the browser
          // needed was the name it already had back.
          //
          // loadStats() is deliberately NOT awaited here. It re-reads the
          // attendance and registration tables, so calling it per scan turns a
          // 3,000-person queue back into thousands of full-table downloads. The
          // header counters settle on the coalesced realtime tick below instead.
          applyScan(result.email);
          toast.success(
            result.duplicate
              ? `${result.displayName} was already checked in`
              : `${result.displayName} checked in`
          );
        }
      } catch (err) {
        setScanError(err instanceof Error ? err.message : "Could not check in this pass.");
      } finally {
        setScanning(false);
      }
    },
[applyScan, toast]
  );

  // Sync all verified QR tokens to the Supabase database
  const [syncingDb, setSyncingDb] = useState(false);
  const handleSyncTokensToDb = async () => {
    setSyncingDb(true);
    try {
      let updatedCount = 0;
      for (const ev of events) {
        const isSport =
          ev.dayId === "day-1" || (ev.category ?? "").toLowerCase().startsWith("sport");
        const canonicalToken = isSport ? UNIFIED_SPORTS_TOKEN : CANONICAL_EVENT_TOKENS[ev.id];
        if (canonicalToken && ev.attendanceToken !== canonicalToken) {
          await adminUpdateEvent(ev.id, { attendanceToken: canonicalToken });
          updatedCount++;
        }
      }
      toast.success(
        updatedCount > 0
          ? `Synced ${updatedCount} event tokens to database successfully!`
          : "All event tokens in the database are already up to date!"
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to sync tokens to database. Please run the SQL migration."
      );
    } finally {
      setSyncingDb(false);
    }
  };

  // Participant Desk Roster calculations
  const statusFor = (player: (typeof players)[number]) => (player.attended ? "checked" : "pending");

  const typedPlayers =
    typeFilter === "all"
      ? players
      : players.filter((p) => p.members.some((m) => m.participantType === typeFilter));

  const filteredPlayers =
    statusFilter === "all"
      ? typedPlayers
      : typedPlayers.filter((p) => statusFor(p) === statusFilter);

  const eventNamesById = new Map(events.map((ev) => [ev.id, ev.name]));
  const eventNameFor = (member: CheckinMember) =>
    member.eventName ?? eventNamesById.get(member.eventId) ?? "";

  // Global aggregate stats across all events
  const { globalTotalRegistrations, globalTotalAttended } = useMemo(() => {
    let regSum = 0;
    let attSum = 0;
    const countedEvents = new Set<string>();

    for (const ev of events) {
      const clean = ev.id.replace(/^(tech-|nontech-|sport-)/, "");
      if (countedEvents.has(clean)) continue;
      countedEvents.add(clean);

      const s =
        attendanceStats[ev.id] || attendanceStats[clean] || attendanceStats[`sport-${clean}`];
      if (s) {
        regSum += s.total;
        attSum += s.attended;
      }
    }

    const effectiveTotal = Math.max(regSum, players.length);
    const effectiveAttended = Math.max(attSum, players.filter((p) => p.attended).length);

    return {
      globalTotalRegistrations: effectiveTotal,
      globalTotalAttended: effectiveAttended,
    };
  }, [events, attendanceStats, players]);

  async function toggle(player: (typeof filteredPlayers)[number]) {
    setBusy(player.key);
    try {
      await adminTogglePlayerGroup(player, !player.attended);
      await refresh();
      await loadStats();
      toast.success(
        player.attended
          ? `Check-in undone for ${player.playerName}`
          : `${player.playerName} checked in`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/[0.06] pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-primary-soft uppercase">
              <QrCode className="h-3 w-3" />
              Attendance Hub
            </span>
            <span className="text-xs text-muted">· TechTrove 3.0 Admin Desk</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Check-in & QR Passes
          </h1>
          <p className="mt-1.5 text-sm text-muted max-w-2xl leading-relaxed">
            One unified QR pass for all{" "}
            <span className="text-amber-400 font-medium">Day 1 Sports</span>, and individual
            dedicated QR passes for each <span className="text-sky-400 font-medium">Technical</span>{" "}
            and <span className="text-purple-400 font-medium">Non-Technical</span> event.
          </p>
        </div>

        {/* Global Progress summary */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
              Total Checked In
            </p>
            <p className="text-xl font-bold text-emerald-400">
              {globalTotalAttended}
              <span className="text-sm font-medium text-muted"> / {globalTotalRegistrations}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleSyncTokensToDb}
            disabled={syncingDb}
            className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-3 text-xs font-semibold text-primary-soft hover:bg-primary/20 transition-colors disabled:opacity-50"
            title="Sync all verified QR card tokens directly to Supabase events table"
          >
            <RefreshCw className={cn("h-4 w-4", syncingDb && "animate-spin")} />
            <span className="hidden sm:inline">Sync DB Tokens</span>
          </button>
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={refreshing || loadingQrs}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-xs font-semibold text-foreground hover:bg-white/[0.08] transition-colors disabled:opacity-50"
            title="Refresh QR codes and attendance statistics"
          >
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin text-primary-soft")} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Main View Tabs (QR Passes vs Live Desk Scanner) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-white/10 bg-[#141414] p-1.5 shadow-inner">
          <button
            type="button"
            onClick={() => setViewMode("qr_passes")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all",
              viewMode === "qr_passes"
                ? "bg-primary text-white shadow-md shadow-primary/25"
                : "text-muted hover:text-foreground"
            )}
          >
            <QrCode className="h-4 w-4" />
            Attendance QR Passes
          </button>
          <button
            type="button"
            onClick={() => setViewMode("desk_scanner")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all",
              viewMode === "desk_scanner"
                ? "bg-primary text-white shadow-md shadow-primary/25"
                : "text-muted hover:text-foreground"
            )}
          >
            <ScanLine className="h-4 w-4" />
            Live Desk Scanner & Roster
          </button>
        </div>

        {viewMode === "qr_passes" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBatchPrintOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-foreground hover:border-primary/50 hover:bg-white/[0.06] transition-all"
            >
              <Printer className="h-3.5 w-3.5 text-primary-soft" />
              Batch Print Posters
            </button>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* ── VIEW 1: ATTENDANCE QR PASSES ── */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {viewMode === "qr_passes" && (
        <div className="space-y-8">
          {/* Quick Category & Search Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-[#141414] p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  [
                    "all",
                    `All Events (${1 + sportsEvents.length + techEvents.length + nonTechEvents.length})`,
                    Layers,
                  ],
                  ["sports", `🏆 Sports (${sportsEvents.length})`, Trophy],
                  ["technical", `💻 Technical (${techEvents.length})`, Cpu],
                  ["non_technical", `🎭 Non-Technical (${nonTechEvents.length})`, Sparkles],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategoryFilter(key)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                    categoryFilter === key
                      ? "bg-white/10 text-foreground border border-white/20 shadow-sm"
                      : "text-muted hover:text-foreground hover:bg-white/[0.03]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 text-muted group-hover:text-foreground" />
                  {label}
                </button>
              ))}
            </div>

            <div className="relative min-w-[240px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                placeholder="Search event name or venue..."
                className="w-full rounded-lg border border-white/10 bg-white/[0.02] py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted focus:border-primary/50 focus:outline-none"
              />
            </div>
          </div>

          {loadingQrs || eventsLoading ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-[#141414] text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary-soft" />
              <p className="text-xs uppercase tracking-widest text-muted">
                Generating cryptographic QR passes…
              </p>
            </div>
          ) : (
            <div className="space-y-10">
              {/* ────────────────────────────────────────────────────────── */}
              {/* 1. MASTER UNIFIED SPORTS PASS (DAY 1)                      */}
              {/* ────────────────────────────────────────────────────────── */}
              {(categoryFilter === "all" || categoryFilter === "sports") && (
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                        <Trophy className="h-5 w-5 text-amber-400" />
                        Day 1 · All Sports Events (1 Unified QR Pass)
                      </h2>
                      <p className="text-xs text-muted">
                        All 8+ sports events share this single official QR code. Participants
                        registered for any sport scan here.
                      </p>
                    </div>
                    <span className="hidden sm:inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-300">
                      Covers All Sports
                    </span>
                  </div>

                  <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/[0.07] via-[#161512] to-[#121212] p-6 shadow-[0_0_40px_rgba(245,158,11,0.08)]">
                    {/* Background glow watermark */}
                    <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />

                    <div className="grid gap-6 md:grid-cols-12 md:items-center">
                      {/* Left: Info, Covered Sports, Stats */}
                      <div className="space-y-5 md:col-span-7">
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="rounded-md border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                              Master Pass · Day 1
                            </span>
                            <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-muted">
                              Single Pass for All Sports
                            </span>
                          </div>
                          <h3 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                            All Sports Events Check-in
                          </h3>
                          <p className="mt-2 text-xs sm:text-sm text-neutral-300 leading-relaxed max-w-xl">
                            Athletes participating in Football, Cricket, Volleyball, Kabaddi,
                            Kho-Kho, Throwball, Chess, or Carrom only need to scan this one QR code.
                            Their attendance is automatically matched to their registered sports
                            team!
                          </p>
                        </div>

                        {/* Covered sports chips with live team/player counts */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 mb-2">
                            Sports Included Under This Pass ({sportsEvents.length} Events):
                          </p>
                          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                            {sportsEvents.map((sp) => {
                              const s = attendanceStats[sp.id] ||
                                attendanceStats[sp.id.replace(/^(tech-|nontech-|sport-)/, "")] ||
                                attendanceStats[`sport-${sp.id}`] || { total: 0, attended: 0 };
                              const unit = getEventUnitLabel(sp);
                              return (
                                <span
                                  key={sp.id}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200 shadow-sm"
                                >
                                  <span>{sp.name}</span>
                                  <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                                    {s.total} {unit}
                                  </span>
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {/* Live sports attendance stat bar */}
                        <div className="rounded-xl border border-white/10 bg-black/40 p-3.5 backdrop-blur-sm">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted font-medium">
                              Sports Athletes Attendance
                            </span>
                            <span className="font-semibold text-emerald-400">
                              {sportsStats.attended} / {sportsStats.total} Checked In
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                            <div
                              className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-500"
                              style={{
                                width: `${
                                  sportsStats.total > 0
                                    ? Math.min(
                                        100,
                                        Math.round((sportsStats.attended / sportsStats.total) * 100)
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-wrap items-center gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => setPresentItem(unifiedSportsItem)}
                            className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-black hover:bg-amber-300 shadow-lg shadow-amber-400/20 transition-all"
                          >
                            <Maximize2 className="h-4 w-4" />
                            Present on Screen
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrintItem(unifiedSportsItem)}
                            className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-white/10 transition-all"
                          >
                            <Printer className="h-4 w-4 text-amber-400" />
                            Print Poster
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadQr(sportsQrUrl, "techtrove-day1-sports-checkin")}
                            className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-white/10 transition-all"
                          >
                            <Download className="h-4 w-4" />
                            Download PNG
                          </button>
                          <button
                            type="button"
                            onClick={() => copyLink(sportsToken, "sports-unified")}
                            className="flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-foreground hover:bg-white/10 transition-all"
                          >
                            {copiedId === "sports-unified" ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                            Copy Link
                          </button>
                        </div>
                      </div>

                      {/* Right: Crisp QR Code Display */}
                      <div className="flex flex-col items-center justify-center md:col-span-5">
                        <div className="group relative rounded-2xl bg-white p-4 shadow-2xl transition-transform hover:scale-[1.02]">
                          {sportsQrUrl ? (
                            <img
                              src={sportsQrUrl}
                              alt="All Sports Events Unified QR Pass"
                              className="h-56 w-56 object-contain rounded-lg"
                            />
                          ) : (
                            <div className="flex h-56 w-56 items-center justify-center">
                              <Loader2 className="h-8 w-8 animate-spin text-neutral-800" />
                            </div>
                          )}
                          <div className="mt-2 text-center">
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-800">
                              TechTrove 3.0 · Sports Pass
                            </p>
                            <p className="text-[9px] text-neutral-500 font-mono">
                              SCAN WITH PHONE CAMERA
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* 1B. INDIVIDUAL SPORTS PASSES (DAY 1 - CRICKET, FOOTBALL..) */}
              {/* ────────────────────────────────────────────────────────── */}
              {(categoryFilter === "all" || categoryFilter === "sports") && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                        <Trophy className="h-5 w-5 text-amber-400" />
                        Day 1 · Individual Sports Event Passes ({filteredSports.length} Sports)
                      </h2>
                      <p className="text-xs text-muted">
                        Each sport has its own dedicated event pass with live team / player counts
                        and check-in tracking.
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
                      {filteredSports.length} Sports
                    </span>
                  </div>

                  {filteredSports.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.07] bg-[#141414] p-8 text-center text-muted text-xs">
                      No sports events match your search.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredSports.map((item) => {
                        const rawEv = sportsEvents.find((e) => e.id === item.id);
                        const stat = attendanceStats[item.id] ||
                          attendanceStats[item.id.replace(/^(tech-|nontech-|sport-)/, "")] ||
                          attendanceStats[`sport-${item.id}`] || { total: 0, attended: 0 };
                        const unit = getEventUnitLabel(rawEv);
                        return (
                          <EventCard
                            key={item.id}
                            item={item}
                            stat={stat}
                            accentColor="amber"
                            unitLabel={unit}
                            onPresent={() => setPresentItem(item)}
                            onPrint={() => setPrintItem(item)}
                            onDownload={() => downloadQr(item.qrDataUrl, item.name)}
                            onCopy={() => copyLink(item.token, item.id)}
                            isCopied={copiedId === item.id}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* 2. TECHNICAL EVENTS GRID (DAY 2 - SEPARATE QRs)            */}
              {/* ────────────────────────────────────────────────────────── */}
              {(categoryFilter === "all" || categoryFilter === "technical") && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                        <Cpu className="h-5 w-5 text-sky-400" />
                        Day 2 · Technical Events (Separate QR per Event)
                      </h2>
                      <p className="text-xs text-muted">
                        Each technical competition has its own dedicated QR code. Display at
                        respective lab/venue entrances.
                      </p>
                    </div>
                    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
                      {filteredTech.length} Events
                    </span>
                  </div>

                  {filteredTech.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.07] bg-[#141414] p-8 text-center text-muted text-xs">
                      No technical events match your search.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredTech.map((item) => {
                        const rawEv = techEvents.find((e) => e.id === item.id);
                        const stat = attendanceStats[item.id] ||
                          attendanceStats[item.id.replace(/^(tech-|nontech-|sport-)/, "")] ||
                          attendanceStats[`tech-${item.id}`] || { total: 0, attended: 0 };
                        const unit = getEventUnitLabel(rawEv);
                        return (
                          <EventCard
                            key={item.id}
                            item={item}
                            stat={stat}
                            accentColor="sky"
                            unitLabel={unit}
                            onPresent={() => setPresentItem(item)}
                            onPrint={() => setPrintItem(item)}
                            onDownload={() => downloadQr(item.qrDataUrl, item.name)}
                            onCopy={() => copyLink(item.token, item.id)}
                            isCopied={copiedId === item.id}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* 3. NON-TECHNICAL EVENTS GRID (DAY 2 - SEPARATE QRs)        */}
              {/* ────────────────────────────────────────────────────────── */}
              {(categoryFilter === "all" || categoryFilter === "non_technical") && (
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
                        <Sparkles className="h-5 w-5 text-purple-400" />
                        Day 2 · Non-Technical Events (Separate QR per Event)
                      </h2>
                      <p className="text-xs text-muted">
                        Each non-technical event has its own dedicated QR code. Display at
                        respective auditorium/hall entrances.
                      </p>
                    </div>
                    <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-purple-300">
                      {filteredNonTech.length} Events
                    </span>
                  </div>

                  {filteredNonTech.length === 0 ? (
                    <div className="rounded-xl border border-white/[0.07] bg-[#141414] p-8 text-center text-muted text-xs">
                      No non-technical events match your search.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredNonTech.map((item) => {
                        const rawEv = nonTechEvents.find((e) => e.id === item.id);
                        const stat = attendanceStats[item.id] ||
                          attendanceStats[item.id.replace(/^(tech-|nontech-|sport-)/, "")] ||
                          attendanceStats[`nontech-${item.id}`] || { total: 0, attended: 0 };
                        const unit = getEventUnitLabel(rawEv);
                        return (
                          <EventCard
                            key={item.id}
                            item={item}
                            stat={stat}
                            accentColor="purple"
                            unitLabel={unit}
                            onPresent={() => setPresentItem(item)}
                            onPrint={() => setPrintItem(item)}
                            onDownload={() => downloadQr(item.qrDataUrl, item.name)}
                            onCopy={() => copyLink(item.token, item.id)}
                            isCopied={copiedId === item.id}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* ── VIEW 2: LIVE DESK SCANNER & PARTICIPANT ROSTER ── */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {viewMode === "desk_scanner" && (
        <div className="space-y-6">
          {/* QR scanner for participant entry pass */}
          <div className="rounded-xl border border-white/[0.07] bg-[#161616] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ScanLine className="h-4 w-4 text-primary-soft" aria-hidden />
                <p className="text-sm font-semibold text-foreground">Scan Participant Entry Pass</p>
              </div>
              <span className="text-xs text-muted font-mono">TTQ1 Camera Scanner</span>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <QrScanner onScan={(raw) => void handleScan(raw)} disabled={scanning} />

              <div className="space-y-4">
                <ScanResultPanel result={scanResult} />
                {scanError && <ScanErrorPanel message={scanError} />}

                {!scanResult && !scanError && (
                  <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-4 text-xs leading-relaxed text-muted">
                    Point the camera at the participant&apos;s digital pass QR code. The system
                    verifies their ticket, displays registered events, and checks them in
                    instantaneously.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search + event filters */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by participant name, team, or registration code…"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              className="rounded-lg border border-white/10 bg-[#161616] px-3 py-2.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            >
              <option value="">All events</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                </option>
              ))}
            </select>
            <div className="flex rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
              {(["all", "internal", "external"] as const).map((ty) => (
                <button
                  key={ty}
                  type="button"
                  onClick={() => setTypeFilter(ty)}
                  className={cn(
                    "px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.13em] transition-colors",
                    typeFilter === ty ? "bg-primary text-white" : "text-muted hover:text-foreground"
                  )}
                >
                  {ty === "all" ? "All" : ty}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg border border-emerald-500/20 bg-white/[0.03] overflow-hidden">
              {(
                [
                  ["all", "All"],
                  ["checked", "Checked In"],
                  ["pending", "Pending"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setStatusFilter(val)}
                  className={cn(
                    "px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.13em] transition-colors",
                    statusFilter === val
                      ? "bg-emerald-500/90 text-white"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Attendee Roster List */}
          {playersLoading || eventsLoading ? (
            <div className="flex h-48 items-center justify-center text-muted">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              Loading attendee roster…
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-white/[0.07] bg-[#161616] p-12 text-center">
              <UserCheck className="h-10 w-10 text-muted" aria-hidden />
              <p className="mt-4 text-sm font-medium text-foreground">No attendees found</p>
              <p className="mt-1 text-xs text-muted">
                {search
                  ? "No participant or team matches your search query."
                  : "Registered participants will appear here."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPlayers.map((player) => {
                const m = player.members[0];
                const realCapName = player.members.find((x) => x.captainName)?.captainName?.trim().toLowerCase();
                const isCaptain = player.members.some(
                  (x) =>
                    (realCapName && x.memberName.trim().toLowerCase() === realCapName) ||
                    x.position === 1 ||
                    x.memberRole === "captain"
                );
                const isSub = player.members.every((x) => x.memberRole === "substitute");
                const playerEventNames = Array.from(
                  new Set(player.members.map((x) => eventNameFor(x)).filter(Boolean))
                );

                return (
                  <div
                    key={player.key}
                    className="rounded-xl border border-white/[0.07] bg-[#161616]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {player.playerName}
                          </p>
                          {isCaptain && (
                            <span className="shrink-0 border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary-soft">
                              Captain
                            </span>
                          )}
                          {isSub && (
                            <span className="shrink-0 border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
                              Substitute
                            </span>
                          )}
                          {m.teamName && (
                            <span className="shrink-0 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-300">
                              {m.teamName}
                            </span>
                          )}
                        </div>
                        {playerEventNames.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <CalendarDays className="h-3 w-3 shrink-0 text-muted" aria-hidden />
                            {playerEventNames.map((name) => (
                              <span
                                key={name}
                                className="shrink-0 border border-primary/30 bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.06em] text-primary-soft"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="mt-1 truncate text-[11px] text-muted">
                          {m.participantType === "internal" ? "SIMATS" : "External"}
                          {m.college ? ` · ${m.college}` : ""}
                          {m.regNumber ? ` · ${m.regNumber}` : ""}
                          {m.registrationCode ? ` · ${m.registrationCode}` : ""}
                        </p>
                      </div>

                      <button
                        onClick={() => toggle(player)}
                        disabled={busy === player.key || viewOnly}
                        className={cn(
                          "shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-all",
                          player.attended
                            ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            : "bg-primary text-white hover:bg-primary-soft shadow-[0_0_12px_rgba(124,58,237,0.3)]"
                        )}
                      >
                        {busy === player.key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : player.attended ? (
                          <Undo2 className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {player.attended ? "Uncheck" : "Check In"}
                      </button>
                    </div>

                    {/* Read-only Squad Roster for team registrations — no individual member check-in buttons */}
                    {player.members.length > 1 && (
                      <div className="border-t border-white/[0.04] bg-white/[0.015] px-4 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-semibold text-muted text-[11px] mr-1">
                            Team Members ({player.members.length}):
                          </span>
                          {player.members.map((mem) => {
                            const isCap = realCapName
                              ? mem.memberName.trim().toLowerCase() === realCapName
                              : mem.position === 1 || mem.memberRole === "captain";
                            return (
                              <span
                                key={mem.id}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium border",
                                  isCap
                                    ? "border-primary/40 bg-primary/10 text-primary-soft font-semibold"
                                    : "border-white/5 bg-white/[0.03] text-foreground/80"
                                )}
                              >
                                {mem.memberName}
                                {isCap && " (Captain)"}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 1: FULLSCREEN PRESENTATION MODE                        ── */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {presentItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="relative flex flex-col items-center max-w-2xl w-full rounded-3xl border border-white/10 bg-[#111111] p-8 shadow-2xl text-center">
            {/* Top controls */}
            <div className="absolute top-5 right-5 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleFullscreen}
                className="rounded-full bg-white/5 p-2 text-muted hover:bg-white/10 hover:text-white transition-all"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-5 w-5" />
                ) : (
                  <Maximize2 className="h-5 w-5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPresentItem(null)}
                className="rounded-full bg-white/5 p-2 text-muted hover:bg-white/10 hover:text-white transition-all"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Event Eyebrow & Badges */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
                  presentItem.isSportsGroup
                    ? "border border-amber-500/40 bg-amber-500/15 text-amber-300"
                    : "border border-primary/40 bg-primary/15 text-primary-soft"
                )}
              >
                {presentItem.category}
              </span>
              <span className="text-xs text-muted font-mono">
                {presentItem.dayId.toUpperCase()}
              </span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
              {presentItem.name}
            </h2>

            <p className="text-sm text-neutral-300 max-w-md mb-6 leading-relaxed">
              Scan with your phone camera or visit{" "}
              <span className="font-semibold text-white underline underline-offset-4">
                techtrove.live/attendance
              </span>
            </p>

            {/* Giant QR Frame */}
            <div className="relative rounded-3xl bg-white p-5 shadow-[0_0_60px_rgba(255,255,255,0.1)]">
              {presentItem.qrDataUrl ? (
                <img
                  src={presentItem.qrDataUrl}
                  alt={presentItem.name}
                  className="h-72 w-72 sm:h-80 sm:w-80 object-contain rounded-xl"
                />
              ) : (
                <div className="flex h-72 w-72 items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-black" />
                </div>
              )}
            </div>

            {/* Venue & instructions footer */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted">
              {presentItem.venue && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-primary-soft" />
                  {presentItem.venue}
                </span>
              )}
              {presentItem.time && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary-soft" />
                  {presentItem.time}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 2: PRINTABLE OFFICIAL POSTER                           ── */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {printItem && <PrintPosterModal item={printItem} onClose={() => setPrintItem(null)} />}

      {/* ═════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL 3: BATCH PRINT ALL POSTERS                             ── */}
      {/* ═════════════════════════════════════════════════════════════════ */}
      {batchPrintOpen && (
        <BatchPrintModal
          sportsItem={unifiedSportsItem}
          sportsItems={sportsItems}
          techItems={techItems}
          nonTechItems={nonTechItems}
          onClose={() => setBatchPrintOpen(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Individual Event QR Card
// ─────────────────────────────────────────────────────────────────────────────

interface EventCardProps {
  item: EventQrItem;
  stat: { total: number; attended: number };
  accentColor: "sky" | "purple" | "amber";
  unitLabel?: string;
  onPresent: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onCopy: () => void;
  isCopied: boolean;
}

function EventCard({
  item,
  stat,
  accentColor,
  unitLabel,
  onPresent,
  onPrint,
  onDownload,
  onCopy,
  isCopied,
}: EventCardProps) {
  const percentage = stat.total > 0 ? Math.round((stat.attended / stat.total) * 100) : 0;

  return (
    <div
      className={cn(
        "group flex flex-col justify-between rounded-2xl border bg-[#151515] p-5 transition-all duration-300 hover:border-white/20 hover:shadow-xl",
        accentColor === "sky"
          ? "border-sky-500/20 hover:border-sky-500/40"
          : accentColor === "amber"
            ? "border-amber-500/20 hover:border-amber-500/40"
            : "border-purple-500/20 hover:border-purple-500/40"
      )}
    >
      <div>
        {/* Card header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              accentColor === "sky"
                ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                : accentColor === "amber"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : "border-purple-500/30 bg-purple-500/10 text-purple-300"
            )}
          >
            {item.category}
          </span>
          <span className="text-[11px] font-mono text-muted">{item.dayId.toUpperCase()}</span>
        </div>

        <h3 className="text-base font-bold text-foreground line-clamp-1 group-hover:text-primary-soft transition-colors">
          {item.name}
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          {item.venue && (
            <span className="flex items-center gap-1 truncate max-w-[180px]">
              <MapPin className="h-3 w-3 shrink-0" />
              {item.venue}
            </span>
          )}
          {item.time && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              {item.time}
            </span>
          )}
        </div>

        {/* QR Preview Display */}
        <div className="mt-4 flex items-center justify-center rounded-xl bg-white p-3 shadow-inner">
          {item.qrDataUrl ? (
            <img
              src={item.qrDataUrl}
              alt={item.name}
              className="h-36 w-36 object-contain rounded"
            />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-black" />
            </div>
          )}
        </div>

        {/* Attendance stats */}
        <div className="mt-3.5 rounded-lg border border-white/[0.05] bg-white/[0.02] p-2.5">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-muted">Checked In</span>
            <span className="font-semibold text-emerald-400">
              {stat.attended} / {stat.total} {unitLabel ? unitLabel : ""} ({percentage}%)
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                accentColor === "sky"
                  ? "bg-sky-400"
                  : accentColor === "amber"
                    ? "bg-amber-400"
                    : "bg-purple-400"
              )}
              style={{ width: `${Math.min(100, percentage)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-4 grid grid-cols-4 gap-1.5 border-t border-white/[0.06] pt-3">
        <button
          type="button"
          onClick={onPresent}
          className="flex flex-col items-center justify-center rounded-lg py-1.5 text-[10px] font-semibold text-muted hover:bg-white/[0.06] hover:text-foreground transition-colors"
          title="Fullscreen Presentation"
        >
          <Maximize2 className="h-4 w-4 mb-0.5" />
          Present
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="flex flex-col items-center justify-center rounded-lg py-1.5 text-[10px] font-semibold text-muted hover:bg-white/[0.06] hover:text-foreground transition-colors"
          title="Print Poster"
        >
          <Printer className="h-4 w-4 mb-0.5" />
          Print
        </button>
        <button
          type="button"
          onClick={onDownload}
          className="flex flex-col items-center justify-center rounded-lg py-1.5 text-[10px] font-semibold text-muted hover:bg-white/[0.06] hover:text-foreground transition-colors"
          title="Download QR Image"
        >
          <Download className="h-4 w-4 mb-0.5" />
          PNG
        </button>
        <button
          type="button"
          onClick={onCopy}
          className="flex flex-col items-center justify-center rounded-lg py-1.5 text-[10px] font-semibold text-muted hover:bg-white/[0.06] hover:text-foreground transition-colors"
          title="Copy Link"
        >
          {isCopied ? (
            <Check className="h-4 w-4 mb-0.5 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4 mb-0.5" />
          )}
          Link
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Print Single Poster Modal
// ─────────────────────────────────────────────────────────────────────────────

function PrintPosterModal({ item, onClose }: { item: EventQrItem; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
      <div className="relative flex flex-col max-w-xl w-full rounded-2xl border border-white/10 bg-[#161616] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-foreground">Print Venue Poster</h3>
            <p className="text-xs text-muted">A4 print-ready official door sign.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-bold text-white hover:bg-primary-soft shadow transition-all"
            >
              <Printer className="h-4 w-4" />
              Print Now
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Printable Poster Sheet (Dark in preview, Clean White in print) */}
        <div
          ref={printRef}
          className="rounded-xl bg-white p-8 text-black text-center shadow-lg print:border-none print:shadow-none"
        >
          <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-neutral-600">
            SIMATS PRESENTS
          </p>
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 mt-1">
            TECHTROVE 3.0
          </h1>
          <p className="text-[11px] font-bold uppercase tracking-widest text-primary mt-0.5">
            OFFICIAL ATTENDANCE CHECK-IN PASS
          </p>

          <div className="my-5 border-y-2 border-neutral-900 py-3">
            <h2 className="text-2xl font-black tracking-tight text-neutral-900">{item.name}</h2>
            <p className="text-xs font-semibold text-neutral-600 mt-1 uppercase tracking-wider">
              {item.category} {item.venue ? `· Venue: ${item.venue}` : ""}
            </p>
          </div>

          <div className="my-4 flex justify-center">
            {item.qrDataUrl && (
              <img
                src={item.qrDataUrl}
                alt={item.name}
                className="h-64 w-64 object-contain border-4 border-neutral-900 p-2 rounded-xl"
              />
            )}
          </div>

          <div className="mt-4 rounded-lg bg-neutral-100 p-3 text-left max-w-sm mx-auto text-neutral-800 text-[11px] space-y-1">
            <p className="font-bold uppercase tracking-wider text-center text-neutral-900 mb-1">
              Instructions for Attendees:
            </p>
            <p>
              1. Open your phone camera or visit <strong>techtrove.live/attendance</strong>
            </p>
            <p>2. Point camera at this QR code to mark your attendance</p>
            <p>3. Sign in with your registered email to record verified attendance</p>
          </div>

          <p className="mt-4 text-[9px] text-neutral-500 uppercase tracking-widest">
            * Attendance is required for event participation & official certificates.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: Batch Print All Posters Modal
// ─────────────────────────────────────────────────────────────────────────────

function BatchPrintModal({
  sportsItem,
  sportsItems,
  techItems,
  nonTechItems,
  onClose,
}: {
  sportsItem: EventQrItem;
  sportsItems: EventQrItem[];
  techItems: EventQrItem[];
  nonTechItems: EventQrItem[];
  onClose: () => void;
}) {
  const [selectedBatch, setSelectedBatch] = useState<
    "all" | "sports" | "technical" | "non_technical"
  >("all");

  const itemsToPrint = useMemo(() => {
    if (selectedBatch === "sports") return [sportsItem, ...sportsItems];
    if (selectedBatch === "technical") return techItems;
    if (selectedBatch === "non_technical") return nonTechItems;
    return [sportsItem, ...sportsItems, ...techItems, ...nonTechItems];
  }, [selectedBatch, sportsItem, sportsItems, techItems, nonTechItems]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md">
      <div className="relative flex flex-col max-w-2xl w-full max-h-[90vh] rounded-2xl border border-white/10 bg-[#161616] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-foreground">Batch Print Event Posters</h3>
            <p className="text-xs text-muted">
              Select category to generate printable signage for venue doors.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-soft shadow transition-all"
            >
              <Printer className="h-4 w-4" />
              Print {itemsToPrint.length} Posters
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Category selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {(
            [
              ["all", `All (${1 + sportsItems.length + techItems.length + nonTechItems.length})`],
              ["sports", `Sports (${1 + sportsItems.length})`],
              ["technical", `Technical (${techItems.length})`],
              ["non_technical", `Non-Technical (${nonTechItems.length})`],
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setSelectedBatch(val)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                selectedBatch === val
                  ? "bg-primary text-white"
                  : "bg-white/5 text-muted hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable list preview */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {itemsToPrint.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs"
            >
              <div className="flex items-center gap-3">
                {item.qrDataUrl && (
                  <img
                    src={item.qrDataUrl}
                    alt={item.name}
                    className="h-12 w-12 rounded bg-white p-0.5 object-contain"
                  />
                )}
                <div>
                  <p className="font-bold text-foreground">{item.name}</p>
                  <p className="text-[11px] text-muted">
                    {item.category} · {item.venue || "Campus Venue"}
                  </p>
                </div>
              </div>
              <span className="rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-muted">
                1 Page
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
