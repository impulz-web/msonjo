-- Bizzflow tenant, membership, inventory, sales, and subscription foundation.
-- Apply only to a dedicated Bizzflow Supabase project after review.

begin;

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 100),
  slug text not null unique
    check (
      char_length(slug) between 3 and 48
      and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    ),
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'attendant')),
  created_at timestamptz not null default now(),
  constraint business_members_business_user_unique unique (business_id, user_id)
);

create index business_members_user_business_idx
  on public.business_members (user_id, business_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  sku text,
  category text,
  cost_price numeric(12, 2) not null check (cost_price >= 0 and cost_price <> 'NaN'::numeric),
  selling_price numeric(12, 2) not null check (selling_price >= 0 and selling_price <> 'NaN'::numeric),
  quantity integer not null default 0 check (quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_business_id_id_unique unique (business_id, id)
);

create index products_business_name_idx on public.products (business_id, name);
create unique index products_business_sku_unique_idx
  on public.products (business_id, lower(sku))
  where sku is not null;

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  total_amount numeric(12, 2) not null
    check (total_amount >= 0 and total_amount <> 'NaN'::numeric),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 128),
  created_at timestamptz not null default now(),
  constraint sales_business_id_id_unique unique (business_id, id),
  constraint sales_business_idempotency_key_unique unique (business_id, idempotency_key)
);

create index sales_business_created_at_idx
  on public.sales (business_id, created_at desc);
create index sales_business_created_by_created_at_idx
  on public.sales (business_id, created_by, created_at desc);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  sale_id uuid not null,
  product_id uuid not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0 and unit_price <> 'NaN'::numeric),
  subtotal numeric(12, 2) not null check (subtotal >= 0 and subtotal <> 'NaN'::numeric),
  created_at timestamptz not null default now(),
  constraint sale_items_business_sale_fk
    foreign key (business_id, sale_id)
    references public.sales (business_id, id) on delete cascade,
  constraint sale_items_business_product_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id) on delete restrict,
  constraint sale_items_subtotal_matches_quantity
    check (subtotal = round(quantity * unit_price, 2))
);

create index sale_items_business_sale_idx on public.sale_items (business_id, sale_id);
create index sale_items_business_product_idx on public.sale_items (business_id, product_id);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id uuid not null,
  movement_type text not null
    check (movement_type in ('sale', 'restock', 'adjustment', 'return', 'correction')),
  quantity_change integer not null check (quantity_change <> 0),
  reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint stock_movements_business_product_fk
    foreign key (business_id, product_id)
    references public.products (business_id, id) on delete restrict
);

create index stock_movements_business_created_at_idx
  on public.stock_movements (business_id, created_at desc);
create index stock_movements_business_product_created_at_idx
  on public.stock_movements (business_id, product_id, created_at desc);

create table public.subscriptions (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'standard', 'premium')),
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

create or replace function public.is_business_member(p_business_id uuid)
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
    );
$$;

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
        and member.role = any(coalesce(p_allowed_roles, array[]::text[]))
    );
$$;

create or replace function public.create_business(
  p_name text,
  p_slug text,
  p_category text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  authenticated_user_id uuid := auth.uid();
  new_business_id uuid;
begin
  if authenticated_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 2 and 100 then
    raise exception using errcode = '22023', message = 'Invalid business name';
  end if;

  if p_slug is null
    or char_length(p_slug) not between 3 and 48
    or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  then
    raise exception using errcode = '22023', message = 'Invalid business slug';
  end if;

  if p_category is not null and char_length(btrim(p_category)) > 80 then
    raise exception using errcode = '22023', message = 'Invalid business category';
  end if;

  insert into public.businesses (name, slug, category)
  values (btrim(p_name), p_slug, nullif(btrim(p_category), ''))
  returning id into new_business_id;

  insert into public.business_members (business_id, user_id, role)
  values (new_business_id, authenticated_user_id, 'owner');

  insert into public.subscriptions (business_id)
  values (new_business_id);

  return new_business_id;
end;
$$;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.is_business_member(uuid) from public, anon;
revoke all on function public.has_business_role(uuid, text[]) from public, anon;
revoke all on function public.create_business(text, text, text) from public, anon;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_business_role(uuid, text[]) to authenticated;
grant execute on function public.create_business(text, text, text) to authenticated;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;
alter table public.subscriptions enable row level security;

revoke all on table
  public.businesses,
  public.business_members,
  public.products,
  public.sales,
  public.sale_items,
  public.stock_movements,
  public.subscriptions
from PUBLIC, anon, authenticated;

grant select on public.businesses to authenticated;
grant update (name, slug, category) on public.businesses to authenticated;

grant select on public.business_members to authenticated;

grant select on public.products to authenticated;
grant insert (business_id, name, sku, category, cost_price, selling_price, low_stock_threshold)
  on public.products to authenticated;
grant update (name, sku, category, cost_price, selling_price, low_stock_threshold)
  on public.products to authenticated;

grant select on public.sales, public.sale_items, public.stock_movements to authenticated;
grant select on public.subscriptions to authenticated;

create policy businesses_select_member
  on public.businesses for select to authenticated
  using (public.is_business_member(id));

create policy businesses_update_owner
  on public.businesses for update to authenticated
  using (public.has_business_role(id, array['owner']::text[]))
  with check (public.has_business_role(id, array['owner']::text[]));

create policy business_members_select_business_members
  on public.business_members for select to authenticated
  using (user_id = auth.uid() or public.is_business_member(business_id));

create policy products_select_business_members
  on public.products for select to authenticated
  using (public.is_business_member(business_id));

create policy products_insert_owner_manager
  on public.products for insert to authenticated
  with check (public.has_business_role(business_id, array['owner', 'manager']::text[]));

create policy products_update_owner_manager
  on public.products for update to authenticated
  using (public.has_business_role(business_id, array['owner', 'manager']::text[]))
  with check (public.has_business_role(business_id, array['owner', 'manager']::text[]));

create policy sales_select_authorized_members
  on public.sales for select to authenticated
  using (
    public.has_business_role(business_id, array['owner', 'manager']::text[])
    or (created_by = auth.uid() and public.is_business_member(business_id))
  );

create policy sale_items_select_authorized_sales
  on public.sale_items for select to authenticated
  using (
    exists (
      select 1
      from public.sales as sale
      where sale.business_id = sale_items.business_id
        and sale.id = sale_items.sale_id
        and (
          public.has_business_role(sale.business_id, array['owner', 'manager']::text[])
          or (sale.created_by = auth.uid() and public.is_business_member(sale.business_id))
        )
    )
  );

create policy stock_movements_select_authorized_members
  on public.stock_movements for select to authenticated
  using (
    public.has_business_role(business_id, array['owner', 'manager']::text[])
    or (created_by = auth.uid() and public.is_business_member(business_id))
  );

create policy subscriptions_select_owner
  on public.subscriptions for select to authenticated
  using (public.has_business_role(business_id, array['owner']::text[]));

commit;
