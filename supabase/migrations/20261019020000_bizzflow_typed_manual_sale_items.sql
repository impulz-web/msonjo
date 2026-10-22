-- Store typed/manual sale lines without inserting products or changing stock.
-- This migration adds a table and replaces RPC implementations only; it does
-- not alter existing table definitions.

begin;

create table public.sale_manual_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sale_id uuid not null,
  line_number integer not null check (line_number > 0),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null
    check (unit_price >= 0 and unit_price <> 'NaN'::numeric),
  unit_cost_snapshot numeric(12, 2)
    check (unit_cost_snapshot is null or (unit_cost_snapshot >= 0 and unit_cost_snapshot <> 'NaN'::numeric)),
  created_at timestamptz not null default now(),
  constraint sale_manual_items_business_sale_fk
    foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete restrict,
  constraint sale_manual_items_sale_line_unique unique (business_id, sale_id, line_number)
);

create index sale_manual_items_business_sale_idx
  on public.sale_manual_items (business_id, sale_id);

alter table public.sale_manual_items enable row level security;
revoke all on public.sale_manual_items from public, anon, authenticated;

create or replace function public.create_sale_with_lines(
  p_business_id uuid,
  p_idempotency_key text,
  p_payment_method text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  authenticated_user_id uuid := auth.uid();
  current_role text;
  catalog_items jsonb;
  manual_items jsonb;
  normalized_payload jsonb;
  existing_payload jsonb;
  new_sale_id uuid;
  existing_sale_id uuid;
  sale_total numeric(12, 2) := 0;
  item record;
  locked_product public.products%rowtype;
  line_number integer := 0;
  item_cost numeric(12, 2);
begin
  select role into current_role
  from public.business_members
  where business_id = p_business_id and user_id = authenticated_user_id;

  if authenticated_user_id is null or current_role is null then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;
  if p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 1 and 128
    or p_payment_method is null
    or p_payment_method not in ('cash', 'mpesa', 'other')
    or p_items is null
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 100
  then
    raise exception using errcode = '22023', message = 'Invalid sale request';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) as entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or (
        entry.value->>'kind' = 'catalog'
        and (
          coalesce(entry.value->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(entry.value->>'quantity', '') !~ '^[1-9][0-9]*$'
          or coalesce(entry.value->>'quantity', '')::numeric > 1000000
        )
      )
      or (
        entry.value->>'kind' = 'manual'
        and (
          char_length(btrim(coalesce(entry.value->>'name', ''))) not between 1 and 160
          or coalesce(entry.value->>'quantity', '') !~ '^[1-9][0-9]*$'
          or coalesce(entry.value->>'quantity', '')::numeric > 1000000
          or coalesce(entry.value->>'unit_price', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
          or coalesce(entry.value->>'unit_price', '')::numeric > 9999999999.99
          or (
            current_role in ('owner', 'manager')
            and coalesce(entry.value->>'unit_cost', '') <> ''
            and (
              entry.value->>'unit_cost' !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
              or (entry.value->>'unit_cost')::numeric > 9999999999.99
            )
          )
        )
      )
      or coalesce(entry.value->>'kind', '') not in ('catalog', 'manual')
  ) then
    raise exception using errcode = '22023', message = 'Invalid sale item';
  end if;

  select jsonb_agg(jsonb_build_object(
    'kind', 'catalog',
    'product_id', grouped.product_id,
    'quantity', grouped.quantity
  ) order by grouped.product_id)
  into catalog_items
  from (
    select
      (entry.value->>'product_id')::uuid as product_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry(value)
    where entry.value->>'kind' = 'catalog'
    group by (entry.value->>'product_id')::uuid
  ) as grouped;
  catalog_items := coalesce(catalog_items, '[]'::jsonb);

  select jsonb_agg(jsonb_build_object(
    'kind', 'manual',
    'name', btrim(entry.value->>'name'),
    'quantity', (entry.value->>'quantity')::integer,
    'unit_price', (entry.value->>'unit_price')::numeric,
    'unit_cost', case when current_role in ('owner', 'manager')
      then nullif(entry.value->>'unit_cost', '')::numeric else null end
  ) order by entry.ordinality)
  into manual_items
  from jsonb_array_elements(p_items) with ordinality as entry(value, ordinality)
  where entry.value->>'kind' = 'manual';
  manual_items := coalesce(manual_items, '[]'::jsonb);

  if exists (
    select 1 from jsonb_array_elements(catalog_items) as entry(value)
    where (entry.value->>'quantity')::numeric > 1000000
  ) then
    raise exception using errcode = '22023', message = 'Sale quantity is too large';
  end if;

  normalized_payload := jsonb_build_object(
    'payment_method', p_payment_method,
    'catalog_items', catalog_items,
    'manual_items', manual_items
  );

  insert into public.sales (
    business_id, created_by, total_amount, idempotency_key, payment_method, request_payload
  )
  values (
    p_business_id, authenticated_user_id, 0, btrim(p_idempotency_key),
    p_payment_method, normalized_payload
  )
  on conflict (business_id, idempotency_key) do nothing
  returning id into new_sale_id;

  if new_sale_id is null then
    select id, request_payload into existing_sale_id, existing_payload
    from public.sales
    where business_id = p_business_id
      and idempotency_key = btrim(p_idempotency_key);
    if existing_payload is distinct from normalized_payload then
      raise exception using errcode = '22023', message = 'Idempotency key was already used for a different sale';
    end if;
    return existing_sale_id;
  end if;

  for item in
    select (entry.value->>'product_id')::uuid as product_id,
      (entry.value->>'quantity')::integer as quantity
    from jsonb_array_elements(catalog_items) as entry(value)
    order by (entry.value->>'product_id')::uuid
  loop
    select * into locked_product
    from public.products
    where business_id = p_business_id
      and id = item.product_id
      and not is_archived
    for update;
    if not found then
      raise exception using errcode = '22023', message = 'Sale contains an unavailable product';
    end if;
    if locked_product.quantity < item.quantity then
      raise exception using errcode = '22023', message = 'Insufficient stock';
    end if;

    sale_total := sale_total + round(locked_product.selling_price * item.quantity, 2);
    update public.products
    set quantity = quantity - item.quantity
    where business_id = p_business_id and id = item.product_id;
    insert into public.sale_items (
      business_id, sale_id, product_id, quantity, unit_price, subtotal, unit_cost_snapshot
    )
    values (
      p_business_id, new_sale_id, item.product_id, item.quantity,
      locked_product.selling_price,
      round(locked_product.selling_price * item.quantity, 2),
      locked_product.cost_price
    );
    insert into public.stock_movements (
      business_id, product_id, sale_id, movement_type, quantity_change, reason, created_by
    )
    values (
      p_business_id, item.product_id, new_sale_id, 'sale', -item.quantity,
      'Sale ' || new_sale_id::text, authenticated_user_id
    );
  end loop;

  for item in
    select entry.value->>'name' as name,
      (entry.value->>'quantity')::integer as quantity,
      (entry.value->>'unit_price')::numeric(12, 2) as unit_price,
      nullif(entry.value->>'unit_cost', '')::numeric(12, 2) as unit_cost
    from jsonb_array_elements(manual_items) with ordinality as entry(value, ordinality)
    order by entry.ordinality
  loop
    item_cost := case when current_role in ('owner', 'manager') then item.unit_cost else null end;
    sale_total := sale_total + round(item.unit_price * item.quantity, 2);
    line_number := line_number + 1;
    insert into public.sale_manual_items (
      business_id, sale_id, line_number, name, quantity, unit_price, unit_cost_snapshot
    )
    values (
      p_business_id, new_sale_id, line_number,
      item.name, item.quantity, item.unit_price, item_cost
    );
  end loop;

  if sale_total > 9999999999.99 then
    raise exception using errcode = '22023', message = 'Sale total is too large';
  end if;
  update public.sales
  set total_amount = sale_total
  where business_id = p_business_id and id = new_sale_id;

  return new_sale_id;
end;
$$;

create or replace function public.record_sale_with_payment(
  p_business_id uuid,
  p_idempotency_key text,
  p_payment_method text,
  p_payment_status text,
  p_items jsonb,
  p_amount_paid numeric,
  p_customer_name text,
  p_customer_phone text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  new_sale_id uuid;
  sale_total numeric(12, 2);
  normalized_name text := nullif(btrim(p_customer_name), '');
  normalized_phone text := nullif(btrim(p_customer_phone), '');
  existing_account public.sale_accounts%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_amount_paid is null or p_amount_paid < 0
    or p_amount_paid = 'NaN'::numeric
    or p_amount_paid <> round(p_amount_paid, 2)
    or char_length(coalesce(normalized_name, '')) > 120
    or char_length(coalesce(normalized_phone, '')) > 32
  then
    raise exception using errcode = '22023', message = 'Invalid payment or customer details';
  end if;

  new_sale_id := public.create_sale_with_lines(
    p_business_id, p_idempotency_key, p_payment_method, p_items
  );
  select total_amount into sale_total
  from public.sales
  where business_id = p_business_id and id = new_sale_id;

  if p_amount_paid > sale_total then
    raise exception using errcode = '22023', message = 'Amount paid cannot exceed the sale total';
  end if;
  if p_payment_status is null
    or p_payment_status not in ('paid', 'partial', 'credit')
    or (p_payment_status = 'paid' and p_amount_paid <> sale_total)
    or (p_payment_status = 'partial' and (p_amount_paid <= 0 or p_amount_paid >= sale_total))
    or (p_payment_status = 'credit' and p_amount_paid <> 0)
  then
    raise exception using errcode = '22023', message = 'Payment status does not match the amount paid';
  end if;
  if p_payment_status <> 'paid'
    and (normalized_name is null or normalized_phone is null)
  then
    raise exception using errcode = '22023', message = 'Customer name and phone are required for an outstanding balance';
  end if;

  insert into public.sale_accounts (
    business_id, sale_id, initial_amount_paid, initial_request_key,
    customer_name, customer_phone
  )
  values (
    p_business_id, new_sale_id, p_amount_paid, btrim(p_idempotency_key),
    case when p_payment_status <> 'paid' then normalized_name else null end,
    case when p_payment_status <> 'paid' then normalized_phone else null end
  )
  on conflict (business_id, sale_id) do nothing;

  select * into existing_account
  from public.sale_accounts
  where business_id = p_business_id and sale_id = new_sale_id
  for update;

  if existing_account.initial_request_key <> btrim(p_idempotency_key)
    or existing_account.initial_amount_paid <> p_amount_paid
    or existing_account.customer_name is distinct from
      (case when p_payment_status <> 'paid' then normalized_name else null end)
    or existing_account.customer_phone is distinct from
      (case when p_payment_status <> 'paid' then normalized_phone else null end)
  then
    raise exception using errcode = '22023', message = 'Idempotency key was already used for different payment details';
  end if;

  if p_amount_paid > 0 then
    insert into public.sale_payments (
      business_id, sale_id, amount, payment_method, idempotency_key, created_by
    )
    values (
      p_business_id, new_sale_id, p_amount_paid, p_payment_method,
      'initial:' || btrim(p_idempotency_key), auth.uid()
    )
    on conflict (business_id, idempotency_key) do nothing;
  end if;
  return new_sale_id;
end;
$$;

create or replace function public.get_sale_detail_with_manual_items(
  p_business_id uuid,
  p_sale_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_role text;
  result jsonb;
  manual_items jsonb;
begin
  select role into current_role
  from public.business_members
  where business_id = p_business_id and user_id = auth.uid();
  if current_role is null then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;

  result := public.get_sale_detail(p_business_id, p_sale_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', 'manual',
    'product_id', null,
    'product_name', item.name,
    'quantity', item.quantity,
    'unit_price', item.unit_price,
    'subtotal', round(item.unit_price * item.quantity, 2),
    'unit_cost_snapshot', case when current_role in ('owner', 'manager')
      then item.unit_cost_snapshot else null end,
    'manual_line_id', item.id
  ) order by item.line_number), '[]'::jsonb)
  into manual_items
  from public.sale_manual_items as item
  where item.business_id = p_business_id and item.sale_id = p_sale_id;

  return jsonb_set(
    result,
    '{items}',
    coalesce(result->'items', '[]'::jsonb) || manual_items
  );
end;
$$;

create or replace function public.edit_sale_with_lines(
  p_business_id uuid,
  p_sale_id uuid,
  p_idempotency_key uuid,
  p_payment_method text,
  p_items jsonb,
  p_amount_paid numeric,
  p_customer_name text,
  p_customer_phone text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  sale_row public.sales%rowtype;
  existing_edit public.sale_edits%rowtype;
  payload jsonb;
  catalog_items jsonb;
  manual_items jsonb;
  priced_items jsonb;
  item record;
  product_row public.products%rowtype;
  old_quantity integer;
  new_quantity integer;
  sale_total numeric(12, 2) := 0;
  previous_paid numeric(12, 2);
  normalized_name text := nullif(btrim(p_customer_name), '');
  normalized_phone text := nullif(btrim(p_customer_phone), '');
begin
  select role into current_role
  from public.business_members
  where business_id = p_business_id and user_id = current_user_id;
  if current_user_id is null or current_role is null then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;
  if p_idempotency_key is null or p_payment_method is null
    or p_payment_method not in ('cash', 'mpesa', 'other')
    or p_items is null or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 100
    or p_amount_paid is null or p_amount_paid < 0
    or p_amount_paid = 'NaN'::numeric or p_amount_paid <> round(p_amount_paid, 2)
  then
    raise exception using errcode = '22023', message = 'Invalid sale update';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) as entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or (
        entry.value->>'kind' = 'catalog'
        and (
          coalesce(entry.value->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          or coalesce(entry.value->>'quantity', '') !~ '^[1-9][0-9]*$'
          or coalesce(entry.value->>'quantity', '')::numeric > 1000000
        )
      )
      or (
        entry.value->>'kind' = 'manual'
        and (
          char_length(btrim(coalesce(entry.value->>'name', ''))) not between 1 and 160
          or coalesce(entry.value->>'quantity', '') !~ '^[1-9][0-9]*$'
          or coalesce(entry.value->>'quantity', '')::numeric > 1000000
          or coalesce(entry.value->>'unit_price', '') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
          or (
            current_role in ('owner', 'manager')
            and coalesce(entry.value->>'unit_cost', '') <> ''
            and entry.value->>'unit_cost' !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$'
          )
        )
      )
      or coalesce(entry.value->>'kind', '') not in ('catalog', 'manual')
  ) then
    raise exception using errcode = '22023', message = 'Invalid sale item';
  end if;

  select * into sale_row from public.sales
  where business_id = p_business_id and id = p_sale_id
    and (current_role in ('owner', 'manager') or created_by = current_user_id)
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Sale access denied';
  end if;
  if not exists (
    select 1 from public.sale_accounts as account
    where account.business_id = p_business_id and account.sale_id = p_sale_id
  ) then
    raise exception using errcode = '22023', message = 'Sale predates payment tracking and cannot be edited';
  end if;

  select jsonb_agg(jsonb_build_object(
    'product_id', grouped.product_id, 'quantity', grouped.quantity
  ) order by grouped.product_id)
  into catalog_items
  from (
    select (entry.value->>'product_id')::uuid as product_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry(value)
    where entry.value->>'kind' = 'catalog'
    group by (entry.value->>'product_id')::uuid
  ) as grouped;
  catalog_items := coalesce(catalog_items, '[]'::jsonb);

  select jsonb_agg(jsonb_build_object(
    'name', btrim(entry.value->>'name'),
    'quantity', (entry.value->>'quantity')::integer,
    'unit_price', (entry.value->>'unit_price')::numeric,
    'unit_cost', case when current_role in ('owner', 'manager')
      then nullif(entry.value->>'unit_cost', '')::numeric else null end
  ) order by entry.ordinality)
  into manual_items
  from jsonb_array_elements(p_items) with ordinality as entry(value, ordinality)
  where entry.value->>'kind' = 'manual';
  manual_items := coalesce(manual_items, '[]'::jsonb);

  payload := jsonb_build_object(
    'catalog_items', catalog_items,
    'manual_items', manual_items,
    'payment_method', p_payment_method,
    'amount_paid', p_amount_paid,
    'customer_name', normalized_name,
    'customer_phone', normalized_phone
  );
  select * into existing_edit from public.sale_edits
  where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    if existing_edit.sale_id <> p_sale_id or existing_edit.request_payload <> payload then
      raise exception using errcode = '22023', message = 'Idempotency key was used for different sale details';
    end if;
    return p_sale_id;
  end if;

  select coalesce(sum(amount), 0) into previous_paid
  from public.sale_payments where business_id = p_business_id and sale_id = p_sale_id;
  if p_amount_paid < previous_paid then
    raise exception using errcode = '22023', message = 'Recorded payments cannot be reduced';
  end if;

  for product_row in
    select product.* from public.products as product
    where product.business_id = p_business_id
      and product.id in (
        select item.product_id from public.sale_items as item
        where item.business_id = p_business_id and item.sale_id = p_sale_id
        union
        select (entry.value->>'product_id')::uuid
        from jsonb_array_elements(catalog_items) as entry(value)
      )
    order by product.id
    for update
  loop
    select coalesce(sum(item.quantity), 0)::integer into old_quantity
    from public.sale_items as item
    where item.business_id = p_business_id and item.sale_id = p_sale_id
      and item.product_id = product_row.id;
    select coalesce(sum((entry.value->>'quantity')::integer), 0)::integer into new_quantity
    from jsonb_array_elements(catalog_items) as entry(value)
    where (entry.value->>'product_id')::uuid = product_row.id;
    if new_quantity > old_quantity and product_row.is_archived then
      raise exception using errcode = '22023', message = 'Archived products cannot be added to a sale';
    end if;
    if product_row.quantity + old_quantity < new_quantity then
      raise exception using errcode = '22023', message = 'Insufficient stock';
    end if;
    if old_quantity <> new_quantity then
      update public.products
      set quantity = product_row.quantity + old_quantity - new_quantity
      where business_id = p_business_id and id = product_row.id;
      insert into public.stock_movements (
        business_id, product_id, sale_id, movement_type, quantity_change,
        reason, created_by, operation_key
      )
      values (
        p_business_id, product_row.id, p_sale_id, 'correction',
        old_quantity - new_quantity, 'Sale ' || p_sale_id::text || ' edited',
        current_user_id, gen_random_uuid()
      );
    end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(catalog_items) as entry(value)
    where not exists (
      select 1 from public.products as product
      where product.business_id = p_business_id
        and product.id = (entry.value->>'product_id')::uuid
    )
  ) then
    raise exception using errcode = '22023', message = 'Sale contains an unavailable product';
  end if;

  select jsonb_agg(jsonb_build_object(
    'product_id', (entry.value->>'product_id')::uuid,
    'quantity', (entry.value->>'quantity')::integer,
    'unit_price', case when old_item.product_id is null then product.selling_price else old_item.unit_price end,
    'unit_cost_snapshot', case when old_item.product_id is null then product.cost_price else old_item.unit_cost_snapshot end
  ) order by (entry.value->>'product_id')::uuid)
  into priced_items
  from jsonb_array_elements(catalog_items) as entry(value)
  join public.products as product
    on product.business_id = p_business_id and product.id = (entry.value->>'product_id')::uuid
  left join public.sale_items as old_item
    on old_item.business_id = p_business_id and old_item.sale_id = p_sale_id
   and old_item.product_id = product.id;

  for item in
    select (entry.value->>'quantity')::integer as quantity,
      (entry.value->>'unit_price')::numeric(12, 2) as unit_price
    from jsonb_array_elements(priced_items) as entry(value)
  loop
    sale_total := sale_total + round(item.quantity * item.unit_price, 2);
  end loop;
  for item in
    select (entry.value->>'quantity')::integer as quantity,
      (entry.value->>'unit_price')::numeric(12, 2) as unit_price
    from jsonb_array_elements(manual_items) as entry(value)
  loop
    sale_total := sale_total + round(item.quantity * item.unit_price, 2);
  end loop;
  if sale_total > 9999999999.99 or p_amount_paid > sale_total then
    raise exception using errcode = '22023', message = 'Sale total or amount received is invalid';
  end if;
  if p_amount_paid < sale_total
    and (normalized_name is null or normalized_phone is null)
  then
    raise exception using errcode = '22023', message = 'Customer name and phone are required for an outstanding balance';
  end if;

  delete from public.sale_items
  where business_id = p_business_id and sale_id = p_sale_id;
  for item in
    select (entry.value->>'product_id')::uuid as product_id,
      (entry.value->>'quantity')::integer as quantity,
      (entry.value->>'unit_price')::numeric as unit_price,
      entry.value->>'unit_cost_snapshot' as unit_cost_snapshot
    from jsonb_array_elements(priced_items) as entry(value)
  loop
    insert into public.sale_items (
      business_id, sale_id, product_id, quantity, unit_price, subtotal, unit_cost_snapshot
    )
    values (
      p_business_id, p_sale_id, item.product_id, item.quantity, item.unit_price,
      round(item.unit_price * item.quantity, 2),
      nullif(item.unit_cost_snapshot, '')::numeric
    );
  end loop;

  delete from public.sale_manual_items
  where business_id = p_business_id and sale_id = p_sale_id;
  insert into public.sale_manual_items (
    business_id, sale_id, line_number, name, quantity, unit_price, unit_cost_snapshot
  )
  select
    p_business_id, p_sale_id, entry.ordinality,
    entry.value->>'name',
    (entry.value->>'quantity')::integer,
    (entry.value->>'unit_price')::numeric,
    nullif(entry.value->>'unit_cost', '')::numeric
  from jsonb_array_elements(manual_items) with ordinality as entry(value, ordinality);

  update public.sales set total_amount = sale_total
  where business_id = p_business_id and id = p_sale_id;
  update public.sale_accounts
  set customer_name = case when p_amount_paid < sale_total then normalized_name else null end,
      customer_phone = case when p_amount_paid < sale_total then normalized_phone else null end,
      updated_at = now()
  where business_id = p_business_id and sale_id = p_sale_id;

  if p_amount_paid > previous_paid then
    insert into public.sale_payments (
      business_id, sale_id, amount, payment_method, idempotency_key, created_by
    )
    values (
      p_business_id, p_sale_id, p_amount_paid - previous_paid,
      p_payment_method, 'edit:' || p_idempotency_key::text, current_user_id
    );
  end if;

  insert into public.sale_edits (
    business_id, sale_id, idempotency_key, changed_by,
    before_total, after_total, request_payload
  )
  values (
    p_business_id, p_sale_id, p_idempotency_key, current_user_id,
    sale_row.total_amount, sale_total, payload
  );
  return p_sale_id;
end;
$$;

revoke all on function public.create_sale_with_lines(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_sale(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.edit_sale_with_payment(uuid, uuid, uuid, text, jsonb, numeric, text, text) from public, anon, authenticated;
revoke all on function public.record_sale_with_payment(uuid, text, text, text, jsonb, numeric, text, text) from public, anon;
revoke all on function public.get_sale_detail_with_manual_items(uuid, uuid) from public, anon;
revoke all on function public.edit_sale_with_lines(uuid, uuid, uuid, text, jsonb, numeric, text, text) from public, anon;
grant execute on function public.record_sale_with_payment(uuid, text, text, text, jsonb, numeric, text, text) to authenticated;
grant execute on function public.get_sale_detail_with_manual_items(uuid, uuid) to authenticated;
grant execute on function public.edit_sale_with_lines(uuid, uuid, uuid, text, jsonb, numeric, text, text) to authenticated;

commit;
