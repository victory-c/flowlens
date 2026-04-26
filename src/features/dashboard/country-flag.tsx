import { cn } from "@/lib/utils";

function iso2ToFlagEmoji(iso2: string) {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export function CountryFlag({
  iso2,
  country,
  className
}: {
  iso2?: string | null;
  country: string;
  className?: string;
}) {
  if (!iso2 || iso2.length !== 2) {
    return (
      <span className={cn("inline-flex items-center text-xs text-slate-400", className)} aria-hidden>
        ·
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center", className)}
      role="img"
      aria-label={`${country} flag`}
      title={country}
    >
      {iso2ToFlagEmoji(iso2)}
    </span>
  );
}
