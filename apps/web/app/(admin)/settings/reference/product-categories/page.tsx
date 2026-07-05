import { redirect } from 'next/navigation';

/** Bare /settings/reference/product-categories → localized canonical route. */
export default function ProductCategoriesRedirectPage() {
  redirect('/en/settings/reference/product-categories');
}
