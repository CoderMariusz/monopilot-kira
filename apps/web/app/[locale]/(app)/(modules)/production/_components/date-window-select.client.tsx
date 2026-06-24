'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@monopilot/ui/Select';

export type DateWindowOption = {
  value: string;
  label: string;
};

export type DateWindowSelectProps = {
  value: number;
  ariaLabel: string;
  options: DateWindowOption[];
};

export function DateWindowSelect({ value, ariaLabel, options }: DateWindowSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = String(value);

  const setWindow = (nextValue: string) => {
    const next = new URLSearchParams(searchParams.toString());
    if (nextValue === '1') next.delete('days');
    else next.set('days', nextValue);
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <Select
      value={current}
      onValueChange={setWindow}
      options={options}
      className="min-w-36"
    >
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
