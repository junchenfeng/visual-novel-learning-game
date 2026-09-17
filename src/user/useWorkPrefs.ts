"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeWorkTitle } from "../dlc/catalogShared";

type UserPrefs = {
  selectedDlcByWork: Record<string, string>;
};

type UseWorkPrefsResult = {
  ready: boolean;
  selectedDlcByWork: Record<string, string>;
  saveSelection: (workTitle: string, dlcId: string) => void;
};

export function useWorkPrefs(): UseWorkPrefsResult {
  const [ready, setReady] = useState(false);
  const [selectedDlcByWork, setSelectedDlcByWork] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/prefs");
        if (!response.ok) {
          throw new Error("prefs");
        }
        const data = (await response.json()) as UserPrefs;
        if (!cancelled) {
          setSelectedDlcByWork(data.selectedDlcByWork ?? {});
        }
      } catch {
        if (!cancelled) {
          setSelectedDlcByWork({});
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSelection = useCallback((workTitle: string, dlcId: string) => {
    const key = normalizeWorkTitle(workTitle);
    setSelectedDlcByWork((current) => ({ ...current, [key]: dlcId }));
    void fetch("/api/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workTitle, dlcId }),
    });
  }, []);

  return { ready, selectedDlcByWork, saveSelection };
}
