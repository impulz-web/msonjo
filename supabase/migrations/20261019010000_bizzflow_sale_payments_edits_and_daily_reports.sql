-- Add sale payment tracking, audited sale edits, and daily sales summaries.
-- Apply only after the existing BizzFlow migrations on its dedicated project.
-- Existing table definitions are left unchanged; all new data uses additive tables.

begin;

create table public.sale_accounts (
  business_id uuid not null,
  sale_id uuid not null,
  initial_amount_paid numeric(12, 2) not null
    check (initial_amount_paid >= 0 and initial_amount_paid <> 'NaN'::numeric),
  initial_request_key text not null,
  customer_name text,
  customer_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, sale_id),
  constraint sale_accounts_business_sale_fk
    foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete restrict,
  constraint sale_accounts_customer_name_check
    check (customer_name is null or char_length(btrim(customer_name)) between 1 and 120),
  constraint sale_accounts_customer_phone_check
    check (customer_phone is null or char_length(btrim(customer_phone)) between 5 and 32)
);

create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sale_id uuid not null,
  amount numeric(12, 2) not null
    check (amount > 0 and amount <> 'NaN'::numeric),
  payment_method text not null check (payment_method in ('cash', 'mpesa', 'other')),
  idempotency_key text not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint sale_payments_business_sale_fk
    foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete restrict,
  constraint sale_payments_business_request_unique
    unique (business_id, idempotency_key)
);

create index sale_payments_business_sale_created_idx
  on public.sale_payments (business_id, sale_id, created_at);

create table public.sale_edits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  sale_id uuid not null,
  idempotency_key uuid not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  before_total numeric(12, 2) not null,
  after_total numeric(12, 2) not null,
  request_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint sale_edits_business_sale_fk
    foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete restrict,
  constraint sale_edits_business_request_unique
    unique (business_id, idempotency_key)
);

create index sale_edits_business_sale_created_idx
  on public.sale_edits (business_id, sale_id, created_at desc);

alter table public.sale_accounts enable row level security;
alter table public.sale_payments enable row level security;
alter table public.sale_edits enable row level security;

revoke all on public.sale_accounts, public.sale_payments, public.sale_edits
  from public, anon, authenticated;
grant select (
  business_id, sale_id, customer_name, customer_phone, created_at, updated_at
) on public.sale_accounts to authenticated;
grant select (
  business_id, sale_id, amount, payment_method, created_at
) on public.sale_payments to authenticated;

create policy sale_accounts_select_authorized_sales
  on public.sale_accounts for select to authenticated
  using (
    public.has_business_role(business_id, array['owner', 'manager']::text[])
    or exists (
      select 1 from public.sales as sale
      where sale.business_id = sale_accounts.business_id
        and sale.id = sale_accounts.sale_id
        and sale.created_by = auth.uid()
        and public.is_business_member(sale.business_id)
    )
  );

