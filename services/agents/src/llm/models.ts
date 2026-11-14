const FAMILY_PATTERNS: readonly [RegExp, string][] = [
  [/qwen|qwq/i, "qwen"],
  [/glm|zhipu|z-ai/i, "glm"],
  [/deepseek/i, "deepseek"],
  [/llama|meta-/i, "llama"],
  [/gpt|openai|\bo[134]\b|o[134]-/i, "openai"],
  [/kimi|moonshot/i, "kimi"],
  [/grok|x-ai/i, "grok"],
  [/mistral|mixtral|codestral/i, "mistral"],
];

export function modelFamily(modelId: string): string {
  const name = modelId.split("/").pop() ?? modelId;
  for (const [re, fam] of FAMILY_PATTERNS) if (re.test(name)) return fam;
  for (const [re, fam] of FAMILY_PATTERNS) if (re.test(modelId)) return fam;
  return (modelId.split("/")[0] ?? modelId).toLowerCase();
}

export function differentFamilies(primary: string, judge: string): boolean {
  return modelFamily(primary) !== modelFamily(judge);
}
