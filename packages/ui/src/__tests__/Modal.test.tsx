import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Modal from '../Modal';
import { assertModalA11y } from '../../test/assertModalA11y';

const uiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = path.resolve(uiRoot, '../..');

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function findFiles(root: string, predicate: (filePath: string) => boolean): string[] {
  if (!fs.existsSync(root)) return [];

  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) return findFiles(absolutePath, predicate);
    return predicate(absolutePath) ? [absolutePath] : [];
  });
}

describe('Modal primitive contract', () => {
  it('matches the settings access invite-modal hierarchy and reads width from tokens.css', () => {
    const { container } = render(
      <Modal open onOpenChange={() => {}} size="md">
        <Modal.Header title="Invite user" />
        <Modal.Body>
          <div className="field"><label>Email address</label><input type="email" /></div>
          <div className="form-grid-2">
            <div className="field"><label>Role</label><select><option>Manager</option></select></div>
            <div className="field"><label>Site</label><select><option>Kraków HQ</option></select></div>
          </div>
          <div className="field"><label>Personal message (optional)</label><textarea rows={2} /></div>
          <div className="alert alert-blue">They&apos;ll receive an email with a magic link.</div>
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-secondary">Cancel</button>
          <button className="btn btn-primary">Send invitation</button>
        </Modal.Footer>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Invite user' });
    expect(dialog.tagName.toLowerCase()).not.toBe('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('data-size', 'md');
    expect(dialog.getAttribute('style')).toMatch(/--modal-size-md-width(?!,)/);

    expect(container.querySelector('[data-testid="modal-header"]')).toContainElement(screen.getByText('Invite user'));
    expect(container.querySelector('[data-testid="modal-close-button"]')).toHaveAttribute('aria-label', 'Close');
    expect(container.querySelector('[data-testid="modal-body"] .form-grid-2')).toBeTruthy();
    expect(container.querySelector('[data-testid="modal-footer"]')).toContainElement(screen.getByRole('button', { name: 'Cancel' }));
    expect(container.querySelector('[data-testid="modal-footer"]')).toContainElement(screen.getByRole('button', { name: 'Send invitation' }));
  });

  it('traps focus while open, closes on Escape only when dismissible, and restores focus to the invoker', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const locked = render(
      <Modal open onOpenChange={onOpenChange} dismissible={false}>
        <Modal.Header title="Locked modal" />
        <Modal.Body><input aria-label="First field" /></Modal.Body>
        <Modal.Footer><button>Cancel</button><button>Confirm</button></Modal.Footer>
      </Modal>,
    );

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Locked modal' }), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    locked.unmount();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>Open invite modal</button>
          <Modal open={open} onOpenChange={setOpen}>
            <Modal.Header title="Invite user" />
            <Modal.Body><input aria-label="Email address" /></Modal.Body>
            <Modal.Footer><button>Cancel</button><button>Send invitation</button></Modal.Footer>
          </Modal>
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open invite modal' });
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole('dialog', { name: 'Invite user' })).toContainElement(document.activeElement as HTMLElement);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});

describe('Modal accessibility helper contract', () => {
  it('fails a fake dialog that has ARIA labels but no demonstrable focus trap', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <button>Outside page control</button>
      <div role="dialog" aria-modal="true" aria-labelledby="fake-title">
        <h2 id="fake-title">Fake modal</h2>
        <button>First</button>
        <button>Last</button>
      </div>
    `;

    await expect(assertModalA11y(container)).rejects.toThrow(/focus trap|focus/i);
  });
});

describe('Modal governance and CI coverage', () => {
  it('blocks direct @radix-ui/react-dialog imports outside packages/ui via root ESLint no-restricted-imports', () => {
    const eslintConfigPath = path.join(repoRoot, '.eslintrc.js');
    expect(fs.existsSync(eslintConfigPath)).toBe(true);
    const eslintConfig = fs.readFileSync(eslintConfigPath, 'utf8');

    expect(eslintConfig).toContain('no-restricted-imports');
    expect(eslintConfig).toContain('@radix-ui/react-dialog');
    expect(eslintConfig).toMatch(/packages\/ui/);
  });

  it('defines one Storybook 8 modal story for every size variant', () => {
    const stories = readText('packages/ui/.storybook/Modal.stories.tsx');

    for (const [storyName, size] of [['Small', 'sm'], ['Medium', 'md'], ['Large', 'lg'], ['ExtraLarge', 'xl']] as const) {
      expect(stories).toMatch(new RegExp(`export\\s+const\\s+${storyName}\\b`));
      expect(stories).toContain(`size="${size}"`);
    }
  });

  it('runs axe-core over the four Storybook modal stories in a Vitest CI test', () => {
    const a11yTests = findFiles(path.join(uiRoot, 'src'), (filePath) => /\.a11y\.test\.tsx?$/.test(filePath))
      .concat(findFiles(path.join(uiRoot, 'test'), (filePath) => /\.a11y\.test\.tsx?$/.test(filePath)));
    expect(a11yTests.length).toBeGreaterThan(0);

    const combined = a11yTests.map((filePath) => fs.readFileSync(filePath, 'utf8')).join('\n');
    expect(combined).toContain('@axe-core/playwright');
    for (const size of ['sm', 'md', 'lg', 'xl']) expect(combined).toContain(size);
    expect(combined).toMatch(/serious|critical/);
  });
});
