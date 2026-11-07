// SPDX-License-Identifier: Apache-2.0
import { ExportOutlined, ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Input,
  Pagination,
  Select,
  Spin,
  Switch,
  Tag,
} from "antd";
import { useCallback, useEffect, useState } from "react";
import { browseCareerMarket, refreshCareerMarket } from "../api/career";
import type { MarketBrowse, MarketBrowseItem } from "../features/career/types";
import { t } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import { formatDateTime } from "../utils/format";
import "../styles/career.css";

export default function MarketPage() {
  useLocale();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [currentOnly, setCurrentOnly] = useState(false);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<MarketBrowse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<MarketBrowseItem | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void browseCareerMarket({ page, q: query, sourceId, currentOnly })
      .then((result) => {
        if (active) setData(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, query, sourceId, currentOnly, revision]);

  const refresh = useCallback(async (force: boolean) => {
    setRefreshing(true);
    try {
      await refreshCareerMarket(force);
      setRevision((value) => value + 1);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  const market = data?.market;
  const sourceOptions = [
    { value: "", label: t("career.browse.allSources") },
    ...(market?.sources
      .filter((source) => source.count > 0)
      .map((source) => ({
        value: source.id,
        label: `${source.name} (${source.count})`,
      })) ?? []),
  ];

  return (
    <div className="career-workbench career-browse">
      <header className="career-hero">
        <span>{t("career.kicker")}</span>
        <h1>{t("career.browse.title")}</h1>
        <p>{t("career.browse.intro")}</p>
      </header>
      <div className="career-browse-toolbar">
        <div>
          <strong>
            {t("career.browse.summary", {
              total: market?.count ?? 0,
              current: market?.current_count ?? 0,
            })}
          </strong>
          <p className="career-help">{t("career.browse.notice")}</p>
        </div>
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={() => void refresh(true)}>
          {t("career.market.refresh")}
        </Button>
      </div>
      <div className="career-browse-filters">
        <Input.Search
          allowClear
          aria-label={t("career.browse.search")}
          placeholder={t("career.browse.search")}
          onSearch={(value) => {
            setQuery(value.trim());
            setPage(1);
          }}
        />
        <Select
          aria-label={t("career.browse.allSources")}
          value={sourceId}
          options={sourceOptions}
          onChange={(value) => {
            setSourceId(value);
            setPage(1);
          }}
        />
        <label className="career-browse-switch">
          <Switch
            checked={currentOnly}
            onChange={(value) => {
              setCurrentOnly(value);
              setPage(1);
            }}
          />
          {t("career.browse.currentOnly")}
        </label>
      </div>
      {error && <Alert type="warning" showIcon title={t("career.browse.error")} />}
      {loading && !data ? (
        <div className="career-browse-loading">
          <Spin />
        </div>
      ) : data?.items.length ? (
        <div className="career-browse-grid" aria-busy={loading}>
          {data.items.map((item) => (
            <Card className="career-browse-card" key={`${item.job.source_id}-${item.job.id}`}>
              <div className="career-browse-card-head">
                <Tag color={item.current ? "green" : "default"}>
                  {t(item.current ? "career.market.updated" : "career.market.stale")}
                </Tag>
                <span>{item.source_name}</span>
              </div>
              <h2>
                <a href={item.job.url} target="_blank" rel="noopener noreferrer">
                  {item.job.title} <ExportOutlined />
                </a>
              </h2>
              <div className="career-browse-meta">
                <strong>{item.job.company}</strong>
                <span>{item.job.cities.join(", ") || t("career.result.cityUnknown")}</span>
                <span>
                  {t(
                    item.job.kind === "campus"
                      ? "career.result.campus"
                      : item.job.kind === "trainee"
                        ? "career.result.trainee"
                        : "career.result.full_time",
                  )}
                </span>
              </div>
              <p className="career-browse-excerpt">{item.job.requirements}</p>
              <div className="career-browse-card-foot">
                <small>
                  {item.checked_at
                    ? t("career.browse.checked", { time: formatDateTime(item.checked_at) })
                    : t("career.market.stale")}
                </small>
                <Button type="link" onClick={() => setSelected(item)}>
                  {t("career.browse.preview")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Empty description={t(market?.count ? "career.browse.empty" : "career.browse.noRecords")} />
      )}
      {(data?.total ?? 0) > 20 && (
        <Pagination
          className="career-browse-pagination"
          current={page}
          pageSize={20}
          total={data?.total}
          showSizeChanger={false}
          onChange={setPage}
        />
      )}
      <Drawer
        title={selected?.job.title}
        open={selected !== null}
        onClose={() => setSelected(null)}
        size="large"
      >
        {selected && (
          <div className="career-browse-detail">
            <p>
              {selected.job.company} · {selected.job.cities.join(", ")}
            </p>
            <Tag color={selected.current ? "green" : "default"}>
              {t(selected.current ? "career.market.updated" : "career.market.stale")}
            </Tag>
            <p className="career-help">
              {t("career.browse.checked", {
                time: selected.checked_at
                  ? formatDateTime(selected.checked_at)
                  : t("career.market.stale"),
              })}
            </p>
            <h3>{t("career.browse.responsibilities")}</h3>
            <p>{selected.job.responsibilities}</p>
            <h3>{t("career.browse.requirements")}</h3>
            <p>{selected.job.requirements}</p>
            {selected.job.experience_requirement && (
              <>
                <h3>{t("career.browse.experience")}</h3>
                <p>{selected.job.experience_requirement}</p>
              </>
            )}
            <p className="career-help">{t("career.browse.notice")}</p>
            <Button
              type="primary"
              href={selected.job.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("career.result.open")} <ExportOutlined />
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
}
