import { SelectHTMLAttributes, forwardRef } from "react";

type SelectVariant = "glass" | "paper";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  variant?: SelectVariant;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, className = "", id, variant = "glass", ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const isPaper = variant === "paper";
    const baseClass = isPaper
      ? "input-rebrand w-full text-[15px] appearance-none pr-10"
      : "glass-select w-full px-3.5 py-2.5 text-sm";
    const labelClass = isPaper
      ? "block text-sm font-medium text-ink mb-2"
      : "block text-sm font-medium text-text-secondary mb-1.5";
    const selectEl = (
      <select
        ref={ref}
        id={selectId}
        className={`${baseClass} ${error ? "border-accent-red!" : ""} ${className}`}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className={labelClass}>
            {label}
          </label>
        )}
        {isPaper ? (
          <div className="relative">
            {selectEl}
            {/* Chevron — visible because `appearance-none` hides the browser default */}
            <svg
              aria-hidden
              className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </div>
        ) : (
          selectEl
        )}
        {error && (
          <p className={`mt-1.5 text-sm ${isPaper ? "text-coral" : "text-accent-red"}`}>{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
