-- Function to calculate fee based on members array and event registration fee
create or replace function public.calculate_registration_fee()
returns trigger
language plpgsql
security definer
as $$
declare
  per_person_fee numeric;
  member_count int;
begin
  -- Get the per-person fee from the events table
  select registration_fee into per_person_fee
  from public.events
  where id = new.event_id;

  if per_person_fee is null then
    per_person_fee := 0;
  end if;

  -- Count the members array
  member_count := jsonb_array_length(new.members);

  -- Set the fee securely
  new.fee := per_person_fee * member_count;
  
  return new;
end;
$$;

-- Apply trigger to internal registrations
drop trigger if exists trg_calculate_fee_internal on public.registrations_internal;
create trigger trg_calculate_fee_internal
  before insert or update of members, event_id on public.registrations_internal
  for each row execute function public.calculate_registration_fee();

-- Apply trigger to external registrations
drop trigger if exists trg_calculate_fee_external on public.registrations_external;
create trigger trg_calculate_fee_external
  before insert or update of members, event_id on public.registrations_external
  for each row execute function public.calculate_registration_fee();
