import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Code Analyzer — Salesforce APEX & LWC',
  description: 'AI-assisted code review for Salesforce APEX and LWC against configurable guardrail rules.',
};

// Inline script: applies the persisted theme before React hydrates,
// so the page doesn't flash the wrong theme on first paint.
const themeBootstrap = `
(function() {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}