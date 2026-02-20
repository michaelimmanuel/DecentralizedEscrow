use anchor_lang::prelude::*;

use crate::{
    constants::*,
    state::Config,
    EscrowError,
};

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = admin @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    /// Fee collector PDA that holds the accumulated fees
    /// CHECK: Validated by seeds constraint
    #[account(
        mut,
        seeds = [FEE_COLLECTOR_SEED],
        bump = config.fee_collector_bump,
    )]
    pub fee_collector: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<WithdrawFees>, amount: u64) -> Result<()> {
    let fee_collector = &ctx.accounts.fee_collector;
    let admin = &ctx.accounts.admin;
    let config = &ctx.accounts.config;

    // Verify sufficient balance
    require!(
        fee_collector.lamports() >= amount,
        EscrowError::InsufficientFunds
    );

    // Create PDA signer seeds
    let fee_collector_seeds = &[
        FEE_COLLECTOR_SEED,
        &[config.fee_collector_bump],
    ];
    let signer_seeds = &[&fee_collector_seeds[..]];

    // Transfer using system program CPI with PDA signer
    anchor_lang::system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: fee_collector.to_account_info(),
                to: admin.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    msg!(
        "Admin {} withdrew {} lamports from fee collector {}",
        admin.key(),
        amount,
        fee_collector.key()
    );

    Ok(())
}
