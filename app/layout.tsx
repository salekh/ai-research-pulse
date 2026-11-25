import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Pulse | Google Cloud AI Tech Group",
  description:
    "Frontier AI research aggregator, dedicated arXiv academic paper track, A2UI 1.0 visual brief engine, and grounded paper Q&A powered by Gemini 4 (Neon & Hydrogen) and Gemini 3.8 Speech.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans bg-[#F8F9FA] text-[#202124] min-h-screen flex flex-col">
        {children}
      </body>
    </html>
  );
}
