import { useState } from "react";

export function ThemeSwitch() {
  const [theme, setTheme] = useState(
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      className="theme-switch"
      type="button"
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        setTheme(next);
        try {
          localStorage.setItem("ct.theme", next);
        } catch {
          /* The switch works without persistence. */
        }
      }}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>{" "}
      {next === "light" ? "Light mode" : "Dark mode"}
    </button>
  );
}
