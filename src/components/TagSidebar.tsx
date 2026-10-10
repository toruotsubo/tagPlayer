import React, { useState, useMemo } from "react";
import {
  Tag,
  Search,
  Check,
  Play,
  ListMusic,
  Trash2,
  X,
  ArrowUpDown,
  ListPlus,
} from "lucide-react";
import { Playlist, TagCategory, TagItem, categoryDotClasses } from "../types/music";
import { useTranslation } from "../i18n";

interface TagSidebarProps {
  tags: TagItem[];
  viewMode: "albums" | "tracks";
  selectedTags: string[];
  matchAll: boolean;
  onToggleMatchMode: () => void;
  onToggleTag: (tagName: string) => void;
  onClearTags: () => void;
  onPlaySelectedTags: () => void;
  onQueueSelectedTags: () => void;
  playlists: Playlist[];
  onPlayPlaylist: (playlist: Playlist) => void;
  onDeletePlaylist: (playlistId: number) => void;
}

export type TagSortOrder = "count-asc" | "count-desc" | "name-asc" | "name-desc";

export const TagSidebar: React.FC<TagSidebarProps> = ({
  tags,
  viewMode,
  selectedTags,
  matchAll,
  onToggleMatchMode,
  onToggleTag,
  onClearTags,
  onPlaySelectedTags,
  onQueueSelectedTags,
  playlists,
  onPlayPlaylist,
  onDeletePlaylist,
}) => {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"tags" | "playlists">("tags");
  const [tagCategory, setTagCategory] = useState<"all" | TagCategory>("all");
  const [tagSortOrder, setTagSortOrder] = useState<TagSortOrder>(() => {
    const saved = localStorage.getItem("tagPlayer_tagSortOrder");
    if (
      saved === "count-asc" ||
      saved === "count-desc" ||
      saved === "name-asc" ||
      saved === "name-desc"
    ) {
      return saved;
    }
    return "count-asc";
  });

  const categoryLabels: Record<"all" | TagCategory, string> = {
    all: t.categories.all,
    genre: t.categories.genre,
    artist: t.categories.artist,
    composer: t.categories.composer,
    release_year: t.categories.release_year,
    other: t.categories.other,
  };

  const filteredTags = tags.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (viewMode === "albums" && t.target_type === "track") return false;
    return tagCategory === "all" || t.category === tagCategory;
  });

  const sortedTags = useMemo(() => {
    return [...filteredTags].sort((a, b) => {
      switch (tagSortOrder) {
        case "count-asc":
          if (a.count !== b.count) {
            return a.count - b.count;
          }
          return a.name.localeCompare(b.name, "ja", { sensitivity: "base" });
        case "count-desc":
          if (a.count !== b.count) {
            return b.count - a.count;
          }
          return a.name.localeCompare(b.name, "ja", { sensitivity: "base" });
        case "name-asc":
          return a.name.localeCompare(b.name, "ja", { sensitivity: "base" });
        case "name-desc":
          return b.name.localeCompare(a.name, "ja", { sensitivity: "base" });
        default:
          return 0;
      }
    });
  }, [filteredTags, tagSortOrder]);

  return (
    <aside className="w-72 border-r border-zinc-800/80 bg-zinc-900/40 p-4 flex flex-col gap-3.5 overflow-hidden select-none">
      {/* Primary Navigation Tabs */}
      <div className="flex rounded-lg bg-zinc-950/60 p-0.5 border border-zinc-800/60 text-xs">
        <button
          onClick={() => setActiveTab("tags")}
          className={`flex-1 py-1.5 text-center rounded-md transition font-medium flex items-center justify-center gap-1.5 cursor-pointer ${activeTab === "tags"
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
            }`}
        >
          <Tag className="h-3.5 w-3.5" /> {t.sidebar.tagsTab}
        </button>
        <button
          onClick={() => setActiveTab("playlists")}
          className={`flex-1 py-1.5 text-center rounded-md transition font-medium flex items-center justify-center gap-1.5 cursor-pointer ${activeTab === "playlists"
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
            }`}
        >
          <ListMusic className="h-3.5 w-3.5" />
          <span>{t.sidebar.playlistsTab}</span>
          <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full border text-[10px] font-mono font-medium leading-none ${
              activeTab === "playlists"
                ? "border-zinc-600 bg-zinc-900/80 text-zinc-200"
                : "border-zinc-700/80 bg-zinc-950/60 text-zinc-400"
            }`}
          >
            {playlists.length}
          </span>
        </button>
      </div>

      {activeTab === "tags" ? (
        <>
          {/* Tag Play & Match Mode Actions */}
          {selectedTags.length > 0 && (
            <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-400/80 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300">
                  {t.sidebar.selectedTagsCount(selectedTags.length)}
                </span>
                <button
                  onClick={onClearTags}
                  className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 hover:text-white border border-zinc-700/60 text-[11px] transition cursor-pointer shadow-xs"
                >
                  {t.sidebar.clearTagsButton}
                </button>
              </div>

              {/* 選択中のタグリスト */}
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto py-0.5 pr-0.5">
                {selectedTags.map((tagName) => {
                  const tagItem = tags.find((t) => t.name === tagName);
                  const category = tagItem?.category || "other";
                  return (
                    <span
                      key={tagName}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-zinc-900/80 border border-zinc-700/60 text-xs text-zinc-200"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${categoryDotClasses[category]}`}
                      />
                      <span className="truncate max-w-[120px]" title={tagName}>
                        {tagName}
                      </span>
                      <button
                        type="button"
                        onClick={() => onToggleTag(tagName)}
                        className="text-zinc-400 hover:text-red-400 p-0.5 -mr-0.5 rounded transition cursor-pointer"
                        title={t.sidebar.removeTagItemTip(tagName)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>

              {/* AND / OR トグルボタンスイッチ (2件以上の選択時のみ表示) */}
              {selectedTags.length > 1 && (
                <div className="grid grid-cols-2 rounded-lg bg-zinc-950/80 p-0.5 border border-zinc-800 text-xs shadow-inner">
                  <button
                    type="button"
                    onClick={() => {
                      if (!matchAll) onToggleMatchMode();
                    }}
                    className={`py-1.5 text-center rounded-md transition text-[11px] font-medium cursor-pointer flex items-center justify-center gap-1 ${
                      matchAll
                        ? "bg-zinc-800 text-indigo-300 shadow-sm border border-zinc-700/60 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span>{t.common.and}</span>
                    <span className="text-[10px] opacity-75">{t.common.andDesc}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (matchAll) onToggleMatchMode();
                    }}
                    className={`py-1.5 text-center rounded-md transition text-[11px] font-medium cursor-pointer flex items-center justify-center gap-1 ${
                      !matchAll
                        ? "bg-zinc-800 text-indigo-300 shadow-sm border border-zinc-700/60 font-semibold"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <span>{t.common.or}</span>
                    <span className="text-[10px] opacity-75">{t.common.orDesc}</span>
                  </button>
                </div>
              )}

              <div className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={onPlaySelectedTags}
                  className="flex-1 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                  title={t.sidebar.playSelectedTagsTip}
                >
                  <Play className="h-3.5 w-3.5 fill-current" />
                  {t.common.play}
                </button>
                <button
                  onClick={onQueueSelectedTags}
                  className="flex-1 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                  title={t.sidebar.queueSelectedTagsTip}
                >
                  <ListPlus className="h-3.5 w-3.5" />
                  {t.common.queue}
                </button>
              </div>
            </div>
          )}

          {/* Search Input */}
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.sidebar.searchPlaceholder}
              className="w-full rounded-lg bg-zinc-950/70 border border-zinc-700 hover:border-zinc-600 pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none transition shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 rounded hover:bg-zinc-800/60 transition cursor-pointer"
                title={t.app.clearSearchTip}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tag categories */}
          <div className="grid grid-cols-3 gap-1 text-[11px]">
            {(["all", "genre", "artist", "release_year", "composer", "other"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setTagCategory(cat)}
                className={`py-1 px-1 rounded-md transition cursor-pointer flex items-center justify-center gap-1 text-center ${
                  tagCategory === cat
                    ? "bg-zinc-800 text-zinc-100 font-medium border border-zinc-700/60 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 border border-transparent"
                }`}
              >
                {cat !== "all" && (
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${categoryDotClasses[cat]}`} />
                )}
                <span className="truncate">{categoryLabels[cat]}</span>
              </button>
            ))}
          </div>

          {/* Tag Sort */}
          <div className="flex items-center justify-end text-[11px] px-0.5 pt-0.5">
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3 w-3 text-zinc-500 shrink-0" />
              <select
                value={tagSortOrder}
                onChange={(e) => {
                  const nextSort = e.target.value as TagSortOrder;
                  setTagSortOrder(nextSort);
                  try {
                    localStorage.setItem("tagPlayer_tagSortOrder", nextSort);
                  } catch {}
                }}
                className="bg-zinc-950/80 border border-zinc-800 text-zinc-300 rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:border-indigo-500 cursor-pointer transition hover:border-zinc-700"
                aria-label={t.sidebar.sortLabel}
              >
                <option value="count-asc" className="bg-zinc-900 text-zinc-200">{t.sidebar.sortCountAsc}</option>
                <option value="count-desc" className="bg-zinc-900 text-zinc-200">{t.sidebar.sortCountDesc}</option>
                <option value="name-asc" className="bg-zinc-900 text-zinc-200">{t.sidebar.sortNameAsc}</option>
                <option value="name-desc" className="bg-zinc-900 text-zinc-200">{t.sidebar.sortNameDesc}</option>
              </select>
            </div>
          </div>

          {/* Tag List */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1">
            {sortedTags.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">
                {t.sidebar.noTagsFound}
              </div>
            ) : (
              sortedTags.map((tag) => {
                const isSelected = selectedTags.includes(tag.name);
                return (
                  <button
                    key={tag.id}
                    onClick={() => onToggleTag(tag.name)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition text-left cursor-pointer group ${isSelected
                        ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-medium"
                        : "text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 border border-transparent"
                      }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${categoryDotClasses[tag.category]
                          }`}
                      />
                      <span className="truncate">{tag.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 bg-zinc-950/60 px-1.5 py-0.2 rounded font-mono">
                        {tag.count}
                      </span>
                      {isSelected && <Check className="h-3 w-3 text-indigo-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>


        </>
      ) : (
        /* Saved Playlists Tab */
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
          {playlists.length === 0 ? (
            <div className="text-center py-12 text-xs text-zinc-500 flex flex-col items-center gap-2">
              <ListMusic className="h-6 w-6 text-zinc-700" />
              {t.sidebar.noPlaylistsFound}
              <span className="text-[11px] text-zinc-600">
                {t.sidebar.noPlaylistsSub}
              </span>
            </div>
          ) : (
            playlists.map((pl) => (
              <div
                key={pl.id}
                className="group flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 hover:bg-zinc-800/60 border border-zinc-800/60 hover:border-zinc-700/60 transition text-xs cursor-pointer"
                onClick={() => onPlayPlaylist(pl)}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <div className="h-8 w-8 rounded bg-indigo-950/60 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                  </div>
                  <div className="flex flex-col truncate">
                    <span className="font-medium text-zinc-200 group-hover:text-indigo-300 transition truncate">
                      {pl.name}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {t.sidebar.trackCount(pl.track_count)}
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t.sidebar.deletePlaylistConfirm(pl.name))) {
                      onDeletePlaylist(pl.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                  title={t.sidebar.deletePlaylistTip}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
};
