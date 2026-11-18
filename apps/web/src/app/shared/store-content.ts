// Nội dung mẫu, nhóm cần xác nhận trước khi báo cáo.
// Thông tin liên hệ chỉ khai báo tại đây; mọi nơi khác import STORE_CONTACT.
// social để chuỗi rỗng thì icon hiển thị ở dạng chưa dùng được (UI-ONLY).
export const STORE_CONTACT = {
  hotline: '1900 6868',
  hotlineHref: 'tel:19006868',
  email: 'support@themuse.vn',
  address: 'Phường Linh Xuân, Thành phố Hồ Chí Minh',
  social: {
    facebook: '',
    instagram: '',
    tiktok: '',
  },
} as const;

export const STORE_CART_CONTENT = {
  deliveryNote: 'Thời gian giao hàng dự kiến được xác nhận tại bước thanh toán.',
  assurances: [
    'Điều kiện đổi trả được áp dụng theo chính sách hiện hành tại thời điểm mua.',
    'Thanh toán được xử lý theo phương thức hiển thị tại bước thanh toán.',
    `Hỗ trợ khách hàng: ${STORE_CONTACT.hotline}.`,
  ],
} as const;

export const STORE_ORDERS_CONTENT = {
  pendingPaymentNote: 'Đơn hàng có thể tự hủy nếu chưa được thanh toán.',
} as const;

export const STORE_ORDER_DETAIL_CONTENT = {
  vatNote: 'Đã bao gồm VAT.',
  addressSnapshotNote: 'Địa chỉ nhận hàng được lưu theo thông tin tại thời điểm đặt đơn.',
  supportDescription: 'MUSE hỗ trợ kiểm tra thông tin liên quan đến đơn hàng của bạn.',
  supportLabel: `Hỗ trợ đơn hàng: ${STORE_CONTACT.hotline}`,
  supportHref: STORE_CONTACT.hotlineHref,
} as const;

export const STORE_PROFILE_CONTENT = {
  googleAccount: {
    eyebrow: 'BẢO MẬT',
    title: 'Tài khoản đăng nhập bằng Google',
    text: 'Tài khoản này đăng nhập bằng Google nên chưa có mật khẩu MUSE. Bạn có thể đặt mật khẩu để đăng nhập bằng email và mật khẩu.',
    cta: 'Đặt mật khẩu',
  },
  securityNotes: [
    'Mật khẩu cần từ 12 đến 128 ký tự, có chữ hoa, chữ thường và số.',
    'Không chia sẻ mật khẩu hoặc thông tin phiên đăng nhập với người khác.',
    'Sau khi đổi mật khẩu, bạn sẽ được yêu cầu đăng nhập lại.',
  ],
} as const;

export const STORE_ADDRESSES_CONTENT = {
  checkoutAddressNote: 'Địa chỉ mặc định được ưu tiên khi bạn chọn địa chỉ nhận hàng ở bước thanh toán.',
} as const;

export const STORE_NOTIFICATIONS_CONTENT = {
  subtitle: 'Cập nhật mới nhất về đơn hàng và hoạt động của bạn tại MUSE.',
  emptyDescription: 'Khi có cập nhật về đơn hàng hoặc hoạt động tài khoản, thông báo sẽ xuất hiện tại đây.',
} as const;

export const STORE_AI_TRY_ON_CONTENT = {
  tips: 'Chọn ảnh toàn thân chụp thẳng, đủ sáng và trang phục hiện tại không che khuất vóc dáng.',
  privacy: 'Ảnh của bạn chỉ được xử lý để tạo kết quả thử đồ theo phiên hiện tại.',
  processingTime: 'Thời gian xử lý tham khảo khoảng 3 giây và có thể thay đổi theo trạng thái hệ thống.',
  commitments: [
    { title: 'Dữ liệu riêng tư', description: 'Ảnh được sử dụng cho phiên thử đồ của bạn.' },
    { title: 'Kết quả trực quan', description: 'Kết quả là hình ảnh mô phỏng để tham khảo.' },
    { title: 'Trang phục thật', description: 'Lựa chọn được lấy từ sản phẩm đang có tại MUSE.' },
    { title: 'Lịch sử đồng bộ', description: 'Các phiên đã tạo được hiển thị từ tài khoản của bạn.' },
  ],
} as const;

