pub mod db;
pub mod models;
pub mod player;
pub mod scanner;

use std::fs;
use std::path::PathBuf;
use rusqlite::Connection;
use tauri::{Manager, State};

use models::{Album, LibraryData, PlaybackStatus, Playlist, Track, TrackWithAlbum};
use player::PlayerManager;


fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    Ok(app_dir.join("library.db"))
}

fn get_cache_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let cache_dir = app_handle
        .path()
        .app_cache_dir()
        .map_err(|e| e.to_string())?;
    let covers_dir = cache_dir.join("covers");
    fs::create_dir_all(&covers_dir).map_err(|e| e.to_string())?;
    Ok(covers_dir)
}

fn cleanup_unused_covers(app_handle: &tauri::AppHandle) {
    let (db_path, covers_dir) = match (get_db_path(app_handle), get_cache_dir(app_handle)) {
        (Ok(db), Ok(covers)) => (db, covers),
        _ => return,
    };

    if !db_path.exists() {
        return;
    }

    let conn = match Connection::open(&db_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to open DB for cover cleanup: {}", e);
            return;
        }
    };

    let used_filenames = match db::get_all_used_cover_filenames(&conn) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("Failed to get used cover filenames: {}", e);
            return;
        }
    };

    if let Ok(entries) = fs::read_dir(&covers_dir) {
        for entry in entries.flatten() {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_file() {
                    let file_name = entry.file_name().to_string_lossy().to_lowercase();
                    if !used_filenames.contains(&file_name) {
                        let path = entry.path();
                        if let Err(e) = fs::remove_file(&path) {
                            eprintln!("Failed to remove unused cover {:?}: {}", path, e);
                        } else {
                            println!("Removed unused cover: {}", file_name);
                        }
                    }
                }
            }
        }
    }
}

#[tauri::command]
async fn scan_music_directory(
    app_handle: tauri::AppHandle,
    dir_path: String,
) -> Result<LibraryData, String> {
    let db_path = get_db_path(&app_handle)?;
    let cache_dir = get_cache_dir(&app_handle)?;

    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::init_db(&conn).map_err(|e| e.to_string())?;

    let dir = PathBuf::from(dir_path);
    if !dir.exists() {
        return Err("指定されたディレクトリが存在しません".to_string());
    }

    scanner::scan_and_save_directory(&mut conn, &dir, &cache_dir)
}

#[tauri::command]
async fn get_library_data(app_handle: tauri::AppHandle) -> Result<LibraryData, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::init_db(&conn).map_err(|e| e.to_string())?;

    let albums = db::get_all_albums(&conn).map_err(|e| e.to_string())?;
    let tags = db::get_all_tags(&conn).map_err(|e| e.to_string())?;

    let total_tracks = albums.iter().map(|a| a.track_count).sum();

    Ok(LibraryData {
        albums,
        tags,
        total_tracks,
    })
}

