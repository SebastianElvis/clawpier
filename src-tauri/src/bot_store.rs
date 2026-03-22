use std::fs;
use std::io::Write;
use std::path::PathBuf;

use crate::error::AppError;
use crate::models::{BotNotificationPrefs, BotProfile, EnvVar, HealthCheckConfig, NetworkMode, PortMapping};

pub struct BotStore {
    bots: Vec<BotProfile>,
    config_path: PathBuf,
}

impl BotStore {
    pub fn new() -> Result<Self, AppError> {
        let config_dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("clawpier");

        std::fs::create_dir_all(&config_dir)?;

        let config_path = config_dir.join("bots.json");

        let mut bots: Vec<BotProfile> = Self::load_with_recovery(&config_path)?;

        // Migrate legacy fields (api_key_env, network_enabled)
        let mut migrated = false;
        for bot in &mut bots {
            if bot.needs_migration() {
                bot.migrate();
                migrated = true;
            }
        }

        let store = Self { bots, config_path };

        // Persist migration if any bots were migrated
        if migrated {
            store.save()?;
        }

        Ok(store)
    }

    fn save(&self) -> Result<(), AppError> {
        let json = serde_json::to_string_pretty(&self.bots)?;

        let dir = self
            .config_path
            .parent()
            .ok_or_else(|| AppError::Other("Invalid config path".into()))?;
        fs::create_dir_all(dir)?;

        // Write to temp file first
        let tmp_path = self.config_path.with_extension("json.tmp");
        let mut file = fs::File::create(&tmp_path)?;
        file.write_all(json.as_bytes())?;
        file.sync_all()?;
        drop(file);

        // Rotate backups before overwriting
        Self::rotate_backups(&self.config_path)?;

        // Atomic rename
        fs::rename(&tmp_path, &self.config_path)?;

        Ok(())
    }

    /// Rotate backup files, keeping the last 3 copies.
    fn rotate_backups(path: &std::path::Path) -> Result<(), AppError> {
        if !path.exists() {
            return Ok(());
        }

        let bak3 = path.with_extension("json.bak.3");
        let bak2 = path.with_extension("json.bak.2");
        let bak1 = path.with_extension("json.bak.1");

        // Rotate: .bak.2 -> .bak.3, .bak.1 -> .bak.2, current -> .bak.1
        if bak2.exists() {
            let _ = fs::rename(&bak2, &bak3);
        }
        if bak1.exists() {
            let _ = fs::rename(&bak1, &bak2);
        }
        // Copy current to .bak.1 (copy, not rename — we still need the original until atomic rename)
        let _ = fs::copy(path, &bak1);

        Ok(())
    }

    /// Try loading bots from the main file, falling back to backups if corrupted.
    fn load_with_recovery(path: &std::path::Path) -> Result<Vec<BotProfile>, AppError> {
        // Try main file first
        if let Ok(content) = fs::read_to_string(path) {
            if let Ok(bots) = serde_json::from_str::<Vec<BotProfile>>(&content) {
                return Ok(bots);
            }
            // Main file corrupted, try backups
            eprintln!("Warning: bots.json is corrupted, trying backups...");
        }

        // Try backups in order
        for i in 1..=3 {
            let bak_path = path.with_extension(format!("json.bak.{}", i));
            if let Ok(content) = fs::read_to_string(&bak_path) {
                if let Ok(bots) = serde_json::from_str::<Vec<BotProfile>>(&content) {
                    eprintln!("Recovered from backup .bak.{}", i);
                    return Ok(bots);
                }
            }
        }

        // No valid file found — return empty
        Ok(Vec::new())
    }

    pub fn get_all(&self) -> &[BotProfile] {
        &self.bots
    }

    pub fn get_bot_ids(&self) -> Vec<String> {
        self.bots.iter().map(|b| b.id.clone()).collect()
    }

    pub fn get_by_id(&self, id: &str) -> Option<&BotProfile> {
        self.bots.iter().find(|b| b.id == id)
    }

    pub fn name_exists(&self, name: &str) -> bool {
        self.bots
            .iter()
            .any(|b| b.name.eq_ignore_ascii_case(name))
    }

    pub fn add(&mut self, bot: BotProfile) -> Result<(), AppError> {
        if self.name_exists(&bot.name) {
            return Err(AppError::DuplicateName(bot.name.clone()));
        }
        self.bots.push(bot);
        self.save()
    }

