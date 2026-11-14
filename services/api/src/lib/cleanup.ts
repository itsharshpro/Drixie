import { authChallenges, dz, emailTokens, sessions, type Db } from "@listed/db";

export async function cleanupExpired(db: Db, now = new Date()): Promise<{ sessions: number; challenges: number; emailTokens: number }> {
  const [s, c, e] = await Promise.all([
    db.delete(sessions).where(dz.lt(sessions.expiresAt, now)).returning({ id: sessions.id }),
    db.delete(authChallenges).where(dz.lt(authChallenges.expiresAt, now)).returning({ id: authChallenges.challenge }),
    db
      .delete(emailTokens)
      .where(dz.lt(emailTokens.expiresAt, new Date(now.getTime() - 86_400_000)))
      .returning({ id: emailTokens.tokenHash }),
  ]);
  return { sessions: s.length, challenges: c.length, emailTokens: e.length };
}

export function startCleanup(db: Db, onError: (err: unknown) => void, opts: { everyMs?: number } = {}): () => void {
  const everyMs = opts.everyMs ?? 3_600_000;
  const run = () => void cleanupExpired(db).catch(onError);
  run();
  const timer = setInterval(run, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
