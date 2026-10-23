// Runs before styles load; stays external to satisfy the dashboard CSP.
// It is also the only owner of the theme-color tag, which follows data-theme
// so browser chrome matches the page background (--paper in tokens.css).
{
  const root = document.documentElement;
  try {
    const theme = localStorage.getItem("ct.theme");
    if (theme === "light" || theme === "dark") {
      root.dataset.theme = theme;
    }
  } catch {
    // Dark remains usable when browser storage is unavailable.
  }
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const syncThemeColor = () =>
    themeColor?.setAttribute(
      "content",
      root.dataset.theme === "light" ? "#eee" : "#000",
    );
  syncThemeColor();
  new MutationObserver(syncThemeColor).observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}
