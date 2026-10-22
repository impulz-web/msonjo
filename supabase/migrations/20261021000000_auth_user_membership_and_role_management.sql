begin;

create or replace function public.add_auth_user_to_msonjo()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  msonjo_business_id uuid;
begin
  select id
    into msonjo_business_id
  from public.businesses
  where slug = 'msonjo-gas-house-hold';

  if msonjo_business_id is null then
    raise exception 'MSONJO business is missing; apply the MSONJO migrations before creating Auth users.';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (msonjo_business_id, new.id, 'attendant')
  on conflict (business_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.add_auth_user_to_msonjo() from public, anon, authenticated;

drop trigger if exists add_auth_user_to_msonjo on auth.users;
create trigger add_auth_user_to_msonjo
  after insert on auth.users
  for each row execute function public.add_auth_user_to_msonjo();

insert into public.business_members (business_id, user_id, role)
select business.id, auth_user.id, 'attendant'
from public.businesses as business
cross join auth.users as auth_user
where business.slug = 'msonjo-gas-house-hold'
on conflict (business_id, user_id) do nothing;

grant select, insert, update on public.business_members to service_role;

commit;
