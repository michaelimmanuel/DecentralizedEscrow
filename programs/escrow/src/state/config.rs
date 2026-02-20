use anchor_lang::prelude::*;

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub fee_basis_points: u16,  // Fee in basis points (e.g., 100 = 1%)
    pub bump: u8,
    pub fee_collector_bump: u8,
}

impl Config {
    pub const LEN: usize = 8  // discriminator
        + 32  // admin
        + 2   // fee_basis_points
        + 1   // bump
        + 1;  // fee_collector_bump

    pub fn is_admin(&self, key: &Pubkey) -> bool {
        self.admin == *key
    }
}

#[account]
pub struct Arbiter {
    pub arbiter: Pubkey,
    pub added_by: Pubkey,
    pub added_at: i64,
    pub is_active: bool,
    pub bump: u8,
}

impl Arbiter {
    pub const LEN: usize = 8  // discriminator
        + 32  // arbiter
        + 32  // added_by
        + 8   // added_at
        + 1   // is_active
        + 1;  // bump

    pub fn can_resolve_disputes(&self) -> bool {
        self.is_active
    }
}
