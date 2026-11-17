# Quy chuẩn giao diện MUSE

Nguồn: các trang đã dựng theo Figma (`cart`, `order-detail`, `product`, `addresses`, `account-sidebar`, `header`, `footer`) và `apps/web/src/styles.css`. Biến Figma của file không khai báo variable nào (`get_variable_defs` trả rỗng), nên giá trị dưới đây rút ra từ code đã khớp Figma.

Nguyên tắc: không góc bo (trừ nút "MUA NGAY" bo 15px và avatar/ biểu tượng tròn), viền mảnh 1px, nhãn nhỏ chữ hoa giãn chữ, tiêu đề serif.

## 1. Màu

Biến mới `--ui-*` (thêm vào `styles.css`, không đổi biến `--color-*` cũ). Trang mới dùng `--ui-*`.

| Biến | Giá trị | Vai trò |
|---|---|---|
| `--ui-bg` | `#ffffff` | Nền trang, thẻ |
| `--ui-bg-soft` | `#f5f3f3` | Nền thanh phụ, ô nhãn, hàng đầu bảng |
| `--ui-bg-image` | `#efeded` | Khung ảnh khi chưa có ảnh |
| `--ui-ink` | `#171717` | Chữ chính, viền đậm, nút đen |
| `--ui-ink-soft` | `#444748` | Chữ phụ, mô tả |
| `--ui-subtle` | `#747878` | Chú thích, giá gạch, nút tắt |
| `--ui-line` | `#c4c7c7` | Viền thẻ, đường kẻ chính |
| `--ui-line-soft` | `#e3e2e2` | Đường kẻ phụ trong thẻ |
| `--ui-pink` | `#f4b8c1` | Nút chính hồng, hover liên kết |
| `--ui-pink-soft` | `#ffd9e1` | Nhãn, tab nhấn, nền mục chọn |
| `--ui-accent` | `#8f485d` | Nhãn nhỏ (eyebrow), icon, nhấn |
| `--ui-price` | `#c52929` | Giá, tổng tiền |
| `--ui-danger` / `-bg` | `#9b2c2c` / `#fff1f1` | Lỗi, xóa, hủy |
| `--ui-success` / `-bg` | `#276749` / `#edf8f1` | Thành công, còn hàng |
| `--ui-warning` / `-bg` | `#8c641a` / `#fff8e8` | Chờ xử lý, cảnh báo |
| `--ui-info` / `-bg` | `#3f5f7e` / `#eff5fa` | Thông tin, đang chuẩn bị |

Lưu ý: các trang cũ còn dùng vài màu lệch (`#de233f` nút xóa, `#a33d3d`, `#296348`, `#5f5353` viền ô nhập). Trang mới dùng bảng trên.

## 2. Chữ

Font: `--font-serif` (Playfair Display) cho tiêu đề; `--font-sans` (Montserrat) cho mọi thứ còn lại. Cả hai được nạp ở `styles.css`.

| Vai trò | Font | Cỡ / dòng | Trọng lượng | Ghi chú |
|---|---|---|---|---|
| H1 tiêu đề trang | serif | 40 / 48px (mobile 34px) | 400 | `letter-spacing:-1px` |
| H2 tiêu đề khối, thẻ tóm tắt | serif | 28 / 36px hoặc 22 / 30px | 400 / 500 | |
| H3 tên mục | serif | 18 / 30px | 400 | |
| Nhãn nhỏ (eyebrow) | sans | 11px | 600–700 | CHỮ HOA, `letter-spacing:1.1px`, màu `--ui-accent` |
| Nút | sans | 11–13px | 700 | CHỮ HOA, `letter-spacing:.65–1.3px` |
| Nội dung | sans | 13–14 / 1.5–1.65 | 400 | màu `--ui-ink-soft` |
| Chú thích | sans | 12px | 400 | màu `--ui-subtle` hoặc `--ui-ink-soft` |
| Giá | sans | 14–16px | 600 | `letter-spacing:.7px`; tổng tiền dùng serif 30px, `--ui-price` |

## 3. Khoảng cách và lưới

- Chiều rộng tối đa trang: `--ui-page-max` 1280px; lề ngang `--ui-page-pad` 48px (dưới 980px: 28px; dưới 640px: 16–18px).
- Trang tài khoản: `width:min(1184px,calc(100% - 48px))`, padding trên 40px, dưới 96px.
- Nhịp khoảng cách: 8 / 12 / 16 / 24 / 32 / 48 / 64px.
- Lưới 2 cột (nội dung + tóm tắt): `grid-template-columns:minmax(0,2.16fr) minmax(330px,1fr); gap:48px`.
- Lưới tài khoản: `280px minmax(0,1fr); gap:32px`.
- Lưới thẻ sản phẩm: 4 cột, `gap:24px` (tablet 2 cột, mobile 1 cột); ảnh tỉ lệ 3/4.
- Breakpoint: **980px** xếp 1 cột; **640px** nút rộng hết khung, lề thu nhỏ.

