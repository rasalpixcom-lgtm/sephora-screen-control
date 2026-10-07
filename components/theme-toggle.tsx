"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = mounted && resolvedTheme === "dark";

  return <button
    type="button"
    className={`theme-toggle ${className}`}
    disabled={!mounted}
    onClick={() => setTheme(isDark ? "light" : "dark")}
    aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    title={isDark ? "Light mode" : "Dark mode"}
  >{isDark ? <Sun size={18} aria-hidden="true"/> : <Moon size={18} aria-hidden="true"/>}<span>{isDark ? "Light" : "Dark"}</span></button>;
}
