use crate::models::{Album, Playlist, TagItem, Track, TrackWithAlbum};
use rusqlite::{params, Connection, Result};

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            release_year INTEGER,
            genre TEXT,
            cover_url TEXT,
            UNIQUE(title, artist)
        );

        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            artist TEXT,
            composer TEXT,
            track_number INTEGER,
            disc_number INTEGER,
            duration_secs INTEGER NOT NULL DEFAULT 0,
            file_path TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            category TEXT NOT NULL DEFAULT 'other'
        );

        CREATE TABLE IF NOT EXISTS album_tags (
            album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            is_primary INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (album_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS track_tags (
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (track_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
            track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            PRIMARY KEY (playlist_id, position)
        );

        CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
        CREATE INDEX IF NOT EXISTS idx_album_tags_tag ON album_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_track_tags_tag ON track_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_playlist_tracks ON playlist_tracks(playlist_id);
        ",
    )?;

    let has_category: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('tags') WHERE name = 'category'",
        [],
        |row| row.get(0),
    )?;
    if has_category == 0 {
        conn.execute(
            "ALTER TABLE tags ADD COLUMN category TEXT NOT NULL DEFAULT 'other'",
            [],
        )?;
    }

    let has_is_primary: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('album_tags') WHERE name = 'is_primary'",
        [],
        |row| row.get(0),
    )?;
    if has_is_primary == 0 {
        conn.execute(
            "ALTER TABLE album_tags ADD COLUMN is_primary INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
        // 既存データのデフォルトPrimaryタグ設定
        // アルバムの artist, genre, release_year に一致する tag を is_primary = 1 に設定
        let _ = conn.execute(
            "UPDATE album_tags SET is_primary = 1
             WHERE rowid IN (
                 SELECT at.rowid FROM album_tags at
                 JOIN tags tg ON at.tag_id = tg.id
                 JOIN albums a ON at.album_id = a.id
                 WHERE (tg.name = a.artist COLLATE NOCASE)
                    OR (tg.name = a.genre COLLATE NOCASE)
                    OR (a.release_year IS NOT NULL AND tg.name = CAST(a.release_year AS TEXT))
             )",
            [],
        );
    }

    let _ = fix_missing_disc_numbers(conn);

    // 作曲者タグのカテゴリを更新（既存の tags で tracks.composer に一致するものを composer に）
    let _ = conn.execute(
        "UPDATE tags SET category = 'composer'
         WHERE category = 'other' AND name IN (
             SELECT DISTINCT composer FROM tracks WHERE composer IS NOT NULL AND composer != ''
         )",
        [],
    );

    // アルバムアーティストタグのカテゴリを最優先（albums.artist に一致するタグは artist に復元・保護）
    let _ = conn.execute(
        "UPDATE tags SET category = 'artist'
         WHERE name IN (
             SELECT DISTINCT artist FROM albums WHERE artist IS NOT NULL AND artist != ''
         )",
        [],
    );

    Ok(())
}

pub fn fix_missing_disc_numbers(conn: &Connection) -> Result<()> {
    let mut stmt = conn
        .prepare("SELECT id, file_path FROM tracks WHERE disc_number IS NULL OR disc_number = 0")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })?;

    let mut updates = Vec::new();
    for r in rows {
        if let Ok((id, path_str)) = r {
            let path = std::path::Path::new(&path_str);
            if let Some(disc) = crate::scanner::extract_disc_from_path(path) {
                updates.push((id, disc));
            }
        }
    }

    for (id, disc) in updates {
        let _ = conn.execute(
            "UPDATE tracks SET disc_number = ?1 WHERE id = ?2",
            params![disc, id],
        );
    }

    Ok(())
}

pub fn get_or_create_tag(conn: &Connection, name: &str) -> Result<i64> {
    get_or_create_tag_with_category(conn, name, "other")
}

