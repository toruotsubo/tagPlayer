use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackStatus {
    pub is_playing: bool,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub volume: f64,
    pub current_file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagItem {
    pub id: i64,
    pub name: String,
    pub count: i64,
    pub target_type: String, // "album" または "track"
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Track {
    pub id: i64,
    pub album_id: i64,
    pub title: String,
    pub artist: Option<String>,
    pub composer: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub duration_secs: u32,
    pub file_path: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackWithAlbum {
    pub id: i64,
    pub album_id: i64,
    pub title: String,
    pub artist: Option<String>,
    pub composer: Option<String>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub duration_secs: u32,
    pub file_path: String,
    pub tags: Vec<String>,
    pub album_title: String,
    pub album_artist: String,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Playlist {
    pub id: i64,
    pub name: String,
    pub track_count: usize,
    pub created_at: String,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    pub id: i64,
    pub title: String,
    pub artist: String,
    pub release_year: Option<u32>,
    pub genre: Option<String>,
    pub cover_url: Option<String>,
    pub track_count: usize,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryData {
    pub albums: Vec<Album>,
    pub tags: Vec<TagItem>,
    pub total_tracks: usize,
}

#[derive(Debug, Clone)]
pub struct RawTrackMeta {
    pub file_path: String,
    pub title: String,
    pub album_title: String,
    pub album_artist: String,
    pub track_artist: Option<String>,
    pub composer: Option<String>,
    pub genre: Option<String>,
    pub release_year: Option<u32>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub duration_secs: u32,
    pub picture_data: Option<Vec<u8>>,
    pub picture_mime: Option<String>,
}
