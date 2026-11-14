import { isHouseAccount } from "@listed/shared";

export function houseHandle(account: string | null | undefined): string | null {
  if (!account || !isHouseAccount(account)) return null;
  const dot = account.indexOf(".");
  return dot > 0 ? account.slice(0, dot) : account;
}
