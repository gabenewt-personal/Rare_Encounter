import type { Metadata } from "next";
import { ClientDaily } from "@/components/ClientGame";

export const metadata: Metadata = { title: "Daily Challenge — Rare Encounter" };

export default function DailyPage() {
  return <ClientDaily />;
}
