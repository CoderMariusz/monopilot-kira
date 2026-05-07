import type { ReactNode } from 'react';
import './globals.css';
import RegisterSW from './_components/RegisterSW';

export const metadata = {
  title: 'Monopilot Kira'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