export const STORE_AI_HISTORY_CONTENT = {
  eyebrow: 'AI STUDIO',
  title: 'Lịch sử thử đồ của bạn',
  subtitle: 'Xem lại các bản thử đồ đã lưu từ tài khoản của bạn và mở lại kết quả bất kỳ lúc nào.',
  emptyTitle: 'Chưa có phiên phù hợp',
  emptyDescription: 'Các kết quả thử đồ của bạn sẽ xuất hiện tại đây.',
} as const;

export const STORE_PRODUCT_CONTENT = {
  tryOnLabel: 'Thử đồ trực tuyến',
  valueProps: ['Freeship 1000k', 'Đổi mẫu 15 ngày', 'Chính hãng 100%'],
  returnPolicy: {
    title: 'Chính sách đổi hàng',
    body: 'Sản phẩm được hỗ trợ đổi mẫu hoặc đổi kích cỡ trong 15 ngày kể từ khi nhận hàng, với điều kiện còn nguyên tem mác và chưa qua sử dụng.',
  },
  banner: {
    eyebrow: 'TRIẾT LÝ THIẾT KẾ',
    title: 'Kiến trúc & Lãng mạn',
    quote: '"Chúng tôi không đơn thuần may trang phục, chúng tôi kiến tạo không gian chuyển động cho người phụ nữ đương đại - nơi sự nghiêm cẩn của hình học song hành cùng nét trữ tình lụa là."',
    cta: 'KHÁM PHÁ BỘ SƯU TẬP',
    imageSrc: '/assets/brand/product-banner.png',
    imageAlt: 'Hai người mẫu mặc thiết kế MUSE trong không gian kiến trúc bê tông',
  },
  /** Tên màu (không dấu, chữ thường) khớp từ khóa nào thì dùng mã màu đó; không khớp thì hiện chữ. */
  colorSwatches: [
    { keys: ['trang nga', 'ivory', 'trang', 'white'], hex: '#fdfbf7' },
    { keys: ['kem', 'cream'], hex: '#f3ead8' },
    { keys: ['be', 'beige'], hex: '#d9c7a7' },
    { keys: ['den', 'black'], hex: '#171717' },
    { keys: ['xam', 'grey', 'gray'], hex: '#9a9a9a' },
    { keys: ['sage', 'olive', 'reu'], hex: '#8a9a86' },
    { keys: ['xanh la', 'green'], hex: '#4f7a5a' },
    { keys: ['xanh navy', 'navy'], hex: '#1f2a44' },
    { keys: ['xanh duong', 'blue'], hex: '#3f66a8' },
    { keys: ['hong', 'pink'], hex: '#f4b8c1' },
    { keys: ['do', 'red'], hex: '#b32f3f' },
    { keys: ['nau', 'brown'], hex: '#7a5c46' },
    { keys: ['vang', 'yellow'], hex: '#e0b84b' },
  ],
} as const;

export const STORE_CATALOG_CONTENT = {
  title: 'Tất cả sản phẩm',
  description: 'Thiết kế tôn vinh cấu trúc hình học tối giản và nét nữ tính đương đại',
  filterLabels: { size: 'KÍCH CỠ', color: 'MÀU SẮC', price: 'KHOẢNG GIÁ' },
  priceRanges: [
    { label: 'Dưới 500.000đ', max: 500000 },
    { label: '500.000–1.000.000đ', min: 500000, max: 1000000 },
    { label: '1.000.000–2.000.000đ', min: 1000000, max: 2000000 },
    { label: 'Trên 2.000.000đ', min: 2000000 },
  ],
  priceFrom: 'Từ',
  priceTo: 'Đến',
  priceApply: 'ÁP DỤNG',
  priceInvalid: 'Giá "Từ" không được lớn hơn giá "Đến".',
  sortOptions: [
    { value: '', label: 'Mặc định' },
    { value: 'newest', label: 'Mới nhất' },
    { value: 'price_asc', label: 'Giá: Thấp đến cao' },
    { value: 'price_desc', label: 'Giá: Cao đến thấp' },
    { value: 'name_asc', label: 'Tên A–Z' },
  ],
} as const;

