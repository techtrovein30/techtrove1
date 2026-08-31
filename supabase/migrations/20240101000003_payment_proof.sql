-- =============================================================================
-- TechTrove 3.0 — Payment Proof for External Participants
-- =============================================================================

-- 1. Add payment proof columns to registrations_external
alter table public.registrations_external add column if not exists utr_number text;
alter table public.registrations_external add column if not exists payment_screenshot_url text;

-- 2. Create Storage bucket for payment screenshots (1MB limit, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment_screenshots',
  'payment_screenshots',
  true,
  1048576, -- 1MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do update set
  public = true,
  file_size_limit = 1048576,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 3. Set up RLS for the storage bucket
drop policy if exists "Anyone can upload payment screenshots" on storage.objects;
create policy "Anyone can upload payment screenshots"
  on storage.objects for insert
  with check ( bucket_id = 'payment_screenshots' );

drop policy if exists "Anyone can view payment screenshots" on storage.objects;
create policy "Anyone can view payment screenshots"
  on storage.objects for select
  using ( bucket_id = 'payment_screenshots' );
