import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Info, Lock } from "lucide-react";
import { useAllEvents, useEvent } from "../lib/useEvents";
import type { TechEvent, Day } from "../lib/eventStore";
import { days as staticDays } from "../data/techtrove";
import { formatFee } from "../lib/utils";
import { cn } from "../lib/utils";
import { api } from "../lib/mockApi";
import type { ParticipantType, RegistrationMember } from "../lib/mockApi";
import { useAuth } from "../context/AuthContext";
import { Field } from "../components/ui/Field";
import { RegistrationStepper, StepShell } from "../components/registration/RegistrationStepper";
import type { StepId } from "../components/registration/RegistrationStepper";

interface MemberDraft {
  name: string;
  role: "player" | "substitute";
  position: number;
  email: string;
  regNumber: string;
  phone: string;
}

interface Draft {
  eventId: string | null;
  termsAccepted: boolean;
  captainName: string;
  teamName: string;
  members: MemberDraft[];
}

function makeEmptyMembers(required: number, maxSubs: number): MemberDraft[] {
  const players: MemberDraft[] = Array.from({ length: required }, (_, i) => ({
    name: "",
    role: "player",
    position: i + 1,
    email: "",
    regNumber: "",
    phone: "",
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

const initialDraft: Draft = {
  eventId: null,
  termsAccepted: false,
  captainName: "",
  teamName: "",
  members: [],
};

export function RegisterPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const preselectedEventId = searchParams.get("event") ?? undefined;
  const { event: preselected } = useEvent(preselectedEventId);

  return (
    <div className="reveal-up mx-auto max-w-4xl px-4 pb-24 pt-28 sm:px-6 md:pt-36 lg:px-8">
      <p className="eyebrow">Registration</p>
      <h1 className="display mt-2 text-4xl text-foreground sm:text-6xl">Team registration</h1>
      <hr className="rule-line mt-5 w-40" />

      <div className="mt-10">
        {user ? (
          <RegistrationFlow preselectedId={preselected?.id ?? null} />
        ) : (
          <LoginFirstPanel eventId={preselectedEventId ?? null} />
        )}
      </div>
    </div>
  );
}

function LoginFirstPanel({ eventId }: { eventId: string | null }) {
  return (
    <div className="clip-angle diag-stripes border border-edge bg-surface p-8 text-center sm:p-12">
      <span className="mx-auto flex h-14 w-14 items-center justify-center border border-primary/50 bg-primary/10">
        <Lock className="h-6 w-6 text-primary-soft" aria-hidden />
      </span>
      <h2 className="display mt-6 text-3xl text-foreground">Login first</h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        Registration requires a TechTrove 3.0 account. Sign in with your username, registration
        number or email, or create a new participant account.
      </p>
      <Link
        to={eventId ? `/login?next=${encodeURIComponent(`/register?event=${eventId}`)}` : "/login?next=%2Fregister"}
        className="clip-angle mt-8 inline-flex bg-primary px-8 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
      >
        Go to login
      </Link>
    </div>
  );
}

function RegistrationFlow({ preselectedId }: { preselectedId: string | null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const teamType: ParticipantType = user?.participantType ?? "internal";
  const { days, events: allEvents, loading: eventsLoading } = useAllEvents();

  // Resolve preselected event from DB data
  const preselectedEvent = preselectedId ? allEvents.find((e) => e.id === preselectedId) : undefined;

  const [step, setStep] = useState<StepId>(preselectedId ? "terms" : "sport");
  const [draft, setDraft] = useState<Draft>(() => {
    if (!preselectedId) return initialDraft;
    // We can't use preselectedEvent here synchronously on first render — start with eventId set,
    // members will be fixed once the event loads (see the effect below).
    return { ...initialDraft, eventId: preselectedId, members: [] };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  // Once events load, populate members + selected day for pre-selected event if not already done
  useMemo(() => {
    if (preselectedEvent && draft.eventId === preselectedEvent.id && draft.members.length === 0) {
      setDraft((d) => ({
        ...d,
        members: makeEmptyMembers(preselectedEvent.requiredPlayers ?? 1, preselectedEvent.maxSubstitutes ?? 0),
      }));
      setSelectedDayId(preselectedEvent.dayId);
    }
  }, [preselectedEvent]);

  const event = draft.eventId ? allEvents.find((e) => e.id === draft.eventId) : undefined;

  function selectEvent(ev: TechEvent) {
    setDraft((d) => ({
      ...d,
      eventId: ev.id,
      members: makeEmptyMembers(ev.requiredPlayers ?? 1, ev.maxSubstitutes ?? 0),
    }));
    setSelectedDayId(ev.dayId);
    setErrors({});
  }

  function selectDay(dayId: string) {
    setSelectedDayId(dayId);
    // Switching days clears any previously chosen event so selection always
    // belongs to the currently viewed day.
    setDraft((d) => (d.eventId ? { ...d, eventId: null, members: [] } : d));
    setErrors({});
  }

  function updateMember(index: number, patch: Partial<MemberDraft>) {
    setDraft((d) => ({
      ...d,
      members: d.members.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    }));
  }

  function goNext() {
    const i = STEP_IDS.indexOf(step);
    setStep(STEP_IDS[Math.min(i + 1, STEP_IDS.length - 1)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    const i = STEP_IDS.indexOf(step);
    setStep(STEP_IDS[Math.max(i - 1, 0)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePayment(): Promise<void> {
    if (!event) throw new Error("Select an event first.");
    const registration = await api.createRegistration({
      eventId: event.id,
      teamName: draft.teamName,
      captainName: draft.captainName,
      members: buildMembersFromDraft(draft.members, teamType),
      termsAccepted: draft.termsAccepted,
    });
    navigate(`/register/success?code=${encodeURIComponent(registration.registrationCode)}`);
  }

  const stepBody = useMemo(() => {
    switch (step) {
      case "sport":
        return (
          <SportStep
            days={days}
            selectedId={draft.eventId}
            selectedDayId={selectedDayId}
            onSelectDay={selectDay}
            onSelect={(ev) => selectEvent(ev)}
            events={allEvents}
            loading={eventsLoading}
          />
        );
      case "terms":
        return event && (
          <TermsStep
            event={event}
            accepted={draft.termsAccepted}
            onAccept={(v) => setDraft((d) => ({ ...d, termsAccepted: v }))}
          />
        );
      case "team":
        return (
          <TeamStep
            event={event}
            draft={draft}
            errors={errors}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          />
        );
      case "members":
        return (
          <MembersStep
            event={event}
            draft={draft}
            errors={errors}
            teamType={teamType}
            onUpdateMember={updateMember}
          />
        );
      case "review":
        return event && <ReviewStep event={event} draft={draft} teamType={teamType} />;
      case "payment":
        return event && <PaymentStep event={event} draft={draft} onPay={handlePayment} />;
    }
  }, [step, draft, errors, event]);

  // Step-level validation before advancing.
  function validateAndNext(): void {
    const nextErrors: Record<string, string> = {};

    if (step === "sport") {
      if (!draft.eventId) nextErrors.step = "Select an event to continue.";
    }

    if (step === "terms") {
      if (!draft.termsAccepted) nextErrors.step = "You must accept the Terms and Conditions.";
    }

    if (step === "team") {
      if (!draft.teamName.trim()) nextErrors.teamName = "Team name is required.";
      if (!draft.captainName.trim()) nextErrors.captainName = "Captain name is required.";
    }

    if (step === "members" && event) {
      const required = event.requiredPlayers ?? 0;
      draft.members.forEach((m, i) => {
        if (m.role === "player" && !m.name.trim()) {
          nextErrors[`member-${i}-name`] = `Player ${String(m.position).padStart(2, "0")} name is required.`;
        }
        if (m.name.trim() && !m.email.trim()) {
          nextErrors[`member-${i}-email`] = `Email is required for ${m.name || `member ${m.position}`}.`;
        }
        if (m.name.trim() && teamType === "internal" && !m.regNumber.trim()) {
          nextErrors[`member-${i}-reg`] = `Registration number is required for SIMATS students.`;
        }
        if (m.name.trim() && teamType === "external" && !m.phone.trim()) {
          nextErrors[`member-${i}-phone`] = `Phone number is required for external participants.`;
        }
      });
      const filledPlayers = draft.members.filter((m) => m.role === "player" && m.name.trim()).length;
      if (filledPlayers < required) {
        nextErrors.step = `Fill in all ${required} required player slots.`;
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) goNext();
  }

  const isFirst = step === "sport";
  const isLast = step === "payment";
  const nextLabel =
    step === "terms" ? "Proceed" : step === "review" ? "Proceed to payment" : step === "sport" ? "Continue" : "Continue";

  return (
    <>
      <RegistrationStepper current={step} />

      <div key={step} className="reveal-up mt-8 space-y-6">
        {stepBody}

        {"step" in errors && errors.step && (
          <p role="alert" className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
            {errors.step}
          </p>
        )}

        {!isLast && (
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={isFirst}
              className="clip-angle inline-flex items-center justify-center gap-2 border border-edge-strong px-7 py-4 text-xs font-semibold uppercase tracking-[0.18em] transition-colors hover:border-primary hover:text-primary-soft disabled:pointer-events-none disabled:opacity-30"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
            <button
              type="button"
              onClick={validateAndNext}
              className="clip-angle inline-flex items-center justify-center gap-2 bg-primary px-9 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft"
            >
              {nextLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

const STEP_IDS: StepId[] = ["sport", "terms", "team", "members", "review", "payment"];

/* ------------------------------ Steps ------------------------------ */

function SportStep({
  days,
  selectedId,
  selectedDayId,
  onSelectDay,
  onSelect,
  events,
  loading,
}: {
  days: Day[];
  selectedId: string | null;
  selectedDayId: string | null;
  onSelectDay: (id: string) => void;
  onSelect: (ev: TechEvent) => void;
  events: TechEvent[];
  loading: boolean;
}) {
  // Day shells for the tabs always exist via static data, so the day selector
  // renders immediately even before the async events fetch completes.
  const dayTabs = days.length > 0 ? days : staticDays;

  // Determine which day to display. If the selected event belongs to a day,
  // restore that day even if the user navigated back to this step. Otherwise
  // default to the first available day so events are visible immediately.
  const chosenDayId =
    (selectedId && events.find((e) => e.id === selectedId)?.dayId) || selectedDayId;
  const defaultDayId = dayTabs.find((d) => d.events.some((e) => e.registrationOpen))?.id ?? dayTabs[0]?.id;
  const activeDayId = chosenDayId || defaultDayId;

  const activeDay = activeDayId ? dayTabs.find((d) => d.id === activeDayId) : undefined;
  const dayEvents = events.filter((e) => e.dayId === activeDayId);
  const openDayEvents = dayEvents.filter((e) => e.registrationOpen);

  return (
    <StepShell
      title={activeDay ? `Select your ${activeDay.name.toLowerCase()} event` : "Select your event"}
      lead={
        activeDay
          ? `You are viewing ${activeDay.label} · ${activeDay.name}. Pick the event your team is entering. You can register additional teams separately.`
          : "Choose an event to register for."
      }
    >
      <div role="tablist" aria-label="Select symposium day" className="grid grid-cols-3 gap-3">
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
                "border p-5 text-center transition-colors",
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

      {loading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[1,2,3,4].map((i) => <div key={i} className="animate-pulse h-16 bg-white/10" />)}
        </div>
      ) : openDayEvents.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No events are open for registration on {activeDay!.label} right now.</p>
      ) : (
        <div role="radiogroup" aria-label={`Available events on ${activeDay!.name}`} className="mt-6 grid gap-3 sm:grid-cols-2">
          {openDayEvents.map((ev) => {
            const active = ev.id === selectedId;
            return (
              <button
                key={ev.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(ev)}
                className={
                  "flex items-center gap-4 border p-4 text-left transition-colors " +
                  (active
                    ? "border-primary bg-primary/10"
                    : "border-edge bg-background hover:border-primary/50")
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="display block text-lg text-foreground">{ev.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {ev.requiredPlayers} player{ev.requiredPlayers === 1 ? "" : "s"} · {ev.maxSubstitutes} substitute{ev.maxSubstitutes === 1 ? "" : "s"} · {formatFee(ev.registrationFee)}
                  </span>
                </span>
                {active && <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary-soft">Selected</span>}
              </button>
            );
          })}
        </div>
      )}
    </StepShell>
  );
}

function TermsStep({
  event,
  accepted,
  onAccept,
}: {
  event: TechEvent;
  accepted: boolean;
  onAccept: (v: boolean) => void;
}) {
  return (
    <StepShell
      title={`Terms and conditions`}
      lead={`Read the rules for ${event.name}. By proceeding you accept these terms on behalf of your team.`}
    >
      <ol className="divide-y divide-edge border-y border-edge">
        {(event.rules ?? []).map((rule, i) => (
          <li key={i} className="flex gap-4 py-3.5">
            <span aria-hidden className="display shrink-0 text-base text-primary-soft/80">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="pt-px text-sm leading-relaxed text-muted">{rule}</span>
          </li>
        ))}
      </ol>

      <label className="mt-7 flex cursor-pointer items-start gap-3 border border-edge-strong bg-background p-4">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAccept(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#7c3aed]"
        />
        <span className="text-sm leading-relaxed text-foreground">
          I agree to the Terms and Conditions, including that the registration fee of{" "}
          <strong className="font-semibold">{formatFee(event.registrationFee)}</strong> is
          non-refundable.
        </span>
      </label>
    </StepShell>
  );
}

function TeamStep({
  event,
  draft,
  errors,
  onChange,
}: {
  event?: TechEvent;
  draft: Draft;
  errors: Record<string, string>;
  onChange: (patch: Partial<Draft>) => void;
}) {
  return (
    <StepShell title="Team details" lead="Name your team and confirm the captain. The game is locked to your selected sport.">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Team captain name"
          required
          value={draft.captainName}
          onChange={(e) => onChange({ captainName: e.target.value })}
          error={errors.captainName}
          autoComplete="name"
          hint="This name will be reflected on the certificate."
        />
        <Field
          label="Team name"
          required
          value={draft.teamName}
          onChange={(e) => onChange({ teamName: e.target.value })}
          error={errors.teamName}
        />
        <div className="sm:col-span-2">
          <Field
            label="Game / Sport"
            value={event?.name ?? ""}
            readOnly
            hint="Locked to your selected event."
            className="cursor-not-allowed text-muted"
          />
        </div>
      </div>
    </StepShell>
  );
}

function MembersStep({
  event,
  draft,
  errors,
  teamType,
  onUpdateMember,
}: {
  event?: TechEvent;
  draft: Draft;
  errors: Record<string, string>;
  teamType: ParticipantType;
  onUpdateMember: (index: number, patch: Partial<MemberDraft>) => void;
}) {
  const required = event?.requiredPlayers ?? 0;
  const maxSubs = event?.maxSubstitutes ?? 0;

  const players = draft.members.filter((m) => m.role === "player");
  const subs = draft.members.filter((m) => m.role === "substitute");

  return (
    <StepShell
      title="Team members"
      lead={`${required} players are mandatory${maxSubs > 0 ? `, plus up to ${maxSubs} optional substitutes` : ""} for ${event?.name ?? "this event"}. All members are ${teamType === "internal" ? "SIMATS students" : "external participants"} since you are registering as ${teamType === "internal" ? "a SIMATS student" : "an external participant"}.`}
    >
      <fieldset>
        <legend className="eyebrow mb-4">Players · required</legend>
        <div className="space-y-6">
          {players.map((m) => {
            const globalIdx = draft.members.indexOf(m);
            return (
              <MemberCard
                key={globalIdx}
                member={m}
                index={globalIdx}
                label={`Player ${String(m.position).padStart(2, "0")}`}
                teamType={teamType}
                errors={errors}
                onUpdate={(patch) => onUpdateMember(globalIdx, patch)}
              />
            );
          })}
        </div>
      </fieldset>

      {maxSubs > 0 && subs.length > 0 && (
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
}: {
  member: MemberDraft;
  index: number;
  label: string;
  teamType: ParticipantType;
  errors: Record<string, string>;
  onUpdate: (patch: Partial<MemberDraft>) => void;
}) {
  const isInternal = teamType === "internal";

  return (
    <div className="border border-edge bg-surface/40 p-5 transition-colors hover:border-primary/30">
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
      </div>

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
          autoComplete="off"
        />
        {isInternal ? (
          <Field
            label="Registration number"
            required
            value={member.regNumber}
            onChange={(e) => onUpdate({ regNumber: e.target.value })}
            error={errors[`member-${index}-reg`]}
            placeholder="e.g. 230701XXX"
            autoComplete="off"
          />
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
    </div>
  );
}

function ReviewRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-edge py-3.5 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <dt className="shrink-0 text-xs font-semibold uppercase tracking-[0.16em] text-muted">{term}</dt>
      <dd className="min-w-0 text-sm text-foreground sm:text-right">{children}</dd>
    </div>
  );
}

function ReviewStep({ event, draft, teamType }: { event: TechEvent; draft: Draft; teamType: ParticipantType }) {
  const filledMembers = draft.members.filter((m) => m.name.trim());

  return (
    <StepShell title="Review your entry" lead="Check everything carefully. Changes after payment cannot be made.">
      <dl>
        <ReviewRow term="Sport">{event.name}</ReviewRow>
        <ReviewRow term="Category">{event.category}</ReviewRow>
        <ReviewRow term="Team name">{draft.teamName}</ReviewRow>
        <ReviewRow term="Captain">{draft.captainName}</ReviewRow>
        <ReviewRow term="Team type">
          <span
            className={
              "inline-flex border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
              (teamType === "internal"
                ? "border-primary/50 bg-primary/10 text-primary-soft"
                : "border-edge-strong bg-surface text-muted")
            }
          >
            {teamType === "internal" ? "SIMATS Students" : "External Participants"}
          </span>
        </ReviewRow>
        <ReviewRow term="Registration fee">{formatFee(event.registrationFee)}</ReviewRow>
        <ReviewRow term="Terms accepted">{draft.termsAccepted ? "Yes" : "No"}</ReviewRow>
      </dl>

      <div className="mt-6 border-t border-edge pt-6">
        <span className="eyebrow block text-muted mb-4">Team members ({filledMembers.length})</span>
        <div className="space-y-3">
          {filledMembers.map((m, i) => (
            <div key={i} className="border border-edge bg-surface/40 p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-foreground">{m.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {m.role} · #{m.position}
                </span>
              </div>
              <div className="grid gap-1 text-xs text-muted sm:grid-cols-3">
                <span>{m.email}</span>
                {teamType === "internal" && m.regNumber && (
                  <span className="font-mono text-primary-soft">{m.regNumber}</span>
                )}
                {teamType === "external" && m.phone && <span>{m.phone}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-6 text-xs text-muted">
        Something wrong? Use Back to revisit earlier steps and correct your details.
      </p>
    </StepShell>
  );
}

function PaymentStep({
  event,
  draft,
  onPay,
}: {
  event: TechEvent;
  draft: Draft;
  onPay: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      await onPay();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be recorded. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepShell title="Payment" lead="Complete the registration fee to confirm your slot.">
      <div className="border border-edge-strong bg-background p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{event.name} · registration fee</dt>
            <dd>{formatFee(event.registrationFee)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Team</dt>
            <dd>{draft.teamName}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-edge pt-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em]">Amount payable</dt>
            <dd className="display text-2xl text-primary-soft">{formatFee(event.registrationFee)}</dd>
          </div>
        </dl>
      </div>

      <p className="mt-5 flex items-start gap-2 border border-edge bg-elevated px-4 py-3 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-soft" aria-hidden />
        Demo checkout: no real money moves and no card details are collected. A real payment
        gateway will be connected later; your registration is confirmed instantly in this demo.
      </p>

      {error && (
        <p role="alert" className="mt-5 border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="clip-angle mt-7 flex w-full items-center justify-center gap-2 bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
      >
        {busy ? "Processing" : `Pay ${formatFee(event.registrationFee)} (demo)`}
      </button>
    </StepShell>
  );
}
