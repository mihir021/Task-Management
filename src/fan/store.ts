import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { EffectsLevel, FanTheme } from "./config";
const lowEnd =
  typeof navigator !== "undefined" &&
  (matchMedia("(pointer: coarse)").matches ||
    navigator.hardwareConcurrency <= 4 ||
    ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <=
      4);
export const useFan = create(
  persist<{
    theme: FanTheme;
    effects: EffectsLevel;
    sound: boolean;
    setTheme: (theme: FanTheme) => void;
    setEffects: (effects: EffectsLevel) => void;
    toggleSound: () => void;
  }>(
    (set) => ({
      theme: "classic",
      effects: lowEnd ? "lite" : "full",
      sound: false,
      setTheme: (theme) => set({ theme }),
      setEffects: (effects) => set({ effects }),
      toggleSound: () => set((value) => ({ sound: !value.sound })),
    }),
    {
      name: "thread-city-settings",
      partialize: (state) =>
        ({
          theme: state.theme,
          effects: state.effects,
          sound: false,
        }) as typeof state,
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as object),
        sound: false,
      }),
    },
  ),
);
