"use client";

export default function ToggleChip({
  label,
  on,
  onClick,
  warm = false,
  title,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  warm?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`chip${on ? " on" : ""}${warm ? " warm" : ""}`}
      onClick={onClick}
      aria-pressed={on}
    >
      <span className="swatch" />
      {label}
    </button>
  );
}
