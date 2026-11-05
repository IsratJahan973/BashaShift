begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'renter', 'mover')),
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  phone text not null check (phone ~ '^01[3-9][0-9]{8}$'),
  service_area text not null default 'Banasree' check (service_area in
    ('Banasree','Rampura','Khilgaon','Mirpur','Dhanmondi','Uttara','Mohammadpur','Bashundhara','Gulshan','Other')),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id),
  owner_name text not null check (char_length(trim(owner_name)) between 1 and 100),
  title text not null check (char_length(trim(title)) between 1 and 160),
  area text not null check (char_length(trim(area)) between 1 and 80),
  block text not null check (char_length(trim(block)) between 1 and 120),
  rent integer not null check (rent between 1000 and 5000000),
  beds integer not null check (beds between 1 and 20),
  baths integer not null check (baths between 1 and 20),
  sqft integer not null default 0 check (sqft between 0 and 100000),
  floor integer not null default 0 check (floor between 0 and 100),
  lift boolean not null default false,
  balcony boolean not null default false,
  parking boolean not null default false,
  available date not null,
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'published' check (status in ('draft','published','archived')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.property_images (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null unique,
  position integer not null default 0 check (position between 0 and 19),
  created_at timestamptz not null default now()
);

create table public.viewing_inquiries (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  renter_id uuid not null default auth.uid() references public.profiles(id),
  renter_name text not null check (char_length(trim(renter_name)) between 1 and 100),
  renter_phone text not null check (renter_phone ~ '^01[3-9][0-9]{8}$'),
  preferred_date date not null,
  message text not null default '' check (char_length(message) <= 2000),
  status text not null default 'requested' check (status in ('requested','acknowledged')),
  created_at timestamptz not null default now()
);

-- Sensitive columns are NOT granted to API roles, even when the row is visible.
-- Retrieve contacts only through get_request_contact after its authorization check.
create table public.moving_requests (
  id uuid primary key default gen_random_uuid(),
  renter_id uuid not null references public.profiles(id),
  property_id uuid references public.properties(id) on delete set null,
  from_area text not null check (char_length(trim(from_area)) between 1 and 80),
  to_area text not null check (char_length(trim(to_area)) between 1 and 80),
  moving_date date not null,
  km numeric not null check (km between 0 and 500),
  from_floor integer not null check (from_floor between 0 and 100),
  to_floor integer not null check (to_floor between 0 and 100),
  has_lift boolean not null default true,
  estimate integer not null check (estimate between 0 and 5000000),
  contact_consent boolean not null default false,
  customer_name text not null check (char_length(trim(customer_name)) between 1 and 100),
  customer_phone text not null check (customer_phone ~ '^01[3-9][0-9]{8}$'),
  from_address text not null default '' check (char_length(from_address) <= 500),
  to_address text not null default '' check (char_length(to_address) <= 500),
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'open' check (status in ('open','awaiting_call','confirmed','cancelled')),
  created_at timestamptz not null default now(),
  unique(id, renter_id)
);

create table public.moving_inventory (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.moving_requests(id) on delete cascade,
  category text not null check (category in
    ('Bed','Sofa','Refrigerator','Wardrobe','Dining table','Washing machine','Boxes','Other')),
  quantity integer not null check (quantity between 1 and 1000),
  unique(request_id, category)
);

create table public.mover_offers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.moving_requests(id),
  mover_id uuid not null default auth.uid() references public.profiles(id),
  amount integer not null check (amount between 100 and 500000),
  status text not null default 'pending' check (status in ('pending','selected','not_selected','declined')),
  created_at timestamptz not null default now(),
  unique(id, request_id, mover_id)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  offer_id uuid not null,
  renter_id uuid not null references public.profiles(id),
  mover_id uuid not null references public.profiles(id),
  amount integer not null check (amount between 100 and 500000),
  status text not null default 'awaiting_call' check (status in ('awaiting_call','confirmed','declined')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(request_id, renter_id) references public.moving_requests(id, renter_id),
  foreign key(offer_id, request_id, mover_id) references public.mover_offers(id, request_id, mover_id),
  check (status <> 'confirmed' or confirmed_at is not null)
);

create index properties_owner_idx on public.properties(owner_id);
create index properties_search_idx on public.properties(area, rent, beds) where status = 'published';
create index property_images_property_idx on public.property_images(property_id, position);
create index inquiries_renter_idx on public.viewing_inquiries(renter_id, created_at desc);
create index inquiries_property_idx on public.viewing_inquiries(property_id, created_at desc);
create index requests_renter_idx on public.moving_requests(renter_id, created_at desc);
create index requests_feed_idx on public.moving_requests(from_area, moving_date) where status = 'open';
create index inventory_request_idx on public.moving_inventory(request_id);
create index offers_mover_idx on public.mover_offers(mover_id, created_at desc);
create index offers_request_idx on public.mover_offers(request_id);
create unique index offers_one_pending_idx on public.mover_offers(request_id, mover_id) where status = 'pending';
create unique index bookings_one_active_idx on public.bookings(request_id) where status in ('awaiting_call','confirmed');
create index bookings_renter_idx on public.bookings(renter_id, created_at desc);
create index bookings_mover_idx on public.bookings(mover_id, created_at desc);

create function app_private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, role, display_name, phone, service_area)
  values (new.id, new.raw_user_meta_data->>'role', trim(new.raw_user_meta_data->>'display_name'),
    regexp_replace(new.raw_user_meta_data->>'phone', '\D', '', 'g'),
    coalesce(nullif(new.raw_user_meta_data->>'service_area',''), 'Banasree'));
  return new;
