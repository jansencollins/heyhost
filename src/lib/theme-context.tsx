"use client";

import { createContext, useContext } from "react";
import type { GameTheme } from "./types";
import { DEFAULT_THEME } from "./theme-presets";

const ThemeContext = createContext<GameTheme>(DEFAULT_THEME.trivia);

export function ThemeProvider({
  theme,
  children,
}: {
  theme: GameTheme;
  children: React.ReactNode;
}) {
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useGameTheme(): GameTheme {
  return useContext(ThemeContext);
}