#[tauri::command]
async fn get_album_tracks(
    app_handle: tauri::AppHandle,
    album_id: i64,
) -> Result<Vec<Track>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::get_album_tracks(&conn, album_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn play_track(
    player: State<'_, PlayerManager>,
    file_path: String,
) -> Result<PlaybackStatus, String> {
    player.play(&file_path)?;
    Ok(player.get_status())
}

#[tauri::command]
async fn pause_playback(player: State<'_, PlayerManager>) -> Result<(), String> {
    player.pause()
}

#[tauri::command]
async fn resume_playback(player: State<'_, PlayerManager>) -> Result<(), String> {
    player.resume()
}

#[tauri::command]
async fn seek_playback(player: State<'_, PlayerManager>, position_secs: f64) -> Result<(), String> {
    player.seek(position_secs)
}

#[tauri::command]
async fn set_playback_volume(player: State<'_, PlayerManager>, volume: f64) -> Result<(), String> {
    player.set_volume(volume)
}

#[tauri::command]
async fn get_playback_status(player: State<'_, PlayerManager>) -> Result<PlaybackStatus, String> {
    Ok(player.get_status())
}

#[tauri::command]
async fn get_tracks_by_tags(
    app_handle: tauri::AppHandle,
    tags: Vec<String>,
    match_all: bool,
) -> Result<Vec<TrackWithAlbum>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::get_tracks_by_tags(&conn, &tags, match_all).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_playlist(
    app_handle: tauri::AppHandle,
    name: String,
    track_ids: Vec<i64>,
) -> Result<i64, String> {
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::save_playlist(&mut conn, &name, &track_ids).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_playlists(app_handle: tauri::AppHandle) -> Result<Vec<Playlist>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::get_all_playlists(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_playlist_tracks(
    app_handle: tauri::AppHandle,
    playlist_id: i64,
) -> Result<Vec<TrackWithAlbum>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::get_playlist_tracks(&conn, playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_playlist(
    app_handle: tauri::AppHandle,
    playlist_id: i64,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::delete_playlist(&conn, playlist_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_album(
    app_handle: tauri::AppHandle,
    album_id: i64,
) -> Result<Album, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::get_album(&conn, album_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_album_primary_tag(
    app_handle: tauri::AppHandle,
    album_id: i64,
    tag_name: String,
    is_primary: bool,
) -> Result<Album, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::set_album_primary_tag(&conn, album_id, &tag_name, is_primary).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_album_tag(
    app_handle: tauri::AppHandle,
    album_id: i64,
    tag_name: String,
    category: String,
) -> Result<Album, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::add_album_tag(&conn, album_id, &tag_name, &category).map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_album_tag(
    app_handle: tauri::AppHandle,
    album_id: i64,
    tag_name: String,
) -> Result<Album, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::remove_album_tag(&conn, album_id, &tag_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_track_tag(
    app_handle: tauri::AppHandle,
    track_id: i64,
    tag_name: String,
    category: String,
) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::add_track_tag(&conn, track_id, &tag_name, &category).map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_track_tag(
    app_handle: tauri::AppHandle,
    track_id: i64,
    tag_name: String,
) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::remove_track_tag(&conn, track_id, &tag_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn add_tracks_tag(
    app_handle: tauri::AppHandle,
    track_ids: Vec<i64>,
    tag_name: String,
    category: String,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::add_tracks_tag(&mut conn, &track_ids, &tag_name, &category).map_err(|e| e.to_string())
}

#[tauri::command]
async fn remove_tracks_tag(
    app_handle: tauri::AppHandle,
    track_ids: Vec<i64>,
    tag_name: String,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::remove_tracks_tag(&mut conn, &track_ids, &tag_name).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_album(
    app_handle: tauri::AppHandle,
    album_id: i64,
) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    db::delete_album(&mut conn, album_id).map_err(|e| e.to_string())?;
    cleanup_unused_covers(&app_handle);
    Ok(())
}

#[tauri::command]
async fn update_album_cover(
    app_handle: tauri::AppHandle,
    album_id: i64,
    source_file_path: String,
) -> Result<Album, String> {
    let source_path = PathBuf::from(&source_file_path);
    if !source_path.exists() || !source_path.is_file() {
        return Err("指定された画像ファイルが存在しません".to_string());
    }

    let ext = source_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();

    if !["jpg", "jpeg", "png", "webp", "bmp", "gif"].contains(&ext.as_str()) {
        return Err("対応していない画像形式です (jpg, png, webp, bmp, gif のみ)".to_string());
    }

    let covers_dir = get_cache_dir(&app_handle)?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);

    let filename = format!("cover_custom_{}_{}.{}", album_id, timestamp, ext);
    let target_path = covers_dir.join(&filename);

    fs::copy(&source_path, &target_path)
        .map_err(|e| format!("カバー画像の保存に失敗しました: {}", e))?;

    let target_path_str = target_path.to_string_lossy().to_string();

    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let album = db::update_album_cover(&conn, album_id, Some(&target_path_str)).map_err(|e| e.to_string())?;
    cleanup_unused_covers(&app_handle);
    Ok(album)
}

#[tauri::command]
async fn reset_album_cover(
    app_handle: tauri::AppHandle,
    album_id: i64,
) -> Result<Album, String> {
    let db_path = get_db_path(&app_handle)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    let album = db::update_album_cover(&conn, album_id, None).map_err(|e| e.to_string())?;
    cleanup_unused_covers(&app_handle);
    Ok(album)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let player_manager = PlayerManager::new().expect("Failed to initialize player manager");

    tauri::Builder::default()
        .manage(player_manager)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // アプリ起動時に未使用のカバー画像ファイルをクリーンアップ
            cleanup_unused_covers(app.handle());

            #[cfg(target_os = "windows")]
            {
                use std::ffi::c_void;

                #[link(name = "dwmapi")]
                extern "system" {
                    fn DwmSetWindowAttribute(
                        hwnd: *mut c_void,
                        dwAttribute: u32,
                        pvAttribute: *const c_void,
                        cbAttribute: u32,
                    ) -> i32;
                }

                if let Some(window) = app.get_webview_window("main") {
                    if let Ok(hwnd) = window.hwnd() {
                        let hwnd_ptr = hwnd.0 as *mut c_void;

                        // DWMWA_USE_IMMERSIVE_DARK_MODE = 20
                        let dark_mode: i32 = 1;
                        unsafe {
                            DwmSetWindowAttribute(
                                hwnd_ptr,
                                20,
                                &dark_mode as *const _ as *const c_void,
                                std::mem::size_of::<i32>() as u32,
                            );
                        }

                        // DWMWA_CAPTION_COLOR = 35 (Windows 11: 0x00BBGGRR)
                        // #18181b -> R=0x18, G=0x18, B=0x1b -> 0x001b1818
                        let caption_color: u32 = 0x001b1818;
                        unsafe {
                            DwmSetWindowAttribute(
                                hwnd_ptr,
                                35,
                                &caption_color as *const _ as *const c_void,
                                std::mem::size_of::<u32>() as u32,
                            );
                        }

                        // DWMWA_TEXT_COLOR = 36 (Windows 11: 0x00BBGGRR)
                        // #e4e4e7 -> R=0xe4, G=0xe4, B=0xe7 -> 0x00e7e4e4
                        let text_color: u32 = 0x00e7e4e4;
                        unsafe {
                            DwmSetWindowAttribute(
                                hwnd_ptr,
                                36,
                                &text_color as *const _ as *const c_void,
                                std::mem::size_of::<u32>() as u32,
                            );
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_music_directory,
            get_library_data,
            get_album_tracks,
            play_track,
            pause_playback,
            resume_playback,
            seek_playback,
            set_playback_volume,
            get_playback_status,
            get_tracks_by_tags,
            save_playlist,
            get_playlists,
            get_playlist_tracks,
            delete_playlist,
            get_album,
            set_album_primary_tag,
            add_album_tag,
            remove_album_tag,
            add_track_tag,
            remove_track_tag,
            add_tracks_tag,
            remove_tracks_tag,
            delete_album,
            update_album_cover,
            reset_album_cover,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}





