"use client";

import type { RiskProfileRequest, RiskProfileResponse } from "@listed/shared";
import { RISK_QUESTIONS } from "@listed/shared";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, RotateCcw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { errorMessage } from "@/lib/mutations/use-tx-mutation";
import { cn } from "@/lib/cn";
import { fundsApi } from "@/lib/funds/api";
import { pct } from "@/lib/funds/format";
import { savePickedFund, saveProfile, useSavedProfile } from "@/lib/funds/local";
import { MANDATE_LABEL } from "@/lib/funds/meta";
import { EASE } from "@/lib/motion";
import { AccountCta } from "../ui/account-cta";
import { Button } from "../ui/button";
import { Card, CARD_TITLE } from "../ui/card";
import { PageHeader } from "../ui/page-header";
import { Term } from "../ui/term";
import { NAV } from "../ui/transitions";
import { FundMark } from "./fund-mark";

type Answers = Partial<RiskProfileRequest>;

export function RiskCheckScreen() {
  const saved = useSavedProfile();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<RiskProfileResponse | null>(null);
  const run = useMutation({
    mutationFn: (a: RiskProfileRequest) => fundsApi.riskProfile(a),
    onSuccess: (r) => {
      setResult(r);
      saveProfile({ profile: r.profile, label: r.label, funds: r.recommended.map((f) => f.fund), at: new Date().toISOString() });
    },
  });

  const q = RISK_QUESTIONS[step];
  const choose = (v: 0 | 1 | 2) => {
    if (!q) return;
    const next = { ...answers, [q.id]: v };
    setAnswers(next);
    if (step < RISK_QUESTIONS.length - 1) setStep(step + 1);
    else run.mutate(next as RiskProfileRequest);
  };
  const restart = () => {
    setAnswers({});
    setStep(0);
    setResult(null);
    run.reset();
  };

  const showResult = !!result;
  const dx = reduce ? 0 : 24;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <PageHeader
        eyebrow="Start here"
        title="Risk check"
        subtitle="Three quick questions. We match you to the funds whose mandate fits how you feel about swings."
      />
      {saved && !showResult && step === 0 && answers.drawdown === undefined && (
        <Card padded className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-body-sm text-ink-2">
            Last time you came out <span className="font-medium text-ink">{saved.label.toLowerCase()}</span>. Your best match was{" "}
            <Link href={`/app/f/${saved.funds[0] ?? ""}`} transitionTypes={[...NAV.forward]} className="font-medium text-brand hover:underline">
              {saved.funds[0] ? saved.funds[0].charAt(0).toUpperCase() + saved.funds[0].slice(1) : "a fund"}
            </Link>
            .
          </p>
          <span className="text-caption text-ink-3">Answer again to update it.</span>
        </Card>
      )}
      <Card className="overflow-hidden">
        {!showResult && (
          <div className="flex gap-1.5 px-5 pt-5 md:px-6 md:pt-6" aria-hidden>
            {RISK_QUESTIONS.map((_, i) => (
              <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors duration-200", i < step || (i === step && run.isPending) ? "bg-brand" : i === step ? "bg-ink" : "bg-fill")} />
            ))}
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          {showResult ? (
            <motion.div key="result" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }}>
              <Result result={result!} onRestart={restart} />
            </motion.div>
          ) : q ? (
            <motion.fieldset
              key={q.id}
              initial={{ opacity: 0, x: dx }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -dx }}
              transition={{ duration: 0.22, ease: EASE }}
              className="flex flex-col gap-4 p-5 md:p-6"
              disabled={run.isPending}
            >
              <legend className="contents">
                <span className="num block text-caption font-medium text-ink-3">
                  Question {step + 1} of {RISK_QUESTIONS.length}
                </span>
                <span className="mt-1 block text-title-sm font-semibold tracking-[-0.01em] text-ink">{q.question}</span>
              </legend>
              <div className="flex flex-col gap-2" role="radiogroup" aria-label={q.question}>
                {q.answers.map((a, i) => {
                  const picked = answers[q.id] === i;
                  return (
                    <button
                      key={a}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      onClick={() => choose(i as 0 | 1 | 2)}
                      className={cn(
                        "flex min-h-14 items-center justify-between gap-3 rounded-control border px-4 text-left text-body-sm font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.99]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                        picked ? "border-brand bg-brand-soft text-brand" : "border-line bg-paper text-ink hover:bg-fill",
                      )}
                    >
                      {a}
                      {picked && <Check className="size-4" aria-hidden />}
                    </button>
                  );
                })}
              </div>
              {run.isError && <p className="text-body-sm text-down">{errorMessage(run.error)}</p>}
              <div className="flex items-center justify-between gap-3 pt-1">
                <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>
                  <ArrowLeft className="size-4" aria-hidden /> Back
                </Button>
                {run.isPending ? (
                  <span className="text-body-sm text-ink-2">Matching you to the funds…</span>
                ) : run.isError ? (
                  <Button onClick={() => run.mutate(answers as RiskProfileRequest)}>Try again</Button>
                ) : null}
              </div>
            </motion.fieldset>
          ) : null}
        </AnimatePresence>
      </Card>
      <p className="mt-4 text-caption text-ink-3">
        This is a game priced off real markets, not financial advice. Coins are testnet tokens.
      </p>
    </div>
  );
}