pub fn get_or_create_tag_with_category(
    conn: &Connection,
    name: &str,
    category: &str,
) -> Result<i64> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    let normalized_category = match category {
        "genre" | "artist" | "composer" | "release_year" => category,
        _ => "other",
    };
    conn.execute(
        "INSERT INTO tags (name, category) VALUES (?1, ?2)
         ON CONFLICT(name) DO UPDATE SET category = CASE
             -- 既に artist であるタグ、または新しく artist として登録されるタグは最優先
             WHEN tags.category = 'artist' THEN 'artist'
             WHEN excluded.category = 'artist' THEN 'artist'
             -- genre, release_year の保護
             WHEN tags.category IN ('genre', 'release_year') AND excluded.category IN ('composer', 'other') THEN tags.category
             WHEN excluded.category IN ('genre', 'release_year') THEN excluded.category
             -- composer やその他
             WHEN excluded.category != 'other' THEN excluded.category
             ELSE tags.category
         END",
        params![trimmed, normalized_category],
    )?;
    let tag_id: i64 = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
        params![trimmed],
        |row| row.get(0),
    )?;
    Ok(tag_id)
}

pub fn get_all_albums(conn: &Connection) -> Result<Vec<Album>> {
    let mut stmt = conn.prepare(
        "
        SELECT a.id, a.title, a.artist, a.release_year, a.genre, a.cover_url, COUNT(t.id) as track_count
        FROM albums a
        LEFT JOIN tracks t ON a.id = t.album_id
        GROUP BY a.id
        ORDER BY a.artist COLLATE NOCASE ASC, a.title COLLATE NOCASE ASC
        "
    )?;

    let album_rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<u32>>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, i64>(6)? as usize,
        ))
    })?;

    let mut albums = Vec::new();
    for row in album_rows {
        let (id, title, artist, release_year, genre, cover_url, track_count) = row?;

        // アルバムのタグを取得
        let mut tag_stmt = conn.prepare(
            "
            SELECT tg.name, at.is_primary
            FROM tags tg
            JOIN album_tags at ON tg.id = at.tag_id
            WHERE at.album_id = ?1
            ORDER BY tg.name COLLATE NOCASE ASC
            ",
        )?;
        let mut tags = Vec::new();
        let mut primary_tags = Vec::new();
        let rows = tag_stmt.query_map(params![id], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })?;
        for r in rows {
            if let Ok((name, is_pri)) = r {
                if is_pri == 1 {
                    primary_tags.push(name.clone());
                }
                tags.push(name);
            }
        }

        albums.push(Album {
            id,
            title,
            artist,
            release_year,
            genre,
            cover_url,
            track_count,
            tags,
            primary_tags,
        });
    }

    Ok(albums)
}

pub fn get_album(conn: &Connection, album_id: i64) -> Result<Album> {
    let mut stmt = conn.prepare(
        "
        SELECT a.id, a.title, a.artist, a.release_year, a.genre, a.cover_url, COUNT(t.id) as track_count
        FROM albums a
        LEFT JOIN tracks t ON a.id = t.album_id
        WHERE a.id = ?1
        GROUP BY a.id
        "
    )?;

    let mut album = stmt.query_row(params![album_id], |row| {
        Ok(Album {
            id: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            release_year: row.get(3)?,
            genre: row.get(4)?,
            cover_url: row.get(5)?,
            track_count: row.get::<_, i64>(6)? as usize,
            tags: Vec::new(),
            primary_tags: Vec::new(),
        })
    })?;

    let mut tag_stmt = conn.prepare(
        "
        SELECT tg.name, at.is_primary
        FROM tags tg
        JOIN album_tags at ON tg.id = at.tag_id
        WHERE at.album_id = ?1
        ORDER BY tg.name COLLATE NOCASE ASC
        ",
    )?;
    let rows = tag_stmt.query_map(params![album_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
    })?;
    for r in rows {
        if let Ok((name, is_pri)) = r {
            if is_pri == 1 {
                album.primary_tags.push(name.clone());
            }
            album.tags.push(name);
        }
    }

    Ok(album)
}

