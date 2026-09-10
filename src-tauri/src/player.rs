use std::sync::Mutex;
use crate::models::PlaybackStatus;

#[cfg(windows)]
mod win_player {
    use std::path::Path;
    use windows::core::HSTRING;
    use windows::Foundation::{TimeSpan, Uri};
    use windows::Media::Core::MediaSource;
    use windows::Media::Playback::{MediaPlayer, MediaPlaybackState};
    use crate::models::PlaybackStatus;

    pub struct WinPlayerEngine {
        player: MediaPlayer,
        current_path: Option<String>,
    }

    impl WinPlayerEngine {
        pub fn new() -> Result<Self, String> {
            let player = MediaPlayer::new().map_err(|e| format!("Failed to create MediaPlayer: {e}"))?;
            let _ = player.SetVolume(0.8);
            Ok(Self {
                player,
                current_path: None,
            })
        }

        pub fn play(&mut self, file_path: &str) -> Result<(), String> {
            let path = Path::new(file_path);
            if !path.exists() {
                return Err(format!("ファイルが存在しません: {}", file_path));
            }

            let normalized = file_path.replace('\\', "/");
            let uri_str = if normalized.starts_with('/') {
                format!("file://{}", normalized)
            } else {
                format!("file:///{}", normalized)
            };

            let uri = Uri::CreateUri(&HSTRING::from(uri_str))
                .map_err(|e| format!("URI作成エラー: {e}"))?;

            let source = MediaSource::CreateFromUri(&uri)
                .map_err(|e| format!("MediaSource作成エラー: {e}"))?;

            self.player.SetSource(&source)
                .map_err(|e| format!("SetSourceエラー: {e}"))?;

            self.player.Play()
                .map_err(|e| format!("Playエラー: {e}"))?;

            self.current_path = Some(file_path.to_string());
            Ok(())
        }

        pub fn pause(&self) -> Result<(), String> {
            self.player.Pause().map_err(|e| format!("Pauseエラー: {e}"))
        }

        pub fn resume(&self) -> Result<(), String> {
            self.player.Play().map_err(|e| format!("Playエラー: {e}"))
        }

        pub fn seek(&self, secs: f64) -> Result<(), String> {
            let session = self.player.PlaybackSession().map_err(|e| format!("PlaybackSessionエラー: {e}"))?;
            let time_span = TimeSpan {
                Duration: (secs * 10_000_000.0).max(0.0) as i64,
            };
            session.SetPosition(time_span).map_err(|e| format!("SetPositionエラー: {e}"))
        }

        pub fn set_volume(&self, volume: f64) -> Result<(), String> {
            let clamped = volume.clamp(0.0, 1.0);
            self.player.SetVolume(clamped).map_err(|e| format!("SetVolumeエラー: {e}"))
        }

        pub fn get_status(&self) -> PlaybackStatus {
            let mut is_playing = false;
            let mut position_secs = 0.0;
            let mut duration_secs = 0.0;
            let mut volume = 0.8;

            if let Ok(vol) = self.player.Volume() {
                volume = vol;
            }

            if let Ok(session) = self.player.PlaybackSession() {
                if let Ok(state) = session.PlaybackState() {
                    is_playing = state == MediaPlaybackState::Playing;
                }
                if let Ok(pos) = session.Position() {
                    position_secs = (pos.Duration as f64) / 10_000_000.0;
                }
                if let Ok(dur) = session.NaturalDuration() {
                    duration_secs = (dur.Duration as f64) / 10_000_000.0;
                }
            }

            PlaybackStatus {
                is_playing,
                position_secs,
                duration_secs,
                volume,
                current_file_path: self.current_path.clone(),
            }
        }
    }
}

pub struct PlayerManager {
    #[cfg(windows)]
    engine: Mutex<win_player::WinPlayerEngine>,
    #[cfg(not(windows))]
    engine: Mutex<()>,
}

impl PlayerManager {
    pub fn new() -> Result<Self, String> {
        #[cfg(windows)]
        {
            let engine = win_player::WinPlayerEngine::new()?;
            Ok(Self {
                engine: Mutex::new(engine),
            })
        }
        #[cfg(not(windows))]
        {
            Ok(Self {
                engine: Mutex::new(()),
            })
        }
    }

    pub fn play(&self, file_path: &str) -> Result<(), String> {
        #[cfg(windows)]
        {
            let mut engine = self.engine.lock().map_err(|e| e.to_string())?;
            engine.play(file_path)
        }
        #[cfg(not(windows))]
        {
            let _ = file_path;
            Err("Windows以外の環境ではWMF再生エンジンは利用できません".to_string())
        }
    }

    pub fn pause(&self) -> Result<(), String> {
        #[cfg(windows)]
        {
            let engine = self.engine.lock().map_err(|e| e.to_string())?;
            engine.pause()
        }
        #[cfg(not(windows))]
        {
            Ok(())
        }
    }

    pub fn resume(&self) -> Result<(), String> {
        #[cfg(windows)]
        {
            let engine = self.engine.lock().map_err(|e| e.to_string())?;
            engine.resume()
        }
        #[cfg(not(windows))]
        {
            Ok(())
        }
    }

    pub fn seek(&self, secs: f64) -> Result<(), String> {
        #[cfg(windows)]
        {
            let engine = self.engine.lock().map_err(|e| e.to_string())?;
            engine.seek(secs)
        }
        #[cfg(not(windows))]
        {
            let _ = secs;
            Ok(())
        }
    }

    pub fn set_volume(&self, volume: f64) -> Result<(), String> {
        #[cfg(windows)]
        {
            let engine = self.engine.lock().map_err(|e| e.to_string())?;
            engine.set_volume(volume)
        }
        #[cfg(not(windows))]
        {
            let _ = volume;
            Ok(())
        }
    }

    pub fn get_status(&self) -> PlaybackStatus {
        #[cfg(windows)]
        {
            if let Ok(engine) = self.engine.lock() {
                engine.get_status()
            } else {
                PlaybackStatus {
                    is_playing: false,
                    position_secs: 0.0,
                    duration_secs: 0.0,
                    volume: 0.8,
                    current_file_path: None,
                }
            }
        }
        #[cfg(not(windows))]
        {
            PlaybackStatus {
                is_playing: false,
                position_secs: 0.0,
                duration_secs: 0.0,
                volume: 0.8,
                current_file_path: None,
            }
        }
    }
}
