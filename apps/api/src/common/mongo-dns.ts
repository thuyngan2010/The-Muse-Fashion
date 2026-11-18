import { setServers } from 'node:dns';

/**
 * Một số mạng (router gia đình, mạng trường) từ chối truy vấn DNS SRV mà chuỗi
 * kết nối `mongodb+srv://` cần, làm Node báo `querySrv ECONNREFUSED`.
 * Khi đặt MONGODB_DNS_SERVERS (ví dụ "8.8.8.8,1.1.1.1"), Node dùng các máy chủ DNS này
 * để tra địa chỉ MongoDB. Không đặt thì giữ nguyên DNS của hệ điều hành.
 */
export function applyMongoDnsServers(raw = process.env.MONGODB_DNS_SERVERS): string[] {
  const servers = (raw ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (servers.length) setServers(servers);
  return servers;
}

applyMongoDnsServers();