pub fn get_album_tracks(conn: &Connection, album_id: i64) -> Result<Vec<Track>> {
    let _ = fix_missing_disc_numbers(conn);

    let mut stmt = conn.prepare(
        "
        SELECT id, album_id, title, artist, composer, track_number, disc_number, duration_secs, file_path
        FROM tracks
        WHERE album_id = ?1
        ORDER BY COALESCE(disc_number, 1) ASC, COALESCE(track_number, 9999) ASC, title COLLATE NOCASE ASC
        "
    )?;

    let track_rows = stmt.query_map(params![album_id], |row| {
        Ok(Track {
            id: row.get(0)?,
            album_id: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            composer: row.get(4)?,
            track_number: row.get(5)?,
            disc_number: row.get(6)?,
            duration_secs: row.get(7)?,
            file_path: row.get(8)?,
            tags: Vec::new(),
        })
    })?;

    let mut tracks = Vec::new();
    for track_res in track_rows {
        let mut track = track_res?;
        let mut tag_stmt = conn.prepare(
            "
            SELECT tg.name
            FROM tags tg
            JOIN track_tags tt ON tg.id = tt.tag_id
            WHERE tt.track_id = ?1
            ORDER BY tg.name COLLATE NOCASE ASC
            ",
        )?;
        track.tags = tag_stmt
            .query_map(params![track.id], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        tracks.push(track);
    }

    Ok(tracks)
}

pub fn get_all_tags(conn: &Connection) -> Result<Vec<TagItem>> {
    let mut stmt = conn.prepare(
        "
         SELECT tg.id, tg.name, tg.category,
             (SELECT COUNT(*) FROM album_tags at WHERE at.tag_id = tg.id) as album_c,
             (SELECT COUNT(*) FROM track_tags tt WHERE tt.tag_id = tg.id) as track_c
        FROM tags tg
        ORDER BY (album_c + track_c) DESC, tg.name COLLATE NOCASE ASC
        ",
    )?;

    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let category: String = row.get(2)?;
        let album_count: i64 = row.get(3)?;
        let track_count: i64 = row.get(4)?;
        let target_type = if album_count > 0 && track_count == 0 {
            "album".to_string()
        } else if track_count > 0 && album_count == 0 {
            "track".to_string()
        } else {
            "all".to_string()
        };

        Ok(TagItem {
            id,
            name,
            count: album_count + track_count,
            target_type,
            category,
        })
    })?;

    let mut tags = Vec::new();
    for r in rows {
        tags.push(r?);
    }
    Ok(tags)
}

/// 年代タグ（例: "1950s"）を判定し、(開始年, 終了年) を返す。
pub fn parse_decade_tag(tag: &str) -> Option<(u32, u32)> {
    let trimmed = tag.trim();
    if (trimmed.ends_with('s') || trimmed.ends_with('S')) && trimmed.len() == 5 {
        let year_str = &trimmed[..4];
        if year_str.ends_with('0') {
            if let Ok(year) = year_str.parse::<u32>() {
                if (1000..=2999).contains(&year) {
                    return Some((year, year + 9));
                }
            }
        }
    }
    None
}

