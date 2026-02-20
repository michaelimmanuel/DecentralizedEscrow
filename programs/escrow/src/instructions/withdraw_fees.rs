use anchor_lang::prelude::*;

use crate::{
    constants::*,
    state::Config,
    ConfigError,
};

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ ConfigError::Unauthorized,
        has_one = fee_collector,
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// Fee collector account that receives the accumulated fees
    /// CHECK: Fee collector receives platform fees
    #[account(mut)]
    pub fee_collector: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    let fee_collector = &ctx.accounts.fee_collector;
    let admin = &ctx.accounts.admin;

    // Transfer fees from fee collector to admin
    **fee_collector.try_borrow_mut_lamports()? = fee_collector
        .lamports()
        .checked_sub(amount)
        .ok_or(ConfigError::InsufficientFunds)?;
    
    **admin.to_account_info().try_borrow_mut_lamports()? = admin
        .lamports()
        .checked_add(amount)
        .ok_or(ConfigError::InsufficientFunds)?;

    msg!(
        "Admin {} withdrew {} lamports from fee collector {}",
        admin.key(),
        amount,
        fee_collector.key()
    );

    Ok(())
}