    pub fn remove(&mut self, id: &str) -> Result<BotProfile, AppError> {
        let index = self
            .bots
            .iter()
            .position(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        let bot = self.bots.remove(index);
        self.save()?;
        Ok(bot)
    }

    pub fn rename(&mut self, id: &str, new_name: String) -> Result<(), AppError> {
        // Check for duplicate name (excluding the bot being renamed)
        if self
            .bots
            .iter()
            .any(|b| b.id != id && b.name.eq_ignore_ascii_case(&new_name))
        {
            return Err(AppError::DuplicateName(new_name));
        }

        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.name = new_name;
        self.save()
    }

    pub fn toggle_network(&mut self, id: &str, enabled: bool) -> Result<(), AppError> {
        self.set_network_mode(
            id,
            if enabled {
                NetworkMode::Bridge
            } else {
                NetworkMode::None
            },
        )
    }

    pub fn set_network_mode(&mut self, id: &str, mode: NetworkMode) -> Result<(), AppError> {
        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.network_mode = mode;
        self.save()
    }

    pub fn set_workspace_path(
        &mut self,
        id: &str,
        workspace_path: Option<String>,
    ) -> Result<(), AppError> {
        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.workspace_path = workspace_path;
        self.save()
    }

    pub fn update_env_vars(&mut self, id: &str, env_vars: Vec<EnvVar>) -> Result<(), AppError> {
        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.env_vars = env_vars;
        self.save()
    }

    pub fn update_resource_limits(
        &mut self,
        id: &str,
        cpu_limit: Option<f64>,
        memory_limit: Option<u64>,
    ) -> Result<(), AppError> {
        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.cpu_limit = cpu_limit;
        bot.memory_limit = memory_limit;
        self.save()
    }

    pub fn update_port_mappings(
        &mut self,
        id: &str,
        port_mappings: Vec<PortMapping>,
    ) -> Result<(), AppError> {
        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.port_mappings = port_mappings;
        self.save()
    }

    pub fn set_auto_start(&mut self, id: &str, auto_start: bool) -> Result<(), AppError> {
        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.auto_start = auto_start;
        self.save()
    }

    pub fn update_health_check(
        &mut self,
        id: &str,
        health_check: Option<HealthCheckConfig>,
    ) -> Result<(), AppError> {
        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.health_check = health_check;
        self.save()
    }

    pub fn update_notification_prefs(
        &mut self,
        id: &str,
        prefs: Option<BotNotificationPrefs>,
    ) -> Result<(), AppError> {
        let bot = self
            .bots
            .iter_mut()
            .find(|b| b.id == id)
            .ok_or_else(|| AppError::BotNotFound(id.to_string()))?;

        bot.notification_prefs = prefs;
        self.save()
    }

    pub fn get_auto_start_bots(&self) -> Vec<BotProfile> {
        self.bots
            .iter()
            .filter(|b| b.auto_start)
            .cloned()
            .collect()
    }

    /// Import bots, skipping any that already exist by ID.
    pub fn import_bots(&mut self, bots: Vec<BotProfile>) -> Result<(), AppError> {
        let existing_ids: std::collections::HashSet<String> =
            self.bots.iter().map(|b| b.id.clone()).collect();
        let mut added = 0;
        for bot in bots {
            if !existing_ids.contains(&bot.id) {
                self.bots.push(bot);
                added += 1;
            }
        }
        if added > 0 {
            self.save()?;
        }
        Ok(())
    }

    /// Test-only constructor that uses a custom path instead of dirs::config_dir().
    #[cfg(test)]
    pub fn from_path(path: std::path::PathBuf) -> Self {
        Self {
            bots: Vec::new(),
            config_path: path,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::BotProfile;

    fn temp_store() -> (BotStore, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("create temp dir");
        let path = dir.path().join("bots.json");
        (BotStore::from_path(path), dir)
    }

    #[test]
    fn add_and_get_bot() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("TestBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        assert_eq!(store.get_all().len(), 1);
        assert!(store.get_by_id(&id).is_some());
        assert_eq!(store.get_by_id(&id).unwrap().name, "TestBot");
    }

    #[test]
    fn add_duplicate_name_fails() {
        let (mut store, _dir) = temp_store();
        store
            .add(BotProfile::new("MyBot".into(), None))
            .unwrap();
        let result = store.add(BotProfile::new("mybot".into(), None));
        assert!(result.is_err());
    }

    #[test]
    fn remove_bot() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("RemoveMe".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        let removed = store.remove(&id).unwrap();
        assert_eq!(removed.name, "RemoveMe");
        assert!(store.get_by_id(&id).is_none());
    }

    #[test]
    fn remove_nonexistent_bot_fails() {
        let (mut store, _dir) = temp_store();
        assert!(store.remove("no-such-id").is_err());
    }

    #[test]
    fn update_resource_limits_persists() {
        let (mut store, dir) = temp_store();
        let bot = BotProfile::new("ResBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        store.update_resource_limits(&id, Some(2.0), Some(4_000_000_000)).unwrap();

        // Reload from disk
        let path = dir.path().join("bots.json");
        let data = std::fs::read_to_string(&path).unwrap();
        let bots: Vec<BotProfile> = serde_json::from_str(&data).unwrap();
        assert_eq!(bots[0].cpu_limit, Some(2.0));
        assert_eq!(bots[0].memory_limit, Some(4_000_000_000));
    }

    #[test]
    fn update_resource_limits_clear() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("ClearBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        store.update_resource_limits(&id, Some(4.0), Some(8_000_000_000)).unwrap();
        store.update_resource_limits(&id, None, None).unwrap();

        let bot = store.get_by_id(&id).unwrap();
        assert!(bot.cpu_limit.is_none());
        assert!(bot.memory_limit.is_none());
    }

    #[test]
    fn update_resource_limits_nonexistent_bot() {
        let (mut store, _dir) = temp_store();
        assert!(store.update_resource_limits("ghost", Some(1.0), None).is_err());
    }

    #[test]
    fn set_network_mode_all_variants() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("NetBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        for mode in [
            NetworkMode::None,
            NetworkMode::Bridge,
            NetworkMode::Host,
            NetworkMode::Custom("my-net".into()),
        ] {
            store.set_network_mode(&id, mode.clone()).unwrap();
            assert_eq!(store.get_by_id(&id).unwrap().network_mode, mode);
        }
    }

    #[test]
    fn toggle_network_flips_mode() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("ToggleBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        // Default is Bridge, toggle to disabled (None)
        store.toggle_network(&id, false).unwrap();
        assert_eq!(store.get_by_id(&id).unwrap().network_mode, NetworkMode::None);

        // Toggle back to enabled (Bridge)
        store.toggle_network(&id, true).unwrap();
        assert_eq!(store.get_by_id(&id).unwrap().network_mode, NetworkMode::Bridge);
    }

    #[test]
    fn update_port_mappings() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("PortBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        let mappings = vec![
            PortMapping {
                container_port: 8080,
                host_port: 8080,
                protocol: "tcp".into(),
            },
            PortMapping {
                container_port: 9090,
                host_port: 9091,
                protocol: "udp".into(),
            },
        ];
        store.update_port_mappings(&id, mappings).unwrap();

        let bot = store.get_by_id(&id).unwrap();
        assert_eq!(bot.port_mappings.len(), 2);
        assert_eq!(bot.port_mappings[0].container_port, 8080);
        assert_eq!(bot.port_mappings[1].protocol, "udp");
    }

    #[test]
    fn update_port_mappings_replace() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("ReplaceBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        store
            .update_port_mappings(
                &id,
                vec![PortMapping {
                    container_port: 3000,
                    host_port: 3000,
                    protocol: "tcp".into(),
                }],
            )
            .unwrap();

        // Replace with empty
        store.update_port_mappings(&id, vec![]).unwrap();
        assert!(store.get_by_id(&id).unwrap().port_mappings.is_empty());
    }

    #[test]
    fn persistence_roundtrip() {
        let dir = tempfile::tempdir().expect("create temp dir");
        let path = dir.path().join("bots.json");

        // Write with one store
        {
            let mut store = BotStore::from_path(path.clone());
            let mut bot = BotProfile::new("Persist".into(), Some("/ws".into()));
            bot.cpu_limit = Some(2.0);
            bot.memory_limit = Some(1_073_741_824);
            bot.network_mode = NetworkMode::Host;
            bot.port_mappings.push(PortMapping {
                container_port: 443,
                host_port: 8443,
                protocol: "tcp".into(),
            });
            store.add(bot).unwrap();
        }

        // Read with a fresh load
        let data = std::fs::read_to_string(&path).unwrap();
        let bots: Vec<BotProfile> = serde_json::from_str(&data).unwrap();
        assert_eq!(bots.len(), 1);
        assert_eq!(bots[0].name, "Persist");
        assert_eq!(bots[0].cpu_limit, Some(2.0));
        assert_eq!(bots[0].memory_limit, Some(1_073_741_824));
        assert_eq!(bots[0].network_mode, NetworkMode::Host);
        assert_eq!(bots[0].port_mappings.len(), 1);
        assert_eq!(bots[0].port_mappings[0].host_port, 8443);
    }

    #[test]
    fn update_env_vars() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("EnvBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        let vars = vec![
            EnvVar { key: "FOO".into(), value: "bar".into() },
            EnvVar { key: "BAZ".into(), value: "qux".into() },
        ];
        store.update_env_vars(&id, vars).unwrap();

        let bot = store.get_by_id(&id).unwrap();
        assert_eq!(bot.env_vars.len(), 2);
        assert_eq!(bot.env_vars[0].key, "FOO");
    }

    #[test]
    fn set_auto_start() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("AutoBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        assert!(!store.get_by_id(&id).unwrap().auto_start);

        store.set_auto_start(&id, true).unwrap();
        assert!(store.get_by_id(&id).unwrap().auto_start);

        store.set_auto_start(&id, false).unwrap();
        assert!(!store.get_by_id(&id).unwrap().auto_start);
    }

    #[test]
    fn set_auto_start_nonexistent_bot() {
        let (mut store, _dir) = temp_store();
        assert!(store.set_auto_start("ghost", true).is_err());
    }

    #[test]
    fn get_auto_start_bots() {
        let (mut store, _dir) = temp_store();
        let bot1 = BotProfile::new("Bot1".into(), None);
        let bot2 = BotProfile::new("Bot2".into(), None);
        let id1 = bot1.id.clone();
        store.add(bot1).unwrap();
        store.add(bot2).unwrap();

        assert!(store.get_auto_start_bots().is_empty());

        store.set_auto_start(&id1, true).unwrap();
        let auto_bots = store.get_auto_start_bots();
        assert_eq!(auto_bots.len(), 1);
        assert_eq!(auto_bots[0].id, id1);
    }

    #[test]
    fn get_bot_ids() {
        let (mut store, _dir) = temp_store();
        store.add(BotProfile::new("A".into(), None)).unwrap();
        store.add(BotProfile::new("B".into(), None)).unwrap();

        let ids = store.get_bot_ids();
        assert_eq!(ids.len(), 2);
    }

    #[test]
    fn test_rotate_backups() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bots.json");
        std::fs::write(&path, "original").unwrap();

        BotStore::rotate_backups(&path).unwrap();

        let bak1 = path.with_extension("json.bak.1");
        assert!(bak1.exists());
        assert_eq!(std::fs::read_to_string(&bak1).unwrap(), "original");
    }

