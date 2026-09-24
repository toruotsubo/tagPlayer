use std::collections::HashMap;
use std::fs;
use std::path::Path;

use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::db::{get_all_albums, get_all_tags, get_or_create_tag_with_category};
use crate::models::{LibraryData, RawTrackMeta};

const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "flac", "m4a", "wma", "wav", "ogg", "aac"];

pub fn is_supported_audio(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        SUPPORTED_EXTENSIONS.iter().any(|&s| s.eq_ignore_ascii_case(ext))
    } else {
        false
    }
}

pub fn find_folder_cover(dir: &Path) -> Option<(Vec<u8>, Option<String>)> {
    if !dir.is_dir() {
        return None;
    }

    let candidates = [
        "folder.jpg",
        "folder.jpeg",
        "folder.png",
        "cover.jpg",
        "cover.jpeg",
        "cover.png",
        "albumartsmall.jpg",
    ];

    if let Ok(entries) = fs::read_dir(dir) {
        let mut all_files = Vec::new();
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_file() {
                    all_files.push(entry.path());
                }
            }
        }

        // 1. Check exact candidate names (case-insensitive)
        for cand in candidates {
            if let Some(found) = all_files.iter().find(|p| {
                p.file_name()
                    .and_then(|f| f.to_str())
                    .map(|s| s.eq_ignore_ascii_case(cand))
                    .unwrap_or(false)
            }) {
                if let Ok(data) = fs::read(found) {
                    let mime = if found.extension().map(|e| e.eq_ignore_ascii_case("png")).unwrap_or(false) {
                        Some("image/png".to_string())
                    } else {
                        Some("image/jpeg".to_string())
                    };
                    return Some((data, mime));
                }
            }
        }

        // 2. Check AlbumArt*Large.jpg or AlbumArt*.jpg
        if let Some(found) = all_files.iter().find(|p| {
            p.file_name()
                .and_then(|f| f.to_str())
                .map(|s| {
                    let lower = s.to_ascii_lowercase();
                    lower.starts_with("albumart") && (lower.ends_with(".jpg") || lower.ends_with(".png") || lower.ends_with(".jpeg"))
                })
                .unwrap_or(false)
        }) {
            if let Ok(data) = fs::read(found) {
                return Some((data, Some("image/jpeg".to_string())));
            }
        }

        // 3. Any image in directory
        if let Some(found) = all_files.iter().find(|p| {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| {
                    let lower = e.to_ascii_lowercase();
                    lower == "jpg" || lower == "jpeg" || lower == "png"
                })
                .unwrap_or(false)
        }) {
            if let Ok(data) = fs::read(found) {
                return Some((data, Some("image/jpeg".to_string())));
            }
        }
    }

    None
}

pub fn parse_disc_from_string(s: &str) -> Option<u32> {
    let lower = s.to_ascii_lowercase();

    // 1. "disc", "disk", "cd", "vol.", "volume" などのキーワード探索
    // [Disc 1], (Disc 2), Disc 1, CD1, [CD 2], Volume 3 などに対応
    let keywords = ["disc", "disk", "cd", "vol.", "volume"];

    for kw in &keywords {
        let mut search_from = 0;
        while let Some(pos) = lower[search_from..].find(kw) {
            let actual_pos = search_from + pos;
            let after_kw = &lower[actual_pos + kw.len()..];

            // 直前が英数字でないこと（単語境界の確認。例: "discover", "acid" などを除外）
            let prev_char = if actual_pos > 0 {
                lower[..actual_pos].chars().last()
            } else {
                None
            };
            let is_word_boundary = prev_char.map(|c| !c.is_ascii_alphanumeric()).unwrap_or(true);

            if is_word_boundary {
                // after_kw の先頭にある空白や記号（-, _, ., :, 空白）をスキップ
                let trimmed = after_kw.trim_start_matches(|c: char| c == ' ' || c == '-' || c == '_' || c == '.' || c == ':');
                // 先頭の連続する数字を取得
                let digits: String = trimmed.chars().take_while(|c| c.is_ascii_digit()).collect();
                if !digits.is_empty() {
                    if let Ok(num) = digits.parse::<u32>() {
                        if num > 0 && num < 100 {
                            // 数字の直後が英字でないこと（例: "cd100mb" などを除外）
                            let next_char = trimmed[digits.len()..].chars().next();
                            let is_end_boundary = next_char.map(|c| !c.is_ascii_alphabetic()).unwrap_or(true);
                            if is_end_boundary {
                                return Some(num);
                            }
                        }
                    }
                }
            }

            search_from = actual_pos + kw.len();
        }
    }

    // 2. "side a", "side b", "side 1", "side 2" 等
    if let Some(pos) = lower.find("side") {
        let prev_char = if pos > 0 { lower[..pos].chars().last() } else { None };
        if prev_char.map(|c| !c.is_ascii_alphanumeric()).unwrap_or(true) {
            let after = lower[pos + 4..].trim_start_matches(|c: char| c == ' ' || c == '-' || c == '_');
            if let Some(c) = after.chars().next() {
                match c {
                    'a' | '1' => return Some(1),
                    'b' | '2' => return Some(2),
                    'c' | '3' => return Some(3),
                    'd' | '4' => return Some(4),
                    _ => {}
                }
            }
        }
    }

    None
}

