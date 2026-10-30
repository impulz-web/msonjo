import Link from 'next/link';
import InventoryPageHeader from '../shared/InventoryPageHeader';
import ProductTable from './ProductTable';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { jsonNumber, jsonObject, jsonString, parseProduct, type ProductRow } from '@/lib/bizzflow/operations-data';

type ProductSearchParams = {
  q?: string;
  category?: string;
  stock?: string;
  sort?: string;
  page?: string;
  notice?: string;
};

function queryHref(params: ProductSearchParams, page: number) {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.stock) query.set('stock', params.stock);
  if (params.sort) query.set('sort', params.sort);
  query.set('page', String(page));
  return `/products?${query.toString()}`;
}

export default async function ProductsPage({ searchParams }: { searchParams: ProductSearchParams }) {
  const params = {
    q: (searchParams.q ?? '').slice(0, 100),
    category: (searchParams.category ?? '').slice(0, 100),
    stock: ['all', 'low', 'out', 'in_stock'].includes(searchParams.stock ?? '')
      ? searchParams.stock ?? 'all' : 'all',
    sort: ['name', 'quantity', 'created_at'].includes(searchParams.sort ?? '')
      ? searchParams.sort ?? 'name' : 'name',
    page: Math.max(1, Math.min(10000, Number.parseInt(searchParams.page ?? '1', 10) || 1)),
  };
  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('list_products', {
    p_business_id: business.id,
    p_search: params.q,
    p_category: params.category || null,
    p_stock_status: params.stock,
    p_sort: params.sort,
    p_limit: 50,
    p_offset: (params.page - 1) * 50,
  });

  const response = error ? null : jsonObject(data);
  const productValues = response?.items;
  const products: ProductRow[] = Array.isArray(productValues)
    ? productValues.map((row) => parseProduct(row)).filter((row): row is ProductRow => row !== null)
    : [];
  const total = jsonNumber(response?.total) ?? 0;
  const categoriesValue = response?.categories;
  const categories = Array.isArray(categoriesValue)
    ? categoriesValue.map((value) => jsonString(value)).filter((value): value is string => value !== null)
    : [];
  const base = { q: params.q, category: params.category, stock: params.stock, sort: params.sort };

  return (
    <>
      <InventoryPageHeader
        title="Products"
        description="Search and manage product details and current stock."
        action={{ label: 'Add product', href: '/products/new' }}
      />
      {searchParams.notice === 'deleted' ? <p role="status" className="mb-4 rounded border border-neutral-200 bg-[#F5F5F5] p-3 text-sm">Product permanently deleted.</p> : null}
      {searchParams.notice === 'delete-history' ? <p role="alert" className="mb-4 rounded border border-neutral-200 bg-[#F5F5F5] p-3 text-sm">This product has sales or stock history and cannot be permanently deleted. Archive it to remove it from active inventory while preserving its records.</p> : null}
      {searchParams.notice === 'delete-error' ? <p role="alert" className="mb-4 rounded border border-neutral-200 bg-[#F5F5F5] p-3 text-sm">Product could not be deleted. Refresh the product list and try again.</p> : null}
      {searchParams.notice === 'archived' ? <p role="status" className="mb-4 rounded border border-neutral-200 bg-[#F5F5F5] p-3 text-sm">Product archived. Existing sales and stock history were preserved.</p> : null}
      {searchParams.notice === 'archive-error' ? <p role="alert" className="mb-4 rounded border border-neutral-200 bg-[#F5F5F5] p-3 text-sm">Product could not be archived. Refresh the product list and try again.</p> : null}
      {error ? (
        <div role="alert" className="rounded border border-neutral-200 bg-[#F5F5F5] p-4 text-sm text-neutral-700">
          Product data is unavailable. Confirm that the MSONJO operations migration is applied.
        </div>
      ) : (
        <>
          <form method="get" className="mb-5 grid gap-3 rounded border border-neutral-200 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2">
              <label htmlFor="q" className="mb-1 block text-xs font-medium">Search name or product code</label>
              <input id="q" name="q" defaultValue={params.q} maxLength={100}
                className="min-h-10 w-full rounded border border-neutral-300 px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="category" className="mb-1 block text-xs font-medium">Category</label>
              <select id="category" name="category" defaultValue={params.category}
                className="min-h-10 w-full rounded border border-neutral-300 bg-white px-3 text-sm">
                <option value="">All categories</option>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="stock" className="mb-1 block text-xs font-medium">Stock status</label>
              <select id="stock" name="stock" defaultValue={params.stock}
                className="min-h-10 w-full rounded border border-neutral-300 bg-white px-3 text-sm">
                <option value="all">All active</option>
                <option value="low">Low stock</option>
                <option value="out">Out of stock</option>
                <option value="in_stock">In stock</option>
              </select>
            </div>
            <div>
              <label htmlFor="sort" className="mb-1 block text-xs font-medium">Sort by</label>
              <select id="sort" name="sort" defaultValue={params.sort}
                className="min-h-10 w-full rounded border border-neutral-300 bg-white px-3 text-sm">
                <option value="name">Name</option>
                <option value="quantity">Quantity</option>
                <option value="created_at">Recently added</option>
              </select>
            </div>
            <div className="flex items-end gap-3 sm:col-span-2 lg:col-span-5">
              <button className="min-h-10 rounded bg-[#E31E24] px-4 text-sm font-medium !text-white hover:!text-white">Apply filters</button>
              <Link href="/products" className="self-center text-sm text-[#E31E24] underline">Clear</Link>
            </div>
          </form>
          <div className="mb-3 flex items-center justify-between text-sm text-neutral-600">
            <p>{total} active {total === 1 ? 'product' : 'products'}</p>
            <p>Stock valuation uses cost price.</p>
          </div>
          <ProductTable products={products} canManage />
          {total > 50 ? (
            <nav aria-label="Product pages" className="mt-4 flex items-center justify-between text-sm">
              {params.page > 1 ? <Link href={queryHref(base, params.page - 1)} className="text-[#E31E24] underline">Previous</Link> : <span />}
              <span>Page {params.page} of {Math.ceil(total / 50)}</span>
              {params.page * 50 < total ? <Link href={queryHref(base, params.page + 1)} className="text-[#E31E24] underline">Next</Link> : <span />}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}