end;
$$;
revoke all on function app_private.create_profile() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function app_private.create_profile();

create function app_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
revoke all on function app_private.touch_updated_at() from public, anon, authenticated;
create trigger profiles_updated before update on public.profiles for each row execute function app_private.touch_updated_at();
create trigger properties_updated before update on public.properties for each row execute function app_private.touch_updated_at();

create function app_private.current_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;
revoke all on function app_private.current_role() from public, anon, authenticated;
grant execute on function app_private.current_role() to authenticated;

-- This definer helper avoids recursive request/offer/booking RLS policies.
create function app_private.can_read_request(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.moving_requests r where r.id = p_id and (
      r.renter_id = (select auth.uid()) or
      exists (select 1 from public.bookings b where b.request_id = r.id
        and b.mover_id = (select auth.uid()) and b.status in ('awaiting_call','confirmed')) or
      (r.status = 'open' and exists (select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'mover' and p.is_available
          and (lower(p.service_area) = lower(r.from_area) or p.service_area = 'Other')))
    )
  );
$$;
revoke all on function app_private.can_read_request(uuid) from public, anon, authenticated;
grant execute on function app_private.can_read_request(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.property_images enable row level security;
alter table public.viewing_inquiries enable row level security;
alter table public.moving_requests enable row level security;
alter table public.moving_inventory enable row level security;
alter table public.mover_offers enable row level security;
alter table public.bookings enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy properties_public_read on public.properties for select to anon, authenticated using (status = 'published' or owner_id = (select auth.uid()));
create policy properties_owner_insert on public.properties for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select app_private.current_role()) = 'owner');
create policy properties_owner_update on public.properties for update to authenticated
  using (owner_id = (select auth.uid()) and (select app_private.current_role()) = 'owner')
  with check (owner_id = (select auth.uid()) and (select app_private.current_role()) = 'owner');
create policy properties_owner_delete on public.properties for delete to authenticated using (owner_id = (select auth.uid()) and (select app_private.current_role()) = 'owner');
create policy images_read on public.property_images for select to anon, authenticated
  using (exists (select 1 from public.properties p where p.id = property_id and (p.status = 'published' or p.owner_id = (select auth.uid()))));
