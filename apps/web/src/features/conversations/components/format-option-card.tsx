import type { ChangeEvent } from "react";

type FormatOptionCardProps = {
  name: string;
  value: string;
  title: string;
  description: string;
  note?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function FormatOptionCard({
  name,
  value,
  title,
  description,
  note,
  checked,
  disabled = false,
  onChange,
}: FormatOptionCardProps) {
  const inputId = `${name}-${value}`;
  const noteId = note ? `${inputId}-note` : undefined;

  return (
    <label className={checked ? "format-option format-option-selected" : "format-option"} htmlFor={inputId}>
      <input
        id={inputId}
        className="format-option-input"
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        aria-describedby={noteId}
        onChange={onChange}
      />
      <span className="format-option-indicator" aria-hidden="true" />
      <span className="format-option-copy">
        <span className="format-option-title">{title}</span>
        <span className="format-option-description">{description}</span>
        {note && <span className="format-option-note" id={noteId}>{note}</span>}
      </span>
    </label>
  );
}
