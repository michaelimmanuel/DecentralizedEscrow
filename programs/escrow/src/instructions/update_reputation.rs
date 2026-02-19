use anchor_lang::prelude::*;

use crate::{
    constants::REPUTATION_SEED,
    events::ReputationUpdated,
    state::Reputation,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ReputationUpdate {
    Successful,
    Failed,
}

#[derive(Accounts)]
pub struct UpdateReputation<'info> {
    #[account(
        mut,
        seeds = [REPUTATION_SEED, user.key().as_ref()],
        bump,
        constraint = reputation.user == user.key()
    )]
    pub reputation: Account<'info, Reputation>,

    /// The user whose reputation is being updated
    /// CHECK: This can be any valid account
    pub user: AccountInfo<'info>,

    /// The authority calling this update
    /// Note: In production, this should be restricted to program PDAs or authorized signers
    pub authority: Signer<'info>,
}

pub fn handler(ctx: Context<UpdateReputation>, update: ReputationUpdate) -> Result<()> {
    let reputation = &mut ctx.accounts.reputation;

    // Update reputation based on the update type
    match update {
        ReputationUpdate::Successful => {
            reputation.increment_successful();
        }
        ReputationUpdate::Failed => {
            reputation.increment_failed();
        }
    }

    // Emit reputation updated event
    emit!(ReputationUpdated {
        user: reputation.user,
        successful_trades: reputation.successful_trades,
        failed_trades: reputation.failed_trades,
    });

    Ok(())
}
