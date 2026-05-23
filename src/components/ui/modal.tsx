"use client";

import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  variant?: "default" | "light";
}

export function Modal({ open, onClose, title, children, variant = "default" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const isLight = variant === "light";

  const panelClass = isLight
    ? "w-full max-w-lg shadow-2xl rounded-[20px] border border-[color:var(--dune,#e8dfce)]"
    : "glass-card w-full max-w-lg shadow-2xl";

  const panelStyle: React.CSSProperties = {
    animation: "slide-up 0.25s ease",
    ...(isLight ? { background: "#fbf5ec" } : {}),
  };

  const headerClass = isLight
    ? "flex items-center justify-between px-6 py-4 border-b border-[color:var(--dune,#e8dfce)]"
    : "flex items-center justify-between px-6 py-4 border-b border-surface-border";

  const titleClass = isLight
    ? "text-lg font-bold text-[color:var(--ink,#1a1a1a)]"
    : "text-lg font-bold text-text-primary";

  const closeClass = isLight
    ? "p-1 rounded-lg text-[color:var(--smoke,#6b6b6b)] hover:text-accent-red hover:bg-accent-red/10 transition-all"
    : "p-1 rounded-lg text-text-muted hover:text-accent-red hover:bg-accent-red/10 transition-all";

  return (
    <div
      ref={overlayRef}
      className="glass-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className={panelClass} style={panelStyle}>
        <div className={headerClass}>
          <h2 className={titleClass}>
            {title}
          </h2>
          <button onClick={onClose} className={closeClass}>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