## 4. Thành phần

**Nút chính (hồng) / nút đen / nút phụ viền / link chữ**

```css
.btn { min-height:44px; padding:0 24px; border:1px solid var(--ui-ink); border-radius:0;
  font:700 12px var(--font-sans); letter-spacing:.08em; text-transform:uppercase; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center; gap:8px; }
.btn-pink  { background:var(--ui-pink); color:var(--ui-ink); }       /* hành động chính */
.btn-black { background:var(--ui-ink);  color:#fff; }                /* hành động chính thay thế */
.btn-line  { background:#fff;           color:var(--ui-ink); }       /* hành động phụ */
.btn:hover:not(:disabled) { background:var(--ui-ink); color:#fff; }  /* pink/line hover */
.btn:disabled { border-color:var(--ui-line); background:var(--ui-bg-image); color:var(--ui-subtle); cursor:not-allowed; }
.link-text { background:none; border:0; padding:0; font:700 11px var(--font-sans); letter-spacing:.1em;
  text-decoration:underline; text-underline-offset:5px; cursor:pointer; }
@media (max-width:640px){ .btn { width:100%; } }
```

Nút "MUA NGAY" (thẻ sản phẩm): `background:var(--ui-ink); color:#fff; border-radius:15px; min-height:40px`, hover nền `--ui-pink`, chữ đen.
Mỗi màn hình chỉ một nút chính; hành động phụ dùng `.btn-line` hoặc `.link-text`. Hành động hủy/xóa dùng chữ `--ui-danger`, không dùng nền đỏ tươi.

**Ô nhập**

```css
.field label { display:block; margin-bottom:8px; font:700 11px var(--font-sans); letter-spacing:.55px; color:var(--ui-ink-soft); }
.field input, .field textarea, .field select { width:100%; min-height:44px; padding:0 14px;
  border:1px solid var(--ui-ink); border-radius:0; background:#fff; font:400 13px var(--font-sans); }
.field input:focus-visible { outline:2px solid var(--ui-accent); outline-offset:2px; }
.field [aria-invalid="true"] { border-color:var(--ui-danger); }
.field .hint { margin-top:6px; font-size:12px; color:var(--ui-subtle); }
.field .error { margin-top:6px; font-size:12px; color:var(--ui-danger); }
```

**Thẻ**

```css
.card { border:1px solid var(--ui-line); background:#fff; padding:32px; }          /* thẻ thường */
.card--strong { border-color:var(--ui-ink); }                                       /* thẻ tóm tắt */
.card h2 { margin:0 0 24px; padding-bottom:12px; border-bottom:1px solid var(--ui-line);
  font:500 22px/30px var(--font-serif); }
```

**Nhãn trạng thái**

```css
.badge { display:inline-flex; padding:6px 12px; border:1px solid currentColor;
  font:600 10px var(--font-sans); letter-spacing:1px; text-transform:uppercase; }
.badge--success { color:var(--ui-success); background:var(--ui-success-bg); }
.badge--warning { color:var(--ui-warning); background:var(--ui-warning-bg); }
.badge--info    { color:var(--ui-info);    background:var(--ui-info-bg); }
.badge--danger  { color:var(--ui-danger);  background:var(--ui-danger-bg); }
```

Trạng thái đơn chỉ gồm: Chờ thanh toán (warning), Đã xác nhận (success), Đang chuẩn bị (info), Đang giao (info), Đã giao (success), Đã hủy (danger), Chờ hoàn tiền (warning). Nhãn chữ lấy từ hằng dùng chung (block D8), không viết lại trong trang.

**Bảng tóm tắt tiền**

```html
<div class="summary-lines">
  <div class="summary-line"><span>Tạm tính</span><span>1.200.000₫</span></div>
  <div class="summary-line"><span>Phí vận chuyển</span><span>30.000₫</span></div>
  <div class="summary-total"><span>TỔNG CỘNG</span><strong>1.230.000₫</strong></div>
</div>
```

```css
.summary-line { display:flex; justify-content:space-between; gap:20px; margin:14px 0; font-size:13px; color:var(--ui-ink-soft); }
.summary-line > :last-child { color:var(--ui-ink); text-align:right; }
.summary-total { display:grid; gap:10px; margin-top:20px; padding-top:18px; border-top:1px solid var(--ui-line); }
.summary-total strong { color:var(--ui-price); font:600 30px/1.15 var(--font-serif); text-align:right; }
```

