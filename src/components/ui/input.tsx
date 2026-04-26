import { InputHTMLAttributes, forwardRef } from "react";

type InputVariant = "glass" | "paper";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  variant?: InputVariant;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", id, variant = "glass", ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const isPaper = variant === "paper";
    const baseClass = isPaper
      ? "input-rebrand w-full text-[15px]"
      : "glass-input w-full px-3.5 py-2.5 text-sm placeholder:text-text-muted";
    const labelClass = isPaper
      ? "block text-sm font-medium text-ink mb-2"
      : "block text-sm font-medium text-text-secondary mb-1.5";
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className={labelClass}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`${baseClass} ${
            error ? "border-accent-red! shadow-[0_0_0_3px_rgba(239,68,68,0.12)]" : ""
          } ${className}`}
          {...props}
        />
        {error && (
          <p className={`mt-1.5 text-sm ${isPaper ? "text-coral" : "text-accent-red"}`}>{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