pub fn get_tracks_by_tags(
    conn: &Connection,
    tags: &[String],
    match_all: bool,
) -> Result<Vec<TrackWithAlbum>> {
    if tags.is_empty() {
        let mut stmt = conn.prepare(
            "
            SELECT t.id, t.album_id, t.title, t.artist, t.composer, t.track_number, t.disc_number, t.duration_secs, t.file_path,
                   a.title as album_title, a.artist as album_artist, a.cover_url
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            ORDER BY a.artist COLLATE NOCASE, a.title COLLATE NOCASE, COALESCE(t.disc_number, 1), COALESCE(t.track_number, 9999), t.title COLLATE NOCASE
            "
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(TrackWithAlbum {
                id: row.get(0)?,
                album_id: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                composer: row.get(4)?,
                track_number: row.get(5)?,
                disc_number: row.get(6)?,
                duration_secs: row.get(7)?,
                file_path: row.get(8)?,
                tags: Vec::new(),
                album_title: row.get(9)?,
                album_artist: row.get(10)?,
                cover_url: row.get(11)?,
            })
        })?;

        let mut tracks = Vec::new();
        for r in rows {
            tracks.push(r?);
        }
        attach_tags_to_tracks(conn, &mut tracks)?;
        return Ok(tracks);
    }

    let mut conditions = Vec::new();

    for name in tags {
        let trimmed = name.trim();
        if let Some((start, end)) = parse_decade_tag(trimmed) {
            // 年代タグ: 該当する年のタグID一覧を取得
            let mut decade_tag_ids = Vec::new();
            if let Ok(mut stmt) = conn.prepare("SELECT id, name FROM tags WHERE category = 'release_year'") {
                if let Ok(rows) = stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))) {
                    for r in rows.flatten() {
                        if let Ok(y) = r.1.trim().parse::<u32>() {
                            if (start..=end).contains(&y) {
                                decade_tag_ids.push(r.0);
                            }
                        }
                    }
                }
            }

            let cond = if decade_tag_ids.is_empty() {
                format!("(a.release_year >= {} AND a.release_year <= {})", start, end)
            } else {
                let id_list = decade_tag_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",");
                format!(
                    "((a.release_year >= {} AND a.release_year <= {}) OR t.id IN (SELECT track_id FROM track_tags WHERE tag_id IN ({})) OR a.id IN (SELECT album_id FROM album_tags WHERE tag_id IN ({})))",
                    start, end, id_list, id_list
                )
            };
            conditions.push(cond);
        } else {
            // 通常タグ
            let res: Result<i64, _> = conn.query_row(
                "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
                params![trimmed],
                |row| row.get(0),
            );
            if let Ok(id) = res {
                conditions.push(format!(
                    "(t.id IN (SELECT track_id FROM track_tags WHERE tag_id = {}) OR a.id IN (SELECT album_id FROM album_tags WHERE tag_id = {}))",
                    id, id
                ));
            } else if match_all {
                // 存在しない通常タグがAND条件にある場合は0件確定
                return Ok(Vec::new());
            }
        }
    }

    if conditions.is_empty() {
        return Ok(Vec::new());
    }

    let join_operator = if match_all { " AND " } else { " OR " };
    let where_clause = conditions.join(join_operator);

    let query = format!(
        "
        SELECT DISTINCT t.id, t.album_id, t.title, t.artist, t.composer, t.track_number, t.disc_number, t.duration_secs, t.file_path,
               a.title as album_title, a.artist as album_artist, a.cover_url
        FROM tracks t
        JOIN albums a ON t.album_id = a.id
        WHERE {}
        ORDER BY a.artist COLLATE NOCASE, a.title COLLATE NOCASE, COALESCE(t.disc_number, 1), COALESCE(t.track_number, 9999), t.title COLLATE NOCASE
        ",
        where_clause
    );

    let mut stmt = conn.prepare(&query)?;
    let rows = stmt.query_map([], |row| {
        Ok(TrackWithAlbum {
            id: row.get(0)?,
            album_id: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            composer: row.get(4)?,
            track_number: row.get(5)?,
            disc_number: row.get(6)?,
            duration_secs: row.get(7)?,
            file_path: row.get(8)?,
            tags: Vec::new(),
            album_title: row.get(9)?,
            album_artist: row.get(10)?,
            cover_url: row.get(11)?,
        })
    })?;

    let mut tracks = Vec::new();
    for r in rows {
        tracks.push(r?);
    }
    attach_tags_to_tracks(conn, &mut tracks)?;
    Ok(tracks)
}

fn attach_tags_to_tracks(conn: &Connection, tracks: &mut [TrackWithAlbum]) -> Result<()> {
    for track in tracks.iter_mut() {
        let mut tag_stmt = conn.prepare(
            "
            SELECT tg.name
            FROM tags tg
            JOIN track_tags tt ON tg.id = tt.tag_id
            WHERE tt.track_id = ?1
            ORDER BY tg.name COLLATE NOCASE ASC
            ",
        )?;
        track.tags = tag_stmt
            .query_map(params![track.id], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();
    }
    Ok(())
}

pub fn save_playlist(conn: &mut Connection, name: &str, track_ids: &[i64]) -> Result<i64> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO playlists (name) VALUES (?1)",
        params![name.trim()],
    )?;
    let playlist_id = tx.last_insert_rowid();

    for (pos, &track_id) in track_ids.iter().enumerate() {
        tx.execute(
            "INSERT INTO playlist_tracks (playlist_id, track_id, position) VALUES (?1, ?2, ?3)",
            params![playlist_id, track_id, pos as i64],
        )?;
    }

    tx.commit()?;
    Ok(playlist_id)
}

