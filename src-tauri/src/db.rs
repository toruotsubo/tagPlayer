use rusqlite::{params, Connection, Result};
use crate::models::{Album, Playlist, TagItem, Track, TrackWithAlbum};


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
            name TEXT NOT NULL UNIQUE COLLATE NOCASE
        );

        CREATE TABLE IF NOT EXISTS album_tags (
            album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
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
        "
    )?;

    let _ = fix_missing_disc_numbers(conn);

    Ok(())
}

pub fn fix_missing_disc_numbers(conn: &Connection) -> Result<()> {
    let mut stmt = conn.prepare("SELECT id, file_path FROM tracks WHERE disc_number IS NULL OR disc_number = 0")?;
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
        let _ = conn.execute("UPDATE tracks SET disc_number = ?1 WHERE id = ?2", params![disc, id]);
    }

    Ok(())
}

pub fn get_or_create_tag(conn: &Connection, name: &str) -> Result<i64> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Ok(0);
    }
    conn.execute(
        "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
        params![trimmed],
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
            SELECT tg.name
            FROM tags tg
            JOIN album_tags at ON tg.id = at.tag_id
            WHERE at.album_id = ?1
            ORDER BY tg.name COLLATE NOCASE ASC
            "
        )?;
        let tags: Vec<String> = tag_stmt
            .query_map(params![id], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        albums.push(Album {
            id,
            title,
            artist,
            release_year,
            genre,
            cover_url,
            track_count,
            tags,
        });
    }

    Ok(albums)
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
            "
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
        SELECT tg.id, tg.name,
               (SELECT COUNT(*) FROM album_tags at WHERE at.tag_id = tg.id) as album_c,
               (SELECT COUNT(*) FROM track_tags tt WHERE tt.tag_id = tg.id) as track_c
        FROM tags tg
        ORDER BY (album_c + track_c) DESC, tg.name COLLATE NOCASE ASC
        "
    )?;

    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let name: String = row.get(1)?;
        let album_count: i64 = row.get(2)?;
        let track_count: i64 = row.get(3)?;
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
        })
    })?;

    let mut tags = Vec::new();
    for r in rows {
        tags.push(r?);
    }
    Ok(tags)
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
        return Ok(tracks);
    }

    // タグ名リストから tag_id を取得
    let mut tag_ids = Vec::new();
    for name in tags {
        let res: Result<i64, _> = conn.query_row(
            "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
            params![name.trim()],
            |row| row.get(0),
        );
        if let Ok(id) = res {
            tag_ids.push(id);
        } else if match_all {
            // 存在しないタグがAND条件にある場合は0件確定
            return Ok(Vec::new());
        }
    }

    if tag_ids.is_empty() {
        return Ok(Vec::new());
    }

    let query = if match_all {
        format!(
            "
            SELECT t.id, t.album_id, t.title, t.artist, t.composer, t.track_number, t.disc_number, t.duration_secs, t.file_path,
                   a.title as album_title, a.artist as album_artist, a.cover_url
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            WHERE t.id IN (
                SELECT t_sub.id
                FROM tracks t_sub
                JOIN (
                    SELECT tt.track_id as t_id, tt.tag_id FROM track_tags tt
                    UNION
                    SELECT tr.id as t_id, at.tag_id FROM tracks tr JOIN album_tags at ON tr.album_id = at.album_id
                ) mapping ON t_sub.id = mapping.t_id
                WHERE mapping.tag_id IN ({})
                GROUP BY t_sub.id
                HAVING COUNT(DISTINCT mapping.tag_id) = {}
            )
            ORDER BY a.artist COLLATE NOCASE, a.title COLLATE NOCASE, COALESCE(t.disc_number, 1), COALESCE(t.track_number, 9999), t.title COLLATE NOCASE
            ",
            tag_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(","),
            tag_ids.len()
        )
    } else {
        format!(
            "
            SELECT DISTINCT t.id, t.album_id, t.title, t.artist, t.composer, t.track_number, t.disc_number, t.duration_secs, t.file_path,
                   a.title as album_title, a.artist as album_artist, a.cover_url
            FROM tracks t
            JOIN albums a ON t.album_id = a.id
            LEFT JOIN track_tags tt ON t.id = tt.track_id
            LEFT JOIN album_tags at ON a.id = at.album_id
            WHERE tt.tag_id IN ({}) OR at.tag_id IN ({})
            ORDER BY a.artist COLLATE NOCASE, a.title COLLATE NOCASE, COALESCE(t.disc_number, 1), COALESCE(t.track_number, 9999), t.title COLLATE NOCASE
            ",
            tag_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(","),
            tag_ids.iter().map(|id| id.to_string()).collect::<Vec<_>>().join(",")
        )
    };

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
    Ok(tracks)
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
        "
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
    Ok(tracks)
}

pub fn delete_playlist(conn: &Connection, playlist_id: i64) -> Result<()> {
    conn.execute(
        "DELETE FROM playlists WHERE id = ?1",
        params![playlist_id],
    )?;
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
        "
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
        "
    )?;
    let tags = stmt
        .query_map(params![track_id], |r| r.get(0))?
        .filter_map(|r| r.ok())
        .collect();
    Ok(tags)
}

pub fn add_album_tag(conn: &Connection, album_id: i64, tag_name: &str) -> Result<Vec<String>> {
    let tag_id = get_or_create_tag(conn, tag_name)?;
    if tag_id > 0 {
        conn.execute(
            "INSERT OR IGNORE INTO album_tags (album_id, tag_id) VALUES (?1, ?2)",
            params![album_id, tag_id],
        )?;
    }
    get_album_tags(conn, album_id)
}

pub fn remove_album_tag(conn: &Connection, album_id: i64, tag_name: &str) -> Result<Vec<String>> {
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
    get_album_tags(conn, album_id)
}

pub fn add_track_tag(conn: &Connection, track_id: i64, tag_name: &str) -> Result<Vec<String>> {
    let tag_id = get_or_create_tag(conn, tag_name)?;
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


