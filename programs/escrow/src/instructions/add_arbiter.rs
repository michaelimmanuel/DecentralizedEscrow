use anchor_lang::prelude::*;

use crate::{
    constants::{ARBITER_SEED, CONFIG_SEED},
    errors::EscrowError,
    state::{Arbiter, Config},
};

#[derive(Accounts)]
pub struct AddArbiter<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.is_admin(&admin.key()) @ EscrowError::Unauthorized,
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = 8 + Arbiter::LEN,
        seeds = [ARBITER_SEED, arbiter.key().as_ref()],
        bump
    )]
    pub arbiter_account: Account<'info, Arbiter>,

    /// The arbiter being added
    /// CHECK: Can be any valid account
    pub arbiter: AccountInfo<'info>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddArbiter>) -> Result<()> {
    let arbiter_account = &mut ctx.accounts.arbiter_account;
    let arbiter = &ctx.accounts.arbiter;
    let admin = &ctx.accounts.admin;
    let clock = Clock::get()?;

    // Initialize arbiter account
    arbiter_account.arbiter = arbiter.key();
    arbiter_account.added_by = admin.key();
    arbiter_account.added_at = clock.unix_timestamp;
    arbiter_account.is_active = true;
    arbiter_account.bump = ctx.bumps.arbiter_account;

    msg!("Arbiter added: {}", arbiter.key());
    msg!("Added by admin: {}", admin.key());

    Ok(())
}
