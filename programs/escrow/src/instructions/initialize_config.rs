use anchor_lang::prelude::*;

use crate::{
    constants::*,
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

    /// Fee collector PDA that will hold accumulated fees
    /// CHECK: PDA will be validated by seeds constraint
    #[account(
        seeds = [FEE_COLLECTOR_SEED],
        bump
    )]
    pub fee_collector: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

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
    config.bump = ctx.bumps.config;
    config.fee_collector_bump = ctx.bumps.fee_collector;

    msg!("Config initialized with admin: {}", config.admin);
    msg!("Fee: {} basis points ({}%)", fee_basis_points, fee_basis_points as f64 / 100.0);
    msg!("Fee collector PDA: {}", fee_collector.key());

    Ok(())
}

#[error_code]
pub enum ConfigError {
    #[msg("Fee cannot exceed 10% (1000 basis points)")]
    FeeTooHigh,
    #[msg("Unauthorized action")]
    Unauthorized,
    #[msg("Insufficient funds")]
    InsufficientFunds,
}
