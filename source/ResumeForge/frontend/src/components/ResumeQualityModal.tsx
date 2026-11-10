// SPDX-License-Identifier: Apache-2.0
/**
 * 「检查」弹窗：一份简历的四个视角放在同一个入口里。
 *
 * 为什么合并：原先详情页底部有「质量检测」和「修改记录」两个按钮，都在回答"这份简历现在
 * 怎么样"，用户要先猜该点哪个。合成一个入口后，四个 Tab 各自内聚、互相不依赖：
 * - 体检单：合并 ATS + 风险 + 内容质量，逐条标记、复检看涨分；
 * - 风险扫描：查重 / 敏感词 / 夸大 / 深挖 / 合规（可能调模型，需手动开始）；
 * - ATS 检测：格式 / 关键词 / 位置三项分（纯本地规则）；
 * - 修改记录：与上一代保存的字段级差异（保存血缘，只读）。
 *
 * 面板之间不共享状态：各自的加载、错误与缓存都留在自己的组件里，弹窗只负责编排与标题。
 */
import { Modal, Tabs } from "antd";
import { t } from "../i18n";
import { useLocale } from "../i18n/i18nContext";
import RevisionDiffPanel from "../features/resume/RevisionDiffPanel";
import SubmitChecklistPanel from "./SubmitChecklistPanel";
import AtsCheckPanel from "./AtsCheckPanel";
import ResumeHealthPanel from "./ResumeHealthPanel";
import ResumeRiskPanel from "./ResumeRiskPanel";

interface Props {
  open: boolean;
  resumeId: number | null;
  /** 简历内容的签名：风险扫描完成后用它判断"内容是不是改过了"。 */
  contentSignature?: string;
  /** 关联岗位 id：ATS 面板据此提供「从关联岗位载入 JD」。 */
  jobId?: number;
  /** 上一代保存的 id：有值才提供「修改记录」这个 Tab（第一版没有可比的）。 */
  parentRevisionId?: number | null;
  onClose: () => void;
}

export default function ResumeQualityModal({
  open,
  resumeId,
  contentSignature,
  jobId,
  parentRevisionId = null,
  onClose,
}: Props) {
  useLocale();
  return (
    <Modal
      title={t("componentsMisc.qualityModal.title")}
      open={open}
      onCancel={onClose}
      width="min(880px, calc(100vw - 24px))"
      footer={null}
      destroyOnHidden
      styles={{ body: { maxHeight: "var(--rf-modal-body-max-h)", overflowY: "auto" } }}
    >
      {resumeId != null && (
        <Tabs
          items={[
            {
              key: "health",
              label: t("componentsMisc.qualityModal.tab.health"),
              children: <ResumeHealthPanel resumeId={resumeId} signature={contentSignature} />,
            },
            {
              key: "risk",
              label: t("componentsMisc.qualityModal.tab.risk"),
              children: <ResumeRiskPanel resumeId={resumeId} contentSignature={contentSignature} />,
            },
            {
              key: "ats",
              label: t("componentsMisc.qualityModal.tab.ats"),
              children: <AtsCheckPanel resumeId={resumeId} jobId={jobId} />,
            },
            {
              key: "submit",
              label: t("componentsMisc.qualityModal.tab.submit"),
              children: <SubmitChecklistPanel resumeId={resumeId} jobId={jobId ?? null} />,
            },
            // 第一版没有上一代：不渲染这个 Tab，避免点进去只看到一句"没有可比的版本"。
            ...(parentRevisionId == null
              ? []
              : [
                  {
                    key: "history",
                    label: t("componentsMisc.qualityModal.tab.history"),
                    children: (
                      <RevisionDiffPanel resumeId={resumeId} parentRevisionId={parentRevisionId} />
                    ),
                  },
                ]),
          ]}
        />
      )}
    </Modal>
  );
}
