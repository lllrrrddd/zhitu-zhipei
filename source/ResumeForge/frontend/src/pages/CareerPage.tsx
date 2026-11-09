// SPDX-License-Identifier: Apache-2.0
import { Alert, App } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { findCareerMatches, getCareerMarket, refreshCareerMarket } from "../api/career";
import CareerProfileForm from "../features/career/CareerProfileForm";
import CareerComparePanel from "../features/career/CareerComparePanel";
import CareerProfileSwitcher from "../features/career/CareerProfileSwitcher";
import {
  buildBackup,
  downloadBackup,
  importBackup as applyBackup,
  parseBackup,
} from "../features/career/careerBackup";
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
  const { message } = App.useApp();
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
  /** 正在"加入技能栏"的技能名：只给那一颗按钮转圈，避免连点写出重复技能。 */
  const [addingSkill, setAddingSkill] = useState<string | null>(null);
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

  /**
   * 把改过的画像写回**当前档案**（不是只改内存里的 draft，刷新后仍在），并重跑一次匹配。
   *
   * "采纳一条表达建议"和"把技能写进技能栏"都走这里：两者都是"改画像 → 立刻看分数变化"，
   * 分两条路径写迟早会漂（一条忘了记历史、一条忘了报错）。
   */
  async function applyProfileChange(updated: CareerProfile) {
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

  async function acceptAdvice(line: string) {
    if (searching || !draft || !line.trim()) return;
    await applyProfileChange({
      ...draft,
      experience: [
        ...draft.experience.filter((item) => item !== line.trim()).slice(-11),
        line.trim(),
      ],
    });
  }

  /** 把匹配档案（含历史与收藏上下文）导出成一个 JSON 文件，不上传任何地方。 */
  function exportBackup() {
    const backup = buildBackup(readStorage());
    downloadBackup(backup);
    message.success(t("career.backup.exported", { count: backup.profiles.length }));
  }

  /**
   * 导入备份：**按 id 合并**，本地已有的档案、历史、收藏上下文一律保留。
   *
   * 导错文件（旧备份、别的应用导出的 JSON）不该把用户现在的画像冲掉，所以只补不覆盖。
   */
  async function importBackup(file: File) {
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      const reason =
        parsed.code === "empty"
          ? t("career.backup.empty")
          : parsed.code === "version"
            ? t("career.backup.version")
            : t("career.backup.invalid");
      message.error(reason);
      return;
    }
    const result = applyBackup(readStorage(), parsed.backup);
    setRecords(loadRecords(readStorage()));
    setSnapshots(loadSnapshots(readStorage()));
    setDraftVersion((value) => value + 1);
    if (result.added.profiles === 0 && result.added.snapshots === 0) {
      message.info(t("career.backup.importedNothing"));
      return;
    }
    message.success(
      t("career.backup.imported", {
        profiles: result.added.profiles,
        snapshots: result.added.snapshots,
      }),
    );
  }

  /** 技能栏没写、经历里提到过的那一档：加一行技能名就够了，不编造新经历。 */
  async function addSkill(term: string) {
    const skill = term.trim();
    if (searching || addingSkill !== null || !draft || !skill) return;
    if (draft.skills.includes(skill)) return;
    setAddingSkill(skill);
    try {
      await applyProfileChange({ ...draft, skills: [...draft.skills, skill] });
      message.success(t("career.skills.added", { skill }));
    } finally {
      setAddingSkill(null);
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
            onExport={exportBackup}
            onImport={(file) => void importBackup(file)}
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
              profileLabel={records.find((item) => item.id === currentId)?.label ?? ""}
              history={snapshots}
              addingSkill={addingSkill}
              onAddSkill={(term) => void addSkill(term)}
              result={result}
              profile={draft}
              onAcceptAdvice={(line) => void acceptAdvice(line)}
            />
          </section>
          <CareerMaterialCheck key={draftVersion} profile={draft} />
        </>
      )}
      {/* 对比只依赖匹配历史：刷新页面后即使没有当前结果，也能看到"哪个方向更有胜算"。 */}
      <CareerComparePanel snapshots={snapshots} />
    </div>
  );
}