**Hộp thông báo**

```css
.alert { padding:16px 20px; border:1px solid var(--ui-line); background:var(--ui-bg-soft); font-size:13px; line-height:1.6; }
.alert--error   { border-color:var(--ui-danger);  background:var(--ui-danger-bg);  color:var(--ui-danger); }
.alert--success { border-color:var(--ui-success); background:var(--ui-success-bg); color:var(--ui-success); }
.alert--warning { border-color:var(--ui-warning); background:var(--ui-warning-bg); color:var(--ui-warning); }
```

Lỗi gắn `role="alert"`; thông tin/thành công gắn `role="status"`. Toast dùng `ToastService` có sẵn cho phản hồi ngắn sau thao tác.

## 5. Mẫu bố cục

**Tiêu đề trang (mọi trang)**: nhãn nhỏ (tùy chọn) + H1 serif + dòng mô tả `--ui-ink-soft`, dưới là đường kẻ `1px solid var(--ui-line-soft)` (trang luồng mua dùng `--ui-ink`).

**Trang tài khoản** (sidebar + nội dung): dùng `<fc-account-sidebar activeItem="...">`.

```html
<main class="account-shell"><fc-account-sidebar activeItem="orders" /><section class="content">…</section></main>
```
```css
.account-shell { width:min(1184px,calc(100% - 48px)); margin:0 auto; padding:40px 0 96px;
  display:grid; grid-template-columns:280px minmax(0,1fr); gap:32px; align-items:start; }
@media (max-width:980px){ .account-shell { width:min(100% - 32px,760px); grid-template-columns:1fr; } }
@media (max-width:640px){ .account-shell { width:100%; padding:20px 16px 64px; } }
```

**Trang luồng mua** (nội dung + tóm tắt, như giỏ hàng): `.container{width:min(100%,1280px);margin:0 auto;padding:64px 48px}` + lưới 2 cột ở mục 3; thẻ tóm tắt `.card--strong` nằm cột phải; dưới 980px tóm tắt xuống dưới nội dung.

**Trang giới thiệu / lưới**: khối full-width ngăn bằng đường kẻ `--ui-line-soft`, mỗi khối có nhãn nhỏ + H2 serif 40px; lưới 3–4 cột gap 24–32px, ảnh nền `--ui-bg-image`; dưới 980px còn 2 cột, dưới 640px 1 cột.

## 6. Trạng thái tải, rỗng, lỗi, thành công

Dùng component chung `<fc-page-state>` (`components/page-state.component.ts`, standalone):

| Input | Ý nghĩa |
|---|---|
| `kind` | `'loading' \| 'empty' \| 'error' \| 'success'` |
| `title`, `message` | Chữ hiển thị (viết trong `store-content.ts`, riêng lỗi API dùng chuỗi lỗi tiếng Việt hiện có) |
| `actionLabel` | Chữ nút; để trống thì không có nút |
| `actionLink` | Có giá trị thì nút là liên kết route; không thì nút phát `(action)` |

```html
<fc-page-state kind="loading" message="Đang tải..." />
<fc-page-state kind="empty" title="Chưa có đơn hàng" message="…" actionLabel="TIẾP TỤC MUA SẮM" actionLink="/products" />
<fc-page-state kind="error" title="Không thể tải dữ liệu" [message]="error()" actionLabel="THỬ LẠI" (action)="reload()" />
<fc-page-state kind="success" title="Đã lưu" message="…" actionLabel="QUAY LẠI" actionLink="/account" />
```

Quy tắc: tải lần đầu hiện `loading`; danh sách rỗng hiện `empty` kèm đường đi tiếp; lỗi luôn có nút "THỬ LẠI"; thành công sau thao tác nhỏ dùng toast, thành công cuối luồng dùng `success`. Nút trong trạng thái là hành động chính duy nhất của khối.

## 7. Admin

Khu quản trị (`/admin/*`) theo Figma "WebNC" (khung 14 — Dashboard, node `41:745`). Dùng chung với storefront: font, `--ui-*`, nút `.btn`. Biến riêng của admin nằm ở cuối `styles.css` (`--admin-*`). Các block admin sau (AD1…AD10) theo mục này.

**Khung trang** (`pages/admin/admin-layout.component.ts`)

