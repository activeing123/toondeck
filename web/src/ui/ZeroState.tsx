/*
ZeroState — the "nothing here yet" card (R33).

A silent empty grid teaches a new user nothing. Every zero-data panel shows
this instead: an icon, an honest title, a hint that names the next action,
and an optional CTA link. data-testid="zero-state" is the sentinel the
panel-level tests pin.
*/

import { useI18n } from "../i18n";

export function ZeroState({
  icon,
  titleKey,
  hintKey,
  ctaHref,
  ctaLabelKey,
}: {
  icon: string;
  titleKey: string;
  hintKey: string;
  ctaHref?: string;
  ctaLabelKey?: string;
}) {
  const { t } = useI18n();
  return (
    <div data-testid="zero-state" className="glass rounded-deck p-8 text-center space-y-2">
      <div className="text-3xl" aria-hidden>
        {icon}
      </div>
      <p className="font-semibold">{t(titleKey)}</p>
      {hintKey && <p className="text-sm text-deck-muted max-w-md mx-auto">{t(hintKey)}</p>}
      {ctaHref && ctaLabelKey && (
        <a href={ctaHref} className="inline-block pt-1 text-sm text-deck-accent hover:underline">
          {t(ctaLabelKey)}
        </a>
      )}
    </div>
  );
}
