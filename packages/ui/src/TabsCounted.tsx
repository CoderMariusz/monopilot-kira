import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';

export interface TabItem {
  label: string;
  count: number;
  content: React.ReactNode;
}

export interface TabsCountedProps {
  tabs: TabItem[];
  defaultValue?: string;
}

export function TabsCounted({ tabs, defaultValue }: TabsCountedProps) {
  const initial = defaultValue ?? tabs[0]?.label ?? '';

  return (
    <Tabs.Root defaultValue={initial}>
      <Tabs.List>
        {tabs.map((tab) => (
          <Tabs.Trigger key={tab.label} value={tab.label}>
            {tab.label}
            <span className="tabs-counted__badge" aria-label={`${tab.count} items`}>
              {tab.count}
            </span>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Content key={tab.label} value={tab.label}>
          {tab.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
