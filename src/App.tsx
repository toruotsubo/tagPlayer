import { useState, useEffect, useRef, useMemo } from "react";
import {
  DatabasePlus,
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
  Check,
  ArrowUpDown,
  Search,
  X,
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
  categoryDotClasses,
  AlbumSortOrder,
  TrackSortOrder,
} from "./types/music";
import { TagSidebar } from "./components/TagSidebar";
import { AlbumGrid } from "./components/AlbumGrid";
import { TrackList } from "./components/TrackList";
import { QueueDrawer } from "./components/QueueDrawer";
import { AlbumDetailModal } from "./components/AlbumDetailModal";
import { AlbumSortSelect } from "./components/AlbumSortSelect";
import { TrackSortSelect } from "./components/TrackSortSelect";
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

  // View Mode & Tracks by Tag
  const [viewMode, setViewMode] = useState<"albums" | "tracks">("albums");
  const [albumSearchQuery, setAlbumSearchQuery] = useState("");
  const [trackSearchQuery, setTrackSearchQuery] = useState("");
  const [tagTracks, setTagTracks] = useState<TrackWithAlbum[]>([]);
  const [loadingTagTracks, setLoadingTagTracks] = useState(false);

  // Album Detail / Tag Edit Modal state
  const [modalAlbum, setModalAlbum] = useState<Album | null>(null);
  const [modalTrackId, setModalTrackId] = useState<number | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const isSeeking = useRef(false);
  const currentTrack = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  // キューに曲が追加された際、未選択なら先頭曲（インデックス0）を選択状態にする
  useEffect(() => {
    if (queue.length > 0) {
      if (currentIndex < 0) {
        setCurrentIndex(0);
        setDurationSecs(queue[0].duration_secs);
        setPositionSecs(0);
      } else if (currentIndex >= queue.length) {
        setCurrentIndex(queue.length - 1);
        setDurationSecs(queue[queue.length - 1].duration_secs);
      }
    } else {
      if (currentIndex !== -1) {
        setCurrentIndex(-1);
        setPositionSecs(0);
        setDurationSecs(0);
      }
    }
  }, [queue, currentIndex]);

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

  // タグ選択変更時のトラック取得
  useEffect(() => {
    if (selectedTags.length > 0) {
      loadTagTracks(selectedTags, matchAll);
    } else {
      if (viewMode === "tracks") {
        loadTagTracks([], matchAll);
      }
    }
  }, [selectedTags, matchAll]);

  const loadTagTracks = async (tags: string[], isMatchAll: boolean) => {
    setLoadingTagTracks(true);
    try {
      const result = await invoke<TrackWithAlbum[]>("get_tracks_by_tags", {
        tags,
        matchAll: isMatchAll,
      });
      setTagTracks(result);
    } catch (e) {
      console.error("Failed to load tracks by tags", e);
      setTagTracks([]);
    } finally {
      setLoadingTagTracks(false);
    }
  };

  const handleSwitchViewMode = (mode: "albums" | "tracks") => {
    setViewMode(mode);
    if (mode === "tracks" && tagTracks.length === 0) {
      loadTagTracks(selectedTags, matchAll);
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
  const handlePlayTrackAtIndex = async (
    index: number,
    queueToPlay: TrackWithAlbum[] = queue
  ) => {
    if (index < 0 || index >= queueToPlay.length) return;
    const track = queueToPlay[index];
    setCurrentIndex(index);
    setPositionSecs(0);
    setDurationSecs(track.duration_secs);

    try {
      await invoke<PlaybackStatus>("play_track", {
        filePath: track.file_path,
      });
      setIsPlaying(true);
    } catch (err) {
      console.error("Play track error", err);
      setIsPlaying(false);
      alert(`再生開始エラー: ${err}`);
    }
  };

  // 単曲の即座再生（キューに追加して再生）
  const handlePlaySingleTrack = async (
    track: Track | TrackWithAlbum,
    album?: Album
  ) => {
    const trackWithAlbum: TrackWithAlbum = {
      ...track,
      album_title: "album_title" in track ? track.album_title : album?.title ?? "",
      album_artist: "album_artist" in track ? track.album_artist : album?.artist ?? "",
      cover_url: "cover_url" in track ? track.cover_url : album?.cover_url,
    };

    const existingIdx = queue.findIndex((t) => t.id === trackWithAlbum.id);
    if (existingIdx >= 0) {
      handlePlayTrackAtIndex(existingIdx);
    } else {
      const insertIdx = currentIndex >= 0 ? currentIndex + 1 : queue.length;
      const newQueue = [...queue];
      newQueue.splice(insertIdx, 0, trackWithAlbum);
      setQueue(newQueue);
      handlePlayTrackAtIndex(insertIdx, newQueue);
    }
  };

  // 単曲を再生キューの末尾に追加
  const handleQueueSingleTrack = (
    track: Track | TrackWithAlbum,
    album?: Album
  ) => {
    const trackWithAlbum: TrackWithAlbum = {
      ...track,
      album_title: "album_title" in track ? track.album_title : album?.title ?? "",
      album_artist: "album_artist" in track ? track.album_artist : album?.artist ?? "",
      cover_url: "cover_url" in track ? track.cover_url : album?.cover_url,
    };

    setQueue((prev) => [...prev, trackWithAlbum]);
    showToast(`「${track.title}」をキューに追加しました`);
  };

  // アルバム全曲再生
  const handlePlayAlbum = async (album: Album, albumTracks: Track[]) => {
    const sortedTracks = [...albumTracks].sort((a, b) => {
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

    setQueue(albumQueue);
    if (albumQueue.length > 0) {
      setCurrentIndex(0);
      setPositionSecs(0);
      setDurationSecs(albumQueue[0].duration_secs);
      try {
        await invoke<PlaybackStatus>("play_track", {
          filePath: albumQueue[0].file_path,
        });
        setIsPlaying(true);
      } catch (err) {
        console.error("Failed to play album", err);
        setIsPlaying(false);
      }
    }
  };

  // アルバム全曲をキューの末尾に追加
  const handleQueueAlbum = (album: Album, albumTracks: Track[]) => {
    const sortedTracks = [...albumTracks].sort((a, b) => {
      const discA = a.disc_number ?? 1;
      const discB = b.disc_number ?? 1;
      if (discA !== discB) return discA - discB;
      const trackA = a.track_number ?? 9999;
      const trackB = b.track_number ?? 9999;
      if (trackA !== trackB) return trackA - trackB;
      return a.title.localeCompare(b.title);
    });

    const items: TrackWithAlbum[] = sortedTracks.map((t) => ({
      ...t,
      album_title: album.title,
      album_artist: album.artist,
      cover_url: album.cover_url,
    }));

    setQueue((prev) => [...prev, ...items]);
    showToast(`「${album.title}」の ${items.length} 曲をキューに追加しました`);
  };

  // 一致曲すべてをキューにして再生
  const handlePlayAllTracks = (tracks: TrackWithAlbum[]) => {
    if (tracks.length === 0) return;
    setQueue(tracks);
    handlePlayTrackAtIndex(0, tracks);
  };

  // 一致曲すべてをキューの末尾に追加
  const handleQueueAllTracks = (tracks: TrackWithAlbum[]) => {
    if (tracks.length === 0) return;
    setQueue((prev) => [...prev, ...tracks]);
    showToast(`${tracks.length} 曲をキューに追加しました`);
  };



  // アルバム詳細モーダルからトラック選択時（互換用）
  const handleSelectTrackFromAlbum = async (track: Track, album: Album) => {
    handlePlaySingleTrack(track, album);
  };

  const handleOpenAlbumModal = (album: Album) => {
    setModalAlbum(album);
    setModalTrackId(null);
  };

  const handleOpenTrackTagEdit = (track: TrackWithAlbum) => {
    const targetAlbum = library.albums.find((a) => a.id === track.album_id);
    if (targetAlbum) {
      setModalAlbum(targetAlbum);
      setModalTrackId(track.id);
    }
  };

  const handleCloseAlbumModal = () => {
    setModalAlbum(null);
    setModalTrackId(null);
  };

  // アルバムのライブラリからの削除
  const handleDeleteAlbum = async (albumId: number) => {
    const targetAlbum = library.albums.find((a) => a.id === albumId);
    const albumTitle = targetAlbum?.title ?? "アルバム";
    await invoke("delete_album", { albumId });
    await loadLibrary();
    if (selectedTags.length > 0 || viewMode === "tracks") {
      loadTagTracks(selectedTags, matchAll);
    }
    showToast(`「${albumTitle}」をライブラリから削除しました`);
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

      await invoke<PlaybackStatus>("play_track", {
        filePath: tracks[0].file_path,
      });
      setIsPlaying(true);
    } catch (err) {
      console.error("Failed to generate tag playlist", err);
      setIsPlaying(false);
      alert(`プレイリスト生成エラー: ${err}`);
    }
  };

  // タグ一致曲をすべてキューに追加
  const handleQueueSelectedTags = async () => {
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

      setQueue((prev) => [...prev, ...tracks]);
      showToast(`${tracks.length} 曲をキューに追加しました`);
    } catch (err) {
      console.error("Failed to queue tag tracks", err);
      alert(`キュー追加エラー: ${err}`);
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

      await invoke<PlaybackStatus>("play_track", {
        filePath: tracks[0].file_path,
      });
      setIsPlaying(true);
    } catch (err) {
      console.error("Failed to play saved playlist", err);
      setIsPlaying(false);
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
        const status = await invoke<PlaybackStatus>("get_playback_status");
        if (status.current_file_path === currentTrack.file_path) {
          await invoke("resume_playback");
          setIsPlaying(true);
        } else {
          await handlePlayTrackAtIndex(currentIndex);
        }
      }
    } catch (err) {
      console.error("Toggle play error", err);
      handlePlayTrackAtIndex(currentIndex);
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

  const handleReorderQueue = (fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= queue.length ||
      toIndex >= queue.length
    ) {
      return;
    }

    setQueue((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(fromIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });

    setCurrentIndex((prev) => {
      if (prev < 0) return prev;
      if (prev === fromIndex) {
        return toIndex;
      }
      if (fromIndex < prev && toIndex >= prev) {
        return prev - 1;
      }
      if (fromIndex > prev && toIndex <= prev) {
        return prev + 1;
      }
      return prev;
    });
  };

  const handleToggleTag = (tagName: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]
    );
  };

  const handleClearTags = () => {
    setSelectedTags([]);
  };

  // アルバム一覧のソート順
  const [albumSortOrder, setAlbumSortOrder] = useState<AlbumSortOrder>(() => {
    const saved = localStorage.getItem("tagPlayer_albumSortOrder");
    if (
      saved === "artist-title-year" ||
      saved === "artist-year-title" ||
      saved === "genre-artist-title-year" ||
      saved === "genre-artist-year-title"
    ) {
      return saved;
    }
    return "artist-title-year";
  });

  // アルバム一覧の絞り込み（タグ選択 ＆ アルバム検索: タイトルとタグ）
  const filteredAlbums = useMemo(() => {
    const query = albumSearchQuery.trim().toLowerCase();
    const queryTerms = query ? query.split(/\s+/).filter(Boolean) : [];

    return library.albums.filter((album) => {
      // タグ選択による絞り込み
      if (selectedTags.length > 0) {
        const matchesTags = matchAll
          ? selectedTags.every((tag) => album.tags.includes(tag))
          : selectedTags.some((tag) => album.tags.includes(tag));
        if (!matchesTags) return false;
      }

      // アルバム検索による絞り込み（タイトルとタグ）
      if (queryTerms.length > 0) {
        const titleLower = album.title.toLowerCase();
        const tagsLower = album.tags.map((t) => t.toLowerCase());

        const matchesAllTerms = queryTerms.every((term) => {
          return titleLower.includes(term) || tagsLower.some((t) => t.includes(term));
        });
        if (!matchesAllTerms) return false;
      }

      return true;
    });
  }, [library.albums, selectedTags, matchAll, albumSearchQuery]);

  // アルバム一覧のソート処理
  const sortedAlbums = useMemo(() => {
    const compareText = (a: string | undefined | null, b: string | undefined | null) => {
      const sA = (a ?? "").trim();
      const sB = (b ?? "").trim();
      if (!sA && !sB) return 0;
      if (!sA) return 1;
      if (!sB) return -1;
      return sA.localeCompare(sB, "ja", { sensitivity: "base" });
    };

    const compareYear = (a: number | undefined | null, b: number | undefined | null) => {
      const yA = a ?? 9999;
      const yB = b ?? 9999;
      return yA - yB;
    };

    return [...filteredAlbums].sort((a, b) => {
      const cmpArtist = compareText(a.artist, b.artist);
      const cmpTitle = compareText(a.title, b.title);
      const cmpYear = compareYear(a.release_year, b.release_year);
      const cmpGenre = compareText(a.genre, b.genre);

      switch (albumSortOrder) {
        case "artist-title-year":
          return cmpArtist || cmpTitle || cmpYear;
        case "artist-year-title":
          return cmpArtist || cmpYear || cmpTitle;
        case "genre-artist-title-year":
          return cmpGenre || cmpArtist || cmpTitle || cmpYear;
        case "genre-artist-year-title":
          return cmpGenre || cmpArtist || cmpYear || cmpTitle;
        default:
          return 0;
      }
    });
  }, [filteredAlbums, albumSortOrder]);

  // 曲一覧のソート順
  const [trackSortOrder, setTrackSortOrder] = useState<TrackSortOrder>(() => {
    const saved = localStorage.getItem("tagPlayer_trackSortOrder");
    if (saved === "artist-album-disc-track" || saved === "title") {
      return saved;
    }
    return "artist-album-disc-track";
  });

  // 曲一覧の絞り込み（曲検索: 曲タイトルとタグ）
  const filteredTagTracks = useMemo(() => {
    const query = trackSearchQuery.trim().toLowerCase();
    const queryTerms = query ? query.split(/\s+/).filter(Boolean) : [];

    if (queryTerms.length === 0) {
      return tagTracks;
    }

    return tagTracks.filter((track) => {
      const titleLower = track.title.toLowerCase();
      const tagsLower = (track.tags || []).map((t) => t.toLowerCase());

      return queryTerms.every((term) => {
        return titleLower.includes(term) || tagsLower.some((t) => t.includes(term));
      });
    });
  }, [tagTracks, trackSearchQuery]);

  // 曲一覧のソート処理
  const sortedTagTracks = useMemo(() => {
    const compareText = (a: string | undefined | null, b: string | undefined | null) => {
      const sA = (a ?? "").trim();
      const sB = (b ?? "").trim();
      if (!sA && !sB) return 0;
      if (!sA) return 1;
      if (!sB) return -1;
      return sA.localeCompare(sB, "ja", { sensitivity: "base" });
    };

    return [...filteredTagTracks].sort((a, b) => {
      if (trackSortOrder === "title") {
        const cmpTitle = compareText(a.title, b.title);
        if (cmpTitle !== 0) return cmpTitle;
        const artistA = a.artist || a.album_artist;
        const artistB = b.artist || b.album_artist;
        return compareText(artistA, artistB);
      }

      // "artist-album-disc-track": アーティスト > アルバムタイトル > ディスク > トラック
      const artistA = a.artist || a.album_artist;
      const artistB = b.artist || b.album_artist;
      const cmpArtist = compareText(artistA, artistB);
      if (cmpArtist !== 0) return cmpArtist;

      const cmpAlbum = compareText(a.album_title, b.album_title);
      if (cmpAlbum !== 0) return cmpAlbum;

      const discA = a.disc_number ?? 1;
      const discB = b.disc_number ?? 1;
      if (discA !== discB) return discA - discB;

      const trackA = a.track_number ?? 1;
      const trackB = b.track_number ?? 1;
      if (trackA !== trackB) return trackA - trackB;

      return compareText(a.title, b.title);
    });
  }, [filteredTagTracks, trackSortOrder]);

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
        <div className="flex items-center">
          <button
            onClick={() => setIsQueueOpen(!isQueueOpen)}
            className={`flex w-[calc(18rem-1rem)] items-center justify-between rounded-lg px-3.5 py-1.5 text-xs font-medium text-white transition active:scale-95 cursor-pointer shadow-sm ${
              isQueueOpen
                ? "bg-indigo-500 ring-1 ring-indigo-300/40"
                : "bg-indigo-600/90 hover:bg-indigo-500"
            }`}
            title="再生キューを表示"
          >
            <div className="flex items-center gap-2">
              <ListMusic className="h-3.5 w-3.5" />
              <span>再生キュー</span>
            </div>
            <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px] font-mono leading-none">
              {queue.length}
            </span>
          </button>
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
            <DatabasePlus className="h-3.5 w-3.5" />
            登録
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <TagSidebar
          tags={library.tags}
          viewMode={viewMode}
          selectedTags={selectedTags}
          matchAll={matchAll}
          onToggleMatchMode={() => setMatchAll(!matchAll)}
          onToggleTag={handleToggleTag}
          onClearTags={handleClearTags}
          onPlaySelectedTags={handlePlaySelectedTags}
          onQueueSelectedTags={handleQueueSelectedTags}
          playlists={playlists}
          onPlayPlaylist={handlePlaySavedPlaylist}
          onDeletePlaylist={handleDeletePlaylist}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-zinc-900/20 to-zinc-950 flex flex-col gap-4">
          {/* View Mode Switcher & Filter Info */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/60 gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSwitchViewMode("albums")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${viewMode === "albums"
                      ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                    }`}
                >
                  <Disc3 className="h-3.5 w-3.5" />
                  <span>アルバム</span>
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full border text-[10px] font-mono font-medium leading-none ${
                      viewMode === "albums"
                        ? "border-zinc-600 bg-zinc-900/80 text-zinc-200"
                        : "border-zinc-700/80 bg-zinc-950/60 text-zinc-400"
                    }`}
                  >
                    {sortedAlbums.length}
                  </span>
                </button>

                <button
                  onClick={() => handleSwitchViewMode("tracks")}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${viewMode === "tracks"
                      ? "bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                    }`}
                >
                  <Music2 className="h-3.5 w-3.5" />
                  <span>曲</span>
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full border text-[10px] font-mono font-medium leading-none ${
                      viewMode === "tracks"
                        ? "border-zinc-600 bg-zinc-900/80 text-zinc-200"
                        : "border-zinc-700/80 bg-zinc-950/60 text-zinc-400"
                    }`}
                  >
                    {sortedTagTracks.length}
                  </span>
                </button>
              </div>

              {/* アルバム並び順セレクタ (アルバムタブ選択時のみ表示) */}
              {viewMode === "albums" && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 border-l border-zinc-800 pl-3">
                  <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span className="text-[11px] text-zinc-400">並び順:</span>
                  <AlbumSortSelect
                    value={albumSortOrder}
                    onChange={(next) => {
                      setAlbumSortOrder(next);
                      try {
                        localStorage.setItem("tagPlayer_albumSortOrder", next);
                      } catch {}
                    }}
                  />
                </div>
              )}

              {/* 曲並び順セレクタ (曲タブ選択時のみ表示) */}
              {viewMode === "tracks" && (
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 border-l border-zinc-800 pl-3">
                  <ArrowUpDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                  <span className="text-[11px] text-zinc-400">並び順:</span>
                  <TrackSortSelect
                    value={trackSortOrder}
                    onChange={(next) => {
                      setTrackSortOrder(next);
                      try {
                        localStorage.setItem("tagPlayer_trackSortOrder", next);
                      } catch {}
                    }}
                  />
                </div>
              )}

              {/* アルバム検索フォーム (アルバムタブ選択時のみ表示) */}
              {viewMode === "albums" && (
                <div className="relative flex items-center w-48 sm:w-60 border-l border-zinc-800 pl-3">
                  <div className="relative w-full flex items-center">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                    <input
                      type="text"
                      value={albumSearchQuery}
                      onChange={(e) => setAlbumSearchQuery(e.target.value)}
                      placeholder="アルバム検索"
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-700 hover:border-zinc-600 pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none transition shadow-inner"
                    />
                    {albumSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setAlbumSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 rounded hover:bg-zinc-800/60 transition cursor-pointer"
                        title="検索ワードをクリア"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* 曲検索フォーム (曲タブ選択時のみ表示) */}
              {viewMode === "tracks" && (
                <div className="relative flex items-center w-48 sm:w-60 border-l border-zinc-800 pl-3">
                  <div className="relative w-full flex items-center">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                    <input
                      type="text"
                      value={trackSearchQuery}
                      onChange={(e) => setTrackSearchQuery(e.target.value)}
                      placeholder="曲検索"
                      className="w-full rounded-lg bg-zinc-950/70 border border-zinc-700 hover:border-zinc-600 pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none transition shadow-inner"
                    />
                    {trackSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setTrackSearchQuery("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 rounded hover:bg-zinc-800/60 transition cursor-pointer"
                        title="検索ワードをクリア"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {selectedTags.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">
                <span>選択中:</span>
                <div className="flex items-center gap-1 flex-wrap">
                  {selectedTags.map((tag) => {
                    const tagItem = library.tags.find((t) => t.name === tag);
                    const category = tagItem?.category || "other";
                    return (
                      <span
                        key={tag}
                        onClick={() => handleToggleTag(tag)}
                        className="px-2 py-0.5 rounded-full bg-zinc-900/80 border border-zinc-700/60 text-zinc-200 text-[10px] cursor-pointer hover:bg-zinc-800 transition flex items-center gap-1.5"
                        title="クリックで解除"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full shrink-0 ${categoryDotClasses[category]}`}
                        />
                        <span>{tag}</span>
                        <span className="text-[9px] text-zinc-400 hover:text-red-400">×</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {viewMode === "albums" ? (
            <AlbumGrid
              albums={sortedAlbums}
              searchQuery={albumSearchQuery}
              selectedTags={selectedTags}
              availableTags={library.tags}
              currentPlayingTrackId={currentTrack?.id}
              isPlaying={isPlaying}
              onOpenAlbumModal={handleOpenAlbumModal}
              onPlayAlbum={handlePlayAlbum}
              onQueueAlbum={handleQueueAlbum}
              onToggleTag={handleToggleTag}
            />
          ) : (
            <TrackList
              tracks={sortedTagTracks}
              searchQuery={trackSearchQuery}
              selectedTags={selectedTags}
              availableTags={library.tags}
              queue={queue}
              loading={loadingTagTracks}
              currentPlayingTrackId={currentTrack?.id}
              isPlaying={isPlaying}
              onPlayTrack={handlePlaySingleTrack}
              onQueueTrack={handleQueueSingleTrack}
              onPlayAll={handlePlayAllTracks}
              onQueueAll={handleQueueAllTracks}
              onToggleTag={handleToggleTag}
              onEditTrackTags={handleOpenTrackTagEdit}
            />
          )}
        </main>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-indigo-600/95 border border-indigo-400/40 text-white text-xs px-4 py-2 rounded-full shadow-2xl z-50 flex items-center gap-2 backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Check className="h-3.5 w-3.5 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Album Detail / Tag Edit Modal */}
      <AlbumDetailModal
        album={modalAlbum}
        initialEditingTrackId={modalTrackId}
        availableTags={library.tags}
        queue={queue}
        currentPlayingTrackId={currentTrack?.id}
        isPlaying={isPlaying}
        onClose={handleCloseAlbumModal}
        onSelectTrack={handleSelectTrackFromAlbum}
        onPlayTrack={handlePlaySingleTrack}
        onQueueTrack={handleQueueSingleTrack}
        onPlayAlbum={handlePlayAlbum}
        onQueueAlbum={handleQueueAlbum}
        onDeleteAlbum={handleDeleteAlbum}
        onTagsChanged={() => {
          loadLibrary();
          if (selectedTags.length > 0 || viewMode === "tracks") {
            loadTagTracks(selectedTags, matchAll);
          }
        }}
      />

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
        onReorderQueue={handleReorderQueue}
        isPlaying={isPlaying}
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
              className={`p-1 rounded transition cursor-pointer ${shuffle ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
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
              className={`p-1 rounded transition cursor-pointer ${repeatMode !== "off" ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300"
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

        {/* Volume Control */}
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
        </div>
      </footer>
    </div>
  );
}

export default App;
