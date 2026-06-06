'use client';

/**
 * FG selector for the top-level Allergen cascade screen.
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/allergen-screens.jsx:5-145
 *   (AllergenCascade) — the `<select value={fa} ...>` FG/FA picker in the page head
 *   (line 49-51). The per-FG route has no top-level picker; this is the new part of
 *   the module-level entry. Raw <select> is a design red-line, so it is translated to
 *   the design-system shadcn Select (@monopilot/ui/Select).
 *
 * Behaviour: choosing an FG navigates by setting the `?fg=` search param
 * (router.replace, scroll-preserving) so the Server Component re-reads the cascade
 * for the selected FG. NO function props cross the RSC boundary — the page hands this
 * client island plain serializable data (options + current value) only.
 */

import React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monopilot/ui/Select';

export type FgSelectorOption = {
  /** product.product_code (FG canonical code). */
  value: string;
  /** "<code> — <name>" display label. */
  label: string;
};

export function FgSelector({
  options,
  value,
  label,
  placeholder,
}: {
  options: FgSelectorOption[];
  value: string;
  /** Visible label for the selector (i18n-resolved server-side). */
  label: string;
  placeholder: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = React.useCallback(
    (next: string) => {
      if (!next || next === value) return;
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('fg', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams, value],
  );

  return (
    <div className="flex items-center gap-2" data-testid="fg-selector">
      <label
        id="fg-selector-label"
        htmlFor="fg-selector-trigger"
        className="text-xs font-medium text-slate-600"
      >
        {label}
      </label>
      <Select value={value} onValueChange={handleChange} aria-labelledby="fg-selector-label">
        <SelectTrigger id="fg-selector-trigger" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default FgSelector;
