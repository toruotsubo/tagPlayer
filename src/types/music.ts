export interface TagItem {
  id: number;
  name: string;
  count: number;
  target_type: "album" | "track" | "all";
}

export interface Track {
  id: number;
  album_id: number;
  title: string;
  artist?: string;
  composer?: string;
  track_number?: number;
  disc_number?: number;
  duration_secs: number;
  file_path: string;
  tags: string[];
}

export interface Album {
  id: number;
  title: string;
  artist: string;
  release_year?: number;
  genre?: string;
  cover_url?: string;
  track_count: number;
  tags: string[];
}

export interface LibraryData {
  albums: Album[];
  tags: TagItem[];
  total_tracks: number;
}

export interface PlaybackStatus {
  is_playing: boolean;
  position_secs: number;
  duration_secs: number;
  volume: number;
  current_file_path?: string | null;
}

export interface TrackWithAlbum extends Track {
  album_title: string;
  album_artist: string;
  cover_url?: string;
}

export interface Playlist {
  id: number;
  name: string;
  track_count: number;
  created_at: string;
}

export type RepeatMode = "off" | "all" | "one";



