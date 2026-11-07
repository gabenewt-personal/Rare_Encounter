"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { searchSpecies } from "@/lib/pokedex";
import { sfx } from "@/lib/audio";

interface Props {
  usedIds: Set<number>;
  disabled?: boolean;
  onSubmit: (value: string) => void;
}

/** Retro-menu combobox: type, pick with ▲▼ / tap, confirm with THROW. */
export function AnswerInput({ usedIds, disabled, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = useMemo(() => (value.trim() ? searchSpecies(value, 5) : []), [value]);
  const showList = open && !disabled && results.length > 0;

  // Desktop: jump straight into typing once the prompt is ready. (Touch devices
  // only open the keyboard on a user tap, so we don't try there.)
  useEffect(() => {
    if (!disabled && window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus();
  }, [disabled]);

  /** Once the mobile keyboard is up, bring the timer + prompt + input into view. */
  const revealAboveKeyboard = () => {
    if (window.matchMedia?.("(pointer: fine)").matches) return;
    setTimeout(() => {
      const q = inputRef.current?.closest(".question");
      q?.scrollIntoView({ block: "start" });
    }, 320);
  };

  const choose = (name: string) => {
    sfx.blip();
    setValue(name);
    setOpen(false);
    inputRef.current?.focus();
  };

  const submit = () => {
    if (!value.trim() || disabled) return;
    onSubmit(value);
    setValue("");
    setOpen(false);
  };

  return (
    <form
      className="answer"
      onSubmit={(e) => {
        e.preventDefault();
        if (showList && results[active] && results[active].name.toLowerCase() !== value.trim().toLowerCase()) {
          choose(results[active].name);
        } else submit();
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Your Pokémon
      </label>
      <div className="answer__row">
        <input
          id={`${listId}-input`}
          ref={inputRef}
          className="answer__input"
          value={value}
          disabled={disabled}
          placeholder="TYPE A POKÉMON…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="go"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            revealAboveKeyboard();
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (!showList) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              sfx.blip();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              sfx.blip();
              setActive((a) => (a - 1 + results.length) % results.length);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        <button type="submit" className="btn btn--a" disabled={disabled || !value.trim()}>
          THROW
        </button>
      </div>
      {showList && (
        <ul className="menu answer__list" id={listId} role="listbox">
          {results.map((s, i) => {
            const used = usedIds.has(s.id);
            return (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={used}
                className={`menu__item ${i === active ? "is-active" : ""} ${used ? "is-used" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s.name)}
              >
                <span className="menu__cursor" aria-hidden>
                  ▶
                </span>
                <span className="menu__dex">#{String(s.id).padStart(4, "0")}</span>
                <span className="menu__name">{s.name}</span>
                {used && <span className="menu__tag">USED</span>}
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
}
