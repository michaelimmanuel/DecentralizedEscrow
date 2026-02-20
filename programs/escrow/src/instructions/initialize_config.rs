use anchor_lang::prelude::*;

use crate::{
    constants::CONFIG_SEED,
    state::Config,
};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + Config::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// The fee collector wallet (can be same as admin or different)
    /// CHECK: This is just a wallet address
    pub fee_collector: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeConfig>, fee_basis_points: u16) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let admin = &ctx.accounts.admin;
    let fee_collector = &ctx.accounts.fee_collector;

    // Validate fee is reasonable (max 10% = 1000 basis points)
    require!(fee_basis_points <= 1000, ConfigError::FeeTooHigh);

    // Initialize config
    config.admin = admin.key();
    config.fee_basis_points = fee_basis_points;
    config.fee_collector = fee_collector.key();
    config.bump = ctx.bumps.config;

    msg!("Config initialized with admin: {}", config.admin);
    msg!("Fee: {} basis points ({}%)", fee_basis_points, fee_basis_points as f64 / 100.0);
    msg!("Fee collector: {}", config.fee_collector);

    Ok(())
}

#[error_code]
pub enum ConfigError {
    #[msg("Fee cannot exceed 10% (1000 basis points)")]
    FeeTooHigh,
}
