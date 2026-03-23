import { useState, useCallback } from 'react';
import type { Settings } from '../types';

const STORAGE_KEY = 'court-simulator-settings';

const DEFAULT_SETTINGS: Settings = {
  length: 'medium',
  rounds: 2,
  style: 'modern',
  typingSpeed: 'fast',
  selectedOfficials: ['hubu', 'bingbu', 'libu', 'gongbu', 'yushi', 'hanlin', 'chancellor'],
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch {
    // localStorage 不可用时静默降级
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 静默忽略
  }
}

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(loadSettings);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettingsState(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSettings, resetSettings };
}
