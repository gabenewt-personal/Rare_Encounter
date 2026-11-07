"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { GAME_TITLE } from "@/config/game";
import { appHref, applyMotionSetting, loadSettings, saveSettings, type ClientContext, type Settings } from "@/lib/client";
import { setSoundEnabled, sfx } from "@/lib/audio";
import { HelpModal } from "@/components/HelpModal";
import { PixelBall } from "@/components/PixelBall";
import { SettingsModal } from "@/components/SettingsModal";

interface ShellActions {
  openHelp: () => void;
  openSettings: () => void;
}
const ShellContext = createContext<ShellActions>({ openHelp: () => {}, openSettings: () => {} });
export const useShell = () => useContext(ShellContext);

/**
 * iOS Safari doesn't resize the layout when the on-screen keyboard opens; the
 * visual viewport shrinks instead. We mirror that onto <html data-kb="open">
 * and --vvh so CSS can compact the chrome and keep the prompt, timer and input
 * visible above the keyboard.
 */
function useKeyboardAwareness() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const open = window.innerHeight - vv.height > 140 && document.activeElement?.tagName === "INPUT";
      root.dataset.kb = open ? "open" : "closed";
      root.style.setProperty("--vvh", `${vv.height}px`);
    };
    const later = () => setTimeout(update, 50);
    update();
    vv.addEventListener("resize", update);
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", later);
    return () => {
      vv.removeEventListener("resize", update);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", later);
    };
  }, []);
}

/** 9×9 pixel gear (the pixel font has no ⚙ glyph). */
function PixelGear() {
  const rows = ["...X.X...", "..XXXXX..", ".XXXXXXX.", "XXX...XXX", ".XX...XX.", "XXX...XXX", ".XXXXXXX.", "..XXXXX..", "...X.X..."];
  return (
    <svg viewBox="0 0 9 9" width={14} height={14} shapeRendering="crispEdges" aria-hidden>
      {rows.flatMap((r, y) => [...r].map((c, x) => (c === "X" ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="currentColor" /> : null)))}
    </svg>
  );
}

export function Shell({
  ctx,
  footer,
  children,
  isHome = false,
}: {
  ctx: ClientContext;
  footer?: ReactNode;
  children: ReactNode;
  isHome?: boolean;
}) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(ctx.store));
  const [help, setHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  useKeyboardAwareness();

  useEffect(() => {
    setSoundEnabled(settings.sound);
    applyMotionSetting(settings.motion);
  }, [settings]);

  const update = (s: Settings) => {
    if (s.sound && !settings.sound) setTimeout(sfx.select, 0);
    setSettings(s);
    saveSettings(ctx.store, s);
  };

  return (
    <ShellContext.Provider value={{ openHelp: () => setHelp(true), openSettings: () => setShowSettings(true) }}>
      <div className="console">
        <header className="shell-top">
          {isHome ? (
            <span className="logo" aria-hidden>
              <PixelBall tier="poke" size={18} />
              <span className="logo__text--small">DAILY POKéMON RARITY</span>
            </span>
          ) : (
            <Link href={appHref("/", ctx)} className="logo logo--link" aria-label="Home">
              <span className="logo__back" aria-hidden>
                ◀
              </span>
              <PixelBall tier="poke" size={18} />
              <span>{GAME_TITLE.toUpperCase()}</span>
            </Link>
          )}
          <div className="shell-top__actions">
            <button
              className="icon-btn"
              onClick={() => update({ ...settings, sound: !settings.sound })}
              aria-pressed={settings.sound}
              aria-label={settings.sound ? "Mute sound" : "Turn sound on"}
            >
              {settings.sound ? "♪ ON" : "♪ OFF"}
            </button>
            <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
              <PixelGear />
            </button>
            <button className="icon-btn" onClick={() => setHelp(true)} aria-label="How to play">
              ?
            </button>
          </div>
        </header>

        <main className="screen">{children}</main>

        <footer className="shell-bottom">{footer}</footer>
      </div>
      <HelpModal open={help} onClose={() => setHelp(false)} />
      <SettingsModal open={showSettings} settings={settings} onChange={update} onClose={() => setShowSettings(false)} />
    </ShellContext.Provider>
  );
}
