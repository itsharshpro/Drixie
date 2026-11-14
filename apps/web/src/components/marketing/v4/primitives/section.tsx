import type { CSSProperties, ReactNode } from "react";

export interface SectionProps {
  id?: string;
  children: ReactNode;
  className?: string;

  containerClassName?: string;
  style?: CSSProperties;

  art?: ReactNode;

  edge?: "last";
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

export function Section({ id, children, className, containerClassName, style, art, edge, ...rest }: SectionProps) {
  return (
    <section id={id} className={["v4-section", className].filter(Boolean).join(" ")} style={style} data-edge={edge} {...rest}>
      {art}
      <div className={["v4-container relative", containerClassName].filter(Boolean).join(" ")}>{children}</div>
    </section>
  );
}