pub fn is_disc_folder_name(name: &str) -> bool {
    parse_disc_from_string(name).is_some()
}

pub fn parse_disc_from_filename(stem: &str) -> Option<u32> {
    let lower = stem.trim().to_ascii_lowercase();

    // 1. "cd1-01", "disc2-05", "d1_01", "cd02 01" 等
    for prefix in &["disc", "disk", "cd", "d"] {
        if let Some(rest) = lower.strip_prefix(prefix) {
            let trimmed = rest.trim_matches(|c: char| c == ' ' || c == '-' || c == '_');
            if let Some(idx) = trimmed.find(|c: char| c == '-' || c == '.' || c == '_' || c == ' ') {
                let disc_part = &trimmed[..idx];
                if let Ok(num) = disc_part.parse::<u32>() {
                    if num > 0 && num < 50 {
                        return Some(num);
                    }
                }
            }
        }
    }

    // 2. "1-01 ...", "2-05 ...", "01-02 ...", "1.01 ...", "1_01 ..."
    let parts: Vec<&str> = stem.split(&['-', '_', '.'][..]).collect();
    if parts.len() >= 2 {
        let p0 = parts[0].trim();
        let p1 = parts[1].trim();
        if let Ok(d) = p0.parse::<u32>() {
            if d > 0 && d < 20 {
                let has_track_digit = p1.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false);
                if has_track_digit {
                    return Some(d);
                }
            }
        }
    }

    None
}

pub fn extract_disc_from_path(path: &Path) -> Option<u32> {
    // 1. 親ディレクトリ名
    if let Some(parent) = path.parent().and_then(|p| p.file_name()).and_then(|f| f.to_str()) {
        if let Some(d) = parse_disc_from_string(parent) {
            return Some(d);
        }
    }
    // 2. 親の親ディレクトリ名 (例: Album/Disc 1/Sub/file.mp3 などの場合)
    if let Some(grandparent) = path.parent().and_then(|p| p.parent()).and_then(|p| p.file_name()).and_then(|f| f.to_str()) {
        if let Some(d) = parse_disc_from_string(grandparent) {
            return Some(d);
        }
    }
    // 3. ファイル名
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        if let Some(d) = parse_disc_from_string(stem).or_else(|| parse_disc_from_filename(stem)) {
            return Some(d);
        }
    }
    None
}

pub fn extract_track_from_path(path: &Path) -> Option<u32> {
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        let stem = stem.trim();
        let parts: Vec<&str> = stem.split(&['-', '_', '.'][..]).collect();
        if parts.len() >= 2 {
            let p0 = parts[0].trim();
            let p1 = parts[1].trim();
            if let Ok(_) = p0.parse::<u32>() {
                let track_digits: String = p1.chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(t) = track_digits.parse::<u32>() {
                    if t > 0 && t < 1000 {
                        return Some(t);
                    }
                }
            }
        }

        let leading_digits: String = stem.chars().take_while(|c| c.is_ascii_digit()).collect();
        if !leading_digits.is_empty() {
            if let Ok(t) = leading_digits.parse::<u32>() {
                if t > 0 && t < 1000 {
                    return Some(t);
                }
            }
        }
    }
    None
}

