/**
 * SkillPicker — searchable multi-select for skills.
 * Fetches from /api/system/skills and lets user pick multiple.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useSkills } from "@/hooks/useSkills";

interface SkillPickerProps {
  value: string[];
  onChange: (skills: string[]) => void;
}

export function SkillPicker({ value, onChange }: SkillPickerProps) {
  const { data: skills = [], isLoading } = useSkills();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return skills.slice(0, 30);
    const q = query.toLowerCase();
    return skills.filter((s) =>
      s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q)
    ).slice(0, 30);
  }, [skills, query]);

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  const remove = (id: string) => {
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected pills */}
      <div className="flex flex-wrap gap-1 mb-1.5">
        {value.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-600"
          >
            {id}
            <button
              type="button"
              onClick={() => remove(id)}
              className="text-blue-400 hover:text-blue-700 ml-0.5 text-[10px] leading-none"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      {/* Search input */}
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={isLoading ? "Cargando skills..." : "Buscar skill..."}
        className="w-full border border-[#E8E2D9] rounded-lg px-2 py-1.5 text-[13px] bg-white focus:outline-none focus:border-[#2C3E50] transition-colors"
      />

      {/* Dropdown */}
      {open && filtered.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[#E8E2D9] rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
          {filtered.map((skill) => {
            const isSelected = value.includes(skill.id);
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => { toggle(skill.id); setQuery(""); }}
                className={`w-full text-left px-3 py-2 text-[12px] hover:bg-[#F5F2ED] transition-colors flex items-center gap-2 ${
                  isSelected ? "bg-blue-50" : ""
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] shrink-0 ${
                  isSelected ? "bg-blue-500 border-blue-500 text-white" : "border-[#E8E2D9]"
                }`}>
                  {isSelected ? "✓" : ""}
                </span>
                <span className="font-medium text-[#2C3E50]">{skill.id}</span>
                {skill.description && (
                  <span className="text-[#7F8C8D] truncate text-[11px]">— {skill.description.slice(0, 60)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
