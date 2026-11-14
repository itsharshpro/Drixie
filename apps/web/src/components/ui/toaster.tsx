"use client";
import { Toaster as Sonner } from "sonner";
import { useIsPhone } from "@/lib/hooks/use-media";

export function Toaster() {
  const phone = useIsPhone();
  return (
    <Sonner
      position={phone ? "top-center" : "bottom-right"}
      offset={phone ? 12 : 24}
      gap={8}
      visibleToasts={4}
      closeButton={false}
      toastOptions={{ duration: 4500 }}
    />
  );
}
