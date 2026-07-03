import { getTranslations } from 'next-intl/server';

import type { StageDeptSectionLabels } from '../_components/StageDeptSections';

const FALLBACK: StageDeptSectionLabels = {
  noFgLinked:
    'No Finished Good linked yet - values are saved on the project and will transfer to the FG automatically when it is created at gate G3.',
  readOnly: 'Read-only',
  save: 'Save',
  saved: 'Saved',
  saveFailed: 'Save failed',
  selectPlaceholder: 'Select...',
  booleanYes: 'Yes',
  booleanNo: 'No',
};

function resolveKey(value: string, key: string, fallback: string): string {
  return value === key ? fallback : value;
}

export async function getStageDeptSectionLabels(locale: string): Promise<StageDeptSectionLabels> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.stageDeptSections' });
    return {
      noFgLinked: resolveKey(t('noFgLinked'), 'noFgLinked', FALLBACK.noFgLinked),
      readOnly: resolveKey(t('readOnly'), 'readOnly', FALLBACK.readOnly),
      save: resolveKey(t('save'), 'save', FALLBACK.save),
      saved: resolveKey(t('saved'), 'saved', FALLBACK.saved),
      saveFailed: resolveKey(t('saveFailed'), 'saveFailed', FALLBACK.saveFailed),
      selectPlaceholder: resolveKey(t('selectPlaceholder'), 'selectPlaceholder', FALLBACK.selectPlaceholder),
      booleanYes: resolveKey(t('booleanYes'), 'booleanYes', FALLBACK.booleanYes),
      booleanNo: resolveKey(t('booleanNo'), 'booleanNo', FALLBACK.booleanNo),
    };
  } catch {
    return FALLBACK;
  }
}

export async function getCloseSectionLabel(locale: string): Promise<string> {
  try {
    const t = await getTranslations({ locale, namespace: 'npd.stageDeptSections' });
    const value = t('closeSection');
    return value === 'closeSection' ? 'Close {dept} section' : value;
  } catch {
    return 'Close {dept} section';
  }
}
