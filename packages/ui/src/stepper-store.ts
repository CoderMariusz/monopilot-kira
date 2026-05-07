import { create } from 'zustand';

interface StepperState {
  steps: Record<string, number>;
  getStep: (wizardId: string) => number;
  setStep: (wizardId: string, step: number) => void;
  reset: (wizardId: string) => void;
}

export const useStepperStore = create<StepperState>((set, get) => ({
  steps: {},

  getStep(wizardId: string): number {
    return get().steps[wizardId] ?? 0;
  },

  setStep(wizardId: string, step: number): void {
    set((state) => ({
      steps: { ...state.steps, [wizardId]: step },
    }));
  },

  reset(wizardId: string): void {
    set((state) => {
      const next = { ...state.steps };
      delete next[wizardId];
      return { steps: next };
    });
  },
}));
