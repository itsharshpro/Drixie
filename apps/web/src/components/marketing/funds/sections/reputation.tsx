"use client";

import { Section, SectionTitle } from "../../v4/primitives";
import { RepLive } from "../reputation/live";
import { RepStory } from "../reputation/story";

export function Reputation() {
  return (
    <Section id="reputation" aria-labelledby="rep-title">
      <SectionTitle
        id="rep-title"
        eyebrow="Reputation"
        title={["Manipulate, and the market", "~walks away.~"]}
        sub="Every fund starts at 60. Each trick costs points in public, and below 40 the money starts leaving."
      />
      <RepStory />
      <RepLive />
    </Section>
  );
}
