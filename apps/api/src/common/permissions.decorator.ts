import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const STAFF_PERMISSIONS = [
  'catalog.manage', 'inventory.manage', 'order.read', 'order.manage', 'order.cancel',
  'shipment.manage', 'payment.read', 'refund.propose', 'content.moderate',
] as const;
export type StaffPermissionName = typeof STAFF_PERMISSIONS[number];
export const Permissions = (...permissions: StaffPermissionName[]) => SetMetadata(PERMISSIONS_KEY, permissions);
