import type { Metadata } from "next";
import { SettingsScreen } from "@/components/settings/settings-screen";
import { PageTransition } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageTransition>
      <SettingsScreen />
    </PageTransition>
  );
}