fn read_track_metadata_lofty(path: &Path) -> Option<RawTrackMeta> {
    let tagged_file = Probe::open(path).ok()?.read().ok()?;
    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());
    let properties = tagged_file.properties();

    let file_path = path.to_string_lossy().to_string();
    let file_stem = path.file_stem()?.to_string_lossy().to_string();

    let title = tag
        .and_then(|t| t.get_string(&ItemKey::TrackTitle))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| file_stem.clone());

    let parent_name = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let grandparent_name = path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let great_grandparent_name = path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let (fallback_album, fallback_artist) = if let Some(ref pn) = parent_name {
        if is_disc_folder_name(pn) {
            (grandparent_name.clone(), great_grandparent_name)
        } else {
            (parent_name.clone(), grandparent_name.clone())
        }
    } else {
        (None, None)
    };

    let album_title = tag
        .and_then(|t| t.get_string(&ItemKey::AlbumTitle))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or(fallback_album)
        .unwrap_or_else(|| "Unknown Album".to_string());

    let track_artist = tag
        .and_then(|t| t.get_string(&ItemKey::TrackArtist))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let album_artist = tag
        .and_then(|t| t.get_string(&ItemKey::AlbumArtist))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| track_artist.clone())
        .or(fallback_artist)
        .unwrap_or_else(|| "Unknown Artist".to_string());

    let composer = tag
        .and_then(|t| t.get_string(&ItemKey::Composer))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let genre = tag
        .and_then(|t| t.get_string(&ItemKey::Genre))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let release_year = tag.and_then(|t| t.year());

    let track_number = tag
        .and_then(|t| t.track())
        .or_else(|| {
            tag.and_then(|t| {
                t.get_string(&ItemKey::TrackNumber)
                    .and_then(|s| s.split(&['/', ' '][..]).next().and_then(|p| p.trim().parse::<u32>().ok()))
            })
        })
        .or_else(|| extract_track_from_path(path));

    let disc_number = tag
        .and_then(|t| t.disk())
        .or_else(|| {
            tag.and_then(|t| {
                t.get_string(&ItemKey::DiscNumber)
                    .and_then(|s| s.split(&['/', ' '][..]).next().and_then(|p| p.trim().parse::<u32>().ok()))
            })
        })
        .or_else(|| extract_disc_from_path(path));

    let duration_secs = properties.duration().as_secs() as u32;

    let mut picture_data = None;
    let mut picture_mime = None;

    if let Some(t) = tag {
        if let Some(pic) = t.pictures().first() {
            picture_data = Some(pic.data().to_vec());
            picture_mime = pic.mime_type().map(|m| m.as_str().to_string());
        }
    }

    Some(RawTrackMeta {
        file_path,
        title,
        album_title,
        album_artist,
        track_artist,
        composer,
        genre,
        release_year,
        track_number,
        disc_number,
        duration_secs,
        picture_data,
        picture_mime,
    })
}

