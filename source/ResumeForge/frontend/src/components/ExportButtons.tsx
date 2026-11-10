// SPDX-License-Identifier: Apache-2.0
/** 导出入口：全页面唯一的「导出」按钮，点击打开统一的导出面板。
 *
 * 历史上这里有「下载 PDF」+「更多格式」两个入口，预览页另有一套「导出选项」、再加一个
 * 「一键脱敏」。三套入口各自拼参数，于是"预览里调过的字号/行距没进导出"这类问题只出现
 * 在其中一条路径上。现在收成一个入口 + 一份请求体（见 ExportOptionsModal）。
 */
import { ExportOutlined } from "@ant-design/icons";
import { Button, Modal } from "antd";
import { useState } from "react";
import { t } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import { loadHistory } from "../features/resume/healthCheck";
import { EXPORT_HEALTH_GATE_SCORE, exportGateDecision } from "../features/resume/exportGate";
import type { ResumeLayout } from "../types";
import ExportOptionsModal from "./ExportOptionsModal";

interface Props {
  recordId: number;
  /** 预览当前的版式草稿：导出必须与眼前所见同参数。 */
  layout?: ResumeLayout;
  /** 服务端是否找到中文字体；为 false 时面板里只给浏览器打印。 */
  pdfDirectAvailable?: boolean;
  /**
   * 由父组件接管弹窗（父组件还需要从「简历制作台」等地方打开同一个面板时用）。
   * 提供时本组件只画按钮，不再自己挂一份弹窗——两份实例会各自持有一份表单状态。
   */
  onOpen?: () => void;
  /** 简历内容签名：用来判断"上次体检分是不是已经过期"。 */
  contentSignature?: string;
  /** 体检分偏低时「先去检查」的去处；不传就只提示、不导航。 */
  onOpenChecks?: () => void;
}

/** 隐私模式下访问 localStorage 会抛错：读不到就当没有体检记录，不拦导出。 */
function readStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export default function ExportButtons({
  recordId,
  layout,
  pdfDirectAvailable = true,
  onOpen,
  contentSignature,
  onOpenChecks,
}: Props) {
  useLocale();
  const [open, setOpen] = useState(false);
  /** 体检分偏低时的提示：受控 Modal，不用 modal.confirm（按钮行为在测试里不稳定）。 */
  const [gate, setGate] = useState<{ score: number; stale: boolean } | null>(null);

  const proceed = () => (onOpen ? onOpen() : setOpen(true));

  /**
   * 点导出时先看一眼上次体检：分数低于建议线就提示一次，但**按钮永远给「仍然导出」**。
   * 没体检过的人不打扰——不该用弹窗教育从没用过体检的人。
   */
  const handleExport = () => {
    const entries = loadHistory(readStorage())[String(recordId)];
    const entry = entries?.[entries.length - 1];
    const decision = exportGateDecision(entry, contentSignature);
    if (!decision.warn) {
      proceed();
      return;
    }
    setGate({ score: decision.score ?? 0, stale: decision.stale });
  };

  return (
    <>
      <Button
        type="primary"
        icon={<ExportOutlined />}
        onClick={handleExport}
      >
        {t("componentsMisc.exportButtons.export")}
      </Button>
      <Modal
        open={gate !== null}
        title={t("componentsMisc.exportButtons.gate.title")}
        onCancel={() => setGate(null)}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => setGate(null)}>
            {t("common.action.cancel")}
          </Button>,
          onOpenChecks ? (
            <Button
              key="check"
              onClick={() => {
                setGate(null);
                onOpenChecks();
              }}
            >
              {t("componentsMisc.exportButtons.gate.check")}
            </Button>
          ) : null,
          <Button
            key="continue"
            type="primary"
            onClick={() => {
              setGate(null);
              proceed();
            }}
          >
            {t("componentsMisc.exportButtons.gate.continue")}
          </Button>,
        ]}
      >
        {/* 拆成两段：换行拼一坨时，断言与屏幕阅读器都拿不到"哪句是过期说明"。 */}
        <p>
          {t("componentsMisc.exportButtons.gate.body", {
            score: gate?.score ?? 0,
            threshold: EXPORT_HEALTH_GATE_SCORE,
          })}
        </p>
        {gate?.stale && <p>{t("componentsMisc.exportButtons.gate.stale")}</p>}
      </Modal>
      {onOpen ? null : (
        <ExportOptionsModal
          recordId={recordId}
          open={open}
          initialPageLimit={layout?.page_limit}
          initialFontScale={layout?.font_scale}
          initialFormatConfig={layout?.format_config}
          initialLanguage={layout?.language}
          pdfDirectAvailable={pdfDirectAvailable}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
