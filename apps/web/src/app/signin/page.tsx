import type { Metadata } from "next";
import { SigninScreen, SigninSkeleton } from "@/components/signin/signin-screen";
import { PageTransition, Reveal } from "@/components/ui/transitions";

export const metadata: Metadata = { title: "Sign in" };

export default function SigninPage() {
  return (
    <PageTransition className="flex w-full justify-center">
      <Reveal fallback={<SigninSkeleton />} className="w-full max-w-[400px]">
        <SigninScreen />
      </Reveal>
    </PageTransition>
  );
}
