import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research Pulse | Google Cloud AI Tech Group",
  description:
    "Frontier AI research aggregator, cross-lab trend synthesizer, and recursive self-improvement engine powered by Gemini 3.8 Flash.",
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
