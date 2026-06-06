'use client';

/**
 * Pipeline — Create NPD project modal (dead "+ New project" button fix).
 *
 * Prototype parity source (1:1):
 *   prototypes/design/Monopilot Design System/npd/project.jsx:107-263
 *   (CreateProjectWizard — the hero "Create NPD project" flow). The 4-step wizard
 *   (Basics / Brief / Starting point / Review) is condensed to a single modal that
 *   captures exactly the fields the merged createProject Server Action (T-057)
 *   accepts: name, category (type), target launch, priority, owner, notes. The
 *   prototype's Brief-only marketing fields (price/audience/claims) and the
 *   clone/template starting-point cards are deferred (logged in the deviation log)
 *   because createProject seeds a blank checklist (start_from='blank') only.
 *
 * Mirrors the working FaCreateModal pattern (fa/_components/fa-create-modal.tsx):
 *   - pure Client form; the Server Action is INJECTED (createAction) so the page
 *     wires the real T-057 createProject — never authored here;
 *   - RBAC is enforced server-side: the page injects the action ONLY when
 *     `canCreate` is true, so the client form can never create what the server
 *     would reject (the submit button is disabled when the action is absent).
 */

import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@monopilot/ui/Button';
import Modal from '@monopilot/ui/Modal';
import Input from '@monopilot/ui/Input';
import { Select } from '@monopilot/ui/Select';

export type ProjectPriority = 'high' | 'normal' | 'low';

/** Server Action signature (owned by T-057 — imported by the page, injected here). */
export type CreateProjectAction = (input: {
  name: string;
  type: string;
  prio: ProjectPriority;
  owner: string | null;
  targetLaunch: string | null;
  notes: string | null;
  templateId: string;
}) => Promise<
  | { ok: true; data: { id: string; code: string } }
  | { ok: false; error: string }
>;

export type ProjectCreateLabels = {
  title: string;
  subtitle: string;
  fieldName: string;
  fieldNameHint: string;
  fieldType: string;
  fieldTarget: string;
  fieldTargetHint: string;
  fieldPriority: string;
  fieldOwner: string;
  fieldOwnerHint: string;
  fieldNotes: string;
  prioHigh: string;
  prioNormal: string;
  prioLow: string;
  cancel: string;
  create: string;
  creating: string;
  errorName: string;
  errorType: string;
  errorTarget: string;
  errorGeneric: string;
  errorForbidden: string;
};

/** Category options mirror the prototype's wizard <select> (project.jsx:152-155). */
const CATEGORY_VALUES = [
  'Meat · Cold cut',
  'Meat · Smoked',
  'Meat · Cured',
  'Meat · Pâté',
  'Fish · Smoked',
] as const;