export const STORE_AUTH_CONTENT = {
  passwordRule: 'Ít nhất 12 ký tự, có chữ hoa, chữ thường và số.',
  google: {
    divider: 'hoặc',
    error: 'Không thể đăng nhập bằng Google. Vui lòng thử lại.',
  },
  strengthLabels: ['', 'Yếu', 'Trung bình', 'Mạnh'],
  terms: 'Tôi đồng ý với Điều khoản dịch vụ và Chính sách bảo mật của MUSE.',
  termsRequired: 'Vui lòng đồng ý với Điều khoản và Chính sách để tạo tài khoản.',
  privileges: {
    title: 'Đặc quyền thành viên MUSE',
    intro: 'Tài khoản MUSE giúp việc mua sắm và thử đồ của bạn liền mạch hơn.',
    items: [
      { title: 'Lưu địa chỉ giao hàng', text: 'Đặt hàng nhanh hơn với sổ địa chỉ của riêng bạn.' },
      { title: 'Theo dõi đơn hàng', text: 'Xem trạng thái và lịch sử đơn mua mọi lúc.' },
      { title: 'Thử đồ AI Studio', text: 'Thử trang phục trực tuyến và xem lại lịch sử thử đồ.' },
      { title: 'Đánh giá sản phẩm', text: 'Chia sẻ nhận xét sau khi nhận hàng.' },
    ],
  },
} as const;

export const STORE_EMAIL_VERIFICATION_CONTENT = {
  broadcastChannel: 'muse-auth',
  pending: {
    title: 'Kiểm tra hộp thư của bạn',
    sentPrefix: 'Chúng tôi đã gửi liên kết xác thực tới',
    sentSuffix: 'Liên kết có hiệu lực trong 60 phút.',
    waiting: 'Đang chờ bạn xác thực...',
    noTokenHint: 'Sau khi bấm liên kết trong thư, hãy quay lại đây và đăng nhập.',
    spamNote: 'Không thấy thư? Hãy kiểm tra cả thư mục Spam và Quảng cáo.',
    resend: 'Gửi lại email xác thực',
    resending: 'Đang gửi...',
    resendIn: 'Gửi lại sau',
    resendSent: 'Đã gửi lại email xác thực. Vui lòng kiểm tra hộp thư.',
    resendFailed: 'Không thể gửi lại email xác thực. Vui lòng thử lại sau.',
    wrongEmail: 'Sai email?',
    registerAgain: 'Đăng ký lại',
  },
  verified: {
    title: 'Xác thực thành công',
    prefix: 'Tài khoản',
    suffix: 'đã được kích hoạt.',
    cta: 'ĐĂNG NHẬP NGAY',
  },
  expired: {
    title: 'Phiên chờ đã hết hạn',
    text: 'Phiên chờ xác thực đã hết hạn. Bạn có thể gửi lại email xác thực hoặc quay về đăng nhập.',
    backToLogin: 'Về đăng nhập',
  },
  unverified: {
    resend: 'Gửi lại email xác thực',
    hint: 'Nếu chưa thấy thư, hãy kiểm tra cả thư mục Spam và Quảng cáo.',
  },
  verifyPage: {
    eyebrow: 'XÁC MINH TÀI KHOẢN',
    title: 'Xác thực địa chỉ email',
    busy: 'Đang tiến hành xác minh liên kết của bạn...',
    successTitle: 'Xác thực thành công',
    success: 'Địa chỉ email của bạn đã được xác thực và tài khoản đã được kích hoạt.',
    closeTabHint: 'Bạn có thể đóng tab này và quay lại tab đăng ký.',
    missingToken: 'Liên kết xác thực không hợp lệ hoặc thiếu mã xác thực.',
    failed: 'Liên kết xác thực không hợp lệ hoặc đã hết hạn.',
    resendPrompt: 'Nhập email bạn đã đăng ký để nhận liên kết mới. Liên kết mới có hiệu lực trong 60 phút.',
    resendPlaceholder: 'Nhập email đã đăng ký',
    resendButton: 'GỬI LẠI EMAIL XÁC THỰC',
    resendBusy: 'ĐANG GỬI...',
    resendDoneTitle: 'Đã gửi lại thư',
    resendDone: 'Nếu email này đang chờ xác thực, một liên kết mới đã được gửi. Vui lòng kiểm tra cả thư mục Spam và Quảng cáo.',
    resendFailed: 'Không thể gửi lại email xác thực. Vui lòng thử lại sau.',
    backToLogin: 'Quay lại đăng nhập',
  },
} as const;