create policy sale_payments_select_authorized_sales
  on public.sale_payments for select to authenticated
  using (
    public.has_business_role(business_id, array['owner', 'manager']::text[])
    or exists (
      select 1 from public.sales as sale
      where sale.business_id = sale_payments.business_id
        and sale.id = sale_payments.sale_id
        and sale.created_by = auth.uid()
        and public.is_business_member(sale.business_id)
    )
  );

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

  new_sale_id := public.create_sale(
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

create or replace function public.edit_sale_with_payment(
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
  normalized_items jsonb;
  priced_items jsonb;
  item record;
  product_row public.products%rowtype;
  unit_price numeric(12, 2);
  unit_cost numeric(12, 2);
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
  if p_idempotency_key is null
    or p_payment_method is null
    or p_payment_method not in ('cash', 'mpesa', 'other')
    or p_items is null
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) not between 1 and 100
    or p_amount_paid is null
    or p_amount_paid < 0
    or p_amount_paid = 'NaN'::numeric
    or p_amount_paid <> round(p_amount_paid, 2)
    or char_length(coalesce(normalized_name, '')) > 120
    or char_length(coalesce(normalized_phone, '')) > 32
  then
    raise exception using errcode = '22023', message = 'Invalid sale update';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) as entry(value)
    where jsonb_typeof(entry.value) <> 'object'
      or coalesce(entry.value->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(entry.value->>'quantity', '') !~ '^[1-9][0-9]*$'
      or coalesce(entry.value->>'quantity', '')::numeric > 1000000
  ) then
    raise exception using errcode = '22023', message = 'Invalid sale item';
  end if;

  select jsonb_agg(
    jsonb_build_object('product_id', grouped.product_id, 'quantity', grouped.quantity)
    order by grouped.product_id
  )
  into normalized_items
  from (
    select
      (entry.value->>'product_id')::uuid as product_id,
      sum((entry.value->>'quantity')::integer)::integer as quantity
    from jsonb_array_elements(p_items) as entry(value)
    group by (entry.value->>'product_id')::uuid
  ) as grouped;

  payload := jsonb_build_object(
    'payment_method', p_payment_method,
    'items', normalized_items,
    'amount_paid', p_amount_paid,
    'customer_name', normalized_name,
    'customer_phone', normalized_phone
  );

  select * into sale_row
  from public.sales
  where business_id = p_business_id
    and id = p_sale_id
    and (current_role in ('owner', 'manager') or created_by = current_user_id)
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Sale access denied';
  end if;

  select * into existing_edit
  from public.sale_edits
  where business_id = p_business_id and idempotency_key = p_idempotency_key;
  if found then
    if existing_edit.sale_id <> p_sale_id or existing_edit.request_payload <> payload then
      raise exception using errcode = '22023', message = 'Idempotency key was already used for a different sale update';
    end if;
    return p_sale_id;
  end if;

  if not exists (
    select 1 from public.sale_accounts as account
    where account.business_id = p_business_id and account.sale_id = p_sale_id
  ) then
    raise exception using errcode = '22023', message = 'Sale predates payment tracking and cannot be edited';
  end if;

  select coalesce(sum(amount), 0) into previous_paid
  from public.sale_payments
  where business_id = p_business_id and sale_id = p_sale_id;
  if p_amount_paid < previous_paid then
    raise exception using errcode = '22023', message = 'Recorded payments cannot be reduced';
  end if;

  for product_row in
    select product.*
    from public.products as product
    where product.business_id = p_business_id
      and product.id in (
        select item.product_id from public.sale_items as item
        where item.business_id = p_business_id and item.sale_id = p_sale_id
        union
        select (entry.value->>'product_id')::uuid
        from jsonb_array_elements(normalized_items) as entry(value)
      )
    order by product.id
    for update
  loop
    select coalesce(sum(item.quantity), 0)::integer into old_quantity
    from public.sale_items as item
    where item.business_id = p_business_id
      and item.sale_id = p_sale_id
      and item.product_id = product_row.id;

    select coalesce(sum((entry.value->>'quantity')::integer), 0)::integer into new_quantity
    from jsonb_array_elements(normalized_items) as entry(value)
    where (entry.value->>'product_id')::uuid = product_row.id;

    select item.unit_price, item.unit_cost_snapshot
    into unit_price, unit_cost
    from public.sale_items as item
    where item.business_id = p_business_id
      and item.sale_id = p_sale_id
      and item.product_id = product_row.id;
    if not found then
      unit_price := product_row.selling_price;
      unit_cost := product_row.cost_price;
    end if;

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
        old_quantity - new_quantity,
        'Sale ' || p_sale_id::text || ' edited',
        current_user_id, gen_random_uuid()
      );
    end if;

    sale_total := sale_total + round(unit_price * new_quantity, 2);
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(normalized_items) as entry(value)
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
  from jsonb_array_elements(normalized_items) as entry(value)
  join public.products as product
    on product.business_id = p_business_id
   and product.id = (entry.value->>'product_id')::uuid
  left join public.sale_items as old_item
    on old_item.business_id = p_business_id
   and old_item.sale_id = p_sale_id
   and old_item.product_id = product.id;

  if p_amount_paid > sale_total then
    raise exception using errcode = '22023', message = 'Amount paid cannot exceed the sale total';
  end if;
  if p_amount_paid < sale_total
    and (normalized_name is null or normalized_phone is null)
  then
    raise exception using errcode = '22023', message = 'Customer name and phone are required for an outstanding balance';
  end if;

  delete from public.sale_items
  where business_id = p_business_id and sale_id = p_sale_id;

  for item in
    select
      (entry.value->>'product_id')::uuid as product_id,
      (entry.value->>'quantity')::integer as quantity,
      (entry.value->>'unit_price')::numeric as unit_price,
      entry.value->>'unit_cost_snapshot' as unit_cost_snapshot
    from jsonb_array_elements(priced_items) as entry(value)
    order by (entry.value->>'product_id')::uuid
  loop
    insert into public.sale_items (
      business_id, sale_id, product_id, quantity, unit_price, subtotal, unit_cost_snapshot
    )
    values (
      p_business_id, p_sale_id, item.product_id, item.quantity,
      item.unit_price,
      round(item.unit_price * item.quantity, 2),
      nullif(item.unit_cost_snapshot, '')::numeric
    );
  end loop;

  update public.sales
  set total_amount = sale_total
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

