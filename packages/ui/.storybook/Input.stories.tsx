/**
 * Input stories — covers the bare Input primitive.
 * For full form-field behaviour see Field.stories.tsx (label + error wiring).
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import Input from '../src/Input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 320, padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    placeholder: 'Type here…',
  },
};

export const Email: Story = {
  args: {
    type: 'email',
    placeholder: 'name@example.com',
    'aria-label': 'Email',
  },
};
