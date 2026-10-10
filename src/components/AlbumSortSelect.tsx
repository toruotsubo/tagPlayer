import React, { useState, useRef, useEffect, useMemo } from "react";
import { ChevronRight, ChevronDown, Check } from "lucide-react";
import { AlbumSortOrder } from "../types/music";
import { useTranslation } from "../i18n";

interface AlbumSortOption {
  value: AlbumSortOrder;
  labels: string[];
}

interface AlbumSortSelectProps {
  value: AlbumSortOrder;
  onChange: (value: AlbumSortOrder) => void;
}

export const AlbumSortSelect: React.FC<AlbumSortSelectProps> = ({
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const sortOptions: AlbumSortOption[] = useMemo(
    () => [
      {
        value: "artist-title-year",
        labels: [t.albumSort.artist, t.albumSort.title, t.albumSort.releaseYear],
      },
      {
        value: "artist-year-title",
        labels: [t.albumSort.artist, t.albumSort.releaseYear, t.albumSort.title],
      },
      {
        value: "genre-artist-title-year",
        labels: [
          t.albumSort.genre,
          t.albumSort.artist,
          t.albumSort.title,
          t.albumSort.releaseYear,
        ],
      },
      {
        value: "genre-artist-year-title",
        labels: [
          t.albumSort.genre,
          t.albumSort.artist,
          t.albumSort.releaseYear,
          t.albumSort.title,
        ],
      },
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
    sortOptions.find((opt) => opt.value === value) ||
    sortOptions[0];

  const renderSortLabels = (labels: string[]) => (
    <span className="inline-flex items-center gap-1">
      {labels.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <ChevronRight className="h-3 w-3 text-zinc-500 shrink-0" />
          )}
          <span>{part}</span>
        </React.Fragment>
      ))}
    </span>
  );

  return (
    <div className="relative inline-block" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-200 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer transition shadow-xs font-medium flex items-center gap-2"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={t.albumSort.label}
      >
        {renderSortLabels(currentOption.labels)}
        <ChevronDown
          className={`h-3 w-3 text-zinc-400 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          className="absolute left-0 mt-1 min-w-full w-max z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
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
                {renderSortLabels(option.labels)}
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
