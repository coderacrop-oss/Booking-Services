import type { NextConfig } from 'next';

const config: NextConfig = {
  // เปิดใน LIFF (iframe/webview ของ LINE) ได้
  poweredByHeader: false,
  serverExternalPackages: ['postgres'],
};
export default config;
