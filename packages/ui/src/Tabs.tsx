'use client';

/**
 * Thin, unstyled re-export of the Radix Tabs primitives so app code can compose
 * count-badged / icon tab bars WITHOUT importing `@radix-ui/*` directly (the
 * drift-gate red-line). `TabsCounted` covers the simple uniform case; this lower-
 * level surface is for screens (e.g. BOM Detail) that need per-tab structure,
 * data-state styling and testid hooks while keeping Radix confined to packages/ui.
 *
 * data-slot markers mirror the other @monopilot/ui primitives so global CSS /
 * snapshot tests can target them.
 */

import React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';

export const Tabs = RadixTabs.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(({ className, ...props }, ref) => (
  <RadixTabs.List
    ref={ref}
    data-slot="tabs-list"
    className={['tabs__list', className].filter(Boolean).join(' ')}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(({ className, ...props }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    data-slot="tabs-trigger"
    className={['tabs__trigger', className].filter(Boolean).join(' ')}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(({ className, ...props }, ref) => (
  <RadixTabs.Content
    ref={ref}
    data-slot="tabs-content"
    className={['tabs__content', className].filter(Boolean).join(' ')}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';
