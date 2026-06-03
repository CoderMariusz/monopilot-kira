import { describe, expect, it } from 'vitest';
import { normalizePermission, Permission } from '../permissions.enum.js';

describe('has-permission canonical permission input', () => {
  it('leaves canonical permission strings unchanged', () => {
    expect(normalizePermission(Permission.SETTINGS_USERS_MANAGE)).toBe(Permission.SETTINGS_USERS_MANAGE);
    expect(normalizePermission(Permission.NPD_RELEASED_PRODUCT_EDIT_REQUEST)).toBe(
      Permission.NPD_RELEASED_PRODUCT_EDIT_REQUEST,
    );
  });

  it('does not normalize un-namespaced NPD permission strings in this task', () => {
    expect(() => normalizePermission('d365_builder.execute')).toThrow('Unknown permission string');
    expect(() => normalizePermission('risk.write')).toThrow('Unknown permission string');
    expect(() => normalizePermission('schema.edit')).toThrow('Unknown permission string');
  });
});
