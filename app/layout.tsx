import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Research Pulse",
  description: "Aggregator for top AI research news",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
