import "./globals.css";
import "./skin.css";
import type { Metadata, Viewport } from "next";
import { themeScript } from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: { default: "reppit — stars say it was popular, reppit says it still works", template: "%s · reppit" },
  description: "Community-ranked repos and agent skills. Every downvote carries a reason, every vote fades with age, and your coding agent can ask before it picks your next dependency.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1117" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
