// SPDX-License-Identifier: Apache-2.0
import { ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, Space, Tag } from "antd";
import { useState } from "react";
import { Link } from "react-router-dom";
import { checkCareerPosting } from "../../api/career";
import { t } from "../../i18n";
import { formatDateTime } from "../../utils/format";
import type { MarketSource, MarketSummary, PostingCheck } from "./types";

function sourceStatus(source: MarketSource) {
  if (source.status === "failed") return t("career.market.failed");
  if (source.status === "idle") return t("career.market.idle");
  if (!source.current) return t("career.market.stale");
  return t(source.status === "partial" ? "career.market.partial" : "career.market.updated");
}

function sourceItem(source: MarketSource) {
  return (
    <li key={source.id}>
      <div>
        <a href={source.url} target="_blank" rel="noopener noreferrer">
          {source.name} ↗
        </a>
        <small>
          {source.checked_at ? formatDateTime(source.checked_at) : sourceStatus(source)}
        </small>
      </div>
      <div className="career-source-status">
        <span>{t("career.market.sourceCount", { count: source.count })}</span>
        {source.checked_at && (
          <Tag color={source.current ? "green" : "default"}>{sourceStatus(source)}</Tag>
        )}
      </div>
    </li>
  );
}

const CHECK_MESSAGES = {
  found: "career.market.checkFound",
  cached: "career.market.checkCached",
  not_found: "career.market.checkMissing",
  unsupported: "career.market.checkUnsupported",
} as const;

export default function CareerSourcePanel({
  market,
  refreshing,
  error,
  onRefresh,
}: {
  market: MarketSummary | null;
  refreshing: boolean;
  error: boolean;
  onRefresh: () => void;
}) {
  const [url, setUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<PostingCheck | null>(null);
  const [checkError, setCheckError] = useState(false);
  const cached = (market?.count ?? 0) - (market?.current_count ?? 0);
  const checkingWithoutCurrent = refreshing && !market?.current_count;
  const extraSources = market?.sources.slice(4) ?? [];

  async function verify() {
    if (checking || !url.trim()) return;
    setChecking(true);
    setCheckError(false);
    setCheck(null);
    try {
      setCheck(await checkCareerPosting(url.trim()));
    } catch {
      setCheckError(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card className="career-panel" title={t("career.market.title")}>
      <div className="career-market-heading">
        <strong>
          {checkingWithoutCurrent
            ? t("career.market.checking")
            : t("career.market.count", { count: market?.current_count ?? 0 })}
        </strong>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={onRefresh}>
          {t("career.market.refresh")}
        </Button>
      </div>
      {cached > 0 && <p className="career-help">{t("career.market.cached", { count: cached })}</p>}
      <p className="career-help" aria-live="polite">
        {t(refreshing ? "career.market.refreshing" : "career.market.interval")}
      </p>
      <Link className="career-market-browse-link" to="/market">
        {t("career.browse.title")} →
      </Link>
      {error && <Alert type="warning" showIcon title={t("career.market.refreshError")} />}
      <ul className="career-source-list">{market?.sources.slice(0, 4).map(sourceItem)}</ul>
      {extraSources.length > 0 && (
        <details className="career-disclosure">
          <summary>
            {t("career.market.title")} ({extraSources.length})
          </summary>
          <ul className="career-source-list">{extraSources.map(sourceItem)}</ul>
        </details>
      )}
      <details className="career-disclosure">
        <summary>{t("career.market.check")}</summary>
        <Space.Compact className="career-full-width">
          <Input
            aria-label={t("career.market.checkHint")}
            placeholder={t("career.market.checkHint")}
            value={url}
            maxLength={600}
            disabled={checking || undefined}
            onChange={(event) => {
              setUrl(event.target.value);
              setCheck(null);
              setCheckError(false);
            }}
            onPressEnter={() => void verify()}
          />
          <Button
            loading={checking}
            disabled={!url.trim() || undefined}
            onClick={() => void verify()}
          >
            {t("career.market.checkAction")}
          </Button>
        </Space.Compact>
        {checkError && (
          <p className="career-help" role="alert">
            {t("career.market.refreshError")}
          </p>
        )}
        {check && (
          <div className="career-check-result" role="status">
            <p>{t(CHECK_MESSAGES[check.status])}</p>
            {check.checked_at && <small>{formatDateTime(check.checked_at)}</small>}
            {check.jobs.map((job) => (
              <a key={job.id} href={job.url} target="_blank" rel="noopener noreferrer">
                {job.title} ↗
              </a>
            ))}
          </div>
        )}
      </details>
    </Card>
  );
}
