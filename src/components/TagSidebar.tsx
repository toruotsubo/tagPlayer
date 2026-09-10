import React, { useState } from "react";
import {
  Tag,
  Search,
  Check,
  Play,
  ListMusic,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";
import { Playlist, TagItem } from "../types/music";

interface TagSidebarProps {
  tags: TagItem[];
  selectedTags: string[];
  matchAll: boolean;
  onToggleMatchMode: () => void;
  onToggleTag: (tagName: string) => void;
  onClearTags: () => void;
  onPlaySelectedTags: () => void;
  playlists: Playlist[];
  onPlayPlaylist: (playlist: Playlist) => void;
  onDeletePlaylist: (playlistId: number) => void;
}

export const TagSidebar: React.FC<TagSidebarProps> = ({
  tags,
  selectedTags,
  matchAll,
  onToggleMatchMode,
  onToggleTag,
  onClearTags,
  onPlaySelectedTags,
  playlists,
  onPlayPlaylist,
  onDeletePlaylist,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"tags" | "playlists">("tags");
  const [tagCategory, setTagCategory] = useState<"all" | "album" | "track">("all");

  const filteredTags = tags.filter((t) => {
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (tagCategory === "all") return true;
    if (tagCategory === "album") return t.target_type === "album" || t.target_type === "all";
    if (tagCategory === "track") return t.target_type === "track" || t.target_type === "all";
    return true;
  });

  return (
    <aside className="w-72 border-r border-zinc-800/80 bg-zinc-900/40 p-4 flex flex-col gap-3.5 overflow-hidden select-none">
      {/* Primary Navigation Tabs */}
      <div className="flex rounded-lg bg-zinc-950/60 p-0.5 border border-zinc-800/60 text-xs">
        <button
          onClick={() => setActiveTab("tags")}
          className={`flex-1 py-1.5 text-center rounded-md transition font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "tags"
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Tag className="h-3.5 w-3.5" /> タグ
        </button>
        <button
          onClick={() => setActiveTab("playlists")}
          className={`flex-1 py-1.5 text-center rounded-md transition font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "playlists"
              ? "bg-zinc-800 text-zinc-100 shadow-sm"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <ListMusic className="h-3.5 w-3.5" /> プレイリスト ({playlists.length})
        </button>
      </div>

      {activeTab === "tags" ? (
        <>
          {/* Tag Play & Match Mode Actions */}
          {selectedTags.length > 0 && (
            <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-300">
                  {selectedTags.length} 件のタグを選択中
                </span>
                <button
                  onClick={onClearTags}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  解除
                </button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center gap-1">
                  <SlidersHorizontal className="h-3 w-3" /> 条件:
                </span>
                <button
                  onClick={onToggleMatchMode}
                  className="px-2 py-0.5 rounded bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 transition font-mono cursor-pointer"
                >
                  {matchAll ? "AND (すべて一致)" : "OR (いずれか一致)"}
                </button>
              </div>

              <button
                onClick={onPlaySelectedTags}
                className="w-full mt-1 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 active:scale-98 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                タグからプレイリスト再生
              </button>
            </div>
          )}

          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="タグを検索..."
              className="w-full rounded-lg bg-zinc-950/60 border border-zinc-800/80 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none transition"
            />
          </div>

          {/* Sub Categories: all / album / track */}
          <div className="flex gap-1 text-[11px]">
            {(["all", "album", "track"] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setTagCategory(cat)}
                className={`px-2.5 py-0.5 rounded transition cursor-pointer ${
                  tagCategory === cat
                    ? "bg-zinc-800 text-zinc-200 font-medium"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {cat === "all" ? "全種" : cat === "album" ? "アルバム" : "曲"}
              </button>
            ))}
          </div>

          {/* Tag List */}
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-1">
            {filteredTags.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500">
                該当するタグがありません
              </div>
            ) : (
              filteredTags.map((tag) => {
                const isSelected = selectedTags.includes(tag.name);
                return (
                  <button
                    key={tag.id}
                    onClick={() => onToggleTag(tag.name)}
                    className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition text-left cursor-pointer group ${
                      isSelected
                        ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 font-medium"
                        : "text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          tag.target_type === "album"
                            ? "bg-amber-400"
                            : tag.target_type === "track"
                            ? "bg-emerald-400"
                            : "bg-indigo-400"
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

          {/* Footer Legend */}
          <div className="pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px] text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> アルバム
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 曲
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> 共通
            </span>
          </div>
        </>
      ) : (
        /* Saved Playlists Tab */
        <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
          {playlists.length === 0 ? (
            <div className="text-center py-12 text-xs text-zinc-500 flex flex-col items-center gap-2">
              <ListMusic className="h-6 w-6 text-zinc-700" />
              保存済みプレイリストはありません
              <span className="text-[11px] text-zinc-600">
                再生キューから「プレイリストとして保存」できます
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
                      {pl.track_count} 曲
                    </span>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`プレイリスト「${pl.name}」を削除しますか？`)) {
                      onDeletePlaylist(pl.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                  title="削除"
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
