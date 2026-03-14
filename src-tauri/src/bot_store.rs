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
}
