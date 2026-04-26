type CardVariant = "glass" | "paper";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  variant?: CardVariant;
}

export function Card({ children, className = "", onClick, variant = "glass" }: CardProps) {
  const base = variant === "paper" ? "card-rebrand p-6" : "glass-card p-6";
  return (
    <div
      onClick={onClick}
      className={`${base} ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
