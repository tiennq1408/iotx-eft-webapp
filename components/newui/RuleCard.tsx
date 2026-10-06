"use client";

import { useState } from "react";
import Icon from "./Icon";
import { useChu } from "./chu";
import { iotxClient, isIotxMode, moTaLoi } from "@/lib/iotx";
import type { IotxLanChay, IotxRule } from "@/lib/iotx/contracts";

/**
 * Một luật trên màn Tự động. Ngoài bật/tắt, chạy tay và xoá, thẻ này còn mở được:
 * - `GET /rules/{id}/runs` — 20 lần chạy gần nhất, mới nhất trước;
 * - `POST /rules/{id}/stop` — dừng chương trình nhiều giai đoạn đang chạy (chỉ `kind=sched`).
 */
export default function RuleCard({ rule, onBatTat, onXoa, onChay, onDung }: {
  rule: IotxRule;
  onBatTat: () => void;
  onXoa: () => void;
  onChay: () => void;
  onDung: () => void;
}) {
  const { t } = useChu();
  const [mo, setMo] = useState(false);
  const [lanChay, setLanChay] = useState<IotxLanChay[] | null>(null);
  const [loi, setLoi] = useState("");

  const tomTat = [
    rule.conds?.length ? t("rule_conds", { n: rule.conds.length }) : null,
    rule.gates?.length ? t("rule_gates", { n: rule.gates.length }) : null,
    rule.exclusions?.length ? t("rule_excl", { n: rule.exclusions.length }) : null,
  ].filter(Boolean).join(" · ");

  async function moLichSu() {
    const next = !mo;
    setMo(next);
    if (!next || lanChay || !isIotxMode) return;
    setLoi("");
    try { setLanChay(await iotxClient.lichSuChay(rule.id)); }
    catch (error) { setLoi(moTaLoi(error)); }
  }

  const gio = (at?: string) => {
    if (!at) return "—";
    const d = new Date(at);
    return Number.isNaN(d.getTime()) ? at : new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(d);
  };

  return (
    <div className="auto-card">
      <div className="auto-card-top">
        <span className="an">{rule.name}{rule.shadow && <span className="tag-shadow">{t("shadow_tag")}</span>}</span>
        <span className="auto-card-actions">
          <button className="switch-hit" aria-label={rule.enabled ? t("off") : t("on")} aria-pressed={Boolean(rule.enabled)} onClick={onBatTat}>
            <span className={`switch${rule.enabled ? " on" : ""}`} />
          </button>
          <button className="auto-icon-btn" aria-label={t("auto_run")} onClick={onChay}><Icon name="play" /></button>
          <button className="auto-icon-btn danger" aria-label={t("auto_delete")} onClick={onXoa}><Icon name="trash" /></button>
        </span>
      </div>
      <p className="auto-line"><span className="lb">{t("if_label")}</span>{tomTat || "—"}</p>
      <p className="auto-line"><span className="lb">{t("then_label")}</span>{rule.actions?.length ? t("rule_actions", { n: rule.actions.length }) : "—"}</p>

      <div className="auto-card-foot">
        <button className="text-button" aria-expanded={mo} onClick={() => { void moLichSu(); }}>
          {t("rule_history")} <Icon name={mo ? "chevUp" : "chevDown"} />
        </button>
        {/* Chỉ chương trình nhiều giai đoạn mới có cái để dừng. */}
        {rule.kind === "sched" && <button className="text-button" onClick={onDung}>{t("rule_stop")}</button>}
      </div>

      {mo && (
        <div className="run-list">
          {loi && <p className="form-message">{loi}</p>}
          {!isIotxMode && <p className="hint">{t("rule_history_mock")}</p>}
          {isIotxMode && !lanChay && !loi && <p className="hint">{t("loading")}</p>}
          {lanChay?.length === 0 && <p className="hint">{t("rule_history_empty")}</p>}
          {lanChay?.map((lan, i) => (
            <div className="run-row" key={i}>
              <span>{gio(lan.at)}</span>
              {lan.shadow && <em className="tag-shadow">{t("shadow_tag")}</em>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
