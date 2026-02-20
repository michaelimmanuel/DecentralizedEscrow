use anchor_lang::prelude::*;

use crate::{
    constants::*,
    errors::EscrowError,
    events::{FundsReleased, ReputationUpdated},
    state::{Escrow, EscrowStatus, Reputation},
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

    /// Buyer's reputation account (optional)
    #[account(
        mut,
        seeds = [REPUTATION_SEED, buyer.key().as_ref()],
        bump,
    )]
    pub buyer_reputation: Option<Account<'info, Reputation>>,

    /// Seller's reputation account (optional)
    #[account(
        mut,
        seeds = [REPUTATION_SEED, seller.key().as_ref()],
        bump,
    )]
    pub seller_reputation: Option<Account<'info, Reputation>>,

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

    // Update reputation for buyer if account exists
    if let Some(buyer_reputation) = &mut ctx.accounts.buyer_reputation {
        buyer_reputation.increment_successful();
        emit!(ReputationUpdated {
            user: buyer_reputation.user,
            successful_trades: buyer_reputation.successful_trades,
            failed_trades: buyer_reputation.failed_trades,
        });
        msg!("Buyer reputation updated: {} successful trades", buyer_reputation.successful_trades);
    }

    // Update reputation for seller if account exists
    if let Some(seller_reputation) = &mut ctx.accounts.seller_reputation {
        seller_reputation.increment_successful();
        emit!(ReputationUpdated {
            user: seller_reputation.user,
            successful_trades: seller_reputation.successful_trades,
            failed_trades: seller_reputation.failed_trades,
        });
        msg!("Seller reputation updated: {} successful trades", seller_reputation.successful_trades);
    }

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
