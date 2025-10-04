import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'FURS & Revolut Flexible Accounts | Davčni obrazci 2023 / 2024',
  description: 'Priprava davčnih obrazcev iz Revolut CSV izvoza za leti 2023 in 2024',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sl">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
