-- Add transactional product, stock, sales, and reporting operations.
-- Apply only after reviewing against a dedicated Bizzflow Supabase project.

begin;

alter table public.products
  add column is_archived boolean not null default false;

alter table public.sales
  add column payment_method text
    check (payment_method is null or payment_method in ('cash', 'mpesa', 'other')),
  add column sale_status text not null default 'completed'
    check (sale_status in ('completed')),
  add column request_payload jsonb;

alter table public.sale_items
  add column unit_cost_snapshot numeric(12, 2)
    check (unit_cost_snapshot is null or (unit_cost_snapshot >= 0 and unit_cost_snapshot <> 'NaN'::numeric));

alter table public.stock_movements
  add column sale_id uuid,
  add column operation_key uuid,
  add column request_payload jsonb,
  add constraint stock_movements_business_sale_fk
    foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete restrict,
  drop constraint stock_movements_movement_type_check,
  add constraint stock_movements_movement_type_check
    check (movement_type in ('sale', 'restock', 'adjustment', 'return', 'correction', 'damaged', 'lost'));

create unique index stock_movements_business_operation_unique_idx
  on public.stock_movements (business_id, operation_key)
  where operation_key is not null;

create index products_business_active_name_idx
  on public.products (business_id, name)
  where not is_archived;

create index products_business_active_category_idx
  on public.products (business_id, category)
  where not is_archived;

create index products_business_active_quantity_idx
  on public.products (business_id, quantity)
  where not is_archived;

create index products_business_name_search_idx
  on public.products (business_id, lower(name) text_pattern_ops)
  where not is_archived;

create index products_business_sku_search_idx
  on public.products (business_id, lower(sku) text_pattern_ops)
  where not is_archived and sku is not null;

create index sales_business_payment_created_idx
  on public.sales (business_id, payment_method, created_at desc);

create index stock_movements_business_sale_idx
  on public.stock_movements (business_id, sale_id)
  where sale_id is not null;

create index stock_movements_business_type_created_idx
  on public.stock_movements (business_id, movement_type, created_at desc);

grant update (is_archived) on public.products to authenticated;

revoke select on public.products from authenticated;
grant select (
  id, business_id, name, sku, category, selling_price, quantity,
  low_stock_threshold, is_archived, created_at, updated_at
) on public.products to authenticated;

revoke select on public.sale_items from authenticated;
grant select (
  id, business_id, sale_id, product_id, quantity, unit_price, subtotal, created_at
) on public.sale_items to authenticated;