export const STORE_ADMIN_LOGIN_CONTENT = {
  quote: 'Quản lý cửa hàng thời trang của bạn một cách dễ dàng và hiệu quả.',
  photoAlt: 'Người mẫu MUSE trong trang phục bộ sưu tập mới',
  photoTag: 'BỘ SƯU TẬP THU - ĐÔNG',
  forbidden: 'Tài khoản này không có quyền quản trị.',
  loginFailed: 'Email hoặc mật khẩu không chính xác.',
} as const;

export const STORE_ACCOUNT_CONTENT = {
  title: 'Tài khoản của tôi',
  subtitle: 'Quản lý thông tin cá nhân và hoạt động của bạn tại MUSE.',
  greetingText: 'Quản lý hồ sơ, đơn hàng và các hoạt động của bạn tại MUSE.',
  stats: {
    orders: { label: 'ĐƠN HÀNG', hint: 'Xem đơn hàng của bạn', cta: 'XEM ĐƠN HÀNG' },
    addresses: { label: 'ĐỊA CHỈ', hint: 'Địa chỉ nhận hàng đã lưu', cta: 'QUẢN LÝ ĐỊA CHỈ' },
    ai: { label: 'PHIÊN AI', hint: 'Phiên thử đồ và phối đồ AI', cta: 'XEM LỊCH SỬ AI' },
    notifications: { label: 'THÔNG BÁO', hint: 'Thông báo chưa đọc', cta: 'XEM THÔNG BÁO' },
  },
  profile: { title: 'Hồ sơ cá nhân', subtitle: 'Thông tin cơ bản của tài khoản.', emailNote: 'Email đăng nhập không thể thay đổi.', cta: 'CHỈNH SỬA HỒ SƠ' },
  recentOrders: { title: 'Đơn hàng gần đây', viewAll: 'XEM TẤT CẢ', empty: 'Bạn chưa có đơn hàng nào.', error: 'Không thể tải đơn hàng gần đây.' },
} as const;

