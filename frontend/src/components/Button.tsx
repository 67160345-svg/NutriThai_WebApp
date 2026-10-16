import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "soft" | "ghost";
}

export default function Button({ variant = "primary", className = "", type = "button", ...props }: Props) {
  return <button {...props} type={type} className={`nt-button nt-button--${variant} ${className}`} />;
}
