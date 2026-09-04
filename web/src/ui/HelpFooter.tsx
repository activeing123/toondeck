import { useI18n } from "../i18n";

/**
 * N1 (novice lane): the app had zero help exits — no repo link, no issue
 * tracker, nowhere to ask. One honest footer link to the GitHub repo
 * (source + issues). The slug is the release home decided at project naming
 * (activeing123); it 404s only until the M5 publish.
 *
 * Mount: one line in the app shell (Shell footer row / console bottom).
 * Kept as a standalone component so the R53 portal-shell surgery in App.tsx
 * can adopt it without a merge conflict.
 */
const REPO_URL = "https://github.com/activeing123/toondeck";

export default function HelpFooter({ centered = false }: { centered?: boolean }) {
  const { t } = useI18n();
  return (
    <footer
      className={`border-t border-deck-line px-4 md:px-8 py-3 text-xs text-deck-muted flex items-center gap-4 ${
        centered ? "justify-center" : "justify-start"
      }`}
    >
      <span className="font-mono">toondeck</span>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="text-deck-accent hover:underline"
      >
        {t("footer.github")}
      </a>
    </footer>
  );
}
