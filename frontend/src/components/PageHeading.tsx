import type { ReactNode } from "react";
import Icon from "./Icon";

export default function PageHeading({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return <header className="soft-page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title} <Icon name="leaf" /></h1><p>{description}</p></div>{children}</header>;
}
