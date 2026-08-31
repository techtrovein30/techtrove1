create table if not exists public.days (
  id          text primary key,
  label       text not null,
  name        text not null,
  description text not null default '',
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);

alter table public.days enable row level security;

create policy "Anyone can view days"
  on public.days for select
  using (true);

create policy "Admins can manage days"
  on public.days for all
  using (exists (
    select 1 from public.admin_allowlist 
    where email = lower(auth.jwt()->>'email')
  ));

-- Insert default days
insert into public.days (id, label, name, description, status) values
  ('day-1', 'Day 1', 'Sports', 'The symposium opens on the field. Compete across eight sports — from cricket to chess — and bring glory to your college.', 'active'),
  ('day-2', 'Day 2', 'Technical', 'A day dedicated to technical excellence. Six events spanning paper presentation, hackathon, debugging, quiz, logo making, and the multi-stage Tech Maze.', 'active'),
  ('day-3', 'Day 3', 'Non-Technical', 'Unleash your creativity and perform on the biggest stage. Eight non-technical events spanning fashion, dance, music, gaming, and more.', 'active')
on conflict (id) do nothing;
