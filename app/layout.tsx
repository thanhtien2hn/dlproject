import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YOLOv8 Detection - Backend + Frontend",
  description: "Object detection with YOLOv8, FastAPI backend and Next.js frontend",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}