/// WMA (ASF形式) のヘッダーから Content Description Object を解析し、Author (曲のアーティスト) を取得する
pub fn read_asf_author(path: &Path) -> Option<String> {
    use std::fs::File;
    use std::io::Read;

    let mut file = File::open(path).ok()?;
    let mut header_buf = [0u8; 24];
    file.read_exact(&mut header_buf).ok()?;

    // ASF Header Object GUID: 30 26 B2 75 8E 66 CF 11 A6 D9 00 AA 00 62 CE 6C
    const ASF_HEADER_GUID: [u8; 16] = [
        0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
    ];
    if header_buf[..16] != ASF_HEADER_GUID {
        return None;
    }

    let header_size = u64::from_le_bytes(header_buf[16..24].try_into().ok()?);
    let read_size = (header_size as usize).min(1024 * 1024).max(24);

    let mut buf = vec![0u8; read_size];
    buf[..24].copy_from_slice(&header_buf);
    let _ = file.read_exact(&mut buf[24..read_size]);

    // ASF Content Description Object GUID: 33 26 B2 75 8E 66 CF 11 A6 D9 00 AA 00 62 CE 6C
    const CONTENT_DESC_GUID: [u8; 16] = [
        0x33, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce, 0x6c,
    ];

    let guid_pos = buf.windows(16).position(|window| window == CONTENT_DESC_GUID)?;

    let lengths_offset = guid_pos + 16 + 8;
    if lengths_offset + 10 > buf.len() {
        return None;
    }

    let title_len = u16::from_le_bytes(buf[lengths_offset..lengths_offset + 2].try_into().ok()?) as usize;
    let author_len = u16::from_le_bytes(buf[lengths_offset + 2..lengths_offset + 4].try_into().ok()?) as usize;

    if author_len == 0 {
        return None;
    }

    let data_offset = lengths_offset + 10;
    let author_offset = data_offset + title_len;
    if author_offset + author_len > buf.len() {
        return None;
    }

    let author_bytes = &buf[author_offset..author_offset + author_len];
    let u16_chars: Vec<u16> = author_bytes
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();

    let author_str = String::from_utf16_lossy(&u16_chars);
    let trimmed = author_str.trim_matches(|c: char| c == '\0' || c.is_whitespace());
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(windows)]
fn read_track_metadata_windows(path: &Path) -> Option<RawTrackMeta> {
    use windows::core::HSTRING;
    use windows::Storage::StorageFile;

    let path_str = path.to_str()?;
    let hpath = HSTRING::from(path_str);
    let file = StorageFile::GetFileFromPathAsync(&hpath).ok()?.get().ok()?;
    let props = file.Properties().ok()?;
    let music_props = props.GetMusicPropertiesAsync().ok()?.get().ok()?;

    let file_path = path.to_string_lossy().to_string();
    let file_stem = path.file_stem()?.to_string_lossy().to_string();

    let title = music_props
        .Title()
        .ok()
        .map(|h| h.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| file_stem.clone());

    let parent_name = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let grandparent_name = path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let great_grandparent_name = path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let (fallback_album, fallback_artist) = if let Some(ref pn) = parent_name {
        if is_disc_folder_name(pn) {
            (grandparent_name.clone(), great_grandparent_name)
        } else {
            (parent_name.clone(), grandparent_name.clone())
        }
    } else {
        (None, None)
    };

    let album_title = music_props
        .Album()
        .ok()
        .map(|h| h.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty())
        .or(fallback_album)
        .unwrap_or_else(|| "Unknown Album".to_string());

    // WMA 等で Windows MusicProperties.Artist() がコンピレーションの AlbumArtist と同じになるケースがあるため、
    // まず WMA の Author ヘッダー属性を優先し、無ければ MusicProperties.Artist() を使用する
    let asf_author = read_asf_author(path);
    let track_artist = asf_author.or_else(|| {
        music_props
            .Artist()
            .ok()
            .map(|h| h.to_string_lossy().trim().to_string())
            .filter(|s| !s.is_empty())
    });

    let album_artist = music_props
        .AlbumArtist()
        .ok()
        .map(|h| h.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty())
        .or_else(|| track_artist.clone())
        .or(fallback_artist)
        .unwrap_or_else(|| "Unknown Artist".to_string());

    let mut composer = None;
    if let Ok(composers) = music_props.Composers() {
        if let Ok(size) = composers.Size() {
            if size > 0 {
                if let Ok(c) = composers.GetAt(0) {
                    let c_str = c.to_string_lossy().trim().to_string();
                    if !c_str.is_empty() {
                        composer = Some(c_str);
                    }
                }
            }
        }
    }

    let mut genre = None;
    if let Ok(genres) = music_props.Genre() {
        if let Ok(size) = genres.Size() {
            if size > 0 {
                if let Ok(g) = genres.GetAt(0) {
                    let g_str = g.to_string_lossy().trim().to_string();
                    if !g_str.is_empty() {
                        genre = Some(g_str);
                    }
                }
            }
        }
    }

    let track_number = match music_props.TrackNumber() {
        Ok(0) => extract_track_from_path(path),
        Ok(n) => Some(n),
        Err(_) => extract_track_from_path(path),
    };

    let release_year = match music_props.Year() {
        Ok(0) => None,
        Ok(y) => Some(y),
        Err(_) => None,
    };

    let duration_secs = match music_props.Duration() {
        Ok(ts) => (ts.Duration / 10_000_000).max(0) as u32,
        Err(_) => 0,
    };

    let disc_number = extract_disc_from_path(path);

    Some(RawTrackMeta {
        file_path,
        title,
        album_title,
        album_artist,
        track_artist,
        composer,
        genre,
        release_year,
        track_number,
        disc_number,
        duration_secs,
        picture_data: None,
        picture_mime: None,
    })
}

