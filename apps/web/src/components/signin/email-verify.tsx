"use client";

import type { Me } from "@listed/shared";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/endpoints";
import { qk } from "@/lib/api/keys";
import { hasLocalKey } from "@/lib/auth/passkey";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Handoff, type HandoffInfo } from "./handoff";
import { Panel } from "./signin-screen";

export function EmailVerify() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(token ? null : "This link is missing its code. Open the newest email from Drixie again.");
  const [handoff, setHandoff] = useState<HandoffInfo | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true;
    api
      .emailVerify(token)
      .then(async (me: Me) => {
        qc.setQueryData(qk.me(), me);
        if (me.accountId && (await hasLocalKey(me.accountId))) {
          setHandoff({ title: me.handle ? `Welcome back, ${me.handle}` : "Welcome back", accountId: me.accountId, isNew: false });
        } else {

          router.replace("/signin");
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [token, qc, router]);

  if (handoff) return <Handoff info={handoff} next="/app" />;
  if (error)
    return (
      <Panel icon="letters" title="That link didn't work" sub={error}>
        <div className="flex flex-col gap-3">
          <Button asChild size="lg" block>
            <Link href="/signin">Back to sign in</Link>
          </Button>
        </div>
      </Panel>
    );
  return (
    <Panel icon="letters" title="Checking your link" sub="One moment while we confirm it's really you.">
      <div className="flex flex-col gap-3" role="status" aria-label="Checking your sign-in link">
        <Skeleton className="h-12 w-full rounded-control" />
        <Skeleton className="mx-auto h-3 w-40" />
      </div>
    </Panel>
  );
}