    #[test]
    fn test_rotate_backups_cascades() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bots.json");
        let bak1 = path.with_extension("json.bak.1");
        let bak2 = path.with_extension("json.bak.2");
        let bak3 = path.with_extension("json.bak.3");

        std::fs::write(&path, "current").unwrap();
        std::fs::write(&bak1, "backup1").unwrap();
        std::fs::write(&bak2, "backup2").unwrap();

        BotStore::rotate_backups(&path).unwrap();

        assert_eq!(std::fs::read_to_string(&bak1).unwrap(), "current");
        assert_eq!(std::fs::read_to_string(&bak2).unwrap(), "backup1");
        assert_eq!(std::fs::read_to_string(&bak3).unwrap(), "backup2");
    }

    #[test]
    fn test_rotate_backups_no_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bots.json");
        // No file exists — should be a no-op
        BotStore::rotate_backups(&path).unwrap();
    }

    #[test]
    fn test_load_with_recovery_valid_main() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bots.json");
        std::fs::write(&path, "[]").unwrap();

        let bots = BotStore::load_with_recovery(&path).unwrap();
        assert!(bots.is_empty());
    }

    #[test]
    fn test_load_with_recovery_from_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bots.json");

        // Write corrupted main file
        std::fs::write(&path, "not json").unwrap();

        // Write valid backup
        let bak1 = path.with_extension("json.bak.1");
        std::fs::write(&bak1, "[]").unwrap();

        let bots = BotStore::load_with_recovery(&path).unwrap();
        assert!(bots.is_empty());
    }

    #[test]
    fn test_load_with_recovery_from_second_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bots.json");

        std::fs::write(&path, "corrupt").unwrap();

        let bak1 = path.with_extension("json.bak.1");
        std::fs::write(&bak1, "also corrupt").unwrap();

        let bak2 = path.with_extension("json.bak.2");
        std::fs::write(&bak2, "[]").unwrap();

        let bots = BotStore::load_with_recovery(&path).unwrap();
        assert!(bots.is_empty());
    }

    #[test]
    fn test_load_with_recovery_no_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bots.json");

        let bots = BotStore::load_with_recovery(&path).unwrap();
        assert!(bots.is_empty());
    }

    #[test]
    fn test_atomic_write_leaves_no_tmp_on_success() {
        let (mut store, dir) = temp_store();
        store.add(BotProfile::new("TmpTest".into(), None)).unwrap();

        let tmp_path = dir.path().join("bots.json.tmp");
        assert!(!tmp_path.exists(), ".json.tmp should not exist after save");
    }

    #[test]
    fn test_save_creates_backup() {
        let (mut store, dir) = temp_store();
        store.add(BotProfile::new("First".into(), None)).unwrap();

        // Second save should create .bak.1
        store.add(BotProfile::new("Second".into(), None)).unwrap();

        let bak1 = dir.path().join("bots.json.bak.1");
        assert!(bak1.exists(), ".bak.1 should exist after second save");

        // .bak.1 should contain the state before the second save (only "First")
        let backup_data: Vec<BotProfile> =
            serde_json::from_str(&std::fs::read_to_string(&bak1).unwrap()).unwrap();
        assert_eq!(backup_data.len(), 1);
        assert_eq!(backup_data[0].name, "First");
    }

    #[test]
    fn test_import_bots_skips_duplicates() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("Existing".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        // Import a bot with the same ID — should be skipped
        let dup = BotProfile {
            id: id.clone(),
            name: "Duplicate".into(),
            image: "test".into(),
            network_enabled: None,
            workspace_path: None,
            api_key_env: None,
            env_vars: Vec::new(),
            cpu_limit: None,
            memory_limit: None,
            network_mode: NetworkMode::Bridge,
            port_mappings: Vec::new(),
            auto_start: false,
            health_check: None,
            notification_prefs: None,
        };
        let new_bot = BotProfile::new("NewBot".into(), None);
        let new_id = new_bot.id.clone();

        store.import_bots(vec![dup, new_bot]).unwrap();
        assert_eq!(store.get_all().len(), 2);
        assert_eq!(store.get_by_id(&id).unwrap().name, "Existing");
        assert!(store.get_by_id(&new_id).is_some());
    }

    // ── Health check persistence ────────────────────────────────────

    #[test]
    fn update_health_check_set() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("HealthBot".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        let hc = HealthCheckConfig {
            command: vec!["echo".into(), "ok".into()],
            interval_secs: 15,
            retries: 2,
            auto_restart: true,
        };
        store.update_health_check(&id, Some(hc)).unwrap();

        let bot = store.get_by_id(&id).unwrap();
        let hc = bot.health_check.as_ref().unwrap();
        assert_eq!(hc.command, vec!["echo", "ok"]);
        assert_eq!(hc.interval_secs, 15);
        assert_eq!(hc.retries, 2);
        assert!(hc.auto_restart);
    }

    #[test]
    fn update_health_check_clear() {
        let (mut store, _dir) = temp_store();
        let bot = BotProfile::new("ClearHC".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        // Set then clear
        store
            .update_health_check(
                &id,
                Some(HealthCheckConfig::default()),
            )
            .unwrap();
        assert!(store.get_by_id(&id).unwrap().health_check.is_some());

        store.update_health_check(&id, None).unwrap();
        assert!(store.get_by_id(&id).unwrap().health_check.is_none());
    }

    #[test]
    fn update_health_check_persists_to_disk() {
        let (mut store, dir) = temp_store();
        let bot = BotProfile::new("PersistHC".into(), None);
        let id = bot.id.clone();
        store.add(bot).unwrap();

        store
            .update_health_check(
                &id,
                Some(HealthCheckConfig {
                    command: vec!["cat".into(), "/health".into()],
                    interval_secs: 60,
                    retries: 5,
                    auto_restart: false,
                }),
            )
            .unwrap();

        // Reload from disk
        let path = dir.path().join("bots.json");
        let data = std::fs::read_to_string(&path).unwrap();
        let bots: Vec<BotProfile> = serde_json::from_str(&data).unwrap();
        let hc = bots[0].health_check.as_ref().unwrap();
        assert_eq!(hc.command, vec!["cat", "/health"]);
        assert_eq!(hc.interval_secs, 60);
    }

    #[test]
    fn update_health_check_nonexistent_bot() {
        let (mut store, _dir) = temp_store();
        assert!(store
            .update_health_check("ghost", Some(HealthCheckConfig::default()))
            .is_err());
    }
}
