import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Instant Video Creator',
  description: 'Create simple videos in your browser and export to WebM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
