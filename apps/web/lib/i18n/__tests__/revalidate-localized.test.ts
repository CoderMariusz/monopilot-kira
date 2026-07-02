import { beforeEach, describe, expect, it, vi } from 'vitest';

const { revalidatePath } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));

import { revalidateLocalized } from '../revalidate-localized';

describe('revalidateLocalized', () => {
  beforeEach(() => {
    revalidatePath.mockClear();
  });

  it('revalidates all locales with a leading slash on the route', () => {
    revalidateLocalized('/settings/users');

    expect(revalidatePath).toHaveBeenCalledTimes(4);
    expect(revalidatePath).toHaveBeenCalledWith('/pl/settings/users', undefined);
    expect(revalidatePath).toHaveBeenCalledWith('/en/settings/users', undefined);
    expect(revalidatePath).toHaveBeenCalledWith('/uk/settings/users', undefined);
    expect(revalidatePath).toHaveBeenCalledWith('/ro/settings/users', undefined);
  });

  it('normalizes a missing leading slash and passes the type arg through', () => {
    revalidateLocalized('settings/users', 'layout');

    expect(revalidatePath).toHaveBeenCalledWith('/pl/settings/users', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/en/settings/users', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/uk/settings/users', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/ro/settings/users', 'layout');
  });
});
