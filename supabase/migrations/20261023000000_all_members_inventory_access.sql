-- Allow every MSONJO business member to operate inventory, sales, and reports.
-- Owner-only user administration and subscription access remain restricted.

begin;

create or replace function public.has_business_role(
  p_business_id uuid,
  p_allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.business_members as member
      where member.business_id = p_business_id
        and member.user_id = auth.uid()
        and (
          member.role = any(coalesce(p_allowed_roles, array[]::text[]))
          or (
            p_allowed_roles @> array['owner', 'manager']::text[]
            and member.role = 'attendant'
          )
        )
    );
$$;

do $$
declare
  function_signature text;
  function_oid regprocedure;
  function_definition text;
  updated_definition text;
  operation_functions text[] := array[
    'public.list_products(uuid,text,text,text,text,integer,integer)',
    'public.create_product(uuid,text,text,text,numeric,numeric,integer,integer,uuid)',
    'public.get_product_detail(uuid,uuid)',
    'public.get_sale_detail(uuid,uuid)',
    'public.adjust_stock(uuid,uuid,integer,text,text,uuid)',
    'public.get_business_dashboard(uuid)',
    'public.get_business_reports(uuid,date,date)',
    'public.edit_sale_with_payment(uuid,uuid,uuid,text,jsonb,numeric,text,text)',
    'public.get_daily_sales(uuid,date,date)',
    'public.create_sale_with_lines(uuid,text,text,jsonb)',
    'public.get_sale_detail_with_manual_items(uuid,uuid)',
    'public.edit_sale_with_lines(uuid,uuid,uuid,text,jsonb,numeric,text,text)'
  ];
begin
  foreach function_signature in array operation_functions loop
    function_oid := to_regprocedure(function_signature);
    if function_oid is null then
      raise exception 'Required MSONJO operation function is missing: %', function_signature;
    end if;

    function_definition := pg_get_functiondef(function_oid);
    updated_definition := replace(
      function_definition,
      'current_role in (''owner'', ''manager'')',
      'current_role is not null'
    );
    updated_definition := replace(
      updated_definition,
      'current_role <> ''attendant''',
      'current_role is not null'
    );
    if position('current_role in (''owner'', ''manager'')' in updated_definition) > 0
      or position('current_role <> ''attendant''' in updated_definition) > 0
    then
      raise exception 'Unconverted role restriction remains in operation function: %',
        function_signature;
    end if;

    if updated_definition <> function_definition then
      execute updated_definition;
    end if;
  end loop;
end;
$$;

drop policy if exists sale_accounts_select_authorized_sales on public.sale_accounts;
create policy sale_accounts_select_authorized_sales
  on public.sale_accounts for select to authenticated
  using (
    public.is_business_member(business_id)
  );

drop policy if exists sale_payments_select_authorized_sales on public.sale_payments;
create policy sale_payments_select_authorized_sales
  on public.sale_payments for select to authenticated
  using (
    public.is_business_member(business_id)
  );

commit;
