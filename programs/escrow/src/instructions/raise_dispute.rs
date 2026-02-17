use anchor_lang::prelude::*;
use crate::{
    constants::*, errors::EscrowError, events::DisputeRaised, state::{Escrow, EscrowStatus}
};

#[derive(Accounts)]
pub struct RaiseDispute<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), seller.key().as_ref()],
        bump = escrow.bump,
        constraint = escrow.buyer == *party.key || escrow.seller == *party.key @ EscrowError::Unauthorized,
        constraint = matches!(escrow.status, EscrowStatus::Active) @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, Escrow>,

    /// The party raising the dispute (either buyer or seller)
    pub party: Signer<'info>,

    /// CHECK: This is the buyer account
    pub buyer: AccountInfo<'info>,

    /// CHECK: This is the seller account
    pub seller: AccountInfo<'info>,
}

pub fn handler(ctx: Context<RaiseDispute>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let clock = Clock::get()?;

    // Update escrow status to Disputed
    escrow.status = EscrowStatus::Disputed;

    // Emit DisputeRaised event
    emit!(DisputeRaised {
        escrow: escrow.key(),
        raised_by: ctx.accounts.party.key(),
        timestamp: clock.unix_timestamp,
    });

    msg!("Dispute raised for escrow by {}", ctx.accounts.party.key());

    Ok(())
}