function Result({ result, onRestart }: { result: RiskProfileResponse; onRestart: () => void }) {
  const best = result.recommended[0];
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 p-5 md:p-6">
        <p className="text-caption font-medium text-brand">Your profile</p>
        <h2 className="text-title font-semibold tracking-[-0.015em] text-ink">{result.label}</h2>
        <p className="text-body-sm text-ink-2">{result.summary}</p>
      </div>
      <div className="border-t border-line">
        <h3 className={cn(CARD_TITLE, "px-5 pt-5 md:px-6")}>Funds that fit you</h3>
        {result.recommended.length === 0 ? (
          <p className="p-5 text-body-sm text-ink-2 md:p-6">No fund is live yet. Come back once the arena opens.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-line">
            {result.recommended.map((f, i) => (
              <li key={f.fund} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:px-6">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <FundMark fund={f.fund} size={40} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-body-sm font-semibold text-ink">{f.name}</span>
                      <span className="text-caption text-ink-3">{MANDATE_LABEL[f.mandate]}</span>
                      {i === 0 && <span className="rounded-chip bg-brand-soft px-2 py-0.5 text-caption font-medium text-brand">Best match</span>}
                    </p>
                    <p className="mt-0.5 text-body-sm text-ink-2">{f.why}</p>
                    <p className="mt-1 text-caption text-ink-3">
                      Fit <span className="num text-ink-2">{Math.round(f.mandateFit)}</span> · <Term id="reputation">Trust</Term>{" "}
                      <span className="num text-ink-2">{Math.round(f.reputation)}</span> · Season <span className="num text-ink-2">{pct(f.seasonReturn)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 md:justify-end">
                  <Button asChild variant="secondary" onClick={() => savePickedFund(f.fund)}>
                    <Link href={`/app/f/${f.fund}`} transitionTypes={[...NAV.forward]}>
                      Open
                    </Link>
                  </Button>
                  {i === 0 && (
                    <AccountCta href={`/app/f/${f.fund}?sheet=buy`} verb="buy in" need="account" onClick={() => savePickedFund(f.fund)}>
                      Buy in
                    </AccountCta>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 md:px-6">
        <Button variant="ghost" onClick={onRestart}>
          <RotateCcw className="size-4" aria-hidden /> Answer again
        </Button>
        {best && (
          <Link href="/app" transitionTypes={[...NAV.back]} className="inline-flex min-h-11 items-center text-label font-medium text-brand hover:underline">
            Compare all five funds →
          </Link>
        )}
      </div>
    </div>
  );
}
