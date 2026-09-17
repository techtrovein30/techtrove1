import { useEffect, useState, Fragment } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  GraduationCap,
  Lock,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useAllEvents, useEvent } from "../lib/useEvents";
import type { TechEvent, Day } from "../lib/eventStore";
import { days as staticDays } from "../data/techtrove";
import { formatFee } from "../lib/utils";
import { computeTotalFee, feeBreakdown, isTechPassEvent } from "../lib/fees";
import { cn } from "../lib/utils";
import { api } from "../lib/api";
import { validateUploadFile, uploadPaymentProof } from "../lib/storage";
import type { ParticipantType, RegistrationMember, User } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Field } from "../components/ui/Field";
import { GoogleIcon } from "../components/ui/GoogleIcon";
import { useToast } from "../components/ui/toastContext";
import { StepShell } from "../components/registration/RegistrationStepper";

import {
  isSportEvent,
  isIndividualEvent,
  isSoloTeamEvent,
  validateRegisterNumber,
  validateEmail,
  validatePhoneNumber,
  validateUtrNumber,
} from "../lib/validation";

interface MemberDraft {
  name: string;
  role: "player" | "substitute";
  position: number;
  email: string;
  regNumber: string;
  phone: string;
}

interface Draft {
  eventIds: string[];
  termsAccepted: boolean;
  captainName: string;
  teamName: string;
  members: MemberDraft[];
}

interface ProfileDraft {
  fullName: string;
  regNumber: string;
  college: string;
  phone: string;
}

function makeEmptyMembers(
  required: number,
  maxSubs: number,
  captainName = "",
  captainEmail = "",
  captainPhone = "",
): MemberDraft[] {

  const players: MemberDraft[] = Array.from({ length: required }, (_, i) => ({
    name: i === 0 ? captainName : "",
    role: "player",
    position: i + 1,
    email: i === 0 ? captainEmail : "",
    regNumber: "",
    phone: i === 0 ? captainPhone : "",
  }));
  const subs: MemberDraft[] = Array.from({ length: maxSubs }, (_, i) => ({
    name: "",
    role: "substitute",
    position: i + 1,
    email: "",
    regNumber: "",
    phone: "",
  }));
  return [...players, ...subs];
}

function buildMembersFromDraft(draftMembers: MemberDraft[], teamType: ParticipantType): RegistrationMember[] {
  return draftMembers
    .filter((m) => m.name.trim())
    .map((m) => ({
      name: m.name.trim(),
      role: m.role,
      position: m.position,
      participantType: teamType,
      email: m.email.trim(),
      regNumber: m.regNumber.trim() || undefined,
      phone: m.phone.trim() || undefined,
    }));
}

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

const initialDraft: Draft = {
  eventIds: [],
  termsAccepted: false,
  captainName: "",
  teamName: "",
  members: [],
};

const initialProfileDraft: ProfileDraft = {
  fullName: "",
  regNumber: "",
  college: "",
  phone: "",
};

interface PendingProfile {
  authUserId: string;
  email: string;
  fullName: string;
}

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const preselectedEventId = searchParams.get("event") ?? undefined;
  // ?day=day-1 | ?day=day-2 preselects the Day tab (used by the two landing
  // page CTAs — one for Sports, one for Tech & Non-Tech). Anything else is ignored.
  const dayParam = searchParams.get("day");
  const initialDayId = dayParam === "day-1" || dayParam === "day-2" ? dayParam : null;
  const { event: preselected } = useEvent(preselectedEventId);

  return (
    <div className="reveal-up mx-auto max-w-6xl px-4 pb-28 pt-28 sm:px-6 md:pt-36 lg:px-8">
      <p className="eyebrow">Registration</p>
      <h1 className="display mt-2 text-4xl text-foreground sm:text-6xl">Register for TechTrove 3.0</h1>
      <hr className="rule-line mt-5 w-40" />
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        Everything in one single flow — tell us who you are, pick your Day&nbsp;1 / Day&nbsp;2 events
        and fill in your details on this page, then confirm. External participants pay right here.
      </p>

      <div className="mt-10">
        <RegistrationNoticeMarquee />
        <div className="mt-10">
          <RegistrationFlow preselectedId={preselected?.id ?? null} initialDayId={initialDayId} />
        </div>
      </div>
    </div>
  );
}

/** Auto-scrolling notice banner pinned to the top of registration so every
 *  entrant sees the Day-2 team format and the early problem-statement drops. */
function RegistrationNoticeMarquee() {
  const items = [
    "Tech & Non-Tech team events? Register individually",
    "Team up at the venue on event day",
  ];
  const sequence = (ariaHidden: boolean) => (
    <div aria-hidden={ariaHidden} className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <Fragment key={`${item}-${i}`}>
          <span className="display whitespace-nowrap px-6 text-2xl text-white md:text-4xl">
            {item}
          </span>
          <span className="mx-4 h-2.5 w-2.5 shrink-0 rotate-45 bg-white/60" aria-hidden />
        </Fragment>
      ))}
    </div>
  );

  return (
    <section
      aria-label="Registration notice"
      className="clip-angle overflow-hidden border-y border-primary/60 bg-gradient-to-r from-primary-deep via-primary to-primary-deep py-5 glow-purple"
    >
      <div className="marquee-track">
        {sequence(false)}
        {sequence(true)}
        {sequence(true)}
      </div>
    </section>
  );
}