fn read_track_metadata_fallback(path: &Path) -> RawTrackMeta {
    let file_path = path.to_string_lossy().to_string();
    let file_stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let parent_name = path
        .parent()
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let grandparent_name = path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let great_grandparent_name = path
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().trim().to_string())
        .filter(|s| !s.is_empty());

    let (fallback_album, fallback_artist) = if let Some(ref pn) = parent_name {
        if is_disc_folder_name(pn) {
            (grandparent_name, great_grandparent_name)
        } else {
            (parent_name, grandparent_name)
        }
    } else {
        (None, None)
    };

    RawTrackMeta {
        file_path,
        title: file_stem,
        album_title: fallback_album.unwrap_or_else(|| "Unknown Album".to_string()),
        album_artist: fallback_artist.unwrap_or_else(|| "Unknown Artist".to_string()),
        track_artist: None,
        composer: None,
        genre: None,
        release_year: None,
        track_number: extract_track_from_path(path),
        disc_number: extract_disc_from_path(path),
        duration_secs: 0,
        picture_data: None,
        picture_mime: None,
    }
}

pub fn read_track_metadata(path: &Path) -> Option<RawTrackMeta> {
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

    let mut meta = if ext.eq_ignore_ascii_case("wma") {
        #[cfg(windows)]
        let m = read_track_metadata_windows(path);
        #[cfg(not(windows))]
        let m: Option<RawTrackMeta> = None;

        m.or_else(|| read_track_metadata_lofty(path))
    } else {
        read_track_metadata_lofty(path).or_else(|| {
            #[cfg(windows)]
            {
                read_track_metadata_windows(path)
            }
            #[cfg(not(windows))]
            {
                None
            }
        })
    };

    if let Some(ref mut m) = meta {
        if m.disc_number.is_none() {
            m.disc_number = extract_disc_from_path(path);
        }
        if m.track_number.is_none() {
            m.track_number = extract_track_from_path(path);
        }
    }

    meta.or_else(|| Some(read_track_metadata_fallback(path)))
}

/// アルバムタグ・曲タグの重複省略ルールを計算するヘルパー
pub fn compute_default_tags(
    album_artist: &str,
    track_artist: Option<&str>,
    composer: Option<&str>,
    genre: Option<&str>,
    release_year: Option<u32>,
) -> (Vec<String>, Vec<String>) {
    let mut album_tags = Vec::new();
    let mut track_tags = Vec::new();

    // 1. アルバムタグ: ジャンル、アルバムアーティスト名、リリース年
    if let Some(g) = genre {
        let trimmed = g.trim();
        if !trimmed.is_empty() {
            album_tags.push(trimmed.to_string());
        }
    }

    let trimmed_album_artist = album_artist.trim();
    if !trimmed_album_artist.is_empty() && !trimmed_album_artist.eq_ignore_ascii_case("Unknown Artist") {
        album_tags.push(trimmed_album_artist.to_string());
    }

    if let Some(y) = release_year {
        if y > 0 {
            album_tags.push(y.to_string());
        }
    }

    // 2. 曲タグ: トラックアーティスト名、作曲者名
    // ルール①: アルバムアーティスト名とトラックアーティスト名が同じ場合、トラックアーティスト名のタグづけは省略。
    let mut effective_track_artist: Option<&str> = None;
    if let Some(ta) = track_artist {
        let trimmed_ta = ta.trim();
        if !trimmed_ta.is_empty()
            && !trimmed_ta.eq_ignore_ascii_case(trimmed_album_artist)
        {
            track_tags.push(trimmed_ta.to_string());
            effective_track_artist = Some(trimmed_ta);
        }
    }

    // ルール②: トラックアーティスト名と作曲者名が同じ場合、作曲者名のタグづけは省略。
    // ※ トラックアーティスト名が省略された場合、または指定されている場合、直前のアーティスト名と比較
    if let Some(comp) = composer {
        let trimmed_comp = comp.trim();
        if !trimmed_comp.is_empty() {
            let artist_to_compare = effective_track_artist
                .or_else(|| track_artist.map(|s| s.trim()))
                .unwrap_or(trimmed_album_artist);

            if !trimmed_comp.eq_ignore_ascii_case(artist_to_compare) {
                track_tags.push(trimmed_comp.to_string());
            }
        }
    }

    (album_tags, track_tags)
}

