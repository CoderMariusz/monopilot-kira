'use client';

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@monopilot/ui/Button';

import { DeptCloseModal } from '../../_modals/dept-close-modal';
import { closeDeptSection } from '../../fa/actions/close-dept-section';
import {
  getRequiredFieldsForDept,
  type Dept,
  type RequiredFieldsForDept,
} from '../../fa/actions/get-required-fields-for-dept';

type StageDeptCloseButtonProps = {
  productCode: string;
  dept: Dept;
  deptLabel: string;
  closeSectionLabel: string;
  canClose: boolean;
};

export function StageDeptCloseButton({
  productCode,
  dept,
  deptLabel,
  closeSectionLabel,
  canClose,
}: StageDeptCloseButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'forbidden'>('loading');
  const [requiredFields, setRequiredFields] = useState<RequiredFieldsForDept | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadReadiness = useCallback(async () => {
    setStatus('loading');
    setRequiredFields(null);
    try {
      const result = await getRequiredFieldsForDept(productCode, dept);
      setRequiredFields({
        ...result,
        allPass: result.fields.length === 0 ? true : result.allPass,
      });
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [dept, productCode]);

  if (!canClose) return null;

  const label = closeSectionLabel.replace('{dept}', deptLabel);

  return (
    <>
      <Button
        type="button"
        disabled={isPending}
        className="px-3 py-1.5 text-xs"
        data-testid={`stage-dept-close-${dept.toLowerCase()}`}
        onClick={() => {
          setOpen(true);
          void loadReadiness();
        }}
      >
        {label}
      </Button>

      <DeptCloseModal
        open={open}
        dept={dept}
        fa={{ faCode: productCode, productName: productCode }}
        requiredFields={requiredFields}
        status={status}
        onClose={() => setOpen(false)}
        onConfirm={({ note }) => {
          startTransition(async () => {
            try {
              await closeDeptSection(productCode, dept);
              setOpen(false);
              router.refresh();
            } catch {
              setStatus('error');
            }
            void note;
          });
        }}
      />
    </>
  );
}

export default StageDeptCloseButton;
