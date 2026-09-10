import { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  Disc3,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  RefreshCw,
  Music2,
  ListMusic,
  Shuffle,
  Repeat,
  Repeat1,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";

import {
  Album,
  LibraryData,
  PlaybackStatus,
  Playlist,
  RepeatMode,
  Track,
  TrackWithAlbum,
} from "./types/music";
import { TagSidebar } from "./components/TagSidebar";
import { AlbumGrid } from "./components/AlbumGrid";
import { QueueDrawer } from "./components/QueueDrawer";
import "./App.css";

function App() {
  const [library, setLibrary] = useState<LibraryData>({
    albums: [],
    tags: [],
    total_tracks: 0,
  });
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [matchAll, setMatchAll] = useState(true); // AND vs OR
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null);

  // Playback & Queue States
  const [queue, setQueue] = useState<TrackWithAlbum[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionSecs, setPositionSecs] = useState(0);
  const [durationSecs, setDurationSecs] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  const isSeeking = useRef(false);
  const currentTrack = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  // 初回マウント時にDBからライブラリおよびプレイリストを復元
  useEffect(() => {
    loadLibrary();
    loadPlaylists();
  }, []);

  const loadLibrary = async () => {
    try {
      const data = await invoke<LibraryData>("get_library_data");
      setLibrary(data);
    } catch (e) {
      console.error("Failed to load library", e);
    }
  };

  const loadPlaylists = async () => {
    try {
      const list = await invoke<Playlist[]>("get_playlists");
      setPlaylists(list);
    } catch (e) {
      console.error("Failed to load playlists", e);
    }
  };

  // 再生位置とステータスの同期ポーリング
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(async () => {
      if (isSeeking.current) return;

      try {
        const status = await invoke<PlaybackStatus>("get_playback_status");
        if (status.duration_secs > 0) {
          setDurationSecs(status.duration_secs);
        }
        setPositionSecs(status.position_secs);
        setIsPlaying(status.is_playing);

        // 曲の終了検出（自然終了）
        if (
          !status.is_playing &&
          status.duration_secs > 0 &&
          status.position_secs >= status.duration_secs - 0.8
        ) {
          handleTrackEnded();
        }
      } catch (e) {
        console.error("Failed to get playback status", e);
      }
    }, 250);

    return () => clearInterval(timer);
  }, [isPlaying, queue, currentIndex, repeatMode, shuffle]);

  const handleTrackEnded = () => {
    if (repeatMode === "one" && currentTrack) {
      handlePlayTrackAtIndex(currentIndex);
      return;
    }
    handleNext();
  };

  const handleOpenDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "音楽フォルダを選択",
      });

      let dirPath: string | null = null;
      if (typeof selected === "string") {
        dirPath = selected;
      } else if (Array.isArray(selected) && (selected as unknown[]).length > 0) {
        dirPath = String((selected as unknown[])[0]);
      }

      if (dirPath) {
        setLoading(true);
        setLoadingMessage(`「${dirPath}」内の音楽ファイルをスキャン中...`);

        try {
          const result = await invoke<LibraryData>("scan_music_directory", {
            dirPath,
          });
          setSelectedTags([]);
          setLibrary(result);
          loadPlaylists();
          if (result.albums.length === 0) {
            alert(`「${dirPath}」内に対象の音楽ファイル（mp3, flac, m4a, wma, wav, ogg, aac）が見つかりませんでした。`);
          }
        } catch (scanErr) {
          console.error("Scan error", scanErr);
          alert(`スキャン中にエラーが発生しました: ${scanErr}`);
        } finally {
          setLoading(false);
          setLoadingMessage(null);
        }
      }
    } catch (err) {
      console.error("Dialog error", err);
    }
  };

  // 指定インデックスの曲を再生
  const handlePlayTrackAtIndex = async (index: number) => {
    if (index < 0 || index >= queue.length) return;
    const track = queue[index];
    setCurrentIndex(index);
    setPositionSecs(0);
    setDurationSecs(track.duration_secs);

    try {
      const status = await invoke<PlaybackStatus>("play_track", {
        filePath: track.file_path,
      });
      setIsPlaying(status.is_playing);
    } catch (err) {
      console.error("Play track error", err);
      alert(`再生開始エラー: ${err}`);
    }
  };

  // アルバム詳細モーダルからトラック選択時
  const handleSelectTrackFromAlbum = async (track: Track, album: Album) => {
    try {
      const rawTracks = await invoke<Track[]>("get_album_tracks", {
        albumId: album.id,
      });
      const sortedTracks = [...rawTracks].sort((a, b) => {
        const discA = a.disc_number ?? 1;
        const discB = b.disc_number ?? 1;
        if (discA !== discB) return discA - discB;
        const trackA = a.track_number ?? 9999;
        const trackB = b.track_number ?? 9999;
        if (trackA !== trackB) return trackA - trackB;
        return a.title.localeCompare(b.title);
      });
      const albumQueue: TrackWithAlbum[] = sortedTracks.map((t) => ({
        ...t,
        album_title: album.title,
        album_artist: album.artist,
        cover_url: album.cover_url,
      }));

      const targetIndex = albumQueue.findIndex((t) => t.id === track.id);
      setQueue(albumQueue);
      setCurrentIndex(targetIndex >= 0 ? targetIndex : 0);
      setPositionSecs(0);
      setDurationSecs(track.duration_secs);

      const status = await invoke<PlaybackStatus>("play_track", {
        filePath: track.file_path,
      });
      setIsPlaying(status.is_playing);
    } catch (err) {
      console.error("Failed to play album track", err);
    }
  };

  // タグからプレイリストを自動生成して再生
  const handlePlaySelectedTags = async () => {
    if (selectedTags.length === 0) return;
    try {
      const tracks = await invoke<TrackWithAlbum[]>("get_tracks_by_tags", {
        tags: selectedTags,
        matchAll,
      });

      if (tracks.length === 0) {
        alert("選択したタグに一致する曲がありませんでした。");
        return;
      }

      setQueue(tracks);
      setCurrentIndex(0);
      setPositionSecs(0);
      setDurationSecs(tracks[0].duration_secs);

      const status = await invoke<PlaybackStatus>("play_track", {
        filePath: tracks[0].file_path,
      });
      setIsPlaying(status.is_playing);
    } catch (err) {
      console.error("Failed to generate tag playlist", err);
      alert(`プレイリスト生成エラー: ${err}`);
    }
  };

  // 保存済みプレイリストの再生
  const handlePlaySavedPlaylist = async (playlist: Playlist) => {
    try {
      const tracks = await invoke<TrackWithAlbum[]>("get_playlist_tracks", {
        playlistId: playlist.id,
      });

      if (tracks.length === 0) {
        alert("プレイリストに曲が含まれていません。");
        return;
      }

      setQueue(tracks);
      setCurrentIndex(0);
      setPositionSecs(0);
      setDurationSecs(tracks[0].duration_secs);

      const status = await invoke<PlaybackStatus>("play_track", {
        filePath: tracks[0].file_path,
      });
      setIsPlaying(status.is_playing);
    } catch (err) {
      console.error("Failed to play saved playlist", err);
    }
  };

  // プレイリストの保存
  const handleSaveAsPlaylist = async (name: string) => {
    const trackIds = queue.map((t) => t.id);
    await invoke("save_playlist", { name, trackIds });
    await loadPlaylists();
  };

  // プレイリストの削除
  const handleDeletePlaylist = async (playlistId: number) => {
    await invoke("delete_playlist", { playlistId });
    await loadPlaylists();
  };

  // 次の曲
  const handleNext = () => {
    if (queue.length === 0) return;

    if (shuffle && queue.length > 1) {
      let nextIdx = currentIndex;
      while (nextIdx === currentIndex) {
        nextIdx = Math.floor(Math.random() * queue.length);
      }
      handlePlayTrackAtIndex(nextIdx);
      return;
    }

    if (currentIndex < queue.length - 1) {
      handlePlayTrackAtIndex(currentIndex + 1);
    } else if (repeatMode === "all") {
      handlePlayTrackAtIndex(0);
    } else {
      setIsPlaying(false);
    }
  };

  // 前の曲
  const handlePrev = () => {
    if (queue.length === 0) return;
    if (positionSecs > 3) {
      handleSeek(0);
      return;
    }
    if (currentIndex > 0) {
      handlePlayTrackAtIndex(currentIndex - 1);
    } else if (repeatMode === "all") {
      handlePlayTrackAtIndex(queue.length - 1);
    }
  };

  const handleTogglePlay = async () => {
    if (!currentTrack) return;
    try {
      if (isPlaying) {
        await invoke("pause_playback");
        setIsPlaying(false);
      } else {
        await invoke("resume_playback");
        setIsPlaying(true);
      }
    } catch (err) {
      console.error("Toggle play error", err);
    }
  };

  const handleSeek = async (newSecs: number) => {
    setPositionSecs(newSecs);
    try {
      await invoke("seek_playback", { positionSecs: newSecs });
    } catch (err) {
      console.error("Seek error", err);
    }
  };

  const handleVolumeChange = async (newVol: number) => {
    setVolume(newVol);
    if (isMuted && newVol > 0) setIsMuted(false);
    try {
      await invoke("set_playback_volume", { volume: newVol });
    } catch (err) {
      console.error("Volume error", err);
    }
  };

  const handleToggleMute = async () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    try {
      await invoke("set_playback_volume", { volume: nextMuted ? 0 : volume });
    } catch (err) {
      console.error("Mute toggle error", err);
    }
  };

  const handleCycleRepeat = () => {
    setRepeatMode((prev) => (prev === "off" ? "all" : prev === "all" ? "one" : "off"));
  };

  const handleToggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  // アルバム一覧のタグ絞り込み
  const filteredAlbums = library.albums.filter((album) => {
    if (selectedTags.length === 0) return true;
    if (matchAll) {
      return selectedTags.every((tag) => album.tags.includes(tag));
    } else {
      return selectedTags.some((tag) => album.tags.includes(tag));
    }
  });

  const formatTime = (secs: number) => {
    const safeSecs = Math.max(0, Math.floor(secs));
    const m = Math.floor(safeSecs / 60);
    const s = safeSecs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const coverSrc = currentTrack?.cover_url
    ? convertFileSrc(currentTrack.cover_url)
    : null;

  return (
    <div className="flex h-screen w-screen flex-col bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      {/* Top Header */}
      <header className="flex h-12 items-center justify-between border-b border-zinc-800/80 px-4 bg-zinc-900/50 backdrop-blur z-20">
        <div className="flex items-center gap-2">
          <Disc3 className={`h-5 w-5 text-indigo-400 ${isPlaying ? "animate-spin-slow" : ""}`} />
          <span className="font-semibold tracking-wider text-sm text-zinc-200">tagPlayer</span>
          <span className="text-[11px] text-zinc-500 ml-3">
            {library.albums.length} アルバム / {library.total_tracks} トラック
          </span>
        </div>

        <div className="flex items-center gap-3">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-indigo-400">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>{loadingMessage}</span>
            </div>
          )}
          <button
            onClick={handleOpenDirectory}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-indigo-600/90 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            ディレクトリを開く
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <TagSidebar
          tags={library.tags}
          selectedTags={selectedTags}
          matchAll={matchAll}
          onToggleMatchMode={() => setMatchAll(!matchAll)}
          onToggleTag={handleToggleTag}
          onClearTags={handleClearTags}
          onPlaySelectedTags={handlePlaySelectedTags}
          playlists={playlists}
          onPlayPlaylist={handlePlaySavedPlaylist}
          onDeletePlaylist={handleDeletePlaylist}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-zinc-900/20 to-zinc-950">
          <AlbumGrid
            albums={filteredAlbums}
            selectedTags={selectedTags}
            availableTags={library.tags}
            onSelectTrack={handleSelectTrackFromAlbum}
            onTagsChanged={loadLibrary}
          />

        </main>
      </div>

      {/* Playback Queue Drawer */}
      <QueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
        queue={queue}
        currentIndex={currentIndex}
        onPlayTrackAtIndex={handlePlayTrackAtIndex}
        onRemoveTrack={(idx) => {
          setQueue((prev) => prev.filter((_, i) => i !== idx));
          if (idx < currentIndex) {
            setCurrentIndex((prev) => prev - 1);
          }
        }}
        onClearQueue={() => {
          setQueue([]);
          setCurrentIndex(-1);
          setIsPlaying(false);
          invoke("pause_playback");
        }}
        onSaveAsPlaylist={handleSaveAsPlaylist}
      />

      {/* Bottom Player Controls */}
      <footer className="h-20 border-t border-zinc-800 bg-zinc-900/90 px-4 flex items-center justify-between backdrop-blur z-20 shadow-2xl">
        {/* Track Info */}
        <div className="flex items-center gap-3 w-1/4">
          <div className="h-12 w-12 rounded-lg bg-zinc-800 border border-zinc-700/60 flex items-center justify-center text-zinc-400 shrink-0 overflow-hidden shadow-inner">
            {coverSrc ? (
              <img src={coverSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <Music2 className="h-5 w-5 text-zinc-500" />
            )}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-xs font-semibold text-zinc-200 truncate">
              {currentTrack?.title ?? "曲を選択してください"}
            </span>
            <span className="text-[11px] text-zinc-400 truncate mt-0.5">
              {currentTrack?.artist || currentTrack?.album_artist || "アーティスト名"}
            </span>
          </div>
        </div>

        {/* Controls & Seek Bar */}
        <div className="flex flex-col items-center gap-1.5 flex-1 max-w-lg">
          <div className="flex items-center gap-4">
            {/* Shuffle Button */}
            <button
              onClick={() => setShuffle(!shuffle)}
              className={`p-1 rounded transition cursor-pointer ${
                shuffle ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title={shuffle ? "シャッフル: オン" : "シャッフル: オフ"}
            >
              <Shuffle className="h-3.5 w-3.5" />
            </button>

            {/* Prev Track */}
            <button
              onClick={handlePrev}
              disabled={!currentTrack}
              className="text-zinc-400 hover:text-zinc-200 transition cursor-pointer disabled:opacity-30"
              title="前の曲"
            >
              <SkipBack className="h-4 w-4" />
            </button>

            {/* Play/Pause */}
            <button
              onClick={handleTogglePlay}
              disabled={!currentTrack}
              className="h-9 w-9 rounded-full bg-zinc-100 text-zinc-950 flex items-center justify-center hover:bg-white active:scale-95 transition shadow cursor-pointer disabled:opacity-30"
              title={isPlaying ? "一時停止" : "再生"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 fill-current ml-0.5" />
              )}
            </button>

            {/* Next Track */}
            <button
              onClick={handleNext}
              disabled={!currentTrack}
              className="text-zinc-400 hover:text-zinc-200 transition cursor-pointer disabled:opacity-30"
              title="次の曲"
            >
              <SkipForward className="h-4 w-4" />
            </button>

            {/* Repeat Button */}
            <button
              onClick={handleCycleRepeat}
              className={`p-1 rounded transition cursor-pointer ${
                repeatMode !== "off" ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
              }`}
              title={`リピート: ${repeatMode === "off" ? "オフ" : repeatMode === "all" ? "全曲" : "1曲"}`}
            >
              {repeatMode === "one" ? (
                <Repeat1 className="h-3.5 w-3.5" />
              ) : (
                <Repeat className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* Seek Bar */}
          <div className="w-full flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
            <span className="w-8 text-right">{formatTime(positionSecs)}</span>
            <input
              type="range"
              min={0}
              max={durationSecs || 100}
              step={0.1}
              value={positionSecs}
              disabled={!currentTrack}
              onMouseDown={() => {
                isSeeking.current = true;
              }}
              onTouchStart={() => {
                isSeeking.current = true;
              }}
              onChange={(e) => {
                setPositionSecs(parseFloat(e.target.value));
              }}
              onMouseUp={(e) => {
                isSeeking.current = false;
                handleSeek(parseFloat((e.target as HTMLInputElement).value));
              }}
              onTouchEnd={(e) => {
                isSeeking.current = false;
                handleSeek(parseFloat((e.target as HTMLInputElement).value));
              }}
              className="h-1 flex-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-indigo-500 disabled:opacity-30 hover:h-1.5 transition-all"
            />
            <span className="w-8">{formatTime(durationSecs)}</span>
          </div>
        </div>

        {/* Volume & Queue Toggle */}
        <div className="flex items-center justify-end gap-3 w-1/4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleMute}
              className="text-zinc-400 hover:text-zinc-200 transition cursor-pointer"
              title={isMuted ? "ミュート解除" : "ミュート"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-4 w-4 text-zinc-500" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer accent-indigo-400 hover:h-1.5 transition-all"
              title={`音量: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
            />
          </div>

          {/* Queue Drawer Button */}
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition cursor-pointer text-xs ${
              isQueueOpen
                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/40"
                : "bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 border-zinc-700/60"
            }`}
            title="再生キューを表示"
          >
            <ListMusic className="h-3.5 w-3.5" />
            <span className="font-mono text-[11px]">{queue.length}</span>
          </button>
        </div>
      </footer>
    </div>
  );
}

export default App;
