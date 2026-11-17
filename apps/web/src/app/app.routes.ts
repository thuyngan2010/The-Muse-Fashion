import { AdminLandingPage, ForbiddenPage } from './pages/admin/access.page';
import { Routes } from '@angular/router';
import { authGuard, adminGuard, staffGuard, commerceGuard, permissionGuard } from './guards/auth.guard';

import { HomePage } from './pages/home.page';
import { CatalogPage } from './pages/catalog.page';
import { ProductPage } from './pages/product.page';
import { LookbooksPage } from './pages/lookbooks.page';
import { CommunityPage } from './pages/community.page';
import { AboutPage } from './pages/about.page';
import { CartPage } from './pages/cart.page';
import { CheckoutPage } from './pages/checkout.page';
import { PaymentPage } from './pages/payment.page';
import { OrdersPage } from './pages/orders.page';
import { OrderDetailPage } from './pages/order-detail.page';

import { AuthPage } from './pages/auth.page';
import { ProfilePage } from './pages/profile.page';
import { AccountPage } from './pages/account.page';
import { AddressesPage } from './pages/addresses.page';
import { NotificationsPage } from './pages/notifications.page';
import { VerifyPage } from './pages/verify.page';

import { AiTryOnPage } from './pages/ai-try-on.page';
import { AiMixMatchPage } from './pages/ai-mix-match.page';
import { AiHistoryPage } from './pages/ai-history.page';

import { AdminLayoutComponent } from './pages/admin/admin-layout.component';
import { AdminLookbooksPage } from './pages/admin/admin-lookbooks.page';
import { AdminReportsPage } from './pages/admin/admin-reports.page';
import { AdminOrdersPage } from './pages/admin/admin-orders.page';
import { AdminProductsPage } from './pages/admin/admin-products.page';
import { AdminInventoryPage } from './pages/admin/admin-inventory.page';
import { AdminVouchersPage } from './pages/admin/admin-vouchers.page';
import { AdminRefundsPage } from './pages/admin/admin-refunds.page';
import { AdminModerationPage } from './pages/admin/admin-moderation.page';
import { AdminUsersPage } from './pages/admin/admin-users.page';
import { AdminSettingsPage } from './pages/admin/admin-settings.page';

