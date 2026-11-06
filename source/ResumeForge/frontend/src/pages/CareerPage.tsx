// SPDX-License-Identifier: Apache-2.0
import { Alert } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { findCareerMatches, getCareerMarket, refreshCareerMarket } from "../api/career";
import CareerProfileForm from "../features/career/CareerProfileForm";
import CareerResults from "../features/career/CareerResults";
import CareerResumePanel from "../features/career/CareerResumePanel";
import CareerSourcePanel from "../features/career/CareerSourcePanel";
import { hasSearchDetails } from "../features/career/profileFromResume";
import type { CareerMatches, CareerProfile, MarketSummary } from "../features/career/types";
import { useApi } from "../hooks/useApi";
import { t } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import "../styles/career.css";

const REFRESH_INTERVAL = 30 * 60 * 1000;

export default function CareerPage() {
  useLocale();
  const initialMarket = useApi(getCareerMarket);
  const [market, setMarket] = useState<MarketSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const refreshBusy = useRef(false);
  const [draft, setDraft] = useState<CareerProfile | null>(null);
  const [draftVersion, setDraftVersion] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [result, setResult] = useState<CareerMatches | null>(null);
  const resultSection = useRef<HTMLElement>(null);

  const refresh = useCallback(async (force: boolean) => {
    if (refreshBusy.current) return;
    refreshBusy.current = true;
    setRefreshing(true);
    setRefreshError(false);
    try {
      setMarket(await refreshCareerMarket(force));
    } catch {
      setRefreshError(true);
    } finally {
      refreshBusy.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(false), 0);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, REFRESH_INTERVAL);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (result) resultSection.current?.scrollIntoView({ block: "start" });
  }, [result]);

  function loadDraft(profile: CareerProfile) {
    setDraft(profile);
    setDraftVersion((value) => value + 1);
    setResult(null);
    setSearchError("");
  }

  async function search() {
    if (searching || !draft) return;
    if (!hasSearchDetails(draft)) {
      setSearchError(t("career.profile.required"));
      return;
    }
    setSearching(true);
    setSearchError("");
    setResult(null);
    try {
      const matches = await findCareerMatches(draft);
      setMarket(matches.market);
      setResult(matches);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : t("career.result.failed"));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="career-workbench">
      <header className="career-hero">
        <span>{t("career.kicker")}</span>
        <h1>{t("career.title")}</h1>
        <p>{t("career.intro")}</p>
      </header>
      <div className="career-start-grid">
        <CareerResumePanel onLoad={loadDraft} searching={searching} />
        <CareerSourcePanel
          market={market ?? initialMarket.data ?? null}
          refreshing={refreshing || initialMarket.loading}
          error={refreshError}
          onRefresh={() => void refresh(true)}
        />
      </div>
      {draft && (
        <CareerProfileForm
          key={draftVersion}
          profile={draft}
          searching={searching}
          onChange={(change) => {
            setDraft((current) => current && { ...current, ...change });
            setSearchError("");
            setResult(null);
          }}
          onSearch={() => void search()}
        />
      )}
      {searchError && <Alert type="error" showIcon title={searchError} />}
      {result && (
        <section className="career-results" ref={resultSection}>
          <CareerResults result={result} />
        </section>
      )}
    </div>
  );
}