- Sidebar rộng `--admin-sidebar-w` 250px, nền trắng, viền phải `--admin-line` (#e5e5e5), dính đầu trang (cao 100vh). Đầu sidebar cao 72px: logo `assets/brand/muse-logo-black.png` 90×29 + chữ "ADMIN PORTAL" (serif 10px, hoa, giãn .5px). Dưới là nhãn nhóm "QUẢN TRỊ HỆ THỐNG" (sans 10px đậm, hoa, màu ink 60%).
- Mục menu: cao ≥40px, chữ 13/18px, icon nét mảnh 18px, bo 4px. Mục đang mở: nền `--admin-nav-active-bg` (#f4b8c1), viền trái 2px `--admin-nav-active-edge` (#805159), chữ đậm. Hover: nền `--admin-nav-hover-bg`. Mục chỉ hiện khi người dùng có quyền; mục trỏ route chưa tồn tại thì ẩn.
- Đáy sidebar: thẻ người dùng (avatar tròn đen 32px chữ cái đầu, tên đậm 13px, vai trò tiếng Việt "Quản trị viên" / "Nhân viên" 10px) + nút đăng xuất.
- Thanh trên cao `--admin-topbar-h` 72px, nền trắng, viền dưới `--admin-line-soft` (#e9e8e7): ngày hôm nay "Thứ Ba, 17/11/2026" và thẻ người dùng, căn phải. Dưới 900px sidebar ẩn, hiện nút "Menu" mở danh sách mục trong cửa sổ.
- Nền vùng nội dung `--admin-canvas` (#faf9f9), lề trong 30px (mobile 16px).

**Màu**: nền trắng cho thẻ, bảng, sidebar; hồng `--ui-pink` cho mục đang chọn và nút chính; chữ `--ui-ink`, chú thích `--ui-subtle`; đường kẻ `--admin-line` (khung lớn) và `--ui-line-soft` (trong bảng). Màu trạng thái dùng bảng `--ui-success|warning|info|danger` (mục 1).

**Chữ**: giống mục 2. Tiêu đề trang admin serif 28/36px; tiêu đề khối serif 22/30px; nhãn nhỏ sans 10–11px đậm, hoa, giãn chữ .5–1px; nội dung bảng 13px.

**Ô số liệu (KPI)**: thẻ trắng, viền 1px `--admin-line`, padding 20px; nhãn nhỏ hoa `--ui-subtle` ở trên, số serif 28px bên dưới, chú thích phạm vi 12px (ví dụ "trong 100 đơn gần nhất"). Không có dữ liệu thì hiện "—". Số tính ở client chỉ trên dữ liệu đã tải và phải ghi rõ phạm vi.

**Bảng**: viền ngoài 1px `--admin-line`; hàng đầu nền `--ui-bg-soft`, chữ nhỏ hoa 10–11px đậm; hàng dữ liệu cao ≥52px, đường kẻ `--ui-line-soft`, hover nền `--ui-bg-soft`; số tiền căn phải dạng 1.250.000đ; cuộn ngang trong khung khi hẹp.

**Nhãn trạng thái**: dùng `.badge` (mục 4) và nhãn tiếng Việt từ `shared/labels.ts`; không hiện enum thô (PENDING_REVIEW, SUSPENDED...), trừ mã quyền như `catalog.manage`.

**Tab**: hàng chữ hoa 11px đậm, tab đang chọn có viền dưới 2px `--ui-ink` (hoặc nền `--ui-pink-soft`), tab không đủ quyền thì không hiện. Dùng `role="tablist"`/`tab`.

**Drawer** (`components/admin-drawer.component.ts`, `<fc-admin-drawer>`): trượt từ phải, rộng 520px (tối đa 100vw), có nút đóng ở đầu, đóng bằng Esc hoặc bấm nền tối, khóa cuộn nền, giữ focus trong ngăn.

```html
<fc-admin-drawer [isOpen]="open()" eyebrow="ĐƠN HÀNG" title="DH-1001" subtitle="…" (close)="open.set(false)">
  …nội dung…
  <button drawer-footer class="btn btn-pink" type="button">LƯU</button>
</fc-admin-drawer>
```

**Nút**: dùng `.btn-pink` (chính, mỗi màn hình một nút), `.btn-black`, `.btn-line`, `.link-text` (mục 4); xóa/hủy dùng chữ `--ui-danger`. Nút chưa có backend thì không dựng; chỉ khi block ghi UI-ONLY mới dựng, kèm `data-ui-only`, `disabled`, `title="Tính năng sắp ra mắt"`.

**Bỏ khỏi Figma**: ô tìm kiếm ⌘K, chuông thông báo, chữ "Super Admin" (dùng vai trò thật), mọi số liệu mẫu (1.485.600.000đ, 8.450 khách...).
