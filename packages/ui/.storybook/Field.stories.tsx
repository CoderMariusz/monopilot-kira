/**
 * T-027 — Field.stories.tsx
 *
 * Replicates the invite-modal Email/Role/Site fields from
 * prototypes/design/Monopilot Design System/settings/access-screens.jsx:139-145
 */
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Field from '../src/Field';

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------
const meta: Meta<typeof Field> = {
  title: 'UI/Field',
  component: Field,
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      const methods = useForm({ mode: 'onBlur' });
      return (
        <FormProvider {...methods}>
          <form style={{ maxWidth: 400, padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
            <Story />
          </form>
        </FormProvider>
      );
    },
  ],
};
export default meta;

type Story = StoryObj<typeof Field>;

// ---------------------------------------------------------------------------
// Basic stories
// ---------------------------------------------------------------------------

export const EmailField: Story = {
  args: {
    name: 'email',
    label: 'Email address',
    type: 'email',
    hint: 'Enter a valid work email',
    required: true,
  },
};

export const NoHint: Story = {
  args: {
    name: 'username',
    label: 'Username',
    type: 'text',
  },
};

export const OptionalField: Story = {
  args: {
    name: 'site',
    label: 'Site',
    type: 'text',
    hint: 'Leave blank to grant access to all sites',
    required: false,
  },
};

// ---------------------------------------------------------------------------
// Invite-modal composite — Email / Role / Site (access-screens.jsx:139-145)
// ---------------------------------------------------------------------------
const inviteSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  role: z.string().min(1, 'Role is required'),
  site: z.string().optional(),
});

function InviteModalFieldsStory() {
  const methods = useForm({
    mode: 'onBlur',
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: '', site: '' },
  });

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={methods.handleSubmit(() => alert('Submitted!'))}
        style={{ maxWidth: 400, padding: '1rem', fontFamily: 'system-ui, sans-serif', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <Field
          name="email"
          label="Email address"
          type="email"
          hint="name@apex.pl"
          required
        />
        <Field
          name="role"
          label="Role"
          type="text"
          hint="e.g. Viewer, Editor, Admin"
          required
        />
        <Field
          name="site"
          label="Site"
          type="text"
          hint="Leave blank for all sites"
        />
        <button type="submit" style={{ alignSelf: 'flex-start', padding: '0.5rem 1rem' }}>
          Invite
        </button>
      </form>
    </FormProvider>
  );
}

export const InviteModalFields: Story = {
  render: () => <InviteModalFieldsStory />,
};