create or replace function public.get_daily_sales(
  p_business_id uuid,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  result jsonb;
  range_start timestamptz;
  range_end timestamptz;
begin
  select role into current_role
  from public.business_members
  where business_id = p_business_id and user_id = current_user_id;
  if current_user_id is null or current_role is null then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;
  if p_start_date is null or p_end_date is null
    or p_end_date < p_start_date
    or p_end_date - p_start_date > 30
  then
    raise exception using errcode = '22023', message = 'Choose a date range of no more than 31 days';
  end if;

  range_start := p_start_date::timestamp at time zone 'Africa/Nairobi';
  range_end := (p_end_date + 1)::timestamp at time zone 'Africa/Nairobi';

  with daily as (
    select
      (sale.created_at at time zone 'Africa/Nairobi')::date as sale_day,
      sale.id, sale.created_by, sale.total_amount, sale.payment_method, sale.created_at,
      account.customer_name, account.customer_phone,
      coalesce(
        payments.amount_paid,
        case when account.sale_id is null then sale.total_amount else 0 end
      )::numeric(12, 2) as amount_paid
    from public.sales as sale
    left join public.sale_accounts as account
      on account.business_id = sale.business_id and account.sale_id = sale.id
    left join lateral (
      select sum(payment.amount)::numeric(12, 2) as amount_paid
      from public.sale_payments as payment
      where payment.business_id = sale.business_id and payment.sale_id = sale.id
    ) as payments on true
    where sale.business_id = p_business_id
      and sale.created_at >= range_start and sale.created_at < range_end
      and (current_role in ('owner', 'manager') or sale.created_by = current_user_id)
  ),
  grouped as (
    select
      sale_day,
      count(*) as sale_count,
      sum(total_amount)::numeric(12, 2) as sales_total,
      sum(amount_paid)::numeric(12, 2) as paid_total,
      jsonb_agg(jsonb_build_object(
        'id', id,
        'created_by', created_by,
        'created_at', created_at,
        'total_amount', total_amount,
        'payment_method', payment_method,
        'amount_paid', amount_paid,
        'balance_due', total_amount - amount_paid,
        'customer_name', customer_name,
        'customer_phone', customer_phone
      ) order by created_at desc) as sales
    from daily
    group by sale_day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', calendar.day::date,
    'sales_count', coalesce(grouped.sale_count, 0),
    'sales_total', coalesce(grouped.sales_total, 0),
    'paid_total', coalesce(grouped.paid_total, 0),
    'balance_due', coalesce(grouped.sales_total, 0) - coalesce(grouped.paid_total, 0),
    'sales', coalesce(grouped.sales, '[]'::jsonb)
  ) order by calendar.day), '[]'::jsonb)
  into result
  from generate_series(p_start_date, p_end_date, interval '1 day') as calendar(day)
  left join grouped on grouped.sale_day = calendar.day::date;

  return result;
end;
$$;

revoke all on function public.record_sale_with_payment(uuid, text, text, text, jsonb, numeric, text, text) from public, anon;
revoke all on function public.edit_sale_with_payment(uuid, uuid, uuid, text, jsonb, numeric, text, text) from public, anon;
revoke all on function public.get_daily_sales(uuid, date, date) from public, anon;
grant execute on function public.record_sale_with_payment(uuid, text, text, text, jsonb, numeric, text, text) to authenticated;
grant execute on function public.edit_sale_with_payment(uuid, uuid, uuid, text, jsonb, numeric, text, text) to authenticated;
grant execute on function public.get_daily_sales(uuid, date, date) to authenticated;

commit;
