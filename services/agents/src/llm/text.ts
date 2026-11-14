export function stripReasoning(text: string): string {
  let t = text.replace(/<(think|thought|thinking)>[\s\S]*?<\/\1>/gi, "");

  if (/^\s*<(think|thought|thinking)>/i.test(t)) t = "";

  const close = /<\/(think|thought|thinking)>/i.exec(t);
  if (close) t = t.slice(close.index + close[0].length);
  return t.replace(/^\s*```(?:markdown|md|text)?\n([\s\S]*?)\n```\s*$/i, "$1").trim();
}
