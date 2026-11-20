// SPDX-License-Identifier: Apache-2.0
/**
 * 粘贴整段个人资料（或资料截图、简历文档）并结构化识别的弹窗。
 *
 * 两个阶段（项 13 / D23）：
 * 1. **输入**：粘贴 / 拖文件 / 截图 → 「识别并填入」；识别过程中主按钮变成
 *    「取消识别」（不是一直转圈的 loading 按钮——用户想反悔时得有个能点的东西）。
 * 2. **校对**：识别成功后**弹窗不关**，结果变成一张可编辑的清单；用户看过、改过、点
 *    「确认填入 N 项」才写进表单。识别是猜、改资料是写，两件事不该由一个按钮完成。
 *
 * `rows !== null` 即进入校对阶段——**不另立 step 状态**：两处状态（step + rows）能不一致，
 * 而它们本来描述的是同一件事。
 */

import { FileSearchOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Modal, Progress, Space, Spin, Typography } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { MessageKey } from "../../i18n";
import { t } from "../../i18n";
import { useLocale } from "../../i18n/i18nContext";
import type { StagedFile } from "../../hooks/useRecognitionFiles";
import { MaxLengthHint } from "../common/MaxLengthHint";
import RecognitionFileField from "../RecognitionFileField";
import RecognitionOutcome from "../RecognitionOutcome";
import RecognitionReviewList from "./RecognitionReviewList";
import type { RecognitionReviewRow } from "./RecognitionReviewList";
import type { RecognitionSource } from "../../types";

/** 上传阶段在整条进度里占的比例：0-15%，剩下的时间都在解析。 */
const UPLOAD_SHARE_PERCENT = 15;

/** 两种宿主：资料页（本轮）与网申资料（下一轮接链路，本轮只有文案）。 */
export type ProfileTextMode = "profile" | "webform";

const COPY: Record<
  ProfileTextMode,
  { titleKey: MessageKey; placeholderKey: MessageKey; introKey: MessageKey }
> = {
  profile: {
    titleKey: "profileTextModal.profile.title",
    placeholderKey: "profileTextModal.profile.placeholder",
    introKey: "profileTextModal.profile.intro",
  },
  webform: {
    titleKey: "profileTextModal.webform.title",
    placeholderKey: "profileTextModal.webform.placeholder",
    introKey: "profileTextModal.webform.intro",
  },
};

interface Props {
  open: boolean;
  text: string;
  warnings: string[];
  parsing: boolean;
  /**
   * 附件上传进度（0-100）；null 表示不在上传中。
   *
   * **100 表示字节已经发完**，服务端此时才开始解析、调模型——那一段耗时不可预估，
   * 所以到 100 就切成不确定态（转圈），不再显示百分比。
   */
  uploadPercent: number | null;
  recognizedText: string;
  /** 这次识别是 AI 还是本地规则；还没识别过时为 null。 */
  recognitionSource: RecognitionSource | null;
  files: StagedFile[];
  filesReading: boolean;
  /** 宿主形态：决定标题 / 说明 / 占位文案。默认资料页。 */
  mode?: ProfileTextMode;
  /** 非 null 即进入校对阶段（内容就是识别结果的行）。 */
  rows?: RecognitionReviewRow[] | null;
  onRowsChange?: (rows: RecognitionReviewRow[]) => void;
  /** 「确认填入」：把校对后的清单写进表单。 */
  onApply?: () => void;
  /** 「取消」：放弃这次识别结果，不写表单。 */
  onDiscard?: () => void;
  /** 识别中「取消识别」：中止请求。 */
  onCancelParse?: () => void;
  onTextChange: (value: string) => void;
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (id: number) => void;
  onPasteFiles: (event: React.ClipboardEvent<HTMLElement>) => void;
  onClose: () => void;
  onParse: () => void;
}