pub fn save_cover_art(
    cache_dir: &Path,
    album_key: &str,
    data: &[u8],
    mime: Option<&str>,
) -> Option<String> {
    let mut hasher = Sha256::new();
    hasher.update(album_key.as_bytes());
    let hash = format!("{:x}", hasher.finalize());

    let ext = match mime {
        Some("image/png") => "png",
        Some("image/webp") => "webp",
        _ => "jpg",
    };

    let filename = format!("cover_{}.{}", &hash[..16], ext);
    let target_path = cache_dir.join(&filename);

    if !target_path.exists() {
        let _ = fs::create_dir_all(cache_dir);
        if fs::write(&target_path, data).is_err() {
            return None;
        }
    }

    Some(target_path.to_string_lossy().to_string())
}

pub fn scan_and_save_directory(
    conn: &mut Connection,
    dir_path: &Path,
    cache_dir: &Path,
) -> Result<LibraryData, String> {
    let mut files = Vec::new();
    for entry in WalkDir::new(dir_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() && is_supported_audio(path) {
            files.push(path.to_path_buf());
        }
    }

    if files.is_empty() {
        let albums = get_all_albums(conn).map_err(|e| e.to_string())?;
        let tags = get_all_tags(conn).map_err(|e| e.to_string())?;
        return Ok(LibraryData {
            albums,
            tags,
            total_tracks: 0,
        });
    }

    // トラックメタデータを抽出
    let mut raw_tracks = Vec::new();
    for path in &files {
        if let Some(meta) = read_track_metadata(path) {
            raw_tracks.push(meta);
        }
    }

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // アルバム単位にグループ化
    struct AlbumGroup {
        title: String,
        artist: String,
        genre: Option<String>,
        year: Option<u32>,
        cover_data: Option<(Vec<u8>, Option<String>)>,
        tracks: Vec<RawTrackMeta>,
    }

    let mut album_groups: HashMap<(String, String), AlbumGroup> = HashMap::new();

    for meta in raw_tracks {
        let key = (meta.album_title.clone(), meta.album_artist.clone());
        let entry = album_groups.entry(key).or_insert_with(|| AlbumGroup {
            title: meta.album_title.clone(),
            artist: meta.album_artist.clone(),
            genre: meta.genre.clone(),
            year: meta.release_year,
            cover_data: meta.picture_data.as_ref().map(|d| (d.clone(), meta.picture_mime.clone())),
            tracks: Vec::new(),
        });

        if entry.cover_data.is_none() && meta.picture_data.is_some() {
            entry.cover_data = meta.picture_data.as_ref().map(|d| (d.clone(), meta.picture_mime.clone()));
        }
        if entry.genre.is_none() && meta.genre.is_some() {
            entry.genre = meta.genre.clone();
        }
        if entry.year.is_none() && meta.release_year.is_some() {
            entry.year = meta.release_year;
        }

        entry.tracks.push(meta);
    }

    let mut total_tracks_inserted = 0;

    for ((_, _), group) in album_groups {
        let cover_data = group.cover_data.or_else(|| {
            if let Some(first_track) = group.tracks.first() {
                let track_path = Path::new(&first_track.file_path);
                track_path.parent().and_then(find_folder_cover)
            } else {
                None
            }
        });

        let cover_url = if let Some((data, mime)) = cover_data {
            let key = format!("{}-{}", group.title, group.artist);
            save_cover_art(cache_dir, &key, &data, mime.as_deref())
        } else {
            None
        };

        // アルバムレコードを登録 (INSERT OR IGNORE)
        tx.execute(
            "
            INSERT INTO albums (title, artist, release_year, genre, cover_url)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ON CONFLICT(title, artist) DO UPDATE SET
                release_year = COALESCE(excluded.release_year, albums.release_year),
                genre = COALESCE(excluded.genre, albums.genre),
                cover_url = COALESCE(excluded.cover_url, albums.cover_url)
            ",
            params![group.title, group.artist, group.year, group.genre, cover_url],
        ).map_err(|e| e.to_string())?;

        let album_id: i64 = tx.query_row(
            "SELECT id FROM albums WHERE title = ?1 AND artist = ?2",
            params![group.title, group.artist],
            |row| row.get(0),
        ).map_err(|e| e.to_string())?;

        // アルバムデフォルトタグの登録
        let (album_tags, _) = compute_default_tags(
            &group.artist,
            None,
            None,
            group.genre.as_deref(),
            group.year,
        );

        for at in album_tags {
            let category = if group.genre.as_deref() == Some(at.as_str()) {
                "genre"
            } else if at == group.artist {
                "artist"
            } else if group.year.map(|year| year.to_string()) == Some(at.clone()) {
                "release_year"
            } else {
                "other"
            };
            if let Ok(tag_id) = get_or_create_tag_with_category(&tx, &at, category) {
                if tag_id > 0 {
                    let _ = tx.execute(
                        "INSERT OR IGNORE INTO album_tags (album_id, tag_id) VALUES (?1, ?2)",
                        params![album_id, tag_id],
                    );
                }
            }
        }

        // トラックの登録
        for track_meta in group.tracks {
            tx.execute(
                "
                INSERT INTO tracks (album_id, title, artist, composer, track_number, disc_number, duration_secs, file_path)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                ON CONFLICT(file_path) DO UPDATE SET
                    title = excluded.title,
                    artist = excluded.artist,
                    composer = excluded.composer,
                    track_number = excluded.track_number,
                    disc_number = excluded.disc_number,
                    duration_secs = excluded.duration_secs
                ",
                params![
                    album_id,
                    track_meta.title,
                    track_meta.track_artist,
                    track_meta.composer,
                    track_meta.track_number,
                    track_meta.disc_number,
                    track_meta.duration_secs,
                    track_meta.file_path,
                ],
            ).map_err(|e| e.to_string())?;

            let track_id: i64 = tx.query_row(
                "SELECT id FROM tracks WHERE file_path = ?1",
                params![track_meta.file_path],
                |row| row.get(0),
            ).map_err(|e| e.to_string())?;

            total_tracks_inserted += 1;

            // 曲デフォルトタグの登録
            let (_, track_tags) = compute_default_tags(
                &group.artist,
                track_meta.track_artist.as_deref(),
                track_meta.composer.as_deref(),
                None,
                None,
            );

            for tt in track_tags {
                let category = if track_meta.track_artist.as_deref() == Some(tt.as_str()) {
                    "artist"
                } else {
                    "other"
                };
                if let Ok(tag_id) = get_or_create_tag_with_category(&tx, &tt, category) {
                    if tag_id > 0 {
                        let _ = tx.execute(
                            "INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?1, ?2)",
                            params![track_id, tag_id],
                        );
                    }
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    let albums = get_all_albums(conn).map_err(|e| e.to_string())?;
    let tags = get_all_tags(conn).map_err(|e| e.to_string())?;

    Ok(LibraryData {
        albums,
        tags,
        total_tracks: total_tracks_inserted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_default_tags_rule() {
        // 条件1: アルバムアーティストとトラックアーティストが同一、トラックアーティストと作曲者が同一の場合
        let (album_tags, track_tags) = compute_default_tags(
            "米津玄師",
            Some("米津玄師"),
            Some("米津玄師"),
            Some("J-POP"),
            Some(2020),
        );
        assert_eq!(album_tags, vec!["J-POP", "米津玄師", "2020"]);
        assert!(track_tags.is_empty(), "アーティストと作曲者が同一の場合は曲タグは省略");

        // 条件2: トラックアーティストがアルバムアーティストと異なる場合
        let (album_tags2, track_tags2) = compute_default_tags(
            "Various Artists",
            Some("椎名林檎"),
            Some("椎名林檎"),
            Some("Rock"),
            Some(2015),
        );
        assert_eq!(album_tags2, vec!["Rock", "Various Artists", "2015"]);
        assert_eq!(track_tags2, vec!["椎名林檎"], "トラックアーティストが付与され、作曲者（同一）は省略");

        // 条件3: トラックアーティストと作曲者が異なる場合
        let (_, track_tags3) = compute_default_tags(
            "宇多田ヒカル",
            Some("宇多田ヒカル"),
            Some("小室哲哉"),
            Some("Pop"),
            None,
        );
        assert_eq!(track_tags3, vec!["小室哲哉"], "トラックアーティストはアルバムと同一で省略、異なる作曲者のみ付与");
    }

    #[test]
    fn test_read_doors_wma_metadata() {
        let p = std::path::Path::new(r"D:\Music\The Doors\Legacy- The Absolute Best Disc 1\01 Break on Through (To the Other Side).wma");
        if p.exists() {
            let meta = read_track_metadata(p);
            assert!(meta.is_some(), "Should read metadata from WMA");
            let m = meta.unwrap();
            println!("Title: {}", m.title);
            println!("Album: {}", m.album_title);
            println!("Artist: {}", m.album_artist);
            println!("Duration: {}s", m.duration_secs);
            assert_eq!(m.title, "Break on Through (To the Other Side)");
            assert!(m.album_title.contains("Legacy"));
            assert_eq!(m.album_artist, "The Doors");
            assert!(m.duration_secs > 0);
        }
    }

    #[test]
    fn test_find_folder_cover() {
        let p = std::path::Path::new(r"D:\Music\The Doors\Legacy- The Absolute Best Disc 1");
        if p.exists() {
            let cover = find_folder_cover(p);
            assert!(cover.is_some(), "Should find Folder.jpg in album directory");
            let (data, mime) = cover.unwrap();
            assert!(!data.is_empty());
            assert_eq!(mime, Some("image/jpeg".to_string()));
            println!("Found cover art of {} bytes", data.len());
        }
    }

    #[test]
    fn test_scan_and_save_doors_album() {
        let p = std::path::Path::new(r"D:\Music\The Doors\Legacy- The Absolute Best Disc 1");
        if p.exists() {
            let mut conn = Connection::open_in_memory().unwrap();
            crate::db::init_db(&conn).unwrap();
            let temp_cache = std::env::temp_dir().join("tagPlayer_test_covers");
            let result = scan_and_save_directory(&mut conn, p, &temp_cache).unwrap();
            println!("Albums found: {}", result.albums.len());
            println!("Total tracks: {}", result.total_tracks);
            println!("Tags: {:?}", result.tags.iter().map(|t| &t.name).collect::<Vec<_>>());
            assert_eq!(result.albums.len(), 1);
            assert_eq!(result.total_tracks, 19);
            assert!(!result.tags.is_empty());
            assert!(result.albums[0].cover_url.is_some());
        }
    }

    #[test]
    fn test_read_debussy_wma() {
        let p = std::path::Path::new(r"D:\Music\Various Artists\Debussy- Les Trois Sonates, The Late Works\01 Debussy- Violin Sonata In G Minor, L 140 - 1. Allegro Vivo.wma");
        if p.exists() {
            let meta = read_track_metadata(p).expect("Should read metadata");
            println!("DEBUG META: title={}", meta.title);
            println!("DEBUG META: album_title={}", meta.album_title);
            println!("DEBUG META: album_artist={}", meta.album_artist);
            println!("DEBUG META: track_artist={:?}", meta.track_artist);
            println!("DEBUG META: composer={:?}", meta.composer);

            assert_eq!(meta.album_artist, "Various Artists");
            assert_eq!(meta.track_artist, Some("Isabelle Faust, Alexander Melnikov".to_string()));

            let (album_tags, track_tags) = compute_default_tags(
                &meta.album_artist,
                meta.track_artist.as_deref(),
                meta.composer.as_deref(),
                meta.genre.as_deref(),
                meta.release_year,
            );
            println!("DEBUG album_tags={:?}", album_tags);
            println!("DEBUG track_tags={:?}", track_tags);

            assert!(track_tags.contains(&"Isabelle Faust, Alexander Melnikov".to_string()));
            assert!(track_tags.contains(&"Claude Debussy".to_string()));
        }
    }
}
