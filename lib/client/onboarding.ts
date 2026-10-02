import { useCallback, useMemo, useSyncExternalStore } from "react";
import { readStorage, useStoredValue, writeStorage } from "./storage";

/** Local-only onboarding progress (there are no accounts). */

export const ONBOARDING_KEY = "tejrouter.onboarding";

export interface OnboardingState {
  /** Current step index: 0 choose routers, 1 restart + re-check, 2 try it. */
  step: number;
  /** Provider ids the user said they use. */
  selected: string[];
  /** Steps the user skipped. */
  skipped: number[];
  /** Provider ids that were configured when the guide started (to spot new ones). */
  baseline: string[] | null;
  completed: boolean;
  /** Banner / guide dismissed without finishing. */
  dismissed: boolean;
}

export const DEFAULT_ONBOARDING: OnboardingState = {
  step: 0,
  selected: [],
  skipped: [],
  baseline: null,
  completed: false,
  dismissed: false,
};

function isState(v: unknown): v is OnboardingState {
  return !!v && typeof v === "object" && Array.isArray((v as OnboardingState).selected);
}

export function readOnboarding(): OnboardingState {
  return { ...DEFAULT_ONBOARDING, ...readStorage(ONBOARDING_KEY, DEFAULT_ONBOARDING, isState) };
}

export function updateOnboarding(patch: Partial<OnboardingState>): void {
  writeStorage(ONBOARDING_KEY, { ...readOnboarding(), ...patch });
}

export function useOnboarding(): [OnboardingState, (patch: Partial<OnboardingState>) => void] {
  const v = useStoredValue(ONBOARDING_KEY, DEFAULT_ONBOARDING, isState);
  const update = useCallback((patch: Partial<OnboardingState>) => updateOnboarding(patch), []);
  const state = useMemo(() => (v === DEFAULT_ONBOARDING ? v : { ...DEFAULT_ONBOARDING, ...v }), [v]);
  return [state, update];
}

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true afterwards. Use to avoid flashes of storage-driven UI. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