pub fn get_all_playlists(conn: &Connection) -> Result<Vec<Playlist>> {
    let mut stmt = conn.prepare(
        "
        SELECT p.id, p.name, COUNT(pt.track_id) as track_count, p.created_at
        FROM playlists p
        LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
        GROUP BY p.id
        ORDER BY p.id DESC
        ",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(Playlist {
            id: row.get(0)?,
            name: row.get(1)?,
            track_count: row.get::<_, i64>(2)? as usize,
            created_at: row.get(3)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}

pub fn get_playlist_tracks(conn: &Connection, playlist_id: i64) -> Result<Vec<TrackWithAlbum>> {
    let mut stmt = conn.prepare(
        "
        SELECT t.id, t.album_id, t.title, t.artist, t.composer, t.track_number, t.disc_number, t.duration_secs, t.file_path,
               a.title as album_title, a.artist as album_artist, a.cover_url
        FROM playlist_tracks pt
        JOIN tracks t ON pt.track_id = t.id
        JOIN albums a ON t.album_id = a.id
        WHERE pt.playlist_id = ?1
        ORDER BY pt.position ASC
        "
    )?;

    let rows = stmt.query_map(params![playlist_id], |row| {
        Ok(TrackWithAlbum {
            id: row.get(0)?,
            album_id: row.get(1)?,
            title: row.get(2)?,
            artist: row.get(3)?,
            composer: row.get(4)?,
            track_number: row.get(5)?,
            disc_number: row.get(6)?,
            duration_secs: row.get(7)?,
            file_path: row.get(8)?,
            tags: Vec::new(),
            album_title: row.get(9)?,
            album_artist: row.get(10)?,
            cover_url: row.get(11)?,
        })
    })?;

    let mut tracks = Vec::new();
    for r in rows {
        tracks.push(r?);
    }
    attach_tags_to_tracks(conn, &mut tracks)?;
    Ok(tracks)
}

pub fn delete_playlist(conn: &Connection, playlist_id: i64) -> Result<()> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![playlist_id])?;
    Ok(())
}

pub fn get_album_tags(conn: &Connection, album_id: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "
        SELECT tg.name
        FROM tags tg
        JOIN album_tags at ON tg.id = at.tag_id
        WHERE at.album_id = ?1
        ORDER BY tg.name COLLATE NOCASE ASC
        ",
    )?;
    let tags = stmt
        .query_map(params![album_id], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tags)
}

pub fn get_track_tags(conn: &Connection, track_id: i64) -> Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "
        SELECT tg.name
        FROM tags tg
        JOIN track_tags tt ON tg.id = tt.tag_id
        WHERE tt.track_id = ?1
        ORDER BY tg.name COLLATE NOCASE ASC
        ",
    )?;
    let tags = stmt
        .query_map(params![track_id], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tags)
}

pub fn set_album_primary_tag(
    conn: &Connection,
    album_id: i64,
    tag_name: &str,
    is_primary: bool,
) -> Result<Album> {
    let tag_row: Result<(i64, String), _> = conn.query_row(
        "SELECT id, category FROM tags WHERE name = ?1 COLLATE NOCASE",
        params![tag_name.trim()],
        |r| Ok((r.get(0)?, r.get(1)?)),
    );

    if let Ok((tag_id, category)) = tag_row {
        if matches!(category.as_str(), "genre" | "artist" | "release_year") {
            if is_primary {
                // 同じアルバムの同じカテゴリの他のタグのPrimaryを解除
                conn.execute(
                    "UPDATE album_tags SET is_primary = 0
                     WHERE album_id = ?1 AND tag_id IN (
                         SELECT id FROM tags WHERE category = ?2
                     )",
                    params![album_id, category],
                )?;
                // 対象タグをPrimaryに設定
                conn.execute(
                    "UPDATE album_tags SET is_primary = 1
                     WHERE album_id = ?1 AND tag_id = ?2",
                    params![album_id, tag_id],
                )?;
            } else {
                // 対象タグのPrimaryを解除
                conn.execute(
                    "UPDATE album_tags SET is_primary = 0
                     WHERE album_id = ?1 AND tag_id = ?2",
                    params![album_id, tag_id],
                )?;
            }
        }
    }

    get_album(conn, album_id)
}

pub fn add_album_tag(
    conn: &Connection,
    album_id: i64,
    tag_name: &str,
    category: &str,
) -> Result<Album> {
    let tag_id = get_or_create_tag_with_category(conn, tag_name, category)?;
    if tag_id > 0 {
        conn.execute(
            "INSERT OR IGNORE INTO album_tags (album_id, tag_id, is_primary) VALUES (?1, ?2, 0)",
            params![album_id, tag_id],
        )?;
    }
    get_album(conn, album_id)
}

pub fn remove_album_tag(conn: &Connection, album_id: i64, tag_name: &str) -> Result<Album> {
    let tag_id_res: Result<i64, _> = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
        params![tag_name.trim()],
        |r| r.get(0),
    );
    if let Ok(tag_id) = tag_id_res {
        conn.execute(
            "DELETE FROM album_tags WHERE album_id = ?1 AND tag_id = ?2",
            params![album_id, tag_id],
        )?;
        let _ = cleanup_unused_tags(conn);
    }
    get_album(conn, album_id)
}

