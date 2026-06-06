export type OnboardingStepId =
  | 'org_profile'
  | 'warehouse'
  | 'location'
  | 'product'
  | 'workorder'
  | 'completion';

export type OnboardingStepStatus = 'not_started' | 'current' | 'completed' | 'skipped';

export type OnboardingStep = {
  id: OnboardingStepId;
  label: string;
  status: OnboardingStepStatus;
  order: number;
};

export type OnboardingState = {
  steps: OnboardingStep[];
  currentStepId: OnboardingStepId | null;
  completedCount: number;
  totalSteps: 6;
  allComplete: boolean;
};
