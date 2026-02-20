use anchor_lang::prelude::*;

use crate::{
    constants::{ARBITER_SEED, CONFIG_SEED},
    errors::EscrowError,
    state::{Arbiter, Config},
};

#[derive(Accounts)]
pub struct RemoveArbiter<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.is_admin(&admin.key()) @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [ARBITER_SEED, arbiter_account.arbiter.as_ref()],
        bump = arbiter_account.bump,
    )]
    pub arbiter_account: Account<'info, Arbiter>,

    #[account(mut)]
    pub admin: Signer<'info>,
}

pub fn handler(ctx: Context<RemoveArbiter>) -> Result<()> {
    let arbiter_account = &mut ctx.accounts.arbiter_account;

    // Mark arbiter as inactive instead of closing account
    // This preserves the history while preventing them from resolving disputes
    arbiter_account.is_active = false;

    msg!("Arbiter removed: {}", arbiter_account.arbiter);
    msg!("Deactivated by admin: {}", ctx.accounts.admin.key());

    Ok(())
}