create or replace function public.list_products(
  p_business_id uuid,
  p_search text default '',
  p_category text default null,
  p_stock_status text default 'all',
  p_sort text default 'name',
  p_limit integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  result_rows jsonb;
  result_count bigint;
  result_categories jsonb;
  current_role text;
  search_term text := lower(btrim(coalesce(p_search, '')));
  search_pattern text := replace(
    replace(replace(lower(btrim(coalesce(p_search, ''))), E'\\', E'\\\\'), '%', E'\\%'),
    '_', E'\\_'
  ) || '%';
begin
  if current_user_id is null or not public.is_business_member(p_business_id) then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;
  select role into current_role
  from public.business_members
  where business_id = p_business_id and user_id = current_user_id;
  if char_length(search_term) > 100
    or char_length(coalesce(p_category, '')) > 100
    or p_stock_status is null
    or p_stock_status not in ('all', 'low', 'out', 'in_stock')
    or p_sort is null
    or p_sort not in ('name', 'quantity', 'created_at')
    or p_limit not between 1 and 100
    or p_offset < 0 or p_offset > 1000000
  then
    raise exception using errcode = '22023', message = 'Invalid product query';
  end if;

  with filtered as (
    select product.*
    from public.products as product
    where product.business_id = p_business_id
      and not product.is_archived
      and (search_term = '' or lower(product.name) like search_pattern escape E'\\'
        or lower(coalesce(product.sku, '')) like search_pattern escape E'\\')
      and (p_category is null or product.category = p_category)
      and (
        p_stock_status = 'all'
        or (p_stock_status = 'out' and product.quantity = 0)
        or (p_stock_status = 'low' and product.quantity > 0 and product.quantity <= product.low_stock_threshold)
        or (p_stock_status = 'in_stock' and product.quantity > 0)
      )
  )
  select
    (select count(*) from filtered),
    coalesce((
      select jsonb_agg(
        case when current_role in ('owner', 'manager')
          then to_jsonb(page_row)
          else to_jsonb(page_row) - 'cost_price'
        end
        order by
          case when p_sort = 'name' then page_row.name end asc,
          case when p_sort = 'quantity' then page_row.quantity end asc,
          case when p_sort = 'created_at' then page_row.created_at end desc,
          page_row.id asc
      )
      from (
        select *
        from filtered
        order by
          case when p_sort = 'name' then name end asc,
          case when p_sort = 'quantity' then quantity end asc,
          case when p_sort = 'created_at' then created_at end desc,
          id asc
        limit p_limit offset p_offset
      ) as page_row
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(categories.category order by categories.category)
      from (
        select distinct category
        from public.products
        where business_id = p_business_id and not is_archived and category is not null
        order by category
        limit 100
      ) as categories
    ), '[]'::jsonb)
  into result_count, result_rows, result_categories;

  return jsonb_build_object(
    'items', result_rows,
    'total', result_count,
    'categories', result_categories
  );
end;
$$;

create or replace function public.create_product(
  p_business_id uuid,
  p_name text,
  p_sku text,
  p_category text,
  p_cost_price numeric,
  p_selling_price numeric,
  p_low_stock_threshold integer,
  p_initial_quantity integer,
  p_operation_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  authenticated_user_id uuid := auth.uid();
  new_product_id uuid;
begin
  if authenticated_user_id is null
    or not public.has_business_role(p_business_id, array['owner', 'manager']::text[])
  then
    raise exception using errcode = '42501', message = 'Product management permission denied';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 160
    or char_length(coalesce(p_sku, '')) > 100
    or char_length(coalesce(p_category, '')) > 100
    or p_cost_price is null or p_cost_price < 0 or p_cost_price = 'NaN'::numeric
    or p_selling_price is null or p_selling_price < 0 or p_selling_price = 'NaN'::numeric
    or p_low_stock_threshold is null or p_low_stock_threshold < 0
    or p_initial_quantity is null or p_initial_quantity < 0
    or (p_initial_quantity > 0 and p_operation_key is null)
  then
    raise exception using errcode = '22023', message = 'Invalid product details';
  end if;

  insert into public.products (
    business_id, name, sku, category, cost_price, selling_price, low_stock_threshold
  )
  values (
    p_business_id, btrim(p_name), nullif(btrim(coalesce(p_sku, '')), ''),
    nullif(btrim(coalesce(p_category, '')), ''), p_cost_price, p_selling_price,
    p_low_stock_threshold
  )
  returning id into new_product_id;

  if p_initial_quantity > 0 then
    update public.products
    set quantity = p_initial_quantity
    where business_id = p_business_id and id = new_product_id;

    insert into public.stock_movements (
      business_id, product_id, movement_type, quantity_change, reason,
      created_by, operation_key, request_payload
    )
    values (
      p_business_id, new_product_id, 'restock', p_initial_quantity,
      'Initial stock', authenticated_user_id, p_operation_key,
      jsonb_build_object(
        'product_id', new_product_id,
        'quantity_change', p_initial_quantity,
        'movement_type', 'restock',
        'reason', 'Initial stock'
      )
    );
  end if;

  return new_product_id;
end;
$$;

create or replace function public.create_sale(
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
  normalized_items jsonb;
  normalized_payload jsonb;
  new_sale_id uuid;
  existing_sale_id uuid;
  existing_payload jsonb;
  sale_total numeric(12, 2) := 0;
  item record;
  locked_product record;
begin
  if authenticated_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not public.has_business_role(
    p_business_id,
    array['owner', 'manager', 'attendant']::text[]
  ) then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;
  if p_idempotency_key is null
    or char_length(btrim(p_idempotency_key)) not between 1 and 128
    or p_payment_method is null
    or p_payment_method not in ('cash', 'mpesa', 'other')
  then
    raise exception using errcode = '22023', message = 'Invalid sale request';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Sale items must be an array';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Sale requires between 1 and 100 items';
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

  if exists (
    select 1
    from jsonb_array_elements(normalized_items) as entry(value)
    where (entry.value->>'quantity')::numeric > 1000000
  ) then
    raise exception using errcode = '22023', message = 'Sale quantity is too large';
  end if;

  normalized_payload := jsonb_build_object(
    'payment_method', p_payment_method,
    'items', normalized_items
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
    select
      (entry.value->>'product_id')::uuid as product_id,
      (entry.value->>'quantity')::integer as quantity
    from jsonb_array_elements(normalized_items) as entry(value)
    order by (entry.value->>'product_id')::uuid
  loop
    select id, quantity, selling_price, cost_price
    into locked_product
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
      p_business_id,
      new_sale_id,
      item.product_id,
      item.quantity,
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

  update public.sales
  set total_amount = sale_total
  where business_id = p_business_id and id = new_sale_id;

  return new_sale_id;
end;
$$;

create or replace function public.get_product_detail(
  p_business_id uuid,
  p_product_id uuid
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
  product_row public.products%rowtype;
begin
  select role into current_role
  from public.business_members
  where business_id = p_business_id and user_id = current_user_id;
  if current_user_id is null or current_role is null then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;

  select * into product_row
  from public.products
  where business_id = p_business_id and id = p_product_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Product not found';
  end if;

  return jsonb_build_object(
    'id', product_row.id,
    'business_id', product_row.business_id,
    'name', product_row.name,
    'sku', product_row.sku,
    'category', product_row.category,
    'cost_price', case when current_role in ('owner', 'manager') then product_row.cost_price else null end,
    'selling_price', product_row.selling_price,
    'quantity', product_row.quantity,
    'low_stock_threshold', product_row.low_stock_threshold,
    'is_archived', product_row.is_archived,
    'created_at', product_row.created_at
  );
end;
$$;

create or replace function public.get_sale_detail(
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
  current_user_id uuid := auth.uid();
  current_role text;
  sale_row public.sales%rowtype;
  sale_items_json jsonb;
begin
  select role into current_role
  from public.business_members
  where business_id = p_business_id and user_id = current_user_id;
  if current_user_id is null or current_role is null then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;

  select * into sale_row
  from public.sales
  where business_id = p_business_id
    and id = p_sale_id
    and (current_role in ('owner', 'manager') or created_by = current_user_id);
  if not found then
    raise exception using errcode = '42501', message = 'Sale access denied';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', item.product_id,
    'product_name', product.name,
    'quantity', item.quantity,
    'unit_price', item.unit_price,
    'subtotal', item.subtotal,
    'unit_cost_snapshot', case when current_role in ('owner', 'manager') then item.unit_cost_snapshot else null end
  ) order by product.name), '[]'::jsonb)
  into sale_items_json
  from public.sale_items as item
  join public.products as product
    on product.business_id = item.business_id and product.id = item.product_id
  where item.business_id = p_business_id and item.sale_id = p_sale_id;

  return jsonb_build_object(
    'sale', jsonb_build_object(
      'id', sale_row.id,
      'business_id', sale_row.business_id,
      'created_by', sale_row.created_by,
      'total_amount', sale_row.total_amount,
      'payment_method', sale_row.payment_method,
      'sale_status', sale_row.sale_status,
      'created_at', sale_row.created_at
    ),
    'items', sale_items_json
  );
end;
$$;

create or replace function public.adjust_stock(
  p_business_id uuid,
  p_product_id uuid,
  p_quantity_change integer,
  p_movement_type text,
  p_reason text,
  p_operation_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  authenticated_user_id uuid := auth.uid();
  current_quantity integer;
  movement_id uuid;
  normalized_reason text := nullif(btrim(p_reason), '');
  request_payload jsonb;
  existing_payload jsonb;
begin
  if authenticated_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not public.has_business_role(p_business_id, array['owner', 'manager']::text[]) then
    raise exception using errcode = '42501', message = 'Stock adjustment permission denied';
  end if;
  if p_quantity_change = 0
    or p_movement_type is null
    or p_movement_type not in ('restock', 'adjustment', 'damaged', 'lost', 'correction')
    or p_operation_key is null
    or char_length(coalesce(normalized_reason, '')) > 500
    or (p_movement_type = 'restock' and p_quantity_change < 0)
    or (p_movement_type in ('damaged', 'lost') and p_quantity_change > 0)
  then
    raise exception using errcode = '22023', message = 'Invalid stock adjustment';
  end if;

  request_payload := jsonb_build_object(
    'product_id', p_product_id,
    'quantity_change', p_quantity_change,
    'movement_type', p_movement_type,
    'reason', normalized_reason
  );

  select quantity into current_quantity
  from public.products
  where business_id = p_business_id and id = p_product_id and not is_archived
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'Product is unavailable';
  end if;

  select id, stock_movements.request_payload
  into movement_id, existing_payload
  from public.stock_movements
  where business_id = p_business_id and operation_key = p_operation_key;

  if found then
    if existing_payload is distinct from request_payload then
      raise exception using errcode = '22023', message = 'Operation key was already used for a different adjustment';
    end if;
    return movement_id;
  end if;

  if current_quantity + p_quantity_change < 0 then
    raise exception using errcode = '22023', message = 'Stock cannot be reduced below zero';
  end if;

  update public.products
  set quantity = quantity + p_quantity_change
  where business_id = p_business_id and id = p_product_id;

  insert into public.stock_movements (
    business_id, product_id, movement_type, quantity_change,
    reason, created_by, operation_key, request_payload
  )
  values (
    p_business_id, p_product_id, p_movement_type, p_quantity_change,
    normalized_reason, authenticated_user_id, p_operation_key, request_payload
  )
  returning id into movement_id;

  return movement_id;
end;
$$;

create or replace function public.get_business_dashboard(p_business_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  current_user_id uuid := auth.uid();
  current_role text;
  local_day_start timestamptz := date_trunc('day', now() at time zone 'Africa/Nairobi')
    at time zone 'Africa/Nairobi';
begin
  select role into current_role
  from public.business_members
  where business_id = p_business_id and user_id = current_user_id;

  if current_user_id is null or current_role is null then
    raise exception using errcode = '42501', message = 'Business access denied';
  end if;

  return jsonb_build_object(
    'active_products', (select count(*) from public.products where business_id = p_business_id and not is_archived),
    'stock_units', (select coalesce(sum(quantity), 0) from public.products where business_id = p_business_id and not is_archived),
    'stock_value', case when current_role in ('owner', 'manager')
      then (select coalesce(sum(cost_price * quantity), 0) from public.products where business_id = p_business_id and not is_archived)
      else null end,
    'today_sales', (
      select coalesce(sum(total_amount), 0) from public.sales
      where business_id = p_business_id and created_at >= local_day_start and created_at < local_day_start + interval '1 day'
        and (current_role <> 'attendant' or created_by = current_user_id)
    ),
    'today_sale_count', (
      select count(*) from public.sales
      where business_id = p_business_id and created_at >= local_day_start and created_at < local_day_start + interval '1 day'
        and (current_role <> 'attendant' or created_by = current_user_id)
    ),
    'low_stock_count', (
      select count(*) from public.products
      where business_id = p_business_id and not is_archived
        and quantity > 0 and quantity <= low_stock_threshold
    ),
    'out_of_stock_count', (
      select count(*) from public.products
      where business_id = p_business_id and not is_archived and quantity = 0
    ),
    'low_stock', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sku', sku, 'quantity', quantity, 'threshold', low_stock_threshold)
        order by quantity, name)
      from (
        select id, name, sku, quantity, low_stock_threshold
        from public.products
        where business_id = p_business_id and not is_archived
          and quantity <= low_stock_threshold
        order by quantity, name
        limit 10
      ) as low_products
    ), '[]'::jsonb),
    'recent_sales', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'total_amount', total_amount, 'payment_method', payment_method, 'created_at', created_at)
        order by created_at desc)
      from (
        select id, total_amount, payment_method, created_at
        from public.sales
        where business_id = p_business_id
          and (current_role <> 'attendant' or created_by = current_user_id)
        order by created_at desc
        limit 5
      ) as latest_sales
    ), '[]'::jsonb),
    'recent_movements', coalesce((
      select jsonb_agg(jsonb_build_object('id', movement.id, 'product_name', product.name, 'movement_type', movement.movement_type, 'quantity_change', movement.quantity_change, 'created_at', movement.created_at)
        order by movement.created_at desc)
      from (
        select id, product_id, movement_type, quantity_change, created_at
        from public.stock_movements
        where business_id = p_business_id
          and (current_role <> 'attendant' or created_by = current_user_id)
        order by created_at desc
        limit 5
      ) as movement
      join public.products as product
        on product.business_id = p_business_id and product.id = movement.product_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_business_reports(
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
    or p_end_date <= p_start_date
    or p_end_date - p_start_date > 366
  then
    raise exception using errcode = '22023', message = 'Invalid report date range';
  end if;

  range_start := p_start_date::timestamp at time zone 'Africa/Nairobi';
  range_end := p_end_date::timestamp at time zone 'Africa/Nairobi';

  return jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'timezone', 'Africa/Nairobi',
    'sales_total', (
      select coalesce(sum(total_amount), 0) from public.sales
      where business_id = p_business_id and created_at >= range_start and created_at < range_end
        and (current_role <> 'attendant' or created_by = current_user_id)
    ),
    'sale_count', (
      select count(*) from public.sales
      where business_id = p_business_id and created_at >= range_start and created_at < range_end
        and (current_role <> 'attendant' or created_by = current_user_id)
    ),
    'gross_profit_estimate', case when current_role in ('owner', 'manager') then (
      select case when count(*) = count(item.unit_cost_snapshot)
        then coalesce(sum(item.subtotal - item.unit_cost_snapshot * item.quantity), 0)
        else null end
      from public.sale_items as item
      join public.sales as sale on sale.business_id = item.business_id and sale.id = item.sale_id
      where sale.business_id = p_business_id and sale.created_at >= range_start and sale.created_at < range_end
        and (current_role <> 'attendant' or sale.created_by = current_user_id)
    ) else null end,
    'sales_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', daily.day, 'total', daily.total, 'count', daily.count) order by daily.day)
      from (
        select (created_at at time zone 'Africa/Nairobi')::date as day,
          sum(total_amount) as total, count(*) as count
        from public.sales
        where business_id = p_business_id and created_at >= range_start and created_at < range_end
          and (current_role <> 'attendant' or created_by = current_user_id)
        group by (created_at at time zone 'Africa/Nairobi')::date
      ) as daily
    ), '[]'::jsonb),
    'sales_by_product', coalesce((
      select jsonb_agg(jsonb_build_object('product_id', product_id, 'name', name, 'quantity', quantity, 'revenue', revenue, 'gross_profit_estimate', gross_profit) order by revenue desc)
      from (
        select item.product_id, product.name, sum(item.quantity) as quantity,
          sum(item.subtotal) as revenue,
          case when current_role in ('owner', 'manager') and count(item.unit_cost_snapshot) = count(*)
            then sum(item.subtotal - item.unit_cost_snapshot * item.quantity)
            else null end as gross_profit
        from public.sale_items as item
        join public.sales as sale on sale.business_id = item.business_id and sale.id = item.sale_id
        join public.products as product on product.business_id = item.business_id and product.id = item.product_id
        where sale.business_id = p_business_id and sale.created_at >= range_start and sale.created_at < range_end
          and (current_role <> 'attendant' or sale.created_by = current_user_id)
        group by item.product_id, product.name
        order by sum(item.subtotal) desc
        limit 100
      ) as product_sales
    ), '[]'::jsonb),
    'low_stock_products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'sku', sku, 'quantity', quantity,
        'low_stock_threshold', low_stock_threshold
      ) order by quantity, name)
      from (
        select id, name, sku, quantity, low_stock_threshold
        from public.products
        where business_id = p_business_id and not is_archived
          and quantity <= low_stock_threshold
        order by quantity, name
        limit 100
      ) as low_products
    ), '[]'::jsonb),
    'stock_movements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', movement.id, 'product_name', product.name,
        'movement_type', movement.movement_type,
        'quantity_change', movement.quantity_change,
        'created_at', movement.created_at
      ) order by movement.created_at desc)
      from (
        select id, product_id, movement_type, quantity_change, created_by, created_at
        from public.stock_movements
        where business_id = p_business_id
          and created_at >= range_start and created_at < range_end
          and (current_role <> 'attendant' or created_by = current_user_id)
        order by created_at desc
        limit 100
      ) as movement
      join public.products as product
        on product.business_id = p_business_id and product.id = movement.product_id
    ), '[]'::jsonb),
    'inventory', jsonb_build_object(
      'product_count', (select count(*) from public.products where business_id = p_business_id and not is_archived),
      'stock_units', (select coalesce(sum(quantity), 0) from public.products where business_id = p_business_id and not is_archived),
      'stock_value_at_cost', case when current_role in ('owner', 'manager')
        then (select coalesce(sum(cost_price * quantity), 0) from public.products where business_id = p_business_id and not is_archived)
        else null end,
      'low_stock_count', (select count(*) from public.products where business_id = p_business_id and not is_archived and quantity <= low_stock_threshold),
      'out_of_stock_count', (select count(*) from public.products where business_id = p_business_id and not is_archived and quantity = 0)
    )
  );
