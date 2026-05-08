/**
 * Button stories — covers default and dry-run variants.
 * The Button is a high-traffic primitive used across forms, modals, and toolbars.
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from '../src/Button';

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  tags: ['autodocs'],
};

export default meta;

type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: {
    children: 'Save changes',
  },
};

export const DryRun: Story = {
  args: {
    children: 'Preview (dry-run)',
    variant: 'dry-run',
  },
};

export const Disabled: Story = {
  args: {
    children: 'Save changes',
    disabled: true,
  },
};