pub fn add_track_tag(
    conn: &Connection,
    track_id: i64,
    tag_name: &str,
    category: &str,
) -> Result<Vec<String>> {
    let tag_id = get_or_create_tag_with_category(conn, tag_name, category)?;
    if tag_id > 0 {
        conn.execute(
            "INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?1, ?2)",
            params![track_id, tag_id],
        )?;
    }
    get_track_tags(conn, track_id)
}

pub fn remove_track_tag(conn: &Connection, track_id: i64, tag_name: &str) -> Result<Vec<String>> {
    let tag_id_res: Result<i64, _> = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
        params![tag_name.trim()],
        |r| r.get(0),
    );
    if let Ok(tag_id) = tag_id_res {
        conn.execute(
            "DELETE FROM track_tags WHERE track_id = ?1 AND tag_id = ?2",
            params![track_id, tag_id],
        )?;
        let _ = cleanup_unused_tags(conn);
    }
    get_track_tags(conn, track_id)
}

pub fn add_tracks_tag(
    conn: &mut Connection,
    track_ids: &[i64],
    tag_name: &str,
    category: &str,
) -> Result<()> {
    let tag_id = get_or_create_tag_with_category(conn, tag_name, category)?;
    if tag_id > 0 && !track_ids.is_empty() {
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare("INSERT OR IGNORE INTO track_tags (track_id, tag_id) VALUES (?1, ?2)")?;
            for &tid in track_ids {
                stmt.execute(params![tid, tag_id])?;
            }
        }
        tx.commit()?;
    }
    Ok(())
}

pub fn remove_tracks_tag(
    conn: &mut Connection,
    track_ids: &[i64],
    tag_name: &str,
) -> Result<()> {
    let tag_id_res: Result<i64, _> = conn.query_row(
        "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
        params![tag_name.trim()],
        |r| r.get(0),
    );
    if let Ok(tag_id) = tag_id_res {
        if !track_ids.is_empty() {
            let tx = conn.transaction()?;
            {
                let mut stmt = tx.prepare("DELETE FROM track_tags WHERE track_id = ?1 AND tag_id = ?2")?;
                for &tid in track_ids {
                    stmt.execute(params![tid, tag_id])?;
                }
            }
            tx.commit()?;
            let _ = cleanup_unused_tags(conn);
        }
    }
    Ok(())
}

pub fn cleanup_unused_tags(conn: &Connection) -> Result<()> {
    conn.execute(
        "
        DELETE FROM tags
        WHERE id NOT IN (SELECT tag_id FROM album_tags)
          AND id NOT IN (SELECT tag_id FROM track_tags)
        ",
        [],
    )?;
    Ok(())
}

pub fn delete_album(conn: &mut Connection, album_id: i64) -> Result<()> {
    let tx = conn.transaction()?;

    tx.execute(
        "DELETE FROM track_tags WHERE track_id IN (SELECT id FROM tracks WHERE album_id = ?1)",
        params![album_id],
    )?;

    tx.execute(
        "DELETE FROM playlist_tracks WHERE track_id IN (SELECT id FROM tracks WHERE album_id = ?1)",
        params![album_id],
    )?;

    tx.execute("DELETE FROM tracks WHERE album_id = ?1", params![album_id])?;

    tx.execute(
        "DELETE FROM album_tags WHERE album_id = ?1",
        params![album_id],
    )?;

    tx.execute("DELETE FROM albums WHERE id = ?1", params![album_id])?;

    tx.commit()?;

    let _ = cleanup_unused_tags(conn);

    Ok(())
}

pub fn update_album_cover(
    conn: &Connection,
    album_id: i64,
    cover_url: Option<&str>,
) -> Result<Album> {
    conn.execute(
        "UPDATE albums SET cover_url = ?1 WHERE id = ?2",
        params![cover_url, album_id],
    )?;
    get_album(conn, album_id)
}

pub fn get_all_used_cover_filenames(conn: &Connection) -> Result<std::collections::HashSet<String>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT cover_url FROM albums WHERE cover_url IS NOT NULL AND cover_url != ''",
    )?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    let mut used_filenames = std::collections::HashSet::new();
    for r in rows {
        if let Ok(url) = r {
            if let Some(file_name) = std::path::Path::new(&url).file_name() {
                used_filenames.insert(file_name.to_string_lossy().to_lowercase());
            }
        }
    }
    Ok(used_filenames)
}
