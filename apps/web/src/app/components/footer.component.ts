import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'fc-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-col brand-col">
          <div class="footer-logo"><img src="/assets/brand/muse-logo-white.png" alt="MUSE"></div>
          <p class="brand-desc">
            Architectural elegance &amp; modern romance.<br>
            Không gian thời trang của những đường nét<br>
            dứt khoát và nét mềm mại tự nhiên.
          </p>
        </div>

        <div class="footer-col">
          <h4>DỊCH VỤ KHÁCH HÀNG</h4>
          <ul>
            <li><a routerLink="/account">Tài khoản cá nhân</a></li>
            <li><a routerLink="/orders">Lịch sử đơn hàng</a></li>
            <li><a routerLink="/cart">Giỏ hàng của bạn</a></li>
            <li><a routerLink="/account/addresses">Sổ địa chỉ nhận hàng</a></li>
          </ul>
        </div>

        <div class="footer-col">
          <h4>CỬA HÀNG &amp; THÔNG TIN</h4>
          <ul>
            <li><a routerLink="/">Sản phẩm</a></li>
            <li><a routerLink="/lookbooks">Bộ sưu tập</a></li>
            <li><a routerLink="/community">Cộng đồng</a></li>
            <li><a routerLink="/ai/try-on">Thử đồ AI</a></li>
          </ul>
        </div>

        <div class="footer-col contact-col">
          <h4>LIÊN HỆ</h4>
          <ul class="contact-list">
            <li><span class="contact-icon" aria-hidden="true">⌖</span><span>Trụ sở: Phường Linh Xuân, Thành phố Hồ Chí Minh</span></li>
            <li><span class="contact-icon" aria-hidden="true">✉</span><span>support&#64;themuse.vn</span></li>
            <li><span class="contact-icon" aria-hidden="true">☎</span><span>0990 888 999</span></li>
          </ul>
        </div>
      </div>

      <div class="footer-bottom">
        <p>© 2026 MUSE</p>
      </div>
    </footer>
  `,
  styles: [`
    .site-footer {
      background: #1e1d1b;
      color: #b5b0a7;
      padding: 60px 6vw 30px;
      margin-top: 80px;
      font-size: 0.88rem;
    }
    .footer-inner {
      max-width: 1300px;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 40px;
    }
    .footer-logo {
      font-weight: 700;
      letter-spacing: 0.18em;
      font-size: 1.15rem;
      color: var(--color-surface);
      margin-bottom: 14px;
    }
    .footer-logo span {
      color: #c4a180;
      font-weight: 400;
    }
    .brand-desc {
      color: #8b857c;
      line-height: 1.7;
      max-width: 380px;
    }
    .footer-col h4 {
      color: var(--color-surface);
      font-size: 0.95rem;
      font-weight: 500;
      margin: 0 0 16px;
      letter-spacing: 0.05em;
    }
    .footer-col ul {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .footer-col a {
      color: #aba49b;
      transition: color 0.15s;
    }
    .footer-col a:hover {
      color: var(--color-surface);
    }
    .footer-col span {
      color: #888279;
    }
    .footer-bottom {
      max-width: 1300px;
      margin: 50px auto 0;
      padding-top: 25px;
      border-top: 1px solid #2e2c29;
      text-align: center;
      color: #726d66;
      font-size: 0.8rem;
    }
    @media (max-width: 900px) {
      .footer-inner {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 600px) {
      .footer-inner {
        grid-template-columns: 1fr;
        gap: 30px;
      }
    }

    .brand-desc,.footer-col span,.footer-bottom { color:#b5afa6; }
    .footer-col a { display:inline-block; padding:4px 0; text-underline-offset:4px; }
    .footer-col a:hover { text-decoration:underline; }
    .footer-logo { font-size:1rem; letter-spacing:.12em; overflow-wrap:anywhere; }
    @media (max-width:600px) { .site-footer { margin-top:48px; padding:40px 24px 24px; } }

    /* MUSE shared footer */
    .site-footer {
      min-height: 362px;
      margin-top: 80px;
      padding: 46px 48px 0;
      background: #000;
      color: #fff;
      font-size: 14px;
    }
    .footer-inner {
      width: 100%;
      max-width: 1184px;
      min-height: 256px;
      grid-template-columns: 27.5% 18.8% 25.8% 27.9%;
      gap: 0;
    }
    .footer-logo {
      margin: 0 0 16px;
    }
    .footer-logo img {
      display: block;
      width: 153px;
      height: auto;
    }
    .brand-desc {
      max-width: 310px;
      margin: 0;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.65;
    }
    .footer-col h4 {
      margin: 18px 0 18px;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: 0.65px;
    }
    .footer-col ul {
      gap: 0;
    }
    .footer-col li {
      min-height: 28px;
    }
    .footer-col a,
    .footer-col span {
      color: #fff;
      font-size: 14px;
      line-height: 1.55;
    }
    .footer-col a {
      padding: 3px 0;
      text-underline-offset: 4px;
    }
    .footer-col a:hover,
    .footer-col a:focus-visible {
      color: #efb3bd;
      text-decoration: underline;
    }
    .contact-list li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 7px;
    }
    .contact-icon {
      flex: 0 0 16px;
      width: 16px;
      color: #fff;
      font-size: 18px !important;
      line-height: 1.25 !important;
      text-align: center;
    }
    .footer-bottom {
      width: 100%;
      max-width: 1184px;
      min-height: 60px;
      margin: 0 auto;
      padding-top: 16px;
      border-top-color: #858585;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2px;
    }
    .footer-bottom p { margin: 0; }
    @media (max-width: 900px) {
      .site-footer { padding: 44px 32px 0; }
      .footer-inner {
        min-height: auto;
        grid-template-columns: 1fr 1fr;
        gap: 36px 28px;
        padding-bottom: 44px;
      }
      .footer-col h4 { margin-top: 8px; }
      .footer-bottom { padding-bottom: 20px; }
    }
    @media (max-width: 600px) {
      .site-footer { margin-top: 48px; padding: 40px 24px 0; }
      .footer-inner { grid-template-columns: 1fr; gap: 28px; }
      .footer-logo img { width: 145px; }
      .brand-desc { max-width: 100%; }
      .brand-desc br { display: none; }
      .footer-col h4 { margin: 0 0 14px; }
      .footer-bottom { min-height: 64px; padding-top: 18px; }
    }


  `],
})
export class FooterComponent {}
