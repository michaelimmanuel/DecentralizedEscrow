use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::EscrowError,
    events::FundsReleased,
    state::{Escrow, EscrowStatus},
};

#[derive(Accounts)]
pub struct ReleaseFunds<'info> {
    #[account(
        mut,
        seeds = [ESCROW_SEED, buyer.key().as_ref(), seller.key().as_ref()],
        bump = escrow.bump,
        has_one = buyer,
        has_one = seller,
        constraint = escrow.can_release() @ EscrowError::InvalidState,
    )]
    pub escrow: Account<'info, Escrow>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: Seller receives the funds
    #[account(mut)]
    pub seller: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ReleaseFunds>) -> Result<()> {
    let escrow = &mut ctx.accounts.escrow;
    let seller = &ctx.accounts.seller;
    let clock = Clock::get()?;

    let amount = escrow.amount;

    // Transfer funds from escrow PDA to seller by directly manipulating lamports
    
    **escrow.to_account_info().try_borrow_mut_lamports()? = escrow
        .to_account_info()
        .lamports()
        .checked_sub(amount)
        .ok_or(EscrowError::InsufficientFunds)?;
    
    **seller.to_account_info().try_borrow_mut_lamports()? = seller
        .lamports()
        .checked_add(amount)
        .ok_or(EscrowError::InsufficientFunds)?;

    // Update escrow status
    escrow.status = EscrowStatus::Completed;

    // Emit event
    emit!(FundsReleased {
        escrow: escrow.key(),
        seller: seller.key(),
        amount,
        timestamp: clock.unix_timestamp,
    });

    msg!("Funds released: {} lamports to {}", amount, seller.key());

    Ok(())
}
