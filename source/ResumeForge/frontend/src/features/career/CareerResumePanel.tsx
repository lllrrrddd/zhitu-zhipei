// SPDX-License-Identifier: Apache-2.0
import { InboxOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Input, Space, Upload } from "antd";
import { useRef, useState } from "react";
import { getGraduateDemo } from "../../api/graduate";
import { getProfile, parseProfileText } from "../../api/profile";
import { t } from "../../i18n";
import { classifyAttachment, MAX_ATTACHMENT_BYTES, readAsDataUrl } from "../../utils/attachments";
import { MAX_CAREER_PDF_BYTES, readPdfResumeText } from "../../utils/pdfText";
import {
  EMPTY_CAREER_PROFILE,
  exampleToCareerProfile,
  hasSearchDetails,
  resumeToCareerProfile,
} from "./profileFromResume";
import type { CareerProfile } from "./types";

export default function CareerResumePanel({
  onLoad,
  searching,
}: {
  onLoad: (profile: CareerProfile) => void;
  searching: boolean;
}) {
  const [reading, setReading] = useState(false);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "success" | "warning" | "error";
    text: string;
  }>();
  const busy = useRef(false);
  const disabled = reading || searching || undefined;

  async function load(
    read: () => Promise<CareerProfile | { profile: CareerProfile; warning: string }>,
    success: string,
    useSaved = false,
  ) {
    if (busy.current || searching) return;
    busy.current = true;
    setReading(true);
    setFeedback(undefined);
    try {
      const result = await read();
      const profile = "profile" in result ? result.profile : result;
      if (!hasSearchDetails(profile)) {
        setFeedback({
          type: "warning",
          text: t(useSaved ? "career.resume.savedEmpty" : "career.resume.noFields"),
        });
        if (useSaved) return;
      } else {
        setFeedback(
          "warning" in result
            ? { type: "warning", text: `${success} ${result.warning}` }
            : { type: "success", text: success },
        );
      }
      onLoad(profile);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : t("career.resume.error"),
      });
    } finally {
      busy.current = false;
      setReading(false);
    }
  }

  function importFile(file: File) {
    const attachment = classifyAttachment(file);
    if (
      attachment?.kind !== "document" ||
      file.size >
        (attachment.mimeType === "application/pdf" ? MAX_CAREER_PDF_BYTES : MAX_ATTACHMENT_BYTES)
    ) {
      setFeedback({ type: "error", text: t("career.resume.invalid") });
      return;
    }
    void load(
      async () => {
        if (attachment.mimeType === "application/pdf" && file.size > MAX_ATTACHMENT_BYTES) {
          const extracted = await readPdfResumeText(file);
          const parsed = await parseProfileText({ text: extracted.text }, undefined, undefined, {
            localOnly: true,
          });
          const warning = [
            t("career.resume.pdfLocalText"),
            extracted.pages > 8 ? t("career.resume.pdfLong") : "",
            extracted.truncated ? t("career.resume.pdfTruncated") : "",
            extracted.blankPages
              ? t("career.resume.pdfScanPages", { count: extracted.blankPages })
              : "",
            parsed.skills.length > 40 || parsed.projects.length > 12
              ? t("career.resume.pdfNoisy")
              : "",
          ]
            .filter(Boolean)
            .join(" ");
          return { profile: resumeToCareerProfile(parsed), warning };
        }
        const data = await readAsDataUrl(file);
        const parsed = await parseProfileText(
          { text: "", documents: [{ name: file.name, mime_type: attachment.mimeType, data }] },
          undefined,
          undefined,
          { localOnly: true },
        );
        const profile = resumeToCareerProfile(parsed);
        return parsed.skills.length > 40 || parsed.projects.length > 12
          ? { profile, warning: t("career.resume.pdfNoisy") }
          : profile;
      },
      t("career.resume.read", { file: file.name }),
    );
  }

  return (
    <Card className="career-panel" title={t("career.resume.title")}>
      <Upload.Dragger
        accept=".pdf,.docx"
        className="career-drop"
        showUploadList={false}
        disabled={disabled}
        beforeUpload={(file) => {
          importFile(file);
          return Upload.LIST_IGNORE;
        }}
      >
        <InboxOutlined className="career-drop-icon" aria-hidden />
        <strong>{t("career.resume.upload")}</strong>
        <span>{t("career.resume.uploadHint")}</span>
      </Upload.Dragger>
      <Space wrap className="career-action-row">
        <Button
          disabled={disabled}
          onClick={() =>
            void load(async () => {
              const demo = await getGraduateDemo();
              return exampleToCareerProfile(demo.profiles[0]);
            }, t("career.resume.exampleReady"))
          }
        >
          {t("career.resume.example")}
        </Button>
        <Button
          disabled={disabled}
          onClick={() =>
            void load(
              async () => resumeToCareerProfile(await getProfile()),
              t("career.resume.savedReady"),
              true,
            )
          }
        >
          {t("career.resume.saved")}
        </Button>
        <Button
          type="link"
          disabled={disabled}
          onClick={() => {
            setFeedback(undefined);
            onLoad(EMPTY_CAREER_PROFILE);
          }}
        >
          {t("career.resume.manual")}
        </Button>
      </Space>
      <details className="career-disclosure">
        <summary>{t("career.resume.paste")}</summary>
        <Input.TextArea
          aria-label={t("career.resume.paste")}
          placeholder={t("career.resume.pasteHint")}
          value={text}
          maxLength={30000}
          autoSize={{ minRows: 3, maxRows: 8 }}
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          disabled={disabled || !text.trim() || undefined}
          onClick={() =>
            void load(
              async () => {
                const parsed = await parseProfileText({ text: text.trim() }, undefined, undefined, {
                  localOnly: true,
                });
                setText("");
                return resumeToCareerProfile(parsed);
              },
              t("career.resume.read", { file: t("career.resume.paste") }),
            )
          }
        >
          {t("career.resume.parse")}
        </Button>
      </details>
      <div className="career-help" aria-live="polite">
        {t(reading ? "career.resume.reading" : "career.resume.local")}
      </div>
      {feedback && (
        <Alert className="career-feedback" type={feedback.type} title={feedback.text} showIcon />
      )}
    </Card>
  );
}
