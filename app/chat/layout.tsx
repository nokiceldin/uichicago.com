import { Manrope } from "next/font/google";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 0;

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
});

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <div className={manrope.className}>{children}</div>;
}