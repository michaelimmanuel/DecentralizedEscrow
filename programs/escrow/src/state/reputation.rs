use anchor_lang::prelude::*;

#[account]
pub struct Reputation {
    pub user: Pubkey,
    pub successful_trades: u64,
    pub failed_trades: u64,
}

impl Reputation {
    pub const LEN: usize = 8  // discriminator
        + 32  // user
        + 8   // successful_trades
        + 8;  // failed_trades

    pub fn total_trades(&self) -> u64 {
        self.successful_trades.saturating_add(self.failed_trades)
    }

    pub fn success_rate(&self) -> f64 {
        let total = self.total_trades();
        if total == 0 {
            return 0.0;
        }
        (self.successful_trades as f64 / total as f64) * 100.0
    }

    pub fn increment_successful(&mut self) {
        self.successful_trades = self.successful_trades.saturating_add(1);
    }

    pub fn increment_failed(&mut self) {
        self.failed_trades = self.failed_trades.saturating_add(1);
    }
}