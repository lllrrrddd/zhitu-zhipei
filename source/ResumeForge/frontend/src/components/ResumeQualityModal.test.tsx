// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { App } from "antd";
import { expect, it, vi } from "vitest";
import { t } from "../i18n";
import ResumeQualityModal from "./ResumeQualityModal";

// 四个面板各自有自己的取数与测试：这里只验证「编排」——Tab 是否按条件出现。
vi.mock("./ResumeHealthPanel", () => ({ default: () => <div>HEALTH_STUB</div> }));
vi.mock("./ResumeRiskPanel", () => ({ default: () => <div>RISK_STUB</div> }));
vi.mock("./AtsCheckPanel", () => ({ default: () => <div>ATS_STUB</div> }));
vi.mock("../features/resume/RevisionDiffPanel", () => ({
  default: () => <div>HISTORY_STUB</div>,
}));

function renderModal(parentRevisionId: number | null) {
  return render(
    <App>
      <ResumeQualityModal
        open
        resumeId={1}
        parentRevisionId={parentRevisionId}
        onClose={() => undefined}
      />
    </App>,
  );
}

it("有上一版时四个 Tab 都在：体检单 / 风险 / ATS / 修改记录", () => {
  renderModal(9);
  expect(screen.getByText(t("componentsMisc.qualityModal.tab.health"))).toBeInTheDocument();
  expect(screen.getByText(t("componentsMisc.qualityModal.tab.risk"))).toBeInTheDocument();
  expect(screen.getByText(t("componentsMisc.qualityModal.tab.ats"))).toBeInTheDocument();
  expect(screen.getByText(t("componentsMisc.qualityModal.tab.history"))).toBeInTheDocument();
});

it("第一版没有上一代：不出现「修改记录」Tab", () => {
  renderModal(null);
  expect(screen.queryByText(t("componentsMisc.qualityModal.tab.history"))).toBeNull();
  expect(screen.getByText(t("componentsMisc.qualityModal.tab.health"))).toBeInTheDocument();
});