export const STORE_HOME_CONTENT = {
  hero: {
    cta: 'KHÁM PHÁ NGAY',
    slides: [
      { image: '/assets/home/hero-1.png', alt: 'MUSE hỗ trợ freeship 1 chiều khi đổi trả' },
      { image: '/assets/home/hero-2.png', alt: 'Own your muse - bộ sưu tập mới của MUSE' },
    ],
    prev: 'Banner trước',
    next: 'Banner kế tiếp',
  },
  categories: { eyebrow: 'KHÁM PHÁ THEO DANH MỤC', title: 'Danh mục sản phẩm', empty: 'Chưa có danh mục để hiển thị.', error: 'Không thể tải danh mục.' },
  newArrivals: { eyebrow: 'BỘ SƯU TẬP MỚI', title: 'Hàng mới về', viewAll: 'XEM TẤT CẢ', empty: 'Chưa có sản phẩm mới.', error: 'Không thể tải sản phẩm.' },
  craft: {
    image: '/assets/home/hero-3.png',
    imageAlt: 'Soft Allure - bộ sưu tập MUSE',
    title: 'Nghệ thuật của những chi tiết nhỏ',
    text: 'Mỗi thiết kế của MUSE được chăm chút từ đường may, chất liệu đến phom dáng, để bạn tự tin thể hiện phong cách riêng mỗi ngày.',
    primary: 'KHÁM PHÁ LOOKBOOK',
    secondary: 'XEM CỘNG ĐỒNG',
  },
  featured: { eyebrow: 'ĐƯỢC YÊU THÍCH NHẤT', title: 'Sản phẩm nổi bật', viewAll: 'XEM TẤT CẢ', empty: 'Chưa có sản phẩm nổi bật.' },
  buyNow: 'MUA NGAY',
  commitments: [
    { title: 'Giao hàng nhanh', text: 'Nhận hàng nhanh chóng trên toàn quốc.' },
    { title: 'Đổi trả dễ dàng', text: 'Hỗ trợ đổi trả theo chính sách của MUSE.' },
    { title: 'Thanh toán an toàn', text: 'Nhiều hình thức thanh toán, bảo mật thông tin.' },
    { title: 'Hỗ trợ tận tâm', text: 'Đội ngũ chăm sóc khách hàng luôn sẵn sàng.' },
  ],
} as const;

