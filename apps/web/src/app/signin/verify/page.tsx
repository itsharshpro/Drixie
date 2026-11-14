import type { Metadata } from "next";
import { EmailVerify } from "@/components/signin/email-verify";
import { SigninSkeleton } from "@/components/signin/signin-screen";
import { PageTransition, Reveal } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Signing in" };

export default function VerifyPage() {
  return (
    <PageTransition className="flex w-full justify-center">
      <Reveal fallback={<SigninSkeleton />} className="w-full max-w-[400px]">
        <EmailVerify />
      </Reveal>
    </PageTransition>
  );
}
