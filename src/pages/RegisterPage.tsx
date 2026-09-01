import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Lock } from "lucide-react";
import { useAllEvents, useEvent } from "../lib/useEvents";
import type { TechEvent, Day } from "../lib/eventStore";
import { days as staticDays } from "../data/techtrove";
import { formatFee, formatPerPerson } from "../lib/utils";
import { cn } from "../lib/utils";
import { api } from "../lib/api";
import { validateUploadFile, uploadPaymentProof } from "../lib/storage";
import type { ParticipantType, RegistrationMember } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Field } from "../components/ui/Field";
import { RegistrationStepper, StepShell } from "../components/registration/RegistrationStepper";
import type { StepId } from "../components/registration/RegistrationStepper";

import {
  isSportEvent,
  isIndividualEvent,
  validateRegisterNumber,
  validateEmail,
  validatePhoneNumber,
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
  eventId: string | null;
  termsAccepted: boolean;
  captainName: string;
  teamName: string;
  members: MemberDraft[];
}

function makeEmptyMembers(event: TechEvent | undefined): MemberDraft[] {
  if (!event) return [];
  const isSport = isSportEvent(event);
  const required = event.requiredPlayers ?? 1;
  const maxSubs = isSport ? (event.maxSubstitutes ?? 0) : 0;

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

function computeTotalFee(event: TechEvent | undefined, members: MemberDraft[], teamType: ParticipantType): number {
  if (teamType === "internal") return 0;
  const filled = members.filter((m) => m.name.trim()).length;
  return (event?.registrationFee ?? 0) * filled;
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
  const [draft, setDraft] = useState<Draft>(() => {
    if (!preselectedId) return initialDraft;
    return { ...initialDraft, eventId: preselectedId, members: [] };
  });
  const event = draft.eventId ? allEvents.find((e) => e.id === draft.eventId) : undefined;
  const activeEvent = event ?? preselectedEvent;
  const isIndividual = isIndividualEvent(activeEvent);

  const stepIds: StepId[] = isIndividual
    ? (teamType === "internal" ? ["sport", "terms", "members", "review"] : ["sport", "terms", "members", "review", "payment"])
    : (teamType === "internal" ? ["sport", "terms", "team", "members", "review"] : ["sport", "terms", "team", "members", "review", "payment"]);

  const [step, setStep] = useState<StepId>(preselectedId ? "terms" : "sport");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  // Once events load, populate members + selected day for pre-selected event if not already done
  useEffect(() => {
    if (preselectedEvent && draft.eventId === preselectedEvent.id && draft.members.length === 0) {
      setDraft((d) => ({
        ...d,
        members: makeEmptyMembers(preselectedEvent),
        captainName: d.captainName || (user?.fullName ?? ""),
      }));
      setSelectedDayId(preselectedEvent.dayId);
    }
  }, [preselectedEvent, draft.eventId, draft.members.length, user]);

  function selectEvent(ev: TechEvent) {
    const indiv = isIndividualEvent(ev);
    setDraft((d) => ({
      ...d,
      eventId: ev.id,
      members: makeEmptyMembers(ev),
      captainName: d.captainName || (user?.fullName ?? ""),
      teamName: indiv ? (user?.fullName ?? ev.name) : d.teamName,
    }));
    setSelectedDayId(ev.dayId);
    setErrors({});
  }

  function selectDay(dayId: string) {
    setSelectedDayId(dayId);
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
    const i = stepIds.indexOf(step);
    setStep(stepIds[Math.min(i + 1, stepIds.length - 1)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    const i = stepIds.indexOf(step);
    setStep(stepIds[Math.max(i - 1, 0)]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleRegistration(paymentDetails?: { utrNumber: string; paymentScreenshotPath?: string; paymentScreenshotUrl?: string }): Promise<void> {
    if (!event) throw new Error("Select an event first.");
    const indiv = isIndividualEvent(event);
    const firstMember = draft.members[0];
    const captainName = draft.captainName.trim() || firstMember?.name.trim() || user?.fullName || "";
    const teamName = indiv
      ? (draft.teamName.trim() || captainName || event.name)
      : draft.teamName.trim();

    const registration = await api.createRegistration({
      eventId: event.id,
      teamName,
      captainName,
      members: buildMembersFromDraft(draft.members, teamType),
      termsAccepted: draft.termsAccepted,
      ...paymentDetails,
    });
    navigate(`/register/success?code=${encodeURIComponent(registration.registrationCode)}`);
  }

  let stepBody: ReactNode;
  switch (step) {
    case "sport":
      stepBody = (
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
      break;
    case "terms":
      stepBody = event && (
        <TermsStep
          event={event}
          accepted={draft.termsAccepted}
          onAccept={(v) => setDraft((d) => ({ ...d, termsAccepted: v }))}
        />
      );
      break;
    case "team":
      stepBody = (
        <TeamStep
          event={event}
          draft={draft}
          errors={errors}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
      );
      break;
    case "members":
      stepBody = (
        <MembersStep
          event={event}
          draft={draft}
          errors={errors}
          teamType={teamType}
          onUpdateMember={updateMember}
        />
      );
      break;
    case "review":
      stepBody = event && <ReviewStep event={event} draft={draft} teamType={teamType} />;
      break;
    case "payment":
      stepBody = event && <PaymentStep event={event} draft={draft} teamType={teamType} onPay={handleRegistration} />;
      break;
  }

  const isFirst = step === "sport";
  const isLast = step === stepIds[stepIds.length - 1];
  
  const nextLabel =
    isLast && step === "review"
      ? "Confirm Registration"
      : step === "review"
      ? "Proceed to payment"
      : "Continue";

  function handleNextClick() {
    validateAndNext();
  }

  function validateAndNext(): void {
    const nextErrors: Record<string, string> = {};

    if (step === "sport" && !draft.eventId) nextErrors.step = "Select an event to continue.";
    if (step === "terms" && !draft.termsAccepted) nextErrors.step = "You must accept the Terms and Conditions.";
    if (step === "team" && !isIndividual) {
      if (!draft.teamName.trim()) nextErrors.teamName = "Team name is required.";
      if (!draft.captainName.trim()) nextErrors.captainName = "Captain name is required.";
    }
    if (step === "members" && event) {
      const required = event.requiredPlayers ?? 1;
      const isSport = isSportEvent(event);

      draft.members.forEach((m, i) => {
        if (!isSport && m.role === "substitute") return;

        if (m.role === "player" && !m.name.trim()) {
          const slotLabel = isIndividual ? "Participant" : `Player ${String(m.position).padStart(2, "0")}`;
          nextErrors[`member-${i}-name`] = `${slotLabel} name is required.`;
        }

        if (m.name.trim()) {
          const emailErr = validateEmail(m.email, teamType);
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

      const filledPlayers = draft.members.filter((m) => m.role === "player" && m.name.trim()).length;
      if (filledPlayers < required) {
        nextErrors.step = isIndividual ? "Please enter your participant details." : `Fill in all ${required} required player slots.`;
      }
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      if (isLast && step === "review") {
        handleRegistration().catch((e) => setErrors({ step: e.message }));
      } else {
        goNext();
      }
    }
  }

  return (
    <>
      <RegistrationStepper current={step} steps={stepIds} />

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
              onClick={handleNextClick}
              disabled={isLast && step === "review" && Object.keys(errors).length > 0 && "step" in errors}
              className="clip-angle inline-flex items-center justify-center gap-2 bg-primary px-9 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
            >
              {nextLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </>
  );
}



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
            const isIndiv = isIndividualEvent(ev);
            const isSport = isSportEvent(ev);
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
                    {isIndiv
                      ? `Individual Event · ${formatPerPerson(ev.registrationFee)}`
                      : `${ev.requiredPlayers} player${ev.requiredPlayers === 1 ? "" : "s"}${isSport && ev.maxSubstitutes ? ` · ${ev.maxSubstitutes} substitute${ev.maxSubstitutes === 1 ? "" : "s"}` : ""} · ${formatPerPerson(ev.registrationFee)}`}
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
          <strong className="font-semibold">{formatPerPerson(event.registrationFee)}</strong>
          (charged for each player and substitute entered) is non-refundable.
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
  const required = event?.requiredPlayers ?? 1;
  const isSport = isSportEvent(event);
  const isIndividual = isIndividualEvent(event);
  const maxSubs = isSport ? (event?.maxSubstitutes ?? 0) : 0;

  const players = draft.members.filter((m) => m.role === "player");
  const subs = draft.members.filter((m) => m.role === "substitute");

  return (
    <StepShell
      title={isIndividual ? "Participant details" : "Team members"}
      lead={
        isIndividual
          ? `Enter your details to register for ${event?.name ?? "this event"}.`
          : `${required} players are mandatory${maxSubs > 0 ? `, plus up to ${maxSubs} optional substitutes` : ""} for ${event?.name ?? "this event"}. All members are ${teamType === "internal" ? "SIMATS students" : "external participants"}.`
      }
    >
      <fieldset>
        {!isIndividual && <legend className="eyebrow mb-4">Players · required</legend>}
        <div className="space-y-6">
          {players.map((m) => {
            const globalIdx = draft.members.indexOf(m);
            return (
              <MemberCard
                key={globalIdx}
                member={m}
                index={globalIdx}
                label={isIndividual ? "Participant Details" : `Player ${String(m.position).padStart(2, "0")}`}
                teamType={teamType}
                errors={errors}
                onUpdate={(patch) => onUpdateMember(globalIdx, patch)}
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
          placeholder={isInternal ? "e.g. student@saveetha.com" : "e.g. alex@example.com"}
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
  const isIndividual = isIndividualEvent(event);
  const isSport = isSportEvent(event);
  const filledMembers = draft.members.filter((m) => m.name.trim());
  const filledPlayers = filledMembers.filter((m) => m.role === "player").length;
  const filledSubs = filledMembers.filter((m) => m.role === "substitute").length;
  const totalFee = computeTotalFee(event, draft.members, teamType);

  return (
    <StepShell title="Review your entry" lead="Check everything carefully. Changes after payment cannot be made.">
      <dl>
        <ReviewRow term="Event">{event.name}</ReviewRow>
        <ReviewRow term="Category">{event.category}</ReviewRow>
        {!isIndividual && <ReviewRow term="Team name">{draft.teamName}</ReviewRow>}
        <ReviewRow term={isIndividual ? "Participant" : "Captain"}>{draft.captainName || filledMembers[0]?.name || "-"}</ReviewRow>
        <ReviewRow term="Participant type">
          <span
            className={
              "inline-flex border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] " +
              (teamType === "internal"
                ? "border-primary/50 bg-primary/10 text-primary-soft"
                : "border-edge-strong bg-surface text-muted")
            }
          >
            {teamType === "internal" ? "SIMATS Student" : "External Participant"}
          </span>
        </ReviewRow>
        <ReviewRow term="Fee per person">{teamType === "internal" ? "Free" : formatPerPerson(event.registrationFee)}</ReviewRow>
        {!isIndividual && (
          <ReviewRow term="Team members">
            {filledPlayers} player{filledPlayers === 1 ? "" : "s"}
            {isSport && filledSubs > 0 ? ` · ${filledSubs} substitute${filledSubs === 1 ? "" : "s"}` : ""}
          </ReviewRow>
        )}
        <ReviewRow term="Total registration fee">{formatFee(totalFee)}</ReviewRow>
        <ReviewRow term="Terms accepted">{draft.termsAccepted ? "Yes" : "No"}</ReviewRow>
      </dl>

      <div className="mt-6 border-t border-edge pt-6">
        <span className="eyebrow block text-muted mb-4">{isIndividual ? "Participant details" : `Team members (${filledMembers.length})`}</span>
        <div className="space-y-3">
          {filledMembers.map((m, i) => (
            <div key={i} className="border border-edge bg-surface/40 p-4">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-foreground">{m.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  {isIndividual ? "Participant" : `${m.role} · #${m.position}`}
                </span>
              </div>
              <div className="grid gap-1 text-xs text-muted sm:grid-cols-3">
                <span>{m.email}</span>
                {teamType === "internal" && m.regNumber && (
                  <span className="font-mono text-primary-soft">{m.regNumber}</span>
                )}
                {m.phone && <span>{m.phone}</span>}
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
  teamType,
  onPay,
}: {
  event: TechEvent;
  draft: Draft;
  teamType?: ParticipantType;
  onPay: (details: { utrNumber: string; paymentScreenshotPath?: string; paymentScreenshotUrl?: string }) => Promise<void>;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [utrNumber, setUtrNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const totalFee = computeTotalFee(event, draft.members, teamType);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }
    
    const validation = validateUploadFile(selected);
    if (!validation.valid) {
      setError(validation.error ?? "Invalid file.");
      setFile(null);
      return;
    }

    setError(null);
    setFile(selected);
  }

  async function pay() {
    if (!utrNumber.trim()) {
      setError("Please enter the UTR / Transaction number.");
      return;
    }
    if (!file) {
      setError("Please upload a payment screenshot.");
      return;
    }
    if (!user?.id) {
      setError("You must be signed in to submit payment proof.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      // Generate a unique registration id segment for the upload path
      const regFileId = `reg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      // Upload directly to private 'uploads/payment-proofs/{user_id}/{regFileId}.{ext}'
      const storagePath = await uploadPaymentProof(user.id, regFileId, file);

      // Complete Registration with the relative storage path
      await onPay({
        utrNumber: utrNumber.trim(),
        paymentScreenshotPath: storagePath,
        paymentScreenshotUrl: storagePath,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment could not be recorded. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepShell title="Payment Proof" lead="Complete the registration fee to confirm your slot. Upload your payment screenshot.">
      <div className="border border-edge-strong bg-background p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">{event.name} · fee per person</dt>
            <dd>{formatPerPerson(event.registrationFee)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Team</dt>
            <dd>{draft.teamName}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-edge pt-3">
            <dt className="text-xs font-semibold uppercase tracking-[0.16em]">Amount payable</dt>
            <dd className="display text-2xl text-primary-soft">{formatFee(totalFee)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-8 space-y-5">
        <Field
          label="UTR / Transaction Number"
          required
          value={utrNumber}
          onChange={(e) => setUtrNumber(e.target.value)}
          placeholder="e.g. 123456789012"
          hint="Enter the 12-digit UPI transaction ID."
        />

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Payment Screenshot <span className="text-red-400">*</span>
          </label>
          <input
            type="file"
            accept="image/jpeg, image/png, image/webp"
            onChange={handleFileChange}
            className="block w-full text-sm text-muted file:mr-4 file:border-0 file:bg-primary/20 file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-primary-soft hover:file:bg-primary/30"
          />
          <p className="mt-1 text-[10px] text-muted">Max file size: 2MB. Allowed formats: JPG, PNG, WEBP.</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-5 border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={busy || !utrNumber.trim() || !file}
        className="clip-angle mt-7 flex w-full items-center justify-center gap-2 bg-primary px-6 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-primary-soft disabled:opacity-50"
      >
        {busy ? "Processing" : `Submit Payment Proof`}
      </button>
    </StepShell>
  );
}