export const routes: Routes = [
  // Storefront & Catalog
  { path: '', component: HomePage, title: 'Cửa hàng thời trang cao cấp | Fashion Commerce' },
  { path: 'products', component: CatalogPage, title: 'Bộ sưu tập sản phẩm | Fashion Commerce' },
  { path: 'products/:slug', component: ProductPage, title: 'Chi tiết sản phẩm | Fashion Commerce' },
  { path: 'lookbooks', component: LookbooksPage, title: 'Bộ sưu tập Lookbook | Fashion Commerce' },
  { path: 'about', component: AboutPage, title: 'Về chúng tôi | Fashion Commerce' },
  { path: 'community', component: CommunityPage, title: 'Cộng đồng phong cách | Fashion Commerce' },

  // Shopping & Checkout
  { path: 'cart', component: CartPage, title: 'Giỏ hàng | Fashion Commerce' },
  { path: 'checkout', component: CheckoutPage, canActivate: [commerceGuard], title: 'Thanh toán đơn hàng | Fashion Commerce' },
  { path: 'payment/:orderId', component: PaymentPage, canActivate: [commerceGuard], title: 'Thanh toán VietQR | Fashion Commerce' },
  { path: 'orders', component: OrdersPage, canActivate: [commerceGuard], title: 'Lịch sử đơn hàng | Fashion Commerce' },
  { path: 'orders/:id', component: OrderDetailPage, canActivate: [authGuard], title: 'Chi tiết đơn hàng | Fashion Commerce' },

  // User Account & Authentication
  { path: 'auth', component: AuthPage, title: 'Đăng nhập / Đăng ký | Fashion Commerce' },
  { path: 'forgot-password', component: AuthPage, title: 'Quên mật khẩu | Fashion Commerce' },
  { path: 'reset-password', component: AuthPage, title: 'Đặt lại mật khẩu | Fashion Commerce' },
  { path: 'account', component: AccountPage, canActivate: [authGuard], title: 'Tổng quan tài khoản | Fashion Commerce' },
  { path: 'account/profile', redirectTo: 'profile', pathMatch: 'full' },
  { path: 'account/addresses', redirectTo: 'addresses', pathMatch: 'full' },
  { path: 'account/notifications', redirectTo: 'notifications', pathMatch: 'full' },
  { path: 'profile', component: ProfilePage, canActivate: [authGuard], title: 'Hồ sơ cá nhân | Fashion Commerce' },
  { path: 'addresses', component: AddressesPage, canActivate: [commerceGuard], title: 'Sổ địa chỉ | Fashion Commerce' },
  { path: 'notifications', component: NotificationsPage, canActivate: [authGuard], title: 'Hộp thư thông báo | Fashion Commerce' },
  { path: 'verify-email', component: VerifyPage, title: 'Xác minh Email | Fashion Commerce' },

  // AI Experiences
  { path: 'ai/try-on', component: AiTryOnPage, canActivate: [commerceGuard], title: 'Phòng thử đồ ảo AI Try-On | Fashion Commerce' },
  { path: 'ai/history', component: AiHistoryPage, canActivate: [commerceGuard], title: 'Lịch sử thử đồ | Fashion Commerce' },
  { path: 'ai/mix-match', component: AiMixMatchPage, canActivate: [commerceGuard], title: 'Gợi ý phối đồ AI Mix & Match | Fashion Commerce' },

  // Operations & Admin (Staff & Admin)
  {
    path: 'admin',
    component: AdminLayoutComponent,
    canActivate: [staffGuard],
    children: [
      { path: '', component: AdminLandingPage, pathMatch: 'full', title: 'Quản trị | Fashion Admin' },
      { path: 'reports', component: AdminReportsPage, canActivate: [adminGuard], title: 'Báo cáo doanh thu | Fashion Admin' },
      { path: 'orders', canActivate: [permissionGuard], data: { permission: 'order.read' }, component: AdminOrdersPage, title: 'Quản lý đơn hàng | Fashion Admin' },
      { path: 'products', canActivate: [permissionGuard], data: { permission: 'catalog.manage' }, component: AdminProductsPage, title: 'Quản lý sản phẩm | Fashion Admin' },
      { path: 'lookbooks', canActivate: [permissionGuard], data: { permission: 'catalog.manage' }, component: AdminLookbooksPage, title: 'Quản lý Lookbook | Fashion Admin' },
      { path: 'inventory', canActivate: [permissionGuard], data: { permission: 'inventory.manage' }, component: AdminInventoryPage, title: 'Kho hàng & Sổ cái | Fashion Admin' },
      { path: 'vouchers', component: AdminVouchersPage, canActivate: [adminGuard], title: 'Mã giảm giá Voucher | Fashion Admin' },
      { path: 'refunds', canActivate: [permissionGuard], data: { permission: 'refund.propose', alternativeGlobalPermission: 'payment.read' }, component: AdminRefundsPage, title: 'Hoàn tiền & Đối soát | Fashion Admin' },
      { path: 'moderation', canActivate: [permissionGuard], data: { permission: 'content.moderate' }, component: AdminModerationPage, title: 'Kiểm duyệt nội dung | Fashion Admin' },
      { path: 'users', component: AdminUsersPage, canActivate: [adminGuard], title: 'Người dùng & Nhân sự | Fashion Admin' },
      { path: 'settings', component: AdminSettingsPage, canActivate: [adminGuard], title: 'Cấu hình hệ thống | Fashion Admin' },
    ],
  },

  { path: 'forbidden', component: ForbiddenPage, title: 'Không có quyền truy cập' },
  // Fallback
  { path: '**', redirectTo: '' },
];
