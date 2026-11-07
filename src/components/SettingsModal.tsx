"use client";
import { useEffect, useRef } from "react";
import type { MotionSetting, Settings } from "@/lib/client";

export function SettingsModal({
  open,
  settings,
  onChange,
  onClose,
}: {
  open: boolean;
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const motions: { id: MotionSetting; label: string }[] = [
    { id: "system", label: "AUTO" },
    { id: "full", label: "FULL" },
    { id: "reduced", label: "REDUCED" },
  ];

  return (
    <dialog ref={ref} className="modal" onClose={onClose} aria-labelledby="settings-title">
      <div className="modal__inner dialog">
        <h2 id="settings-title" className="modal__title">SETTINGS</h2>

        <div className="setting">
          <span className="setting__label">Sound effects</span>
          <div className="seg" role="group" aria-label="Sound effects">
            {[true, false].map((on) => (
              <button
                key={String(on)}
                className={`seg__btn ${settings.sound === on ? "is-on" : ""}`}
                aria-pressed={settings.sound === on}
                onClick={() => onChange({ ...settings, sound: on })}
              >
                {on ? "ON" : "OFF"}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <span className="setting__label">Animations</span>
          <div className="seg" role="group" aria-label="Animations">
            {motions.map((m) => (
              <button
                key={m.id}
                className={`seg__btn ${settings.motion === m.id ? "is-on" : ""}`}
                aria-pressed={settings.motion === m.id}
                onClick={() => onChange({ ...settings, motion: m.id })}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <p className="fineprint">AUTO follows your device&apos;s reduced-motion setting. REDUCED removes flashes, shakes and wipes.</p>

        <button className="btn btn--primary btn--wide" onClick={onClose}>
          DONE
        </button>
      </div>
    </dialog>
  );
}
