import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { UserAddress } from '@fashion/contracts';
import { AccountSidebarComponent } from '../components/account-sidebar.component';
import { ModalComponent } from '../components/modal.component';
import { ApiService } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { STORE_ADDRESSES_CONTENT } from '../shared/store-content';
import { PageStateComponent } from '../components/page-state.component';

@Component({
  standalone: true,
  imports: [PageStateComponent, FormsModule, ModalComponent, AccountSidebarComponent],
  template: `
    <main class="account-shell">
      <fc-account-sidebar activeItem="addresses" />

      <section class="addresses-content">
        <header class="page-header">
          <div><h1>Sổ địa chỉ</h1><p>Quản lý các địa chỉ nhận hàng của bạn để thanh toán nhanh chóng hơn.</p></div>
          <button type="button" class="button button-pink" (click)="openAddModal()"><span aria-hidden="true">＋</span> THÊM ĐỊA CHỈ</button>
        </header>

        @if (loading()) {
          <fc-page-state kind="loading" title="Đang tải địa chỉ" message="Danh sách địa chỉ nhận hàng đang được cập nhật." />
        } @else if (error()) {
          <fc-page-state kind="error" title="Không thể tải địa chỉ" [message]="error()" actionLabel="THỬ LẠI" (action)="loadAddresses()" />
        } @else {
          @if (addresses().length === 0) {
            <div class="empty-intro"><span>CHƯA CÓ ĐỊA CHỈ</span><h2>Bạn chưa lưu địa chỉ nhận hàng</h2><p>Thêm địa chỉ để sử dụng khi thực hiện thanh toán.</p></div>
          }

          <div class="address-grid">
            @for (address of addresses(); track address.id) {
              <article class="address-card" [class.default-card]="address.isDefault">
                <div class="card-main">
                  <div class="card-label-row">
                    <span class="address-label" [class.default-label]="address.isDefault">{{ address.isDefault ? 'MẶC ĐỊNH' : 'ĐỊA CHỈ PHỤ' }}</span>
                    @if (address.isDefault) { <span class="default-check" aria-label="Địa chỉ mặc định">✓</span> }
                  </div>
                  <h2>{{ address.receiver }}</h2>
                  <p class="phone"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 3 4 5c0 8 7 15 15 15l2-3-4-3-2 2c-3-1-6-4-7-7l2-2-3-4Z"/></svg>{{ address.phone }}</p>
                  <div class="address-lines"><strong>{{ address.line1 }}</strong><p>{{ address.ward }}, {{ address.district }}</p><p>{{ address.province }}</p>@if (address.note) { <small>Ghi chú: {{ address.note }}</small> }</div>
                </div>
                <footer class="card-actions">
                  @if (!address.isDefault) { <button type="button" (click)="setDefault(address.id)">ĐẶT LÀM MẶC ĐỊNH</button> }
                  <span></span><button type="button" (click)="openEditModal(address)">SỬA</button><button type="button" class="delete-link" (click)="deleteAddress(address.id)">XÓA</button>
                </footer>
              </article>
            }

            <button type="button" class="add-card" (click)="openAddModal()">
              <span class="add-circle" aria-hidden="true">＋</span><strong>+ Thêm địa chỉ mới</strong><small>Lưu thêm địa chỉ nhà riêng, văn phòng hoặc nơi làm việc của bạn.</small>
            </button>
          </div>

          <div class="helper-strip"><span class="info-icon" aria-hidden="true">i</span><p>{{ policy.checkoutAddressNote }}</p></div>
        }
      </section>
    </main>

    <fc-modal [isOpen]="modalOpen()" [title]="editingAddressId() ? 'Sửa địa chỉ' : 'Thêm địa chỉ mới'" (close)="closeAddressModal()">
      <form (ngSubmit)="saveAddress()" class="address-form">
        <p class="modal-description">{{ editingAddressId() ? 'Cập nhật thông tin địa chỉ nhận hàng.' : 'Nhập đầy đủ thông tin địa chỉ nhận hàng.' }}</p>
        <div class="form-grid two-columns">
          <label><span>NGƯỜI NHẬN <b>*</b></span><input type="text" [(ngModel)]="formReceiver" name="receiver" required autocomplete="name" /></label>
          <label><span>SỐ ĐIỆN THOẠI <b>*</b></span><input type="tel" [(ngModel)]="formPhone" name="phone" required autocomplete="tel" /></label>
        </div>
        <label><span>ĐỊA CHỈ <b>*</b></span><input type="text" [(ngModel)]="formLine1" name="line1" placeholder="Số nhà, tên đường..." required autocomplete="street-address" /></label>
        <div class="form-grid two-columns">
          <label><span>PHƯỜNG / XÃ <b>*</b></span><input type="text" [(ngModel)]="formWard" name="ward" required /></label>
          <label><span>QUẬN / HUYỆN <b>*</b></span><input type="text" [(ngModel)]="formDistrict" name="district" required /></label>
        </div>
        <label><span>TỈNH / THÀNH PHỐ <b>*</b></span><input type="text" [(ngModel)]="formProvince" name="province" required /></label>
        <label><span>GHI CHÚ</span><textarea [(ngModel)]="formNote" name="note" rows="3" placeholder="Chỉ dẫn khi giao hàng..."></textarea></label>
        <label class="checkbox-label"><input type="checkbox" [(ngModel)]="formIsDefault" name="isDefault" /><span>Đặt làm địa chỉ nhận hàng mặc định</span></label>
        <div class="modal-actions"><button type="button" class="button button-outline" [disabled]="saving()" (click)="closeAddressModal()">HỦY</button><button type="submit" class="button button-black" [disabled]="saving()">{{ saving() ? 'ĐANG LƯU...' : editingAddressId() ? 'LƯU THAY ĐỔI' : 'THÊM ĐỊA CHỈ' }}</button></div>
      </form>
    </fc-modal>

    <fc-modal [isOpen]="deleteModalOpen()" title="Xóa địa chỉ" (close)="closeDeleteModal()">
      <div class="delete-dialog">
        <span class="warning-icon" aria-hidden="true">!</span><h3>Bạn muốn xóa địa chỉ này?</h3><p>Địa chỉ sẽ bị xóa khỏi sổ địa chỉ của bạn.</p>
        @if (deletingAddress(); as address) { <div class="delete-summary"><strong>{{ address.receiver }}</strong><span>{{ address.phone }}</span><p>{{ address.line1 }}, {{ address.ward }}, {{ address.district }}, {{ address.province }}</p></div> }
        <div class="modal-actions"><button type="button" class="button button-outline" [disabled]="deleting()" (click)="closeDeleteModal()">QUAY LẠI</button><button type="button" class="button button-danger" [disabled]="deleting()" (click)="confirmDeleteAddress()">{{ deleting() ? 'ĐANG XÓA...' : 'XÓA ĐỊA CHỈ' }}</button></div>
      </div>
    </fc-modal>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&family=Outfit:wght@300;400;500;600&family=Playfair+Display:wght@400;500&display=swap');
    :host { display:block; background:#fff; color:#171414; } * { box-sizing:border-box; }
    .account-shell { width:min(1184px,calc(100% - 48px)); margin:0 auto; padding:40px 0 96px; display:grid; grid-template-columns:280px minmax(0,1fr); gap:32px; align-items:start; font-family:'Montserrat',sans-serif; }
    .addresses-content { min-width:0; }
    .page-header { min-height:101px; padding-bottom:24px; border-bottom:1px solid #e3e2e2; display:flex; justify-content:space-between; align-items:center; gap:24px; }
    .page-header h1 { margin:0 0 6px; font:400 40px/48px 'Playfair Display',serif; letter-spacing:-.4px; } .page-header p { margin:0; color:#444748; font:400 14px/22px 'Outfit',sans-serif; letter-spacing:.14px; }
    .button { min-height:44px; padding:13px 24px; border:1px solid #000; border-radius:0; display:inline-flex; align-items:center; justify-content:center; gap:8px; color:#000; font:600 11px 'Outfit',sans-serif; letter-spacing:1.1px; cursor:pointer; }
    .button-pink { background:#ffd9e1; } .button-black { background:#000; color:#fff; } .button-outline { background:#fff; } .button-danger { background:#de233f; border-color:#de233f; color:#fff; } .button:disabled { opacity:.55; cursor:not-allowed; }
    .address-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; padding-top:32px; }
    .address-card { min-height:352px; border:1px solid #e3e2e2; padding:28px; background:#fff; display:flex; flex-direction:column; justify-content:space-between; }
    .address-card.default-card { border-color:#000; } .card-main { min-height:260px; } .card-label-row { min-height:30px; display:flex; align-items:flex-start; justify-content:space-between; }
    .address-label { min-height:30px; padding:4px 10px; display:inline-flex; align-items:center; background:#efeded; color:#444748; font:600 10px/22px 'Outfit',sans-serif; letter-spacing:1px; } .address-label.default-label { background:#000; color:#fff; }
    .default-check { width:15px; height:15px; border-radius:50%; display:grid; place-items:center; background:#000; color:#fff; font-size:10px; }
    .address-card h2 { margin:16px 0 4px; font:400 22px/30px 'Playfair Display',serif; }
    .phone { margin:0; display:flex; align-items:center; gap:8px; color:#444748; font:400 14px/22px 'Outfit',sans-serif; } .phone svg { width:12px; stroke:currentColor; stroke-width:1.5; }
    .address-lines { margin-top:16px; padding:4px 0 24px; border-bottom:1px solid #e9e8e7; } .address-lines strong,.address-lines p { display:block; margin:0 0 6px; font:400 14px/23px 'Outfit',sans-serif; }
    .address-lines strong { color:#000; font-weight:500; } .address-lines p { color:#444748; } .address-lines small { display:block; margin-top:11px; color:#444748; font:400 12px/18px 'Outfit',sans-serif; }
    .card-actions { min-height:34px; padding-top:20px; display:grid; grid-template-columns:auto 1fr auto auto; gap:24px; align-items:end; }
    .card-actions button { border:0; border-bottom:1px solid currentColor; background:none; padding:0; color:#444748; font:600 11px/14px 'Outfit',sans-serif; letter-spacing:1.1px; cursor:pointer; } .card-actions .delete-link { color:#444748; }
    .add-card { min-height:300px; border:1px dashed #c4c7c7; background:rgba(251,249,249,.5); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px; color:#171414; cursor:pointer; }
    .add-card:hover,.add-card:focus-visible { border-color:#000; background:#fff7f8; } .add-circle { width:48px; height:48px; border:1px solid #000; border-radius:50%; display:grid; place-items:center; font-size:22px; }
    .add-card strong { margin-top:16px; font:400 22px/30px 'Playfair Display',serif; } .add-card small { max-width:320px; margin-top:7px; color:#444748; text-align:center; font:400 12px/18px 'Outfit',sans-serif; }
    .helper-strip { min-height:78px; margin-top:32px; padding:24px; border:1px solid #e3e2e2; background:#f5f3f3; display:flex; align-items:center; gap:16px; } .helper-strip p { margin:0; color:#444748; font:400 14px/22px 'Outfit',sans-serif; } .info-icon { width:15px; height:15px; border:1px solid #8f485d; border-radius:50%; display:grid; place-items:center; color:#8f485d; font:500 10px serif; flex:0 0 auto; }
    .empty-intro { margin-top:32px; padding:32px; border:1px solid #e3e2e2; text-align:center; } .empty-intro > span { color:#8f485d; font-size:9px; font-weight:600; letter-spacing:1.3px; } .empty-intro h2 { margin:8px 0; font:400 27px 'Playfair Display',serif; } .empty-intro p { margin:0; color:#555; font:400 13px 'Outfit',sans-serif; }.warning-icon{ width:40px; height:40px; border:1px solid #de233f; border-radius:50%; display:grid; place-items:center; color:#de233f; font:500 22px 'Playfair Display',serif; }
    .address-form,.delete-dialog { font-family:'Montserrat',sans-serif; } .modal-description { margin:-4px 0 20px; color:#444748; font:400 12px/20px 'Outfit',sans-serif; } .form-grid.two-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
    .address-form label { display:grid; gap:7px; margin-bottom:16px; } .address-form label > span { font-size:10px; font-weight:600; letter-spacing:1px; } .address-form b { color:#de233f; }
    .address-form input[type='text'],.address-form input[type='tel'],.address-form textarea { width:100%; border:1px solid #5f5353; border-radius:0; background:#fff; padding:0 14px; color:#171414; outline:none; font:400 12px 'Montserrat',sans-serif; } .address-form input[type='text'],.address-form input[type='tel'] { height:46px; } .address-form textarea { padding-block:12px; resize:vertical; }
    .address-form input:focus,.address-form textarea:focus { box-shadow:inset 0 0 0 1px #000; } .checkbox-label { grid-template-columns:18px 1fr; align-items:center; margin-top:2px; } .checkbox-label input { width:16px; height:16px; accent-color:#000; }
    .modal-actions { margin-top:18px; padding-top:18px; border-top:1px solid #e3e2e2; display:flex; justify-content:flex-end; gap:12px; }
    .delete-dialog { display:flex; flex-direction:column; align-items:center; text-align:center; } .delete-dialog h3 { margin:14px 0 7px; font:400 25px 'Playfair Display',serif; } .delete-dialog > p { margin:0; color:#555; font:400 13px 'Outfit',sans-serif; }
    .delete-summary { width:100%; margin-top:22px; padding:18px; border:1px solid #e3e2e2; background:#f5f3f3; display:grid; gap:5px; text-align:left; } .delete-summary strong { font:500 15px 'Playfair Display',serif; } .delete-summary span,.delete-summary p { margin:0; color:#555; font:400 11px/1.5 'Outfit',sans-serif; }
    .delete-dialog .modal-actions { width:100%; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media (max-width:980px) { .account-shell { width:min(100% - 32px,760px); grid-template-columns:1fr; } }
    @media (max-width:640px) { .account-shell { width:100%; padding:20px 16px 64px; } .page-header { align-items:flex-start; flex-direction:column; } .page-header h1 { font-size:34px; } .page-header .button { width:100%; } .address-grid { grid-template-columns:1fr; } .address-card { min-height:330px; padding:22px; } .form-grid.two-columns { grid-template-columns:1fr; gap:0; } .modal-actions { flex-direction:column-reverse; } .modal-actions .button { width:100%; } }
    
  `],
})
export class AddressesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly addresses = signal<UserAddress[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly modalOpen = signal(false);
  readonly editingAddressId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly deleteModalOpen = signal(false);
  readonly deletingAddress = signal<UserAddress | null>(null);
  readonly deleting = signal(false);
  readonly policy = STORE_ADDRESSES_CONTENT;

  formReceiver = '';
  formPhone = '';
  formLine1 = '';
  formWard = '';
  formDistrict = '';
  formProvince = '';
  formNote = '';
  formIsDefault = false;

  ngOnInit(): void { this.loadAddresses(); }
  loadAddresses(): void {
    this.loading.set(true); this.error.set('');
    this.api.listAddresses().subscribe({
      next: res => { this.addresses.set(res.items); this.loading.set(false); },
      error: () => { this.error.set('Không thể tải danh sách địa chỉ.'); this.loading.set(false); },
    });
  }
  openAddModal(): void { this.editingAddressId.set(null); this.resetForm(); this.formIsDefault = this.addresses().length === 0; this.modalOpen.set(true); }
  openEditModal(address: UserAddress): void {
    this.editingAddressId.set(address.id); this.formReceiver=address.receiver; this.formPhone=address.phone; this.formLine1=address.line1; this.formWard=address.ward; this.formDistrict=address.district; this.formProvince=address.province; this.formNote=address.note || ''; this.formIsDefault=!!address.isDefault; this.modalOpen.set(true);
  }
  closeAddressModal(): void { if (!this.saving()) this.modalOpen.set(false); }
  private resetForm(): void { this.formReceiver=''; this.formPhone=''; this.formLine1=''; this.formWard=''; this.formDistrict=''; this.formProvince=''; this.formNote=''; this.formIsDefault=false; }
  saveAddress(): void {
    if (!this.formReceiver || !this.formPhone || !this.formLine1 || !this.formWard || !this.formDistrict || !this.formProvince) { this.toast.warning('Vui lòng điền đầy đủ các thông tin bắt buộc.'); return; }
    this.saving.set(true); const id=this.editingAddressId(); const dto={ receiver:this.formReceiver, phone:this.formPhone, line1:this.formLine1, ward:this.formWard, district:this.formDistrict, province:this.formProvince, note:this.formNote || undefined, isDefault:this.formIsDefault };
    const request = id ? this.api.updateAddress(id,dto) : this.api.createAddress(dto);
    request.subscribe({
      next: () => { this.saving.set(false); this.modalOpen.set(false); this.toast.success(id ? 'Đã cập nhật địa chỉ.' : 'Đã thêm địa chỉ mới.'); this.loadAddresses(); },
      error: err => { this.saving.set(false); this.toast.error(err.error?.message || (id ? 'Không thể cập nhật địa chỉ.' : 'Không thể thêm địa chỉ.')); },
    });
  }
  setDefault(id: string): void {
    this.api.updateAddress(id,{isDefault:true}).subscribe({ next: () => { this.toast.success('Đã đặt làm địa chỉ mặc định.'); this.loadAddresses(); }, error: () => this.toast.error('Không thể cập nhật địa chỉ mặc định.') });
  }
  deleteAddress(id: string): void { const address=this.addresses().find(item => item.id === id) || null; this.deletingAddress.set(address); this.deleteModalOpen.set(!!address); }
  closeDeleteModal(): void { if (!this.deleting()) { this.deleteModalOpen.set(false); this.deletingAddress.set(null); } }
  confirmDeleteAddress(): void {
    const address=this.deletingAddress(); if (!address) return; this.deleting.set(true);
    this.api.deleteAddress(address.id).subscribe({
      next: () => { this.deleting.set(false); this.closeDeleteModal(); this.toast.success('Đã xóa địa chỉ.'); this.loadAddresses(); },
      error: () => { this.deleting.set(false); this.toast.error('Không thể xóa địa chỉ.'); },
    });
  }
}
