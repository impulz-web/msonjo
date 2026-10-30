import Link from 'next/link';
import { notFound } from 'next/navigation';
import InventoryPageHeader from '@/features/bizzflow/shared/InventoryPageHeader';
import ProductForm from '@/features/bizzflow/operations/ProductForm';
import { getActiveBusinessContext } from '@/lib/bizzflow/context';
import { parseProduct } from '@/lib/bizzflow/operations-data';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, business } = await getActiveBusinessContext();
  const { data, error } = await supabase.rpc('get_product_detail', {
    p_business_id: business.id,
    p_product_id: id,
  });
  if (error) return <p role="alert" className="text-sm text-neutral-700">Product details could not be loaded.</p>;
  const product = parseProduct(data);
  if (!product || product.is_archived) notFound();
  const costPrice = product.cost_price;
  if (costPrice === null) return <p role="alert" className="text-sm text-neutral-700">Cost price is not available to this role.</p>;
  return (
    <>
      <InventoryPageHeader title="Edit product" description={`Update details for ${product.name}. Stock is managed through recorded movements.`} />
      <ProductForm product={{ ...product, cost_price: costPrice }} />
      <Link href={`/products/${id}`} className="mt-5 inline-flex text-sm text-[#E31E24] underline">Cancel</Link>
    </>
  );
}
