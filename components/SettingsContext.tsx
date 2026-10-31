'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  ReasoningSettings,
  DEFAULT_REASONING_SETTINGS,
  SettingsDrawer,
} from './SettingsDrawer';

interface SettingsContextValue {
  userApiKey: string;
  setUserApiKey: (key: string) => void;
  reasoningSettings: ReasoningSettings;
  setReasoningSettings: (settings: ReasoningSettings) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  getApiHeaders: (operation: 'lint' | 'spec' | 'tests' | 'diagrams') => Record<string, string>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  // Kept in tab memory only (never localStorage, never URL)
  const [userApiKey, setUserApiKey] = useState<string>('');
  const [reasoningSettings, setReasoningSettings] = useState<ReasoningSettings>(
    DEFAULT_REASONING_SETTINGS
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const getApiHeaders = (operation: 'lint' | 'spec' | 'tests' | 'diagrams'): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (userApiKey && userApiKey.trim() !== '') {
      headers['x-groq-api-key'] = userApiKey.trim();
    }
    const effort = reasoningSettings[operation];
    if (effort) {
      headers['x-reasoning-effort'] = effort;
    }
    return headers;
  };

  return (
    <SettingsContext.Provider
      value={{
        userApiKey,
        setUserApiKey,
        reasoningSettings,
        setReasoningSettings,
        isSettingsOpen,
        setIsSettingsOpen,
        getApiHeaders,
      }}
    >
      {children}
      <SettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        userApiKey={userApiKey}
        onUserApiKeyChange={setUserApiKey}
        reasoningSettings={reasoningSettings}
        onReasoningSettingsChange={setReasoningSettings}
      />
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

