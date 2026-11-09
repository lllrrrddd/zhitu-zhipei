// SPDX-License-Identifier: Apache-2.0
import { Alert } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { findCareerMatches, getCareerMarket, refreshCareerMarket } from "../api/career";
import CareerProfileForm from "../features/career/CareerProfileForm";
import CareerProfileSwitcher from "../features/career/CareerProfileSwitcher";
import {
  loadRecords,
  newRecordId,
  removeRecord,
  saveRecords,
  suggestedLabel,
  upsertRecord,
  type CareerProfileRecord,
} from "../features/career/careerProfiles";
import CareerMaterialCheck from "../features/career/CareerMaterialCheck";
import CareerResults from "../features/career/CareerResults";
import {
  loadSnapshots,
  recordMatches,
  saveSnapshots,
  type MatchSnapshot,
} from "../features/career/matchHistory";
import CareerResumePanel from "../features/career/CareerResumePanel";
import CareerSourcePanel from "../features/career/CareerSourcePanel";
import type { CareerMatches, CareerProfile, MarketSummary } from "../features/career/types";
import { useApi } from "../hooks/useApi";
import { t } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import "../styles/career.css";

const REFRESH_INTERVAL = 30 * 60 * 1000;

/** 隐私模式/禁用存储时 access 会抛错，读不到就当没有档案，不阻断页面。 */
function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function CareerPage() {
  useLocale();
  const initialMarket = useApi(getCareerMarket);
  const [market, setMarket] = useState<MarketSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const refreshBusy = useRef(false);
  const [records, setRecords] = useState<CareerProfileRecord[]>(() => loadRecords(readStorage()));
  const [currentId, setCurrentId] = useState<string>(() => {
    const initial = loadRecords(readStorage());
    return initial[0]?.id ?? "";
  });
  const draft = records.find((item) => item.id === currentId)?.profile ?? null;
  const [draftVersion, setDraftVersion] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [result, setResult] = useState<CareerMatches | null>(null);
  /** 匹配历史只在这台设备上：每次匹配成功后追加，卡片上据此显示「较上次」。 */
  const [snapshots, setSnapshots] = useState<MatchSnapshot[]>(() => loadSnapshots(readStorage()));
  const resultSection = useRef<HTMLElement>(null);

  useEffect(() => {
    saveRecords(readStorage(), records);
  }, [records]);

  useEffect(() => {
    saveSnapshots(readStorage(), snapshots);
  }, [snapshots]);

  /**
   * 记一次匹配结果。
   *
   * 快照里的 `profileLabel` 用**匹配当时**的名字：用户之后改名，历史仍能说清"那次用的是哪份"。
   */
  const rememberMatches = useCallback(
    (matches: CareerMatches) => {
      const record = records.find((item) => item.id === currentId);
      if (!record) return;
      setSnapshots((current) =>
        recordMatches(current, matches.matches, { id: record.id, label: record.label }),
      );
    },
    [records, currentId],
  );

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

  /**
   * 导入/示例画像：**新建一份档案**，不覆盖已有档案。
   * 这正是"一个账号导入不同人的简历"要用到的地方——导入谁的就多一份，随时切回自己的。
   */
  function loadDraft(profile: CareerProfile) {
    const record: CareerProfileRecord = {
      id: newRecordId(),
      label: suggestedLabel(profile, records.length + 1, t("career.profiles.untitled")),
      profile,
      updatedAt: new Date().toISOString(),
    };
    setRecords((current) => upsertRecord(current, record));
    setCurrentId(record.id);
    setDraftVersion((value) => value + 1);
    setResult(null);
    setSearchError("");
  }

  function updateRecord(change: Partial<CareerProfile>) {
    setRecords((current) =>
      current.map((item) =>
        item.id === currentId
          ? {
              ...item,
              profile: { ...item.profile, ...change },
              updatedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
    setSearchError("");
    setResult(null);
  }

  function createRecord() {
    // 以当前档案为起点复制一份：多数场景是"同一个人换方向"，从空白开始反而更麻烦。
    const source = records.find((item) => item.id === currentId)?.profile;
    const profile: CareerProfile =
      source ??
      ({
        degree: "unknown",
        graduation_year: null,
        major: "",
        direction: "",
        cities: [],
        skills: [],
        experience: [],
      } satisfies CareerProfile);
    const record: CareerProfileRecord = {
      id: newRecordId(),
      label: suggestedLabel(profile, records.length + 1, t("career.profiles.untitled")),
      profile,
      updatedAt: new Date().toISOString(),
    };
    setRecords((current) => upsertRecord(current, record));
    setCurrentId(record.id);
    setDraftVersion((value) => value + 1);
    setResult(null);
  }

  function renameRecord(id: string, label: string) {
    setRecords((current) => current.map((item) => (item.id === id ? { ...item, label } : item)));
  }

  function deleteRecord(id: string) {
    setRecords((current) => {
      const next = removeRecord(current, id);
      if (id === currentId) {
        const fallback = next[0];
        setCurrentId(fallback?.id ?? "");
        setDraftVersion((value) => value + 1);
        setResult(null);
      }
      return next;
    });
  }

  async function search() {
    if (searching || !draft) return;
    if (!draft.direction.trim()) {
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
      rememberMatches(matches);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : t("career.result.failed"));
    } finally {
      setSearching(false);
    }
  }

  async function acceptAdvice(line: string) {
    if (searching || !draft || !line.trim()) return;
    const updated = {
      ...draft,
      experience: [
        ...draft.experience.filter((item) => item !== line.trim()).slice(-11),
        line.trim(),
      ],
    };
    // 采纳建议写回**当前档案**（而不是只改内存里的 draft），刷新后仍然在。
    setRecords((current) =>
      current.map((item) =>
        item.id === currentId
          ? { ...item, profile: updated, updatedAt: new Date().toISOString() }
          : item,
      ),
    );
    setDraftVersion((value) => value + 1);
    setSearching(true);
    setSearchError("");
    try {
      const matches = await findCareerMatches(updated);
      setMarket(matches.market);
      setResult(matches);
      rememberMatches(matches);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : t("career.result.failed"));
      setResult(null);
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
        <>
          <CareerProfileSwitcher
            records={records}
            currentId={currentId}
            onSelect={(id) => {
              setCurrentId(id);
              setDraftVersion((value) => value + 1);
              setResult(null);
              setSearchError("");
            }}
            onCreate={createRecord}
            onRename={renameRecord}
            onDelete={deleteRecord}
          />
          <CareerProfileForm
            key={draftVersion}
            profile={draft}
            searching={searching}
            onChange={updateRecord}
            onSearch={() => void search()}
          />
        </>
      )}
      {searchError && <Alert type="error" showIcon title={searchError} />}
      {result && draft && (
        <>
          <section className="career-results" ref={resultSection}>
            <CareerResults
              profileId={currentId}
              history={snapshots}
              result={result}
              profile={draft}
              onAcceptAdvice={(line) => void acceptAdvice(line)}
            />
          </section>
          <CareerMaterialCheck key={draftVersion} profile={draft} />
        </>
      )}
    </div>
  );
}
