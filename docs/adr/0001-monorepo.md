# ADR-0001 — npm workspaces với modular monolith

**Trạng thái:** Accepted · **Ngày:** 23/10/2026

## Bối cảnh

Cần một repository chung chứa Angular, NestJS và shared contracts; đội nhỏ cần setup dễ, CI đơn giản, có thể quản lý FR/UC đồng bộ.

## Quyết định

Dùng npm workspaces với `apps/web`, `apps/api`, `packages/contracts`; backend modular monolith; MongoDB chính; monorepo tập trung tài liệu trong `docs`.

## Hệ quả

Giảm chi phí vận hành, dễ trace thay đổi; build contracts trước apps, package lock cấp root. Các module chưa tách deploy riêng; sẽ xem lại sau khi có số liệu tải thực.