create policy images_owner_insert on public.property_images for insert to authenticated with check (
  exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and split_part(storage_path,'/',1) = (select auth.uid())::text
  and split_part(storage_path,'/',2) = property_id::text
  and exists (select 1 from storage.objects o where o.bucket_id = 'property-images' and o.name = storage_path));
create policy images_owner_delete on public.property_images for delete to authenticated
  using (exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())));
create policy inquiries_participants_read on public.viewing_inquiries for select to authenticated using (
  renter_id = (select auth.uid()) or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())));
create policy inquiries_renter_insert on public.viewing_inquiries for insert to authenticated with check (
  renter_id = (select auth.uid()) and (select app_private.current_role()) = 'renter'
  and exists (select 1 from public.properties p where p.id = property_id and p.status = 'published'));
create policy requests_eligible_read on public.moving_requests for select to authenticated using (app_private.can_read_request(id));
create policy inventory_eligible_read on public.moving_inventory for select to authenticated using (app_private.can_read_request(request_id));
create policy offers_participants_read on public.mover_offers for select to authenticated using (
  mover_id = (select auth.uid()) or exists (select 1 from public.moving_requests r where r.id = request_id and r.renter_id = (select auth.uid())));
create policy offers_mover_insert on public.mover_offers for insert to authenticated with check (
  mover_id = (select auth.uid()) and status = 'pending' and exists (
    select 1 from public.moving_requests r join public.profiles p on p.id = (select auth.uid())
    where r.id = request_id and r.status = 'open' and p.role = 'mover' and p.is_available
      and (lower(p.service_area) = lower(r.from_area) or p.service_area = 'Other')));
create policy bookings_participants_read on public.bookings for select to authenticated using (renter_id = (select auth.uid()) or mover_id = (select auth.uid()));

create function app_private.validate_new_offer() returns trigger
language plpgsql security definer set search_path = '' as $$
declare request public.moving_requests;
begin
  select * into request from public.moving_requests r where r.id = new.request_id for update;
  if request.status is distinct from 'open' or new.mover_id is distinct from auth.uid()
    or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'mover'
      and p.is_available and (lower(p.service_area) = lower(request.from_area) or p.service_area = 'Other')) then
    raise exception 'This account cannot offer on this request' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_new_offer() from public, anon, authenticated;
create trigger offers_validate before insert on public.mover_offers for each row execute function app_private.validate_new_offer();

-- Explicit grants prevent role changes, state forgery, and private-column leaks.
revoke all on public.profiles, public.properties, public.property_images, public.viewing_inquiries,
  public.moving_requests, public.moving_inventory, public.mover_offers, public.bookings from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name, phone, service_area, is_available) on public.profiles to authenticated;
grant select on public.properties, public.property_images to anon, authenticated;
grant insert(title, owner_name, area, block, rent, beds, baths, sqft, floor, lift, balcony, parking, available, description, status)
  on public.properties to authenticated;
grant update(title, owner_name, area, block, rent, beds, baths, sqft, floor, lift, balcony, parking, available, description, status)
  on public.properties to authenticated;
grant delete on public.properties to authenticated;
grant insert(property_id, storage_path, position), delete on public.property_images to authenticated;
grant select on public.viewing_inquiries, public.moving_inventory, public.mover_offers, public.bookings to authenticated;
grant insert(property_id, renter_name, renter_phone, preferred_date, message) on public.viewing_inquiries to authenticated;
grant insert(request_id, amount) on public.mover_offers to authenticated;
grant select(id, renter_id, property_id, from_area, to_area, moving_date, km, from_floor, to_floor, has_lift, estimate, contact_consent, status, created_at)
  on public.moving_requests to authenticated;