end;
$$;

revoke all on function public.create_sale(uuid, text, text, jsonb) from public, anon;
revoke all on function public.list_products(uuid, text, text, text, text, integer, integer) from public, anon;
revoke all on function public.create_product(uuid, text, text, text, numeric, numeric, integer, integer, uuid) from public, anon;
revoke all on function public.get_product_detail(uuid, uuid) from public, anon;
revoke all on function public.get_sale_detail(uuid, uuid) from public, anon;
revoke all on function public.adjust_stock(uuid, uuid, integer, text, text, uuid) from public, anon;
revoke all on function public.get_business_dashboard(uuid) from public, anon;
revoke all on function public.get_business_reports(uuid, date, date) from public, anon;
grant execute on function public.create_sale(uuid, text, text, jsonb) to authenticated;
grant execute on function public.list_products(uuid, text, text, text, text, integer, integer) to authenticated;
grant execute on function public.create_product(uuid, text, text, text, numeric, numeric, integer, integer, uuid) to authenticated;
grant execute on function public.get_product_detail(uuid, uuid) to authenticated;
grant execute on function public.get_sale_detail(uuid, uuid) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, text, text, uuid) to authenticated;
grant execute on function public.get_business_dashboard(uuid) to authenticated;
grant execute on function public.get_business_reports(uuid, date, date) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'products'
    ) then
      alter publication supabase_realtime add table public.products;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sales'
    ) then
      alter publication supabase_realtime add table public.sales;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stock_movements'
    ) then
      alter publication supabase_realtime add table public.stock_movements;
    end if;
  end if;
end;
$$;

commit;
