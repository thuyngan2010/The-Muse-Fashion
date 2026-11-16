const base = (process.env.WEB_BASE_URL ?? 'http://localhost:4200').replace(/\/$/, '');
const accounts = [
  ['admin', process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD,
    ['/users/me', '/payments', '/admin/users', '/admin/settings', '/admin/reports/sales', '/admin/audit-logs', '/admin/payment-events', '/admin/vouchers', '/admin/lookbooks', '/admin/orders', '/admin/products', '/admin/inventory', '/admin/inventory/ledger', '/admin/refunds', '/admin/moderation']],
  ['staff', process.env.E2E_STAFF_EMAIL, process.env.E2E_STAFF_PASSWORD,
    ['/users/me', '/admin/lookbooks', '/admin/orders', '/admin/products', '/admin/inventory', '/admin/inventory/ledger', '/admin/refunds', '/admin/moderation']],
  ['customer', process.env.E2E_CUSTOMER_EMAIL, process.env.E2E_CUSTOMER_PASSWORD,
    ['/users/me', '/users/me/addresses', '/orders', '/cart', '/payments', '/notifications', '/ai/jobs']],
];
let failed = 0;
const page = await fetch(`${base}/`);
console.log(`${page.ok ? 'OK' : 'FAIL'} frontend: ${page.status}`);
if (!page.ok) failed++;
const runtime = await fetch(`${base}/runtime-config.js`);
const runtimeText = await runtime.text();
console.log(`${runtime.ok && runtimeText.includes('/api/v1') ? 'OK' : 'FAIL'} runtime API config: ${runtime.status}`);
if (!runtime.ok || !runtimeText.includes('/api/v1')) failed++;
async function request(path, init = {}) {
  const response = await fetch(`${base}/api/v1${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}
function check(name, response, body, predicate = () => true) {
  const ok = response.ok && predicate(body);
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}: ${response.status}${ok ? '' : ` ${body.code ?? body.message ?? ''}`}`);
  if (!ok) failed++;
}
let sampleProduct;
for (const [name, path, predicate] of [
  ['categories', '/categories', x => Array.isArray(x.items)],
  ['products', '/products?limit=2', x => Array.isArray(x.items)],
  ['lookbooks', '/lookbooks', x => Array.isArray(x.items)],
  ['community', '/community/posts', x => Array.isArray(x.items)],
]) {
  const { response, body } = await request(path);
  check(name, response, body, predicate);
  if (name === 'products') sampleProduct = body.items?.[0];
}
if (sampleProduct?.slug) {
  const result = await request(`/products/${encodeURIComponent(sampleProduct.slug)}`);
  check('product detail', result.response, result.body, x => x.id === sampleProduct.id);
}
for (const [name, email, password, routes] of accounts) {
  if (!email || !password) throw new Error(`Missing E2E_${name.toUpperCase()}_EMAIL/PASSWORD`);
  const { response, body } = await request('/auth/login', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ email, password }) });
  check(`${name} login`, response, body, x => !!x.accessToken && x.user?.role === name.toUpperCase());
  if (!body.accessToken) continue;
  const headers = { Authorization: `Bearer ${body.accessToken}` };
  for (const path of routes) {
    const result = await request(path, { headers });
    const shapeChecks = {
      '/admin/reports/sales': x => Array.isArray(x.topProducts) && x.topProducts.every(item => typeof item.productName === 'string' && item.productName.length > 0),
      '/admin/audit-logs': x => Array.isArray(x.items),
      '/admin/payment-events': x => Array.isArray(x.items),
      '/admin/orders': x => Array.isArray(x.items) && x.items.every(order => Number.isInteger(order.itemCount) && typeof order.shippingSnapshot?.receiver === 'string'),
      '/admin/inventory': x => Array.isArray(x.items) && x.items.every(item => typeof item.productName === 'string' && item.productName.length > 0),
      '/admin/inventory/ledger': x => Array.isArray(x.items) && x.items.every(item => typeof item.type === 'string' && typeof item.quantity === 'number'),
    };
    check(`${name} ${path}`, result.response, result.body, shapeChecks[path] ?? (() => true));
    if (name === 'admin' && path === '/admin/lookbooks' && result.body.items?.length) {
      const detail = await request(`/admin/lookbooks/${result.body.items[0].id}`, { headers });
      check('admin lookbook detail', detail.response, detail.body, x => Array.isArray(x.items));
    }
    if (name === 'customer' && path === '/orders' && result.body.items?.length) {
      const detail = await request(`/orders/${result.body.items[0].id}`, { headers });
      check('customer order detail', detail.response, detail.body, x => Array.isArray(x.items));
    }
  }
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (cookie) {
    const result = await request('/auth/refresh', { method: 'POST', headers: { Cookie: cookie, Origin: base } });
    check(`${name} cookie refresh`, result.response, result.body, x => !!x.accessToken);
  } else { console.log(`FAIL ${name} refresh cookie absent`); failed++; }
}
if (failed) process.exitCode = 1;
