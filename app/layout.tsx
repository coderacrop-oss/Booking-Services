import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { ICONS } from '@/lib/icons';
import './globals.css';

// LINE Seed Sans TH (SIL OFL) ฟอนต์เดียวกับจอโปรโตไทป์
const line = localFont({
  src: [
    { path: './fonts/LINESeedSansTH-Regular.woff2', weight: '400' },
    { path: './fonts/LINESeedSansTH-Bold.woff2', weight: '700' },
    { path: './fonts/LINESeedSansTH-ExtraBold.woff2', weight: '800' },
  ],
  variable: '--font-line',
  display: 'swap',
});

export const metadata: Metadata = { title: 'จองบริการ', robots: { index: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const icons = `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&icon_names=${ICONS.join(',')}&display=block`;
  return (
    <html lang="th" className={line.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={icons} />
      </head>
      <body>{children}</body>
    </html>
  );
}
