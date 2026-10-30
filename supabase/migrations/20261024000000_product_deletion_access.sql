-- Allow business members to permanently delete products with no historical references.
-- Sale and stock foreign keys remain restrictive to preserve transaction history.

begin;

grant delete on public.products to authenticated;

drop policy if exists products_delete_business_members on public.products;
create policy products_delete_business_members
  on public.products for delete to authenticated
  using (public.is_business_member(business_id));

commit;
