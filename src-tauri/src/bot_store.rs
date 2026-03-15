use std::path::PathBuf;

use crate::error::AppError;
use crate::models::{BotProfile, EnvVar, NetworkMode, PortMapping};

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

        let mut bots: Vec<BotProfile> = if config_path.exists() {
            let data = std::fs::read_to_string(&config_path)?;
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Vec::new()
        };

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
        let data = serde_json::to_string_pretty(&self.bots)?;
        std::fs::write(&self.config_path, data)?;
        Ok(())
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
    fn get_bot_ids() {
        let (mut store, _dir) = temp_store();
        store.add(BotProfile::new("A".into(), None)).unwrap();
        store.add(BotProfile::new("B".into(), None)).unwrap();

        let ids = store.get_bot_ids();
        assert_eq!(ids.len(), 2);
    }
}
