-- Convert the dedicated inventory workspace to the single MSONJO business.
-- This migration intentionally aborts if multiple businesses exist: merging
-- unrelated tenants would risk changing records and expanding user access.

begin;

do $$
declare
  existing_business_count bigint;
begin
  select count(*) into existing_business_count from public.businesses;

  if existing_business_count > 1 then
    raise exception
      'MSONJO migration stopped: multiple businesses exist. Back up the database and reconcile tenant data and memberships before retrying.';
  elsif existing_business_count = 1 then
    update public.businesses
    set name = 'MSONJO GAS & HOUSE HOLD',
        slug = 'msonjo-gas-house-hold',
        category = 'retail'
    where id = (select id from public.businesses limit 1);
  else
    insert into public.businesses (id, name, slug, category)
    values (
      '00000000-0000-4000-8000-000000000001',
      'MSONJO GAS & HOUSE HOLD',
      'msonjo-gas-house-hold',
      'retail'
    );
  end if;
end;
$$;

insert into public.subscriptions (business_id)
select id from public.businesses where slug = 'msonjo-gas-house-hold'
on conflict (business_id) do nothing;

grant select on public.businesses to service_role;
grant select, insert on public.business_members to service_role;

drop policy if exists businesses_update_owner on public.businesses;
revoke update on public.businesses from public, anon, authenticated;

drop function public.create_business(text, text, text);

commit;
