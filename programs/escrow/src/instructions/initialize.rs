use anchor_lang::prelude::*;

use crate::{
    constants::REPUTATION_SEED,
    events::ReputationUpdated,
    state::Reputation,
};

#[derive(Accounts)]
pub struct InitializeReputation<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + Reputation::LEN,
        seeds = [REPUTATION_SEED, user.key().as_ref()],
        bump
    )]
    pub reputation: Account<'info, Reputation>,

    /// The user whose reputation is being initialized
    /// CHECK: This can be any valid account
    pub user: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeReputation>) -> Result<()> {
    let reputation = &mut ctx.accounts.reputation;
    let user = &ctx.accounts.user;

    // Initialize reputation account
    reputation.user = user.key();
    reputation.successful_trades = 0;
    reputation.failed_trades = 0;

    // Emit reputation initialized event
    emit!(ReputationUpdated {
        user: user.key(),
        successful_trades: 0,
        failed_trades: 0,
    });

    Ok(())
}
