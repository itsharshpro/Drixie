import type { GlossaryId, NavPlace } from "./glossary";

export type ActionPlace = NavPlace | "Account";

export interface UserActionBase<Id extends string = string> {
  id: Id;

  title: string;

  why: string;
  place: ActionPlace;

  where: string;

  href: string;

  go: string;
  needs: {

    account: boolean;

    near: boolean;

    shares?: boolean;
  };

  time: string;

  terms: GlossaryId[];
}
