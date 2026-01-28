interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = "", onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-6 shadow-sm ${onClick ? "cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-600 transition-colors" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
