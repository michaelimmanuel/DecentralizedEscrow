use anchor_lang::prelude::*;

use crate::{
    constants::*, errors::EscrowError, events::EscrowCancelled, state::{Escrow, EscrowStatus}
};

#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    #[account(
        mut, 
        seeds = [ESCROW_SEED, buyer.key().as_ref(), seller.key().as_ref()],
        bump = escrow.bump,
        has_one = buyer,
        constraint = escrow.can_cancel() @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, Escrow>,

    pub buyer: Signer<'info>,
    /// CHECK: Seller is not involved in cancellation
    pub seller: AccountInfo<'info>,
}

pub fn handler(ctx: Context<CancelEscrow>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let buyer = &ctx.accounts.buyer;
    let clock = Clock::get()?;

    let amount = escrow.amount;

    // Transfer funds back to buyer by directly manipulating lamports
    **escrow.to_account_info().try_borrow_mut_lamports()? = escrow
        .to_account_info()
        .lamports()
        .checked_sub(amount)
        .ok_or(EscrowError::InsufficientFunds)?;

    **buyer.to_account_info().try_borrow_mut_lamports()? = buyer
        .to_account_info()
        .lamports()
        .checked_add(amount)
        .ok_or(EscrowError::InsufficientFunds)?;

    // Update escrow status
    escrow.status = EscrowStatus::Cancelled;

    // Emit event
    emit!(EscrowCancelled {
        escrow: escrow.key(),
        buyer: buyer.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Escrow cancelled: {} returned to buyer {}", amount, buyer.key());

    Ok(())
}