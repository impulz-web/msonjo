-- Preserve inventory and financial history when a managed Auth user is deleted.
-- The immutable records remain; only the deleted user's attribution is cleared.

begin;

alter table public.sales
  alter column created_by drop not null,
  drop constraint sales_created_by_fkey,
  add constraint sales_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.stock_movements
  alter column created_by drop not null,
  drop constraint stock_movements_created_by_fkey,
  add constraint stock_movements_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.sale_payments
  alter column created_by drop not null,
  drop constraint sale_payments_created_by_fkey,
  add constraint sale_payments_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.sale_edits
  alter column changed_by drop not null,
  drop constraint sale_edits_changed_by_fkey,
  add constraint sale_edits_changed_by_fkey
    foreign key (changed_by) references auth.users(id) on delete set null;

commit;