export const STORE_ABOUT = {
  hero: {
    eyebrow: 'ABOUT MUSE',
    title: 'MUSE',
    quote: ['"Thời trang không chỉ để mặc.', 'Đó là cách bạn kể câu chuyện', 'của chính mình."'],
    cta: 'KHÁM PHÁ CÂU CHUYỆN',
    image: '/assets/about/about-hero.png',
    imageAlt: 'Người mẫu MUSE trong áo trench coat',
    badge: 'EDITION 2026 • MUSE SILHOUETTES',
  },
  story: {
    eyebrow: 'OUR STORY',
    title: 'Câu chuyện của MUSE',
    paragraphs: [
      'MUSE được xây dựng với mong muốn mang đến một trải nghiệm mua sắm thời trang trực tuyến không chỉ dừng lại ở việc lựa chọn sản phẩm.',
      'Thông qua sản phẩm, Lookbook, công cụ hỗ trợ lựa chọn size, trải nghiệm thử đồ và phối đồ bằng AI cùng không gian cộng đồng, MUSE giúp người dùng khám phá và thể hiện phong cách cá nhân theo cách trực quan hơn.',
    ],
    pillars: [
      { title: 'HAUTE', text: 'TINH TUYỂN TRONG TỪNG ĐƯỜNG KIM MŨI CHỈ' },
      { title: 'INTUITIVE', text: 'TRẢI NGHIỆM TƯƠNG TÁC SỐ HIỆN ĐẠI' },
    ],
    image: '/assets/about/about-story.png',
    imageAlt: 'Hình ảnh câu chuyện thương hiệu MUSE',
  },
  core: {
    eyebrow: 'MUSE CORE EXPERIENCE',
    title: 'Không chỉ là một cửa hàng thời trang',
    items: [
      { no: '01', title: 'KHÁM PHÁ', text: 'Tìm kiếm sản phẩm, khám phá Lookbook và những ý tưởng thời trang mới được cập nhật liên tục qua từng mùa tuyển chọn.', link: 'SẢN PHẨM', to: '/products' },
      { no: '02', title: 'CÁ NHÂN HÓA', text: 'Size Guide, Virtual Try-on và Mix & Match hỗ trợ người dùng lựa chọn và hình dung phong cách phù hợp hơn với chính vóc dáng của mình.', link: 'AI STUDIO', to: '/ai/try-on' },
      { no: '03', title: 'KẾT NỐI', text: 'Chia sẻ outfit, bình luận và tìm cảm hứng từ cộng đồng yêu thời trang thanh lịch, chia sẻ cùng chung góc nhìn thẩm mỹ.', link: 'BLOG', to: '/community' },
    ],
  },
  tech: {
    eyebrow: 'FASHION & TECHNOLOGY',
    title: 'Công nghệ đồng hành cùng phong cách',
    text: 'MUSE kết hợp trải nghiệm thời trang truyền thống với các công cụ số nhằm hỗ trợ người dùng trong quá trình khám phá sản phẩm và xây dựng phong cách.',
    features: [
      { title: 'Virtual Try-on', text: 'Thử một sản phẩm trên ảnh cá nhân để hình dung trang phục trước khi lựa chọn.' },
      { title: 'Mix & Match', text: 'Phối từ 2 đến 5 sản phẩm và khám phá những cách kết hợp khác nhau trong tích tắc.' },
      { title: 'Size Guide', text: 'Gợi ý size có sẵn ngay tại trang chi tiết của từng sản phẩm, dựa trên số đo ngực, eo và hông.' },
    ],
    cta: 'KHÁM PHÁ AI STUDIO →',
    image: '/assets/about/about-tech.png',
    imageAlt: 'Không gian thử đồ MUSE',
  },
  lookbook: {
    eyebrow: 'EDITORIAL SHOWCASE',
    title: 'Cảm hứng từ Bộ sưu tập',
    text: 'Mỗi Bộ sưu tập là một cách kể câu chuyện thời trang thông qua hình ảnh, sản phẩm và những chủ đề khác nhau.',
    cta: 'KHÁM PHÁ BỘ SƯU TẬP →',
    main: { image: '/assets/about/about-lookbook-1.png', title: 'Volume 04: Tĩnh tại & Cấu trúc', sub: 'Mùa Thu - Đông 2026' },
    cards: [
      { image: '/assets/about/about-lookbook-2.png', tag: 'TAILORED COAT EDITION', title: 'Chất liệu tự nhiên & Dáng vẻ vĩnh cửu', text: 'Lựa chọn len dệt thủ công và lụa tơ tằm nguyên bản.' },
      { image: '/assets/about/about-lookbook-3.png', tag: 'PHỤ KIỆN & ĐIỂM NHẤN', title: 'Sự cân bằng giữa hình khối và cảm xúc', text: 'Hoàn thiện vẻ ngoài với các chi tiết tối giản có chủ đích.' },
    ],
  },
  community: {
    eyebrow: 'THE COMMUNITY BLOG',
    title: 'Phong cách được tạo nên cùng nhau',
    text: 'MUSE tạo ra một không gian để người dùng chia sẻ outfit, bình luận và tìm cảm hứng từ những phong cách khác nhau trong cộng đồng.',
    cta: 'KHÁM PHÁ BLOG →',
    fallbackAuthor: 'Thành viên MUSE',
  },
} as const;

export const STORE_CHECKOUT_CONTENT = {
  title: 'Thanh toán',
  steps: ['Giỏ hàng', 'Thông tin giao hàng', 'Thanh toán VietQR'],
  addressTitle: '1. Địa chỉ giao hàng',
  addAddress: '＋ Thêm địa chỉ mới',
  cancelAddAddress: 'Hủy thêm địa chỉ',
  noAddressHint: 'Bạn chưa có địa chỉ nào. Vui lòng thêm địa chỉ nhận hàng để tiếp tục.',
  itemsTitle: '2. Sản phẩm trong đơn',
  editCart: 'Sửa giỏ hàng',
  summaryTitle: 'Tóm tắt đơn hàng',
  voucherLabel: 'MÃ ƯU ĐÃI',
  voucherPlaceholder: 'Nhập mã ưu đãi',
  placeOrder: 'ĐẶT HÀNG & THANH TOÁN',
  placeOrderNote: 'Sau khi đặt hàng, bạn sẽ được chuyển sang trang quét mã VietQR để thanh toán.',
  emptyTitle: 'Giỏ hàng của bạn đang trống.',
  emptyAction: 'TIẾP TỤC MUA SẮM',
} as const;