function RegistrationFlow({ preselectedId, initialDayId }: { preselectedId: string | null; initialDayId: string | null }) {
  const navigate = useNavigate();
  const { user, loading, signInWithGoogle, googlePendingProfile, completeGoogleProfile, signOut } = useAuth();
  const toast = useToast();
  const { days, events: allEvents, loading: eventsLoading } = useAllEvents();

  // Resolve preselected event from DB data
  const preselectedEvent = preselectedId ? allEvents.find((e) => e.id === preselectedId) : undefined;
  const [draft, setDraft] = useState<Draft>(() => {
    if (!preselectedId) return initialDraft;
    return { ...initialDraft, eventIds: [preselectedId], members: [] };
  });
  const selectedEvents = allEvents.filter(e => draft.eventIds.includes(e.id));
  const event = selectedEvents.length > 0 ? selectedEvents[0] : undefined;
  const activeEvent = event ?? preselectedEvent;
  const isIndividual = isIndividualEvent(activeEvent) || isTechPassEvent(activeEvent);

  // ── Participant type ──────────────────────────────────────────────────────
  // Before sign-in this is the visitor's explicit choice (drives the live fee
  // preview). Once a completed profile exists the type is locked to the account.
  const [typeChoice, setTypeChoice] = useState<ParticipantType | null>(null);
  const teamType: ParticipantType = user?.participantType ?? typeChoice ?? "internal";

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedDayId, setSelectedDayId] = useState<string | null>(initialDayId ?? preselectedEvent?.dayId ?? null);

  const firstSelectedEventId = draft.eventIds[0];

  // Once events load, populate members + selected day for pre-selected event if not already done.
  // setState is deferred into a microtask so no state is set synchronously inside
  // the effect body (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (preselectedEvent && firstSelectedEventId === preselectedEvent.id && draft.members.length === 0) {
      void Promise.resolve().then(() => {
        setDraft((d) => ({
          ...d,
          members: makeEmptyMembers(
            isTechPassEvent(preselectedEvent) || !isSportEvent(preselectedEvent) ? 1 : (preselectedEvent?.requiredPlayers ?? 1),
            isSoloTeamEvent(preselectedEvent) ? 0 : (isSportEvent(preselectedEvent) && !isTechPassEvent(preselectedEvent) ? (preselectedEvent.maxSubstitutes ?? 0) : 0),
            user?.fullName ?? "",
            user?.email ?? "",
            user?.phone ?? "",
          ),
          captainName: d.captainName || (user?.fullName ?? ""),
        }));
        // A preselect by ?event= moves the tab to that event's day; an explicit
        // ?day= (landing Sports / Tech CTA) keeps its own tab.
        if (!initialDayId) {
          setSelectedDayId(preselectedEvent.dayId);
        }
      });
    }
  }, [preselectedEvent, firstSelectedEventId, draft.members.length, user, initialDayId]);

  function selectEvent(ev: TechEvent) {
    const isMultiSelect = ev.dayId === "day-2";
    let newEventIds = [...draft.eventIds];

    if (isMultiSelect) {
      newEventIds = newEventIds.filter(id => {
        const existing = allEvents.find(e => e.id === id);
        return existing && existing.dayId !== "day-1";
      });
      if (newEventIds.includes(ev.id)) {
        newEventIds = newEventIds.filter(id => id !== ev.id);
      } else {
        newEventIds.push(ev.id);
      }
    } else {
      newEventIds = newEventIds.includes(ev.id) ? [] : [ev.id];
    }

    const sEvs = allEvents.filter(e => newEventIds.includes(e.id));
    const allTechPass = sEvs.length > 0 && sEvs.every(isTechPassEvent);
    const maxReq = allTechPass ? 1 : (sEvs.length > 0 ? Math.max(...sEvs.map(e => isSportEvent(e) ? (e.requiredPlayers ?? 1) : 1)) : 1);
    const mSubs = allTechPass ? 0 : (isSoloTeamEvent(ev) ? 0 : (sEvs.length > 0 ? Math.max(...sEvs.map(e => isSportEvent(e) ? (e.maxSubstitutes ?? 0) : 0)) : 0));

    setDraft((d) => ({
      ...d,
      eventIds: newEventIds,
      members: newEventIds.length === 0
        ? []
        : makeEmptyMembers(
            maxReq,
            mSubs,
            user?.fullName ?? "",
            user?.email ?? "",
            user?.phone ?? ""
          ),
      captainName: d.captainName || (user?.fullName ?? ""),
      teamName: isIndividualEvent(ev) || isTechPassEvent(ev) ? (user?.fullName ?? ev.name) : d.teamName,
    }));
    setSelectedDayId(ev.dayId);
    setErrors({});
  }

  function selectDay(dayId: string) {
    setSelectedDayId(dayId);
    setErrors({});
  }

  function updateMember(index: number, patch: Partial<MemberDraft>) {
    setDraft((d) => ({
      ...d,
      members: d.members.map((m, i) => (i === index ? { ...m, ...patch } : m)),
      // Keep the dedicated "Team captain name" field in sync with the captain slot.
      captainName:
        index === 0 && patch.name !== undefined ? patch.name : d.captainName,
    }));
    setErrors((prev) => {
      const next = { ...prev };
      if (patch.name !== undefined) delete next[`member-${index}-name`];
      if (patch.email !== undefined) delete next[`member-${index}-email`];
      if (patch.regNumber !== undefined) delete next[`member-${index}-reg`];
      if (patch.phone !== undefined) delete next[`member-${index}-phone`];
      return next;
    });
  }

  // Safety sync: if member[0] name/email ended up empty (e.g. timing edge on
  // preselected-event route), backfill from the authenticated user profile.
  // setState is deferred into a microtask (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!user) return;
    if (draft.members.length === 0) return;
    const captain = draft.members[0];
    if (!captain.name && user.fullName) {
      void Promise.resolve().then(() => {
        setDraft((d) => ({
          ...d,
          members: d.members.map((m, i) =>
            i === 0
              ? {
                  ...m,
                  name: m.name || user.fullName,
                  email: m.email || user.email || "",
                  phone: m.phone || user.phone || "",
                }
              : m
          ),
        }));
      });
    }
  }, [user, draft.members]);

  const [submitting, setSubmitting] = useState(false);
  const [utrNumber, setUtrNumber] = useState("");
  const [paymentFile, setPaymentFile] = useState<File | null>(null);

  // ── Account / profile section state ───────────────────────────────────────
  const [profileForm, setProfileForm] = useState<ProfileDraft>(initialProfileDraft);
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  function handlePaymentFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) {
      setPaymentFile(null);
      return;
    }
    const validation = validateUploadFile(selected);
    if (!validation.valid) {
      toast.error(validation.error ?? "Invalid file.");
      setPaymentFile(null);
      return;
    }
    setPaymentFile(selected);
  }

  async function handleGoogleSignIn() {
    setAccountError(null);
    setAccountBusy(true);
    try {
      // Come straight back to the register flow after the OAuth round-trip,
      // keeping the ?day=/?event= selection in the URL as well.
      await signInWithGoogle(`/register${window.location.search}`);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Google sign-in failed. Try again.");
      setAccountBusy(false);
    }
  }

  async function handleSaveProfile() {
    const pending = googlePendingProfile;
    if (!pending) return;
    setAccountError(null);
    const chosen = typeChoice ?? "internal";
    try {
      const emailErr = validateEmail(pending.email, chosen);
      if (emailErr) {
        setAccountError(emailErr);
        return;
      }
      if (chosen === "internal") {
        const regErr = validateRegisterNumber(profileForm.regNumber, "internal");
        if (regErr) {
          setAccountError(regErr);
          return;
        }
        if (profileForm.phone.trim()) {
          const phoneErr = validatePhoneNumber(profileForm.phone, false);
          if (phoneErr) {
            setAccountError(phoneErr);
            return;
          }
        }
      } else {
        if (!profileForm.college.trim()) {
          setAccountError("College name is required for external participants.");
          return;
        }
        const phoneErr = validatePhoneNumber(profileForm.phone, true);
        if (phoneErr) {
          setAccountError(phoneErr);
          return;
        }
      }

      setAccountBusy(true);
      await completeGoogleProfile({
        participantType: chosen,
        fullName: profileForm.fullName.trim() || pending.fullName,
        regNumber: profileForm.regNumber || undefined,
        college: profileForm.college || undefined,
        phone: profileForm.phone || undefined,
      });
      toast.success("Profile complete — you're all set to register.");
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Could not save your profile. Please try again.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleSignOut() {
    setAccountBusy(true);
    try {
      await signOut();
      setTypeChoice(null);
      toast.success("Signed out.");
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleRegistration(paymentDetails?: { utrNumber: string; paymentScreenshotPath?: string; paymentScreenshotUrl?: string }): Promise<void> {
    if (!event) throw new Error("Select an event first.");
    const indiv = isIndividualEvent(event);
    const firstMember = draft.members[0];
    const captainName = firstMember?.name.trim() || draft.captainName.trim() || user?.fullName || "";
    const teamName = indiv
      ? (draft.teamName.trim() || captainName || event.name)
      : isSoloTeamEvent(event)
        ? (draft.teamName.trim() || captainName || event.name)
        : draft.teamName.trim();

    const registration = await api.createRegistration({
      eventIds: draft.eventIds,
      teamName,
      captainName,
      members: buildMembersFromDraft(draft.members, teamType),
      termsAccepted: draft.termsAccepted,
      ...paymentDetails,
    });
    // Cache registration so the success page can display it even if the DB
    // lookup fails (e.g. RLS blocks SELECT or session is lost during redirect).
    try {
      sessionStorage.setItem("tt:lastRegistration", JSON.stringify(registration[0]));
    } catch { /* storage unavailable — best-effort */ }
    navigate(`/register/success?code=${encodeURIComponent(registration[0].registrationCode)}`);
  }

  // Final confirmation: internal students submit directly; external students
  // must first supply valid payment proof (UTR + screenshot), which is uploaded
  // before the registration is created.
  async function handleFinalSubmit(): Promise<void> {
    if (teamType === "internal") {
      await handleRegistration();
      return;
    }
    const utrError = validateUtrNumber(utrNumber);
    if (utrError) {
      toast.error(utrError);
      return;
    }
    if (!paymentFile) {
      toast.error("Please upload a payment screenshot before confirming.");
      return;
    }
    if (!user?.id) {
      toast.error("You must be signed in to submit payment proof.");
      return;
    }
    const rand = new Uint32Array(4);
    crypto.getRandomValues(rand);
    const regFileId = `reg_${Date.now()}_${Array.from(rand, (n) => n.toString(36)).join("")}`;

    const storagePath = await uploadPaymentProof(user.id, regFileId, paymentFile);
    await handleRegistration({
      utrNumber: utrNumber.trim(),
      paymentScreenshotPath: storagePath,
      paymentScreenshotUrl: storagePath,
    });
  }

  // Everything below is on one page — so "validate and submit" runs ALL checks
  // in one pass rather than per-step.
  function validateAll(): Record<string, string> {
    const nextErrors: Record<string, string> = {};

    if (draft.eventIds.length === 0) {
      nextErrors.step = "Select an event to continue.";
    }

    if (event) {
      if (!draft.termsAccepted) {
        nextErrors.step = nextErrors.step || "You must accept the Terms and Conditions.";
      }

      if (!isIndividual) {
        if (!isSoloTeamEvent(event)) {
          if (!draft.teamName.trim()) nextErrors.teamName = "Team name is required.";
        }
        if (!draft.captainName.trim()) nextErrors.captainName = "Captain name is required.";
      }

      const maxPlayers = (!isSportEvent(event) || isTechPassEvent(event)) ? 1 : (event.requiredPlayers ?? 1);
      const minPlayers = isSoloTeamEvent(event) ? 1 : maxPlayers;
      const isSport = isSportEvent(event);
      const captainName = user?.fullName?.trim() ?? "";
      const captainEmail = user?.email?.trim() ?? "";

      draft.members.forEach((m, i) => {
        if (!isSport && m.role === "substitute") return;

        const effectiveName = (m.position === 1 && m.role === "player")
          ? (m.name.trim() || captainName)
          : m.name.trim();

        if (m.role === "player" && !effectiveName) {
          const slotLabel = isIndividual ? "Participant" : `Player ${String(m.position).padStart(2, "0")}`;
          if (isSoloTeamEvent(event) && m.position > 1) return;
          nextErrors[`member-${i}-name`] = `${slotLabel} name is required.`;
        }

        if (effectiveName) {
          const effectiveEmail = (m.position === 1 && m.role === "player")
            ? (m.email.trim() || captainEmail)
            : m.email.trim();
          const emailErr = validateEmail(effectiveEmail, teamType);
          if (emailErr) nextErrors[`member-${i}-email`] = emailErr;

          if (teamType === "internal") {
            const regErr = validateRegisterNumber(m.regNumber, "internal");
            if (regErr) nextErrors[`member-${i}-reg`] = regErr;

            if (m.phone && m.phone.trim()) {
              const phoneErr = validatePhoneNumber(m.phone, false);
              if (phoneErr) nextErrors[`member-${i}-phone`] = phoneErr;
            }
          } else {
            const phoneErr = validatePhoneNumber(m.phone, true);
            if (phoneErr) nextErrors[`member-${i}-phone`] = phoneErr;
          }
        }
      });

      const filledPlayers = draft.members.filter((m) => {
        if (m.role !== "player") return false;
        const effectiveName = (m.position === 1)
          ? (m.name.trim() || captainName)
          : m.name.trim();
        return !!effectiveName;
      }).length;
      if (filledPlayers < minPlayers) {
        nextErrors.step = nextErrors.step || (isIndividual
          ? "Please enter your participant details."
          : isSoloTeamEvent(event)
            ? "Enter at least 1 player. A 2-player team is the maximum for this event."
            : `Fill in all ${minPlayers} required player slots.`);
      }
    }

    return nextErrors;
  }

  async function handleConfirm() {
    setErrors({});

    // Auth gate: the register wizard signs the visitor in right here rather
    // than bouncing them to a separate login page.
    if (!user) {
      if (googlePendingProfile) {
        toast.error("Save your profile above before confirming.");
        return;
      }
      toast.info("Sign in with Google to complete your registration.");
      await handleGoogleSignIn();
      return;
    }

    const nextErrors = validateAll();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error(nextErrors.step ?? "Please fix the highlighted fields and continue.");
      return;
    }

    setSubmitting(true);
    try {
      await handleFinalSubmit();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const isExternal = teamType === "external";

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-16rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return (
    <>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        <div className="min-w-0 space-y-6">
          {/* 1 · Who are you — internal/external + inline Google sign-in */}
          <AccountSection
            user={user}
            googlePendingProfile={googlePendingProfile}
            authBusy={accountBusy}
            authError={accountError}
            typeChoice={typeChoice}
            onSelectType={setTypeChoice}
            onSignIn={handleGoogleSignIn}
            onSaveProfile={handleSaveProfile}
            onSignOut={handleSignOut}
            profileForm={profileForm}
            onProfileField={(patch) => setProfileForm((f) => ({ ...f, ...patch }))}
          />

          {/* 2 · Day 1 / Day 2 events */}
          <SportStep
            days={days}
            selectedIds={draft.eventIds}
            selectedDayId={selectedDayId}
            onSelectDay={selectDay}
            onSelect={(ev) => selectEvent(ev)}
            events={allEvents}
            loading={eventsLoading}
            isInternal={!isExternal}
          />

          {/* 3 · Details */}
          {event ? (
            <DetailsStep
              event={event}
              draft={draft}
              errors={errors}
              teamType={teamType}
              captainUser={user}
              onPatchDraft={(patch) => {
                setDraft((d) => {
                  const next = { ...d, ...patch };
                  // Keep the captain member slot in sync with the "Team captain
                  // name" field so the two never diverge.
                  if (patch.captainName !== undefined && d.members.length > 0) {
                    next.members = d.members.map((m, i) =>
                      i === 0 && m.role === "player"
                        ? { ...m, name: patch.captainName ?? "" }
                        : m
                    );
                  }
                  return next;
                });
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.teamName;
                  delete next.captainName;
                  return next;
                });
              }}
              onAcceptTerms={(v) => setDraft((d) => ({ ...d, termsAccepted: v }))}
              onUpdateMember={updateMember}
            />
          ) : (
            <StepShell
              title="Your details"
              lead="Pick a Day 1 or Day 2 event above — your participant and team form will appear here."
            >
              <p className="rounded-xl border border-dashed border-edge-strong px-4 py-5 text-center text-sm text-muted">
                Select at least one event to fill in your details.
              </p>
            </StepShell>
          )}

          {/* 4 · Payment — QR + UTR + screenshot upload (external only) */}
          {isExternal ? (
            event ? (
              <PaymentPanel
                events={selectedEvents}
                event={event}
                draft={draft}
                utrNumber={utrNumber}
                onUtrNumber={setUtrNumber}
                file={paymentFile}
                onFileChange={handlePaymentFileChange}
              />
            ) : (
              <StepShell
                title="Payment"
                lead="Select an event above and the amount payable plus the payment QR will appear here."
              >
                <p className="rounded-xl border border-dashed border-edge-strong px-4 py-5 text-center text-sm text-muted">
                  No event selected yet — pick one to see your amount payable, the QR, and the upload fields.
                </p>
              </StepShell>
            )
          ) : (
            <StepShell title="Payment" lead="As a SIMATS student your registration is free of charge.">
              <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                <p className="text-sm leading-relaxed text-emerald-400">
                  Internal SIMATS students register free — no payment needed. Just confirm below.
                </p>
              </div>
            </StepShell>
          )}

          {/* Confirm */}
          <section className="panel diag-stripes p-6 sm:p-10">
            <h2 className="display text-3xl text-foreground sm:text-4xl">Confirm</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              Review your selection in the summary and lock in your entry.
              {!user && " When you confirm you'll be asked to sign in with Google — the flow continues on this same page."}
            </p>
            <hr className="rule-line mt-5 w-32" />
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                id="registration-confirm-btn"
                onClick={handleConfirm}
                disabled={submitting || accountBusy}
                className="clip-angle inline-flex w-full items-center justify-center gap-2 bg-primary px-9 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50 sm:w-auto"
              >
                {submitting
                  ? "Submitting\u2026"
                  : isExternal
                    ? "Confirm & Submit Payment"
                    : "Confirm Registration"}
                {!submitting && <ArrowRight className="h-4 w-4" aria-hidden />}
              </button>
              <p className="text-[11px] leading-relaxed text-muted">
                {isExternal
                  ? "Payment proof is verified by the TechTrove team before your slot is confirmed."
                  : "Your registration is confirmed immediately."}
              </p>
            </div>
          </section>
        </div>

        {/* Live sticky summary — desktop only */}
        <aside className="hidden lg:block">
          <div className="sticky top-28">
            <SummarySidebar
              selectedEvents={selectedEvents}
              draft={draft}
              teamType={teamType}
              onRemove={(ev) => selectEvent(ev)}
            />
          </div>
        </aside>
      </div>

      {/* Mobile sticky total bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
        <MobileSummaryBar selectedEvents={selectedEvents} draft={draft} teamType={teamType} />
      </div>
    </>
  );
}

/* ------------------------------ Account ------------------------------ */

function AccountSection({
  user,
  googlePendingProfile,
  authBusy,
  authError,
  typeChoice,
  onSelectType,
  onSignIn,
  onSaveProfile,
  onSignOut,
  profileForm,
  onProfileField,
}: {
  user: User | null;
  googlePendingProfile: PendingProfile | null;
  authBusy: boolean;
  authError: string | null;
  typeChoice: ParticipantType | null;
  onSelectType: (t: ParticipantType) => void;
  onSignIn: () => void;
  onSaveProfile: () => void;
  onSignOut: () => void;
  profileForm: ProfileDraft;
  onProfileField: (patch: Partial<ProfileDraft>) => void;
}) {
  const chosen = user?.participantType ?? typeChoice ?? "internal";

  // Signed-in visitor with a completed profile: type is locked to the account.
  if (user) {
    const isInternal = user.participantType === "internal";
    return (
      <StepShell title="1 · Your account" lead="Your participant type is locked to this Google account.">
        <div className="panel border-primary/25 p-6">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-gradient-to-br from-primary/20 to-primary-soft/10 text-lg font-bold text-primary-soft ring-1 ring-primary/20">
              {initialsOf(user.fullName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{user.fullName}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <span
              className={
                "border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] " +
                (isInternal
                  ? "border-primary/50 bg-primary/10 text-primary-soft"
                  : "border-edge-strong bg-surface text-muted")
              }
            >
              {isInternal ? "SIMATS Student" : "External Participant"}
            </span>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-muted">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {isInternal
              ? "Register number and account type are locked to your SIMATS profile."
              : "College details and account type are locked to your profile."}
          </p>
          <button
            type="button"
            onClick={onSignOut}
            disabled={authBusy}
            className="mt-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted transition-colors hover:text-red-400 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden /> Sign out &amp; switch account
          </button>
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell
      title="1 · Who you are"
      lead={
        googlePendingProfile
          ? `Signed in as ${googlePendingProfile.email}. Choose your participant type, then finish your profile.`
          : "Pick the participant type that applies to you. Your account is created on this page — no separate sign-up needed."
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-soft">
        Choose your participant type
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Participant type">
        <button
          type="button"
          role="radio"
          aria-checked={chosen === "internal"}
          onClick={() => onSelectType("internal")}
          className={
            "flex items-start gap-4 rounded-xl border p-5 text-left transition-colors " +
            (chosen === "internal"
              ? "border-primary bg-primary/10"
              : "border-edge-strong bg-background hover:border-primary/60")
          }
        >
          <GraduationCap
            className="h-6 w-6 shrink-0 text-primary-soft"
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="display block text-xl text-foreground">Internal</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              SIMATS student — free registration, needs your Saveetha register number.
            </span>
          </span>
          {chosen === "internal" && (
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-soft">Selected</span>
          )}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={chosen === "external"}
          onClick={() => onSelectType("external")}
          className={
            "flex items-start gap-4 rounded-xl border p-5 text-left transition-colors " +
            (chosen === "external"
              ? "border-primary bg-primary/10"
              : "border-edge-strong bg-background hover:border-primary/60")
          }
        >
          <Building2 className="h-6 w-6 shrink-0 text-primary-soft" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="display block text-xl text-foreground">External</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              Participant from another college — registration fee paid via the QR below.
            </span>
          </span>
          {chosen === "external" && (
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-soft">Selected</span>
          )}
        </button>
      </div>

      {googlePendingProfile ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSaveProfile();
          }}
          noValidate
          className="mt-6 space-y-5"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Full name"
              required
              value={profileForm.fullName || googlePendingProfile.fullName}
              onChange={(e) => onProfileField({ fullName: e.target.value })}
              maxLength={120}
              autoComplete="name"
              hint="Defaults to your Google name — edit it if needed."
            />
            <Field
              label="Email"
              value={googlePendingProfile.email}
              readOnly
              className="cursor-not-allowed text-muted"
              hint="From your Google account."
            />
          </div>

          {chosen === "internal" ? (
            <>
              <Field
                label="Registration number"
                required
                value={profileForm.regNumber}
                onChange={(e) => onProfileField({ regNumber: e.target.value })}
                autoComplete="off"
                placeholder="e.g. 19xxxxxxxx"
                hint="This name will be reflected on the certificate."
              />
              <Field
                label="Phone number"
                required
                type="tel"
                value={profileForm.phone}
                onChange={(e) => onProfileField({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                autoComplete="tel"
                maxLength={10}
              />
            </>
          ) : (
            <>
              <Field
                label="College"
                required
                value={profileForm.college}
                onChange={(e) => onProfileField({ college: e.target.value })}
                autoComplete="organization"
              />
              <Field
                label="Phone number"
                required
                type="tel"
                value={profileForm.phone}
                onChange={(e) => onProfileField({ phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                autoComplete="tel"
                maxLength={10}
              />
            </>
          )}

          {authError && (
            <p role="alert" className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs leading-relaxed text-red-300">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={authBusy}
            className="clip-angle inline-flex w-full items-center justify-center gap-2 bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50 sm:w-auto"
          >
            {authBusy ? "Saving\u2026" : "Save & continue"}
          </button>
        </form>
      ) : (
        <div className="mt-6 rounded-xl border border-edge-strong bg-background p-5">
          <p className="text-xs leading-relaxed text-muted">
            Registration uses your Google account — one account, one profile. After you sign in you'll
            land right back here, still on this page.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            disabled={authBusy}
            className="mt-4 flex w-full items-center justify-center gap-3 border border-edge-strong bg-background px-6 py-4 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-surface disabled:opacity-50"
          >
            <GoogleIcon className="h-5 w-5" />
            {authBusy ? "Redirecting…" : "Sign in with Google"}
          </button>
          <p className="mt-2 text-[11px] text-muted">
            Returning participant? Sign in — the wizard continues on this page.
          </p>
        </div>
      )}
    </StepShell>
  );
}

function SummarySidebar({
  selectedEvents,
  draft,
  teamType,
  onRemove,
}: {
  selectedEvents: TechEvent[];
  draft: Draft;
  teamType: ParticipantType;
  onRemove: (ev: TechEvent) => void;
}) {
  const totalFee = computeTotalFee(selectedEvents, draft.members, teamType);
  const isInternal = teamType === "internal";
  const breakdown = isInternal ? [] : feeBreakdown(selectedEvents, draft.members);

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow text-muted">Your entry</p>
      </div>

      <div className="mt-4 space-y-2">
        {selectedEvents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-edge-strong px-3 py-4 text-center text-xs text-muted">
            No event selected yet — pick one below.
          </p>
        ) : (
          selectedEvents.map((ev) => {
            const isTech = isTechPassEvent(ev);
            const isSolo = isSoloTeamEvent(ev);
            const feeLabel = isInternal
              ? "Free"
              : isTech
                ? `Rs ${ev.registrationFee ?? 0} flat`
                : isSolo
                  ? `${formatFee(ev.registrationFee)} / player`
                  : formatFee(ev.registrationFee);
            return (
              <div
                key={ev.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-edge bg-background/40 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{ev.name}</p>
                  <p className="truncate text-[11px] text-muted">{ev.category}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] font-semibold text-primary-soft">{feeLabel}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${ev.name}`}
                    onClick={() => onRemove(ev)}
                    className="text-muted transition-colors hover:text-red-300"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!isInternal && breakdown.length > 0 && (
        <div className="mt-4 border-t border-edge pt-4">
          <p className="eyebrow mb-2 text-muted">Fee breakdown</p>
          <ul className="space-y-1.5 text-xs leading-snug text-muted">
            {breakdown.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex items-end justify-between gap-3 border-t border-edge pt-4">
        <p className="eyebrow text-muted">{isInternal ? "Total" : "Amount payable"}</p>
        <p className="display text-2xl text-primary-soft">
          {isInternal ? "Free" : formatFee(totalFee)}
        </p>
      </div>

      {isInternal ? (
        <p className="mt-2 text-[11px] leading-relaxed text-emerald-400">
          As a SIMATS student your registration is free of charge.
        </p>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          This total updates live as you select events or fill in players.
        </p>
      )}
    </div>
  );
}

function MobileSummaryBar({
  selectedEvents,
  draft,
  teamType,
}: {
  selectedEvents: TechEvent[];
  draft: Draft;
  teamType: ParticipantType;
}) {
  const totalFee = computeTotalFee(selectedEvents, draft.members, teamType);
  const isInternal = teamType === "internal";

  return (
    <div className="border-t border-primary/20 bg-background/90 px-4 py-3 shadow-[0_-10px_30px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            {selectedEvents.length} event{selectedEvents.length === 1 ? "" : "s"} selected
          </p>
          <p className="mt-0.5 truncate text-xs text-foreground/70">
            {selectedEvents.length > 0
              ? selectedEvents.map((e) => e.name).join(", ")
              : "Pick an event to get started."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Total</p>
          <p className="display text-xl text-primary-soft">
            {isInternal ? "Free" : formatFee(totalFee)}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Steps ------------------------------ */

function SportStep({
  days,
  selectedIds,
  selectedDayId,
  onSelectDay,
  onSelect,
  events,
  loading,
  isInternal,
}: {
  days: Day[];
  selectedIds: string[];
  selectedDayId: string | null;
  onSelectDay: (id: string) => void;
  onSelect: (ev: TechEvent) => void;
  events: TechEvent[];
  loading: boolean;
  isInternal: boolean;
}) {
  // Day shells for the tabs always exist via static data, so the day selector
  // renders immediately even before the async events fetch completes.
  const dayTabs = days.length > 0 ? days : staticDays;

  // Determine which day to display.
  // The user's explicit tab choice (selectedDayId) always wins. Only when no
  // day tab has been chosen do we fall back to the first selected event's day
  // (so returning to this step after navigating away shows the relevant day).
  const firstSelectedDay =
    selectedIds.length > 0 && events.find((e) => e.id === selectedIds[0])?.dayId;
  const defaultDayId = dayTabs.find((d) => d.events.some((e) => e.registrationOpen))?.id ?? dayTabs[0]?.id;
  const activeDayId = selectedDayId || (!selectedIds.length ? defaultDayId : firstSelectedDay) || defaultDayId;

  const activeDay = activeDayId ? dayTabs.find((d) => d.id === activeDayId) : undefined;
  const dayEvents = events.filter((e) => e.dayId === activeDayId);
  const openDayEvents = dayEvents.filter((e) => e.registrationOpen);

  const leadText = activeDay
    ? activeDay.id === "day-2"
      ? `You are viewing ${activeDay.label} · ${activeDay.name}. Tick as many events as you want — one registration covers them all${isInternal ? ", free as a SIMATS student" : " on a single flat Rs 75 pass"}.`
      : `You are viewing ${activeDay.label} · ${activeDay.name}. Pick the sport your team is entering. You can register additional teams separately.`
    : "Choose an event to register for.";

  return (
    <StepShell
      title={activeDay ? `Select your ${activeDay.name.toLowerCase()} event` : "Select your event"}
      lead={leadText}
    >
      <div role="tablist" aria-label="Select symposium day" className="grid grid-cols-2 gap-3">
        {dayTabs.map((day) => {
          const active = activeDayId === day.id;
          return (
            <button
              key={day.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelectDay(day.id)}
              className={cn(
                "rounded-xl border p-5 text-center transition-colors",
                active
                  ? "border-primary bg-primary/20"
                  : "border-edge-strong bg-background hover:border-primary/60"
              )}
            >
              <span
                className={cn(
                  "display block text-2xl",
                  active ? "text-primary-soft" : "text-foreground"
                )}
              >
                {day.label}
              </span>
              <span
                className={cn(
                  "mt-1 block text-xs font-bold uppercase tracking-[0.16em]",
                  active ? "text-primary-soft" : "text-muted"
                )}
              >
                {day.name}
              </span>
            </button>
          );
        })}
      </div>

      {!isInternal && (
        <div className="panel mt-6 p-4 text-sm text-foreground">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-soft">How payment works</p>
          <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-muted">
            <li>
              <strong className="text-foreground">Day 2 (Technical and Non-Technical):</strong> a single flat{" "}
              <strong className="text-primary-soft">Rs 75</strong> pass covers every event you tick across the day.
            </li>
            <li>
              <strong className="text-foreground">Day 1 Sports:</strong> pay per sport —{" "}
              Rs 75 per participant for Carrom / Chess (₹75 solo or ₹150 for a 2-player team), Rs 600 for team sports. Each selected sport is billed separately.
            </li>
          </ul>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border border-primary/40 bg-primary/10 px-4 py-3 text-xs text-foreground">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-soft">Selected:</span>
          {events.filter((e) => selectedIds.includes(e.id)).map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1 border border-edge-strong bg-background px-2 py-1">
              {e.name}
              <button
                type="button"
                aria-label={`Remove ${e.name}`}
                onClick={() => onSelect(e)}
                className="text-muted hover:text-red-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[1,2,3,4].map((i) => <div key={i} className="animate-pulse h-16 bg-white/10" />)}
        </div>
      ) : openDayEvents.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No events are open for registration on {activeDay!.label} right now.</p>
      ) : (() => {
        const renderEvent = (ev: TechEvent) => {
          const active = selectedIds.includes(ev.id);
          const isIndiv = isIndividualEvent(ev) || isTechPassEvent(ev);
          const isSoloTeam = isSoloTeamEvent(ev);
          const isSport = isSportEvent(ev);
          // Internal students always register for free — never show monetary amounts
          const feeLabel = isInternal ? "Free" : isTechPassEvent(ev) ? `Rs ${ev.registrationFee ?? 0} flat` : formatFee(ev.registrationFee);
          return (
            <button
              key={ev.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(ev)}
              className={
                "flex items-center gap-4 rounded-xl border p-4 text-left transition-colors " +
                (active
                  ? "border-primary bg-primary/10"
                  : "border-edge bg-background hover:border-primary/50")
              }
            >
              <span className="min-w-0 flex-1">
                <span className="display block text-lg text-foreground">{ev.name}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {isIndiv
                    ? `Individual Event · ${feeLabel}`
                    : isSoloTeam
                      ? `Solo or 2-player team · ${feeLabel}${isInternal ? "" : " / player"}`
                      : `${ev.requiredPlayers} player${ev.requiredPlayers === 1 ? "" : "s"}${isSport && ev.maxSubstitutes ? ` · ${ev.maxSubstitutes} substitute${ev.maxSubstitutes === 1 ? "" : "s"}` : ""} · ${feeLabel}`}
                </span>
              </span>
              {active && <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-soft">Selected</span>}
            </button>
          );
        };

        return activeDayId === "day-2" ? (
          <div className="mt-6 space-y-8">
            <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-soft">
                {isInternal ? "One registration, many events" : "Rs 75 flat pass"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {isInternal
                  ? "Tick as many Technical and Non-Technical events as you like — they all come on a single registration, free for SIMATS students."
                  : "Tick as many Technical and Non-Technical events as you like — a single flat Rs 75 pass covers every event you tick for the whole of Day 2."}
              </p>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary-soft mb-3">Technical Events</h3>
              <div role="radiogroup" aria-label="Technical events" className="grid gap-3 sm:grid-cols-2">
                {openDayEvents.filter((e) => e.category === "Technical").map(renderEvent)}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary-soft mb-3">Non-Technical Events</h3>
              <div role="radiogroup" aria-label="Non-Technical events" className="grid gap-3 sm:grid-cols-2">
                {openDayEvents.filter((e) => e.category !== "Technical").map(renderEvent)}
              </div>
            </div>
          </div>
        ) : (
          <div role="radiogroup" aria-label={`Available events on ${activeDay!.name}`} className="mt-6 grid gap-3 sm:grid-cols-2">
            {openDayEvents.map(renderEvent)}
          </div>
        );
      })()}
    </StepShell>
  );
}

function DetailsStep({
  event,
  draft,
  errors,
  teamType,
  captainUser,
  onPatchDraft,
  onAcceptTerms,
  onUpdateMember,
}: {
  event: TechEvent;
  draft: Draft;
  errors: Record<string, string>;
  teamType: ParticipantType;
  captainUser?: { fullName: string; email: string; phone?: string } | null;
  onPatchDraft: (patch: Partial<Draft>) => void;
  onAcceptTerms: (v: boolean) => void;
  onUpdateMember: (index: number, patch: Partial<MemberDraft>) => void;
}) {
  const isInternal = teamType === "internal";
  const required = event.requiredPlayers ?? 1;
  const isSport = isSportEvent(event);
  const isIndividual = isIndividualEvent(event) || isTechPassEvent(event);
  const isSoloTeam = isSoloTeamEvent(event);
  const maxSubs = isSoloTeam ? 0 : (isSport ? (event.maxSubstitutes ?? 0) : 0);

  const players = draft.members.filter((m) => m.role === "player");
  const subs = draft.members.filter((m) => m.role === "substitute");

  return (
    <StepShell
      title="Your details"
      lead={
        isIndividual
          ? `Everything in one place for ${event.name} — review the rules, then fill in your participant details below.`
          : `Everything in one place for ${event.name} — review the rules, name your team and fill in your ${required} required player${required === 1 ? "" : "s"}${maxSubs > 0 ? ` plus up to ${maxSubs} optional substitute${maxSubs === 1 ? "" : "s"}` : ""}.`
      }
    >
      {/* 1 · Terms and conditions */}
      <section>
        <h3 className="eyebrow text-primary-soft">1 · Terms &amp; conditions</h3>
        <ol className="divide-y divide-edge border-y border-edge">
          {(event.rules ?? []).map((rule, i) => (
            <li key={i} className="flex gap-3 py-2.5">
              <span aria-hidden className="display shrink-0 text-sm text-primary-soft/80">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="text-[13px] leading-relaxed text-muted">{rule}</span>
            </li>
          ))}
        </ol>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-edge-strong bg-background p-4 transition-colors hover:border-primary/50">
          <input
            type="checkbox"
            checked={draft.termsAccepted}
            onChange={(e) => onAcceptTerms(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c3aed]"
          />
          {isInternal ? (
            // Internal students register for free — never mention a fee
            <span className="text-sm leading-relaxed text-foreground">
              I agree to the Terms and Conditions for {event.name}. I understand that my
              registration as a SIMATS student is{" "}
              <strong className="font-semibold text-emerald-400">free of charge</strong>.
            </span>
          ) : (
            <span className="text-sm leading-relaxed text-foreground">
              I agree to the Terms and Conditions, including that the registration fee of{" "}
              <strong className="font-semibold">
                {isTechPassEvent(event) ? `Rs ${event.registrationFee ?? 0} flat` : isSoloTeamEvent(event) ? `${formatFee(event.registrationFee)} per participant` : formatFee(event.registrationFee)}
              </strong>{" "}
              {isTechPassEvent(event)
                ? "covers all selected Technical and Non-Technical events and is non-refundable."
                : isSoloTeamEvent(event)
                  ? "(₹75 solo / ₹150 for a 2-player team) is charged per participant and is non-refundable."
                  : "is a flat fee per team/event and is non-refundable."}
            </span>
          )}
        </label>
      </section>

      {/* 2 · Team details */}
      {!isIndividual && (
        <section className="mt-9">
          <h3 className="eyebrow text-primary-soft">2 · Team details</h3>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field
              label="Team captain name"
              required
              value={draft.captainName}
              onChange={(e) => onPatchDraft({ captainName: e.target.value })}
              error={errors.captainName}
              autoComplete="name"
              hint="This name will be reflected on the certificate."
            />
            <Field
              label="Team name"
              required={!isSoloTeam}
              value={draft.teamName}
              onChange={(e) => onPatchDraft({ teamName: e.target.value })}
              error={errors.teamName}
            />
            <div className="sm:col-span-2">
              <Field
                label="Game / Sport"
                value={event.name}
                readOnly
                hint="Locked to your selected event."
                className="cursor-not-allowed text-muted"
              />
            </div>
          </div>
        </section>
      )}

      {/* 3-ish · Member details */}
      <section className="mt-9">
        <h3 className="eyebrow text-primary-soft">
          {isIndividual ? "2 · Participant details" : "3 · Team members"}
        </h3>
        <p className="mt-2 text-xs text-muted">
          {isIndividual
            ? `Enter your details to register for ${event.name}.`
            : isSoloTeam
              ? `Register solo or as a 2-player team — you can leave the 2nd player slot empty to enter solo. All members are ${isInternal ? "SIMATS students" : "external participants"}.`
              : `${required} players are mandatory${maxSubs > 0 ? `, plus up to ${maxSubs} optional substitute${maxSubs === 1 ? "" : "s"}` : ""}. All members are ${isInternal ? "SIMATS students" : "external participants"}.`}
        </p>

        <fieldset>
          {!isIndividual && (
            <legend className="eyebrow mb-4">
              Players · {isSoloTeam ? "solo or team (max 2)" : "required"}
            </legend>
          )}
          <div className="space-y-6">
            {players.map((m) => {
              const globalIdx = draft.members.indexOf(m);
              const isCaptainSlot = m.position === 1;
              const isOptionalSlot = isSoloTeam && m.position > 1;
              return (
                <MemberCard
                  key={globalIdx}
                  member={m}
                  index={globalIdx}
                  label={isIndividual ? "Participant Details" : `Player ${String(m.position).padStart(2, "0")}${isOptionalSlot ? " · Optional" : ""}`}
                  teamType={teamType}
                  errors={errors}
                  onUpdate={(patch) => onUpdateMember(globalIdx, patch)}
                  isCaptainSlot={isCaptainSlot}
                  captainUser={isCaptainSlot ? captainUser : undefined}
                />
              );
            })}
          </div>
        </fieldset>

        {isSport && maxSubs > 0 && subs.length > 0 && (
          <fieldset className="mt-9">
            <legend className="eyebrow mb-4">Substitutes · optional</legend>
            <div className="space-y-6">
              {subs.map((m) => {
                const globalIdx = draft.members.indexOf(m);
                return (
                  <MemberCard
                    key={globalIdx}
                    member={m}
                    index={globalIdx}
                    label={`Substitute ${String(m.position).padStart(2, "0")}`}
                    teamType={teamType}
                    errors={errors}
                    onUpdate={(patch) => onUpdateMember(globalIdx, patch)}
                  />
                );
              })}
            </div>
          </fieldset>
        )}
      </section>
    </StepShell>
  );
}

function MemberCard({
  member,
  index,
  label,
  teamType,
  errors,
  onUpdate,
  isCaptainSlot = false,
  captainUser,
}: {
  member: MemberDraft;
  index: number;
  label: string;
  teamType: ParticipantType;
  errors: Record<string, string>;
  onUpdate: (patch: Partial<MemberDraft>) => void;
  isCaptainSlot?: boolean;
  captainUser?: { fullName: string; email: string; phone?: string } | null;
}) {
  const isInternal = teamType === "internal";

  return (
    <div className="panel panel-hover border-primary/25 p-5">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="display text-lg text-foreground">{label}</span>
        <span
          className={
            "border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
            (isInternal
              ? "border-primary/50 bg-primary/10 text-primary-soft"
              : "border-edge-strong bg-surface text-muted")
          }
        >
          {isInternal ? "SIMATS Student" : "External"}
        </span>
        {isCaptainSlot && (
          <span className="border border-amber-500/40 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-400">
            Team Captain · You
          </span>
        )}
      </div>

      {/* Captain slot: name locked from profile, only ask email + phone */}
      {isCaptainSlot && captainUser ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Editable name — defaults to the signed-in profile name */}
          <div className="sm:col-span-2">
            <Field
              label="Full name"
              required
              value={member.name || captainUser.fullName}
              onChange={(e) => onUpdate({ name: e.target.value })}
              error={errors[`member-${index}-name`]}
              maxLength={120}
              autoComplete="name"
              hint="Defaults to your profile name — edit it if needed. This name will be reflected on the certificate."
            />
          </div>
          {/* Locked email display */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Email
            </p>
            <div className="flex items-center gap-3 rounded-lg border border-edge bg-background/60 px-4 py-3">
              <span className="flex-1 break-all text-sm text-foreground">{captainUser.email}</span>
              <span className="flex flex-col items-end gap-0.5 text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-primary-soft/70">
                <span>Google</span>
                <span>Account</span>
              </span>
            </div>
          </div>
          {isInternal ? (
            <>
              <Field
                label="Registration number"
                required
                value={member.regNumber}
                onChange={(e) => onUpdate({ regNumber: e.target.value })}
                error={errors[`member-${index}-reg`]}
                placeholder="e.g. 19xxxxxxxx"
                autoComplete="off"
              />
              <Field
                label="Phone number"
                type="tel"
                value={member.phone}
                onChange={(e) => onUpdate({ phone: e.target.value })}
                error={errors[`member-${index}-phone`]}
                placeholder="e.g. 9876543210"
                autoComplete="tel"
              />
            </>
          ) : (
            <Field
              label="Phone number"
              required
              type="tel"
              value={member.phone}
              onChange={(e) => onUpdate({ phone: e.target.value })}
              error={errors[`member-${index}-phone`]}
              placeholder="e.g. 9876543210"
              autoComplete="tel"
            />
          )}
        </div>
      ) : (
        /* Normal member slot: all fields editable */
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            required
            value={member.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            error={errors[`member-${index}-name`]}
            autoComplete="off"
            hint="This name will be reflected on the certificate."
          />
          <Field
            label="Email"
            required
            type="email"
            value={member.email}
            onChange={(e) => onUpdate({ email: e.target.value })}
            error={errors[`member-${index}-email`]}
            placeholder={isInternal ? "e.g. student@gmail.com" : "e.g. alex@example.com"}
            autoComplete="off"
          />
          {isInternal ? (
            <>
              <Field
                label="Registration number"
                required
                value={member.regNumber}
                onChange={(e) => onUpdate({ regNumber: e.target.value })}
                error={errors[`member-${index}-reg`]}
                placeholder="e.g. 19xxxxxxxx"
                autoComplete="off"
              />
              <Field
                label="Phone number"
                type="tel"
                value={member.phone}
                onChange={(e) => onUpdate({ phone: e.target.value })}
                error={errors[`member-${index}-phone`]}
                placeholder="e.g. 9876543210"
                autoComplete="off"
              />
            </>
          ) : (
            <Field
              label="Phone number"
              required
              type="tel"
              value={member.phone}
              onChange={(e) => onUpdate({ phone: e.target.value })}
              error={errors[`member-${index}-phone`]}
              placeholder="e.g. 9876543210"
              autoComplete="off"
            />
          )}
        </div>
      )}
    </div>
  );
}

function PaymentPanel({
  events,
  event,
  draft,
  utrNumber,
  onUtrNumber,
  file,
  onFileChange,
}: {
  events: TechEvent[];
  event: TechEvent;
  draft: Draft;
  utrNumber: string;
  onUtrNumber: (v: string) => void;
  file: File | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const totalFee = computeTotalFee(events, draft.members, "external");
  const isTech = isTechPassEvent(event);
  const isSoloTeam = isSoloTeamEvent(event);
  const filledPlayers = draft.members.filter((m) => m.name.trim() && m.role === "player").length;

  return (
    <div className="panel diag-stripes mt-10 p-6 sm:p-10">
      <h3 className="display text-3xl text-foreground sm:text-4xl">Payment</h3>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Complete the registration fee to confirm your slot. When you hit Confirm, your payment
        proof will be submitted for verification.
      </p>
      <hr className="rule-line mt-5 w-32" />

      <div className="panel mt-7 p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">
              {isTech
                ? events.length > 1
                  ? `${events.length} Technical and Non-Technical events (flat pass)`
                  : `${event.name} (flat pass)`
                : isSoloTeam
                  ? `${event.name} · per participant`
                  : `${event.name} · flat fee`}
            </dt>
            <dd>
              {isTech
                ? formatFee(events[0]?.registrationFee ?? event.registrationFee)
                : isSoloTeam
                  ? `${formatFee(event.registrationFee)} × ${filledPlayers}`
                  : formatFee(event.registrationFee)}
            </dd>
          </div>
          {events.length > 1 && !isTech && (
            <div className="flex flex-col gap-1">
              {events.map((e) => (
                <div key={e.id} className="flex justify-between gap-4">
                  <dt className="text-muted">{e.name}</dt>
                  <dd>{formatFee(e.registrationFee)}</dd>
                </div>
              ))}
            </div>
          )}
          {isTech && events.length > 1 && (
            <p className="text-[11px] text-muted">One flat payment covers all selected Technical and Non-Technical events.</p>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Team</dt>
            <dd>{draft.teamName || draft.captainName || "-"}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-edge pt-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em]">Amount payable</dt>
            <dd className="display text-2xl text-primary-soft">{formatFee(totalFee)}</dd>
          </div>
        </dl>
      </div>

      <div className="panel mt-6 flex flex-col items-center gap-5 p-6 sm:flex-row sm:items-center sm:gap-6">
        <div className="shrink-0 rounded-xl border border-edge bg-white p-2.5">
          <img
            src="/images/events/simats-upi.jpeg"
            alt="QR code to scan and pay your registration fee"
            width={176}
            height={176}
            className="block h-auto w-full max-w-[176px]"
          />
        </div>
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary-soft">
            Scan to pay
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Open any UPI app, scan this QR, and pay the{" "}
            <span className="font-semibold text-primary-soft">{formatFee(totalFee)}</span> shown above.
          </p>
          <p className="mt-1 text-xs text-muted">
            Enter the transaction's 12-digit UTR number and upload the screenshot below.
            Your slot is confirmed only after the payment is verified.
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-5">
        <div>
          <Field
            label="TRANSACTION / UTR NUMBER"
            required
            value={utrNumber}
            onChange={(e) => onUtrNumber(e.target.value)}
            placeholder="e.g. 123456789012"
            hint="GPay → Transaction ID | PhonePe → UTR Number | FamPay → Transaction ID"
          />
          <p className="mt-2 text-xs text-muted">
            If you paid through Google Pay (GPay), enter your Transaction ID. If you paid through PhonePe, enter your UTR number. If you paid through FamPay, enter your Transaction ID.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Payment Screenshot <span className="text-red-400">*</span>
          </label>
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            onChange={onFileChange}
            className="block w-full text-sm text-muted file:mr-4 file:border-0 file:bg-primary/20 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-primary-soft hover:file:bg-primary/30"
          />
          {file && (
            <p className="mt-1 text-[11px] font-medium text-emerald-400">
              Attached: {file.name}
            </p>
          )}
          <p className="mt-1 text-[10px] text-muted">Max file size: 2MB. Allowed formats: JPG, PNG, WEBP.</p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
            The screenshot must clearly show your UTR / transaction ID so the payment can be verified.
          </p>
        </div>
      </div>
    </div>
  );
}