create function public.create_moving_request(details jsonb, inventory jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare request_id uuid;
begin
  if (select app_private.current_role()) is distinct from 'renter' then
    raise exception 'Only renters can create moving requests' using errcode = '42501';
  end if;
  if jsonb_typeof(inventory) is distinct from 'array' or jsonb_array_length(inventory) not between 1 and 8 then
    raise exception 'Provide between one and eight inventory categories' using errcode = '22023';
  end if;
  if nullif(details->>'property_id','') is not null and not exists (
    select 1 from public.properties p where p.id = (details->>'property_id')::uuid and p.status = 'published') then
    raise exception 'Property is not published' using errcode = '42501';
  end if;
  insert into public.moving_requests(renter_id, property_id, from_area, to_area, moving_date, km,
    from_floor, to_floor, has_lift, estimate, contact_consent, customer_name, customer_phone, from_address, to_address, notes)
  values (auth.uid(), nullif(details->>'property_id','')::uuid, details->>'from_area', details->>'to_area',
    (details->>'moving_date')::date, (details->>'km')::numeric, (details->>'from_floor')::integer,
    (details->>'to_floor')::integer, (details->>'has_lift')::boolean, (details->>'estimate')::integer,
    coalesce((details->>'contact_consent')::boolean,false), details->>'customer_name',
    regexp_replace(details->>'customer_phone','\D','','g'), coalesce(details->>'from_address',''),
    coalesce(details->>'to_address',''), coalesce(details->>'notes','')) returning id into request_id;
  insert into public.moving_inventory(request_id, category, quantity)
    select request_id, item->>'name', (item->>'qty')::integer from jsonb_array_elements(inventory) item;
  return request_id;
end;
$$;
revoke all on function public.create_moving_request(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.create_moving_request(jsonb,jsonb) to authenticated;

create function public.acknowledge_inquiry(inquiry_id uuid, acknowledged boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.viewing_inquiries i set status = case when acknowledged then 'acknowledged' else 'requested' end
    where i.id = inquiry_id and exists (select 1 from public.properties p where p.id = i.property_id and p.owner_id = auth.uid());
  if not found then raise exception 'Inquiry is unavailable' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.acknowledge_inquiry(uuid,boolean) from public, anon, authenticated;
grant execute on function public.acknowledge_inquiry(uuid,boolean) to authenticated;

create function public.get_property_contact(property_id uuid)
returns table(display_name text, phone text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.properties p where p.id = property_id and (
    p.owner_id = auth.uid() or exists (select 1 from public.viewing_inquiries i where i.property_id = p.id and i.renter_id = auth.uid()))) then
    raise exception 'Send a viewing inquiry before requesting owner contact details' using errcode = '42501';
  end if;
  return query select owner.display_name, owner.phone from public.profiles owner join public.properties p on p.owner_id = owner.id where p.id = property_id;
end;
$$;
revoke all on function public.get_property_contact(uuid) from public, anon, authenticated;
grant execute on function public.get_property_contact(uuid) to authenticated;

-- All booking transitions lock the request first, so competing selections serialize.
create function public.select_mover_offer(offer_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare chosen public.mover_offers; request public.moving_requests; booking_id uuid;
begin
  select * into chosen from public.mover_offers o where o.id = offer_id;
  select * into request from public.moving_requests r where r.id = chosen.request_id for update;
  if request.renter_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Request is unavailable' using errcode = '42501';
  end if;
  -- Re-read the offer after taking the request lock, avoiding stale concurrent state.
  select * into chosen from public.mover_offers o where o.id = offer_id;
  if request.status <> 'open' or chosen.status <> 'pending' then
    raise exception 'Offer is no longer available' using errcode = '23514';
  end if;
  insert into public.bookings(request_id, offer_id, renter_id, mover_id, amount)
    values (request.id, chosen.id, request.renter_id, chosen.mover_id, chosen.amount) returning id into booking_id;
  update public.mover_offers o set status = case when o.id = chosen.id then 'selected' else 'not_selected' end where o.request_id = request.id;
  update public.moving_requests set status = 'awaiting_call' where id = request.id;
  return booking_id;
end;
$$;
revoke all on function public.select_mover_offer(uuid) from public, anon, authenticated;
grant execute on function public.select_mover_offer(uuid) to authenticated;

create function public.confirm_booking(request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare request public.moving_requests;
begin
  select * into request from public.moving_requests r where r.id = request_id for update;
  if request.renter_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Request is unavailable' using errcode = '42501';
  end if;
  if request.status <> 'awaiting_call' then raise exception 'No booking awaits confirmation' using errcode = '23514'; end if;
  update public.bookings b set status = 'confirmed', confirmed_at = now() where b.request_id = request.id and b.status = 'awaiting_call';
  if not found then raise exception 'No active booking' using errcode = '23514'; end if;
  update public.moving_requests set status = 'confirmed' where id = request.id;
end;
$$;
revoke all on function public.confirm_booking(uuid) from public, anon, authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;

create function public.reopen_moving_request(request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare request public.moving_requests;
begin
  select * into request from public.moving_requests r where r.id = request_id for update;
  if request.renter_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'Request is unavailable' using errcode = '42501';
  end if;
  if request.status <> 'awaiting_call' then raise exception 'Only a selected request can be reopened' using errcode = '23514'; end if;
  update public.bookings b set status = 'declined' where b.request_id = request.id and b.status = 'awaiting_call';
  update public.mover_offers o set status = 'declined' where o.request_id = request.id;
  update public.moving_requests set status = 'open' where id = request.id;
end;
$$;
revoke all on function public.reopen_moving_request(uuid) from public, anon, authenticated;
grant execute on function public.reopen_moving_request(uuid) to authenticated;

create function public.get_request_contact(request_id uuid)
returns table(customer_name text, customer_phone text, from_address text, to_address text, notes text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.moving_requests r where r.id = request_id and (
    r.renter_id = auth.uid() or (r.contact_consent and exists (
      select 1 from public.bookings b where b.request_id = r.id and b.mover_id = auth.uid() and b.status in ('awaiting_call','confirmed'))))) then
    raise exception 'Contact is not shared with this account' using errcode = '42501';
  end if;
  return query select r.customer_name, r.customer_phone, r.from_address, r.to_address, r.notes from public.moving_requests r where r.id = request_id;
end;
$$;
revoke all on function public.get_request_contact(uuid) from public, anon, authenticated;
grant execute on function public.get_request_contact(uuid) to authenticated;

create function public.mover_summaries(mover_ids uuid[])
returns table(id uuid, display_name text, service_area text, is_available boolean, phone text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.service_area, p.is_available,
    case when p.id = auth.uid() or exists (select 1 from public.bookings b
      where b.mover_id = p.id and b.renter_id = auth.uid() and b.status in ('awaiting_call','confirmed')) then p.phone else null end
  from public.profiles p where p.role = 'mover' and p.id = any(mover_ids) and (
    p.id = auth.uid() or exists (select 1 from public.mover_offers o join public.moving_requests r on r.id = o.request_id
      where o.mover_id = p.id and r.renter_id = auth.uid()));
$$;
revoke all on function public.mover_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.mover_summaries(uuid[]) to authenticated;

-- Private bucket: signed URLs are issued only after Storage's RLS read check.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('property-images', 'property-images', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy property_photos_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'property-images' and exists (select 1 from public.properties p
    where p.id::text = (storage.foldername(name))[2] and p.owner_id::text = (storage.foldername(name))[1]
      and (p.status = 'published' or p.owner_id = (select auth.uid()))));
create policy property_photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'property-images' and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.properties p where p.id::text = (storage.foldername(name))[2] and p.owner_id = (select auth.uid())));
create policy property_photos_delete on storage.objects for delete to authenticated using (
  bucket_id = 'property-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Never publish profiles, inquiry contacts, or private request columns to Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.properties, public.property_images;
  end if;
end;
$$;

commit;