export const STORE_PAYMENT_CONTENT = {
  title: 'Quét mã để thanh toán',
  qrHint: 'Mở app ngân hàng bất kỳ và quét mã',
  detailsTitle: 'Thông tin chuyển khoản',
  detailsNote: 'Thanh toán bằng quét QR. Tài khoản dưới đây được che để đối chiếu, không dùng để nhập chuyển khoản thủ công.',
  matchWarning: 'Ghi đúng nội dung chuyển khoản để hệ thống tự động xác nhận đơn hàng.',
  watching: 'Hệ thống sẽ tự cập nhật khi nhận được tiền.',
  guideTitle: 'Cách thanh toán',
  guideSteps: [
    { title: 'Mở ứng dụng ngân hàng', description: 'Chọn tính năng quét mã QR trong ứng dụng.' },
    { title: 'Quét mã và kiểm tra', description: 'Đối chiếu tên người nhận, số tiền và nội dung chuyển khoản.' },
    { title: 'Xác nhận chuyển tiền', description: 'Đơn hàng được cập nhật tự động sau khi hệ thống nhận tiền.' },
  ],
  viewOrder: 'Xem đơn hàng',
  payLater: 'Thanh toán sau',
} as const;

export const STORE_LOOKBOOKS_CONTENT = {
  eyebrow: 'CẢM HỨNG TỪ BỘ SƯU TẬP',
  title: 'Bộ sưu tập Lookbook',
  description: 'Lấy cảm hứng từ những bản phối được tuyển chọn, rồi chọn món đồ bạn thích để thử ngay trên chính mình.',
  viewCollection: 'XEM BỘ SƯU TẬP',
  loading: 'Đang tải bộ sưu tập...',
  empty: 'Chưa có bộ sưu tập nào được xuất bản.',
  emptyAction: 'XEM SẢN PHẨM',
  retry: 'THỬ LẠI',
  detailTitle: 'Chi tiết bộ sưu tập',
  productsTitle: 'Sản phẩm trong bộ sưu tập',
  viewProduct: 'Xem sản phẩm',
  tryOn: 'Thử đồ',
  noProducts: 'Bộ sưu tập này chưa gắn sản phẩm.',
  close: 'ĐÓNG',
} as const;

export const STORE_AI_MIX_MATCH_CONTENT = {
  eyebrow: 'GỢI Ý PHỐI ĐỒ',
  title: 'Phối đồ theo phong cách của bạn',
  description: 'Chọn từ 2 đến 5 thiết kế MUSE, hệ thống sẽ gợi ý một bản phối hoàn chỉnh từ ảnh của bạn.',
  historyLink: 'XEM LỊCH SỬ',
  tryOnLink: 'Về trang Thử đồ',
  step1: { label: 'BƯỚC 01', title: 'Bắt đầu bằng ảnh của bạn' },
  step2: { label: 'BƯỚC 02', title: 'Chọn sản phẩm để phối' },
  uploadHint: 'PNG, JPG hoặc WEBP',
  pickProducts: 'CHỌN SẢN PHẨM ĐỂ PHỐI',
  closePicker: 'ĐÓNG DANH SÁCH',
  selectedTitle: 'ĐÃ CHỌN',
  selectedEmpty: 'Chưa chọn sản phẩm nào. Cần chọn ít nhất 2 sản phẩm.',
  generate: 'TẠO BẢN PHỐI',
  resultTitle: 'Bản phối đề xuất',
  resultEmpty: 'Tải ảnh và chọn từ 2 đến 5 sản phẩm để nhận gợi ý phối đồ.',
  itemsTitle: 'Sản phẩm trong bản phối',
  viewProduct: 'Xem sản phẩm',
  minItems: 2,
  maxItems: 5,
} as const;
