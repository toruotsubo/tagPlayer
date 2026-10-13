import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "../i18n";

export type TagSortOrder = "count-asc" | "count-desc" | "name-asc" | "name-desc";

interface TagSortOption {
  value: TagSortOrder;
  label: string;
}

interface TagSortSelectProps {
  value: TagSortOrder;
  onChange: (value: TagSortOrder) => void;
}

export const TagSortSelect: React.FC<TagSortSelectProps> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const sortOptions: TagSortOption[] = useMemo(
    () => [
      { value: "count-desc", label: t.sidebar.sortCountDesc },
      { value: "count-asc", label: t.sidebar.sortCountAsc },
      { value: "name-asc", label: t.sidebar.sortNameAsc },
      { value: "name-desc", label: t.sidebar.sortNameDesc },
    ],
    [t]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const currentOption =
    sortOptions.find((opt) => opt.value === value) || sortOptions[0];

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer transition shadow-xs font-medium flex items-center gap-2"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t.sidebar.sortLabel}
      >
        <span>{currentOption.label}</span>
        <ChevronDown
          className={`h-3 w-3 text-zinc-400 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute right-0 mt-1 min-w-full w-max z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        >
          {sortOptions.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-xs text-left cursor-pointer transition flex items-center justify-between gap-3 ${
                  isSelected
                    ? "bg-indigo-600/20 text-indigo-300 font-medium"
                    : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                }`}
              >
                <span>{option.label}</span>
                {isSelected && (
                  <Check className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
