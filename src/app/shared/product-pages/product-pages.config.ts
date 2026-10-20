import { ProductPagesConfig } from '@taliferro/ui/platform/product-pages.model';

/** Email Creator's Help and About pages (the shared template). */
export const PRODUCT_PAGES_CONFIG: ProductPagesConfig = {
  key: 'email-creator',
  logo: 'assets/email-creator-logo.png',
  logoFill: true,
  openRoute: '/',
  // There's no app-wide menu here; each page draws its own Menu button.
  ownMenu: true,
};
