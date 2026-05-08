"use client";

interface SlotDef {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
}

interface SlotInputProps {
  slot: SlotDef;
  value: string;
  onChange: (v: string) => void;
}

export function SlotInput({ slot, value, onChange }: SlotInputProps) {
  const counter = slot.maxLength ? `${value.length}/${slot.maxLength}` : null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-[11px] font-semibold text-foreground">{slot.label}</label>
        {counter && (
          <span className="text-[10px] font-mono text-muted-foreground">{counter}</span>
        )}
      </div>
      {slot.multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={slot.maxLength}
          placeholder={slot.placeholder}
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-[#E5E2DC] dark:border-[#313244] rounded-md bg-white dark:bg-[#181825] focus:outline-none focus:border-rust resize-y"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={slot.maxLength}
          placeholder={slot.placeholder}
          className="w-full px-2 py-1.5 text-sm border border-[#E5E2DC] dark:border-[#313244] rounded-md bg-white dark:bg-[#181825] focus:outline-none focus:border-rust"
        />
      )}
    </div>
  );
}