function makeSchema(labels: ProjectCreateLabels) {
  return z.object({
    name: z.string().trim().min(1, labels.errorName).max(160, labels.errorName),
    type: z.string().trim().min(1, labels.errorType).max(120, labels.errorType),
    prio: z.enum(['high', 'normal', 'low']),
    owner: z.string().trim().max(120).optional(),
    // empty string OR a YYYY-MM-DD date.
    targetLaunch: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), labels.errorTarget),
    notes: z.string().trim().max(2000).optional(),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export function ProjectCreateModal({
  open,
  labels,
  createAction,
  onCreated,
  onClose,
}: {
  open: boolean;
  labels: ProjectCreateLabels;
  createAction?: CreateProjectAction;
  /** Called with the new project id on success; the page redirects to /pipeline/<id>. */
  onCreated: (projectId: string) => void;
  onClose: () => void;
}) {
  const schema = React.useMemo(() => makeSchema(labels), [labels]);
  const methods = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      type: CATEGORY_VALUES[0],
      prio: 'normal',
      owner: '',
      targetLaunch: '',
      notes: '',
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isValid, isSubmitting },
  } = methods;

  const [serverError, setServerError] = React.useState<string | null>(null);

  const prioOptions = React.useMemo(
    () => [
      { value: 'high', label: labels.prioHigh },
      { value: 'normal', label: labels.prioNormal },
      { value: 'low', label: labels.prioLow },
    ],
    [labels.prioHigh, labels.prioNormal, labels.prioLow],
  );

  const categoryOptions = React.useMemo(
    () => CATEGORY_VALUES.map((value) => ({ value, label: value })),
    [],
  );

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    if (!createAction) {
      setServerError(labels.errorForbidden);
      return;
    }
    const result = await createAction({
      name: values.name,
      type: values.type,
      prio: values.prio,
      owner: values.owner?.trim() ? values.owner.trim() : null,
      targetLaunch: values.targetLaunch?.trim() ? values.targetLaunch.trim() : null,
      notes: values.notes?.trim() ? values.notes.trim() : null,
      templateId: 'APEX_DEFAULT',
    });
    if (result.ok) {
      onCreated(result.data.id);
      return;
    }
    setServerError(result.error === 'FORBIDDEN' ? labels.errorForbidden : labels.errorGeneric);
  });

  const submitDisabled = !isValid || isSubmitting || !createAction;
  const currentPrio = watch('prio');
  const currentType = watch('type');

  return (
    <Modal open={open} onOpenChange={(next) => (next ? undefined : onClose())} size="md" modalId="projectCreate">
      <Modal.Header title={labels.title} />
      <FormProvider {...methods}>
        <form onSubmit={onSubmit} noValidate data-testid="project-create-form">
          <Modal.Body>
            <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{labels.subtitle}</p>

            <div className="ff">
              <label htmlFor="project-create-name">
                {labels.fieldName} <span className="req" aria-label="required">*</span>
              </label>
              <Input
                id="project-create-name"
                className="form-input"
                placeholder="Sliced Ham 200g"
                aria-invalid={errors.name ? 'true' : undefined}
                aria-describedby={errors.name ? 'project-create-name-error' : 'project-create-name-hint'}
                {...register('name')}
              />
              {errors.name ? (
                <span id="project-create-name-error" role="alert" className="ff-error">
                  {errors.name.message}
                </span>
              ) : (
                <span id="project-create-name-hint" className="ff-help">
                  {labels.fieldNameHint}
                </span>
              )}
            </div>

            <div className="ff">
              <label htmlFor="project-create-type">
                {labels.fieldType} <span className="req" aria-label="required">*</span>
              </label>
              <Select
                id="project-create-type"
                aria-label={labels.fieldType}
                value={currentType}
                options={categoryOptions}
                onValueChange={(v) => setValue('type', v, { shouldValidate: true, shouldDirty: true })}
              />
            </div>

            <div className="ff">
              <label htmlFor="project-create-target">{labels.fieldTarget}</label>
              <Input
                id="project-create-target"
                className="form-input mono"
                placeholder="YYYY-MM-DD"
                aria-invalid={errors.targetLaunch ? 'true' : undefined}
                aria-describedby={
                  errors.targetLaunch ? 'project-create-target-error' : 'project-create-target-hint'
                }
                {...register('targetLaunch')}
              />
              {errors.targetLaunch ? (
                <span id="project-create-target-error" role="alert" className="ff-error">
                  {errors.targetLaunch.message}
                </span>
              ) : (
                <span id="project-create-target-hint" className="ff-help">
                  {labels.fieldTargetHint}
                </span>
              )}
            </div>

            <div className="ff">
              <label htmlFor="project-create-priority">{labels.fieldPriority}</label>
              <Select
                id="project-create-priority"
                aria-label={labels.fieldPriority}
                value={currentPrio}
                options={prioOptions}
                onValueChange={(v) =>
                  setValue('prio', v as ProjectPriority, { shouldValidate: true, shouldDirty: true })
                }
              />
            </div>

            <div className="ff">
              <label htmlFor="project-create-owner">{labels.fieldOwner}</label>
              <Input
                id="project-create-owner"
                className="form-input"
                placeholder="K. Nowak"
                aria-describedby="project-create-owner-hint"
                {...register('owner')}
              />
              <span id="project-create-owner-hint" className="ff-help">
                {labels.fieldOwnerHint}
              </span>
            </div>

            <div className="ff">
              <label htmlFor="project-create-notes">{labels.fieldNotes}</label>
              <textarea
                id="project-create-notes"
                className="form-input"
                rows={3}
                {...register('notes')}
              />
            </div>

            {serverError ? (
              <div role="alert" className="alert alert-red">
                {serverError}
              </div>
            ) : null}
          </Modal.Body>
          <Modal.Footer>
            <Button type="button" className="btn-secondary btn-sm" onClick={onClose} disabled={isSubmitting}>
              {labels.cancel}
            </Button>
            <Button type="submit" className="btn-primary btn-sm" disabled={submitDisabled}>
              {isSubmitting ? labels.creating : labels.create}
            </Button>
          </Modal.Footer>
        </form>
      </FormProvider>
    </Modal>
  );
}

export default ProjectCreateModal;