export default function ProfileTextModal({
  open,
  text,
  warnings,
  parsing,
  uploadPercent,
  recognizedText,
  recognitionSource,
  files,
  filesReading,
  mode = "profile",
  rows = null,
  onRowsChange,
  onApply,
  onDiscard,
  onCancelParse,
  onTextChange,
  onAddFiles,
  onRemoveFile,
  onPasteFiles,
  onClose,
  onParse,
}: Props) {
  useLocale();
  const reviewing = rows !== null;
  const copy = COPY[mode];
  // 新字段只有在勾选后才计入"将写入 N 项"，所以这个数字就是用户眼前真正会发生的变化量。
  const confirmCount = rows ? rows.filter((row) => !row.isNew || row.selected).length : 0;
  // 关闭（X / ESC）在校对阶段等价于"放弃这次结果"，不能静默留下半份草稿。
  // 「关闭 / ×」也打一行日志：如果点了这里 Console 没有这行，说明点击根本没到组件，
  // 是被页面上的浮层或浏览器扩展截走了（这跟"识别"逻辑无关）。
  const handleCancel = () => {
    // eslint-disable-next-line no-console
    console.info("[识别] 收到关闭请求");
    (reviewing ? (onDiscard ?? onClose) : onClose)();
  };

  // 空输入点「识别并填入」：toast 一闪就没了（何况视线在输入框上），
  // 改成输入框下方的常驻提示；一旦有内容或文件就自动消失。
  const [emptyHint, setEmptyHint] = useState(false);
  useEffect(() => {
    if (text.trim() || files.length > 0) setEmptyHint(false);
  }, [text, files]);
  // 空输入时把焦点送回输入框：用户常常以为"粘了"，其实焦点不在框里，
  // Ctrl+V 落到了页面别处。聚焦后提示与下一次粘贴都更顺。
  const textareaRef = useRef<TextAreaRef | null>(null);
  // 解析耗时可能到分钟级（本机 CPU 模型实测 180 秒）。一个不动的转圈会让人以为卡死，
  // 所以把"已经等了多少秒"显出来，并提示本地模型较慢——用户至少知道系统在干活。
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!parsing) {
      setElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [parsing]);

  const handleParse = () => {
    // 用户报"点了没反应"时，这行能立刻区分三种情况：没粘进来（0 字）、
    // 粘进来了但没触发（>0 却没有任何请求）、或确实在跑。只打长度，不打内容。
    // eslint-disable-next-line no-console
    console.info("[识别] 点击识别：文本长度=%d，文件数=%d", text.trim().length, files.length);
    if (!text.trim() && files.length === 0) {
      setEmptyHint(true);
      textareaRef.current?.focus();
      return;
    }
    setEmptyHint(false);
    onParse();
  };

  // 正文限高：1080p + 125% 缩放时弹窗会高过视口，底部按钮被切掉一半，点了像没反应。
  // 正文限高：1080p + 125% 缩放时弹窗会高过视口，底部按钮被切掉一半，点了像没反应。
  return (
    <Modal
      title={t(copy.titleKey)}
      open={open}
      onCancel={handleCancel}
      destroyOnHidden
      width={760}
      // 窗口不高（1080p + 125% 缩放很常见）时，弹窗会高过视口，
      // 底部的「识别并填入」被切掉一半，用户点了像没反应。这里限制正文高度并滚动，
      // footer 永远留在视口内。
      style={{ top: 24 }}
      footer={
        reviewing
          ? [
              <Button key="discard" onClick={onDiscard}>
                {t("profileTextModal.action.cancel")}
              </Button>,
              <Button key="apply" type="primary" disabled={confirmCount === 0} onClick={onApply}>
                {t("profileTextModal.action.apply", { count: confirmCount })}
              </Button>,
            ]
          : [
              <Button key="cancel" onClick={onClose} disabled={parsing}>
                {t("profileTextModal.action.close")}
              </Button>,
              parsing ? (
                // 识别中不再给一个"转圈到结束"的 loading 按钮：用户唯一想做的事是取消。
                <Button key="cancel-parse" danger onClick={onCancelParse}>
                  {t("profileTextModal.action.cancelRecognize")}
                </Button>
              ) : (
                <Button key="parse" type="primary" icon={<FileSearchOutlined />} onClick={handleParse}>
                  {t("profileTextModal.action.recognize")}
                </Button>
              ),
            ]
      }
      styles={{ body: { paddingRight: 8, maxHeight: "calc(100vh - 210px)", overflowY: "auto" } }}
    >
      {reviewing ? (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            title={t("profileTextModal.review.count", { count: rows.length })}
            description={t("profileTextModal.review.hint")}
          />
          {warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              title={warnings.join(t("profileTextModal.separator.warning"))}
            />
          )}
          <RecognitionReviewList rows={rows} onChange={onRowsChange ?? (() => undefined)} />
          <RecognitionOutcome source={recognitionSource} text={recognizedText} />
        </>
      ) : (
        <>
          <Typography.Paragraph type="secondary">{t(copy.introKey)}</Typography.Paragraph>
          <Input.TextArea
            ref={textareaRef}
            aria-label={t("profileTextModal.input.textAria")}
            value={text}
            disabled={parsing}
            onPaste={onPasteFiles}
            onChange={(event) => onTextChange(event.target.value)}
            maxLength={100_000}
            placeholder={t(copy.placeholderKey)}
            autoSize={{ minRows: 14, maxRows: 24 }}
          />
          {emptyHint ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 8 }}
              title={t("profileTextModal.warning.emptyInput")}
            />
          ) : null}
          <MaxLengthHint value={text} maxLength={100_000} />
          {/* 文件暂存区紧跟输入框下缘，补 12px 呼吸空隙，避免「添加截图或文档」按钮贴住边框。 */}
          <div style={{ marginTop: 12 }}>
            <RecognitionFileField
              files={files}
              reading={filesReading}
              disabled={parsing}
              onAddFiles={onAddFiles}
              onRemove={onRemoveFile}
            />
          </div>
          <RecognitionOutcome source={recognitionSource} text={recognizedText} />
          {uploadPercent !== null && uploadPercent < 100 && (
            // 上传阶段只占整个等待的一小段：真实字节映射到 0-15%，避免大文件一上传完
            // 进度条就画满、而用户还要再等十几秒解析。
            <Progress
              aria-label={t("profileTextModal.upload.progressAria")}
              percent={Math.round((uploadPercent / 100) * UPLOAD_SHARE_PERCENT)}
              size="small"
              status="active"
              style={{ marginTop: 12 }}
            />
          )}
          {uploadPercent !== null && uploadPercent >= 100 && parsing && (
            // 解析阶段不显示百分比：服务端要抽文本、可能还要调模型，耗时不可预估。
            // 用不确定态 + 一句说明，比一个停在 15% 的假进度条诚实。
            <Space size={8} style={{ marginTop: 12 }}>
              <Spin size="small" />
              <Typography.Text type="secondary">
                {t("profileTextModal.upload.parsing")}
                {elapsed > 0 ? ` · ${t("profileTextModal.upload.elapsed", { seconds: elapsed })}` : ""}
              </Typography.Text>
              {elapsed >= 30 ? (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t("profileTextModal.upload.slowHint")}
                </Typography.Text>
              ) : null}
            </Space>
          )}
          {warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginTop: 12 }}
              title={warnings.join(t("profileTextModal.separator.warning"))}
            />
          )}
        </>
      )}
    </Modal>
  );
}
