-- =============================================================================
-- TechTrove 3.0 — Unified Storage for Payment Proofs & ID Cards
-- =============================================================================

-- 1. Ensure columns exist on registrations_external
alter table public.registrations_external add column if not exists utr_number text;
alter table public.registrations_external add column if not exists payment_screenshot_path text;

-- Backwards compatibility: populate payment_screenshot_path from payment_screenshot_url if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'registrations_external' 
      and column_name = 'payment_screenshot_url'
  ) then
    update public.registrations_external
    set payment_screenshot_path = payment_screenshot_url
    where payment_screenshot_path is null and payment_screenshot_url is not null;
  end if;
end$$;

-- 2. Add ID card storage path support to participant tables
alter table public.internal_participants add column if not exists id_card_path text;
alter table public.external_participants add column if not exists id_card_path text;

-- 3. Decommission old public bucket policies (clean up access)
drop policy if exists "Anyone can upload payment screenshots" on storage.objects;
drop policy if exists "Anyone can view payment screenshots" on storage.objects;
-- Note: Supabase restricts direct SQL deletion of buckets via protect_delete().
-- To remove the old 'payment_screenshots' bucket completely, delete it from 
-- Supabase Dashboard → Storage → payment_screenshots → Delete Bucket.

-- 4. Create the unified private 'uploads' bucket (2MB limit, images only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false, -- PRIVATE bucket (signed URLs required)
  2097152, -- 2MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/webp']
) on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 5. Storage RLS Policies for 'uploads' bucket
-- Note: storage.objects already has RLS enabled by default by Supabase.

-- Drop any existing policies on 'uploads' to ensure clean state
drop policy if exists "Users can upload to their own folder in uploads" on storage.objects;
drop policy if exists "Users can view their own uploads" on storage.objects;
drop policy if exists "Admins can view all uploads" on storage.objects;
drop policy if exists "Users and admins can delete uploads" on storage.objects;

-- Policy A: Users can ONLY upload into their own folder:
-- 'payment-proofs/{user_id}/...' or 'id-cards/{user_id}/...'
create policy "Users can upload to their own folder in uploads"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'uploads'
    and (
      (storage.foldername(name))[1] in ('payment-proofs', 'id-cards')
      and (storage.foldername(name))[2] = (select auth.uid()::text)
    )
  );

-- Policy B: Users can view their own uploads
create policy "Users can view their own uploads"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'uploads'
    and (storage.foldername(name))[2] = (select auth.uid()::text)
  );

-- Policy C: Admins can view/generate signed URLs for all uploads in the bucket
create policy "Admins can view all uploads"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'uploads'
    and public.is_admin()
  );

-- Policy D: Users can update or delete their own uploads, admins can delete any
create policy "Users and admins can delete uploads"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'uploads'
    and (
      (storage.foldername(name))[2] = (select auth.uid()::text)
      or public.is_admin()
    )
  